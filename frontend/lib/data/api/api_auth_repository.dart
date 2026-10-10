import 'package:blocks_app/core/constants/storage_keys.dart';
import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/core/services/local_store.dart';
import 'package:blocks_app/data/api/api_client.dart';
import 'package:blocks_app/data/api/device_identity.dart';
import 'package:blocks_app/data/api/json_reader.dart';
import 'package:blocks_app/data/api/token_store.dart';
import 'package:blocks_app/data/models/auth_models.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/data/repositories/auth_repository.dart';

/// Registration, sign-in and sign-out against the real API.
///
/// Passwords and codes are sent once and never kept, logged or returned. The
/// tokens go straight to the [TokenStore] (secure storage); nothing else in the
/// app holds them. Whether a sign-in needs another step, and whether a wrong
/// password has locked the account, is decided by the server: this class only
/// translates its answer.
class ApiAuthRepository implements AuthRepository {
  ApiAuthRepository({
    required this._api,
    required this._tokens,
    required this._store,
    required this._device,
    DateTime Function()? now,
  }) : _now = now ?? DateTime.now;

  /// Shown as the number of tries left when the server does not say: large
  /// enough that no "few attempts left" warning appears.
  static const _unknownAttempts = 99;

  final ApiClient _api;
  final TokenStore _tokens;
  final LocalStore _store;
  final DeviceIdentity _device;
  final DateTime Function() _now;

  @override
  bool get hasCompletedOnboarding =>
      _store.getBool(StorageKeys.onboardingCompleted) ?? false;

  @override
  bool get isSignedIn => _tokens.current != null;

  @override
  Future<void> completeOnboarding() =>
      _store.setBool(StorageKeys.onboardingCompleted, value: true);

  /// There is no demo account on the live service.
  @override
  Future<void> signInAsDemo() async =>
      throw const ForbiddenFailure('Demo sign-in is not available');

  // ------------------------------------------------------------- sign-in --

  @override
  Future<LoginResult> signInWithPassword({
    required String identifier,
    required String password,
  }) async {
    final JsonObject answer;
    try {
      answer = JsonObject.of(
        (await _api.post(
          '/auth/login',
          body: {
            'identifier': identifier,
            'password': password,
            'device': _device.toJson(),
          },
          authenticated: false,
        )).data,
      );
    } on UnauthorizedFailure catch (e) {
      if (e.code != 'INVALID_CREDENTIALS') rethrow;
      final left = e.details['attemptsRemaining'];
      return LoginRejected(
        attemptsRemaining: left is num ? left.toInt() : _unknownAttempts,
      );
    } on ForbiddenFailure catch (e) {
      if (e.code != 'ACCOUNT_LOCKED') rethrow;
      final until = e.details['until'];
      final retryAt = until is String ? DateTime.tryParse(until) : null;
      return LoginProtected(
        // Without a time the server's pause is still real: wait the usual
        // window rather than invite another try straight away.
        retryAt: retryAt ?? _now().add(const Duration(minutes: 15)),
        justTriggered: e.details['justTriggered'] == true,
      );
    }

    switch (answer.string('status')) {
      case 'authenticated':
        return _open(answer);
      case 'two_factor_required':
        return LoginNeedsCode(
          CodeChallenge(
            id: answer.string('challengeId'),
            kind: CodeChallengeKind.secondFactor,
            methods: _methods(answer),
            destinationMasked: answer.stringOrNull('destinationMasked'),
          ),
        );
      case 'verification_required':
        final v = answer.object('verification');
        return LoginNeedsCode(
          _challengeOf(
            v,
            answer.string('reason') == 'unverified_contact'
                ? CodeChallengeKind.contactVerification
                : CodeChallengeKind.unusualSignIn,
          ),
        );
      default:
        throw const UnknownFailure('The server sent something unexpected');
    }
  }

  List<SignInCodeMethod> _methods(JsonObject answer) {
    final methods = [
      for (final m in answer.strings('methods')) ?SignInCodeMethod.fromWire(m),
    ];
    return methods.isEmpty ? const [SignInCodeMethod.otp] : methods;
  }

  CodeChallenge _challengeOf(JsonObject v, CodeChallengeKind kind) =>
      CodeChallenge(
        id: v.string('challengeId'),
        kind: kind,
        destinationMasked: v.stringOrNull('destinationMasked'),
        resendAvailableAt: v.dateOrNull('resendAvailableAt'),
      );

  /// Keeps the tokens from an `authenticated` answer and nothing else of it.
  Future<LoginSucceeded> _open(JsonObject answer) async {
    final tokens = AuthTokens.fromJson(
      answer.object('tokens').raw,
      now: _now(),
    );
    if (tokens == null) {
      throw const UnknownFailure('The server sent something unexpected');
    }
    await _tokens.save(tokens);
    await _store.setBool(StorageKeys.onboardingCompleted, value: true);
    return LoginSucceeded(isNewDevice: answer.boolean('newDevice'));
  }

  // -------------------------------------------------------- registration --

  @override
  Future<CodeChallenge> register(RegistrationRequest request) async {
    final answer = await _api.post(
      '/auth/register',
      body: {
        'username': request.username.trim(),
        'displayName': request.displayName.trim(),
        'password': request.password,
        'dateOfBirth': _isoDate(request.dateOfBirth),
        if (_filled(request.email)) 'email': request.email!.trim(),
        if (_filled(request.phone)) 'phone': request.phone!.trim(),
        if (_filled(request.state)) 'state': request.state!.trim(),
        if (_filled(request.district)) 'district': request.district!.trim(),
        if (_filled(request.language)) 'language': request.language,
        'device': _device.toJson(),
      },
      authenticated: false,
    );
    return _challengeOf(
      JsonObject.of(answer.data).object('verification'),
      CodeChallengeKind.contactVerification,
    );
  }

  static bool _filled(String? v) => v != null && v.trim().isNotEmpty;

  static String _isoDate(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';

  // --------------------------------------------------------------- codes --

  @override
  Future<LoginSucceeded> submitCode(
    CodeChallenge challenge,
    String code, {
    SignInCodeMethod method = SignInCodeMethod.otp,
  }) async {
    final contact = challenge.kind == CodeChallengeKind.contactVerification;
    final answer = await _api.post(
      contact ? '/auth/verify-contact' : '/auth/login/verify',
      body: {
        'challengeId': challenge.id,
        'code': code.trim(),
        if (!contact) 'method': method.wire,
        'device': _device.toJson(),
      },
      authenticated: false,
    );
    return _open(JsonObject.of(answer.data));
  }

  @override
  Future<CodeChallenge> resendCode(CodeChallenge challenge) async {
    final answer = await _api.post(
      '/auth/resend',
      body: {'challengeId': challenge.id},
      authenticated: false,
    );
    final v = JsonObject.of(answer.data);
    return CodeChallenge(
      id: v.string('challengeId'),
      kind: challenge.kind,
      methods: challenge.methods,
      destinationMasked:
          v.stringOrNull('destinationMasked') ?? challenge.destinationMasked,
      resendAvailableAt: v.dateOrNull('resendAvailableAt'),
    );
  }

  // ------------------------------------------------------------- sign-out --

  @override
  Future<void> signOut() async {
    try {
      await _api.post('/auth/logout');
    } on AppFailure {
      // Offline, or the session is already gone: either way this device is
      // signed out below, and the server expires an unused session on its own.
    }
    await _tokens.clear();
  }
}
