import 'package:blocks_app/data/models/auth_models.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/data/repositories/auth_repository.dart';

/// An [AuthRepository] whose answers a test sets, recording what it was asked.
class FakeAuthRepository implements AuthRepository {
  FakeAuthRepository({this.signedIn = false});

  bool signedIn;
  bool onboarded = true;

  /// What the next call does; a thrown object is thrown from the call.
  Object signInResult = const LoginSucceeded();
  Object registerResult = const CodeChallenge(
    id: 'challenge-1',
    kind: CodeChallengeKind.contactVerification,
  );
  Object? submitError;
  Object? resendResult;

  final List<({String identifier, String password})> signIns = [];
  final List<RegistrationRequest> registrations = [];
  final List<({CodeChallenge challenge, String code, SignInCodeMethod method})>
  codes = [];
  final List<CodeChallenge> resends = [];
  int signOuts = 0;

  @override
  bool get hasCompletedOnboarding => onboarded;

  @override
  bool get isSignedIn => signedIn;

  @override
  Future<void> completeOnboarding() async => onboarded = true;

  @override
  Future<void> signInAsDemo() async => signedIn = true;

  @override
  Future<LoginResult> signInWithPassword({
    required String identifier,
    required String password,
  }) async {
    signIns.add((identifier: identifier, password: password));
    final r = signInResult;
    if (r is LoginResult) {
      if (r is LoginSucceeded) signedIn = true;
      return r;
    }
    throw r;
  }

  @override
  Future<CodeChallenge> register(RegistrationRequest request) async {
    registrations.add(request);
    final r = registerResult;
    if (r is CodeChallenge) return r;
    throw r;
  }

  @override
  Future<LoginSucceeded> submitCode(
    CodeChallenge challenge,
    String code, {
    SignInCodeMethod method = SignInCodeMethod.otp,
  }) async {
    codes.add((challenge: challenge, code: code, method: method));
    final e = submitError;
    if (e != null) throw e;
    signedIn = true;
    return const LoginSucceeded();
  }

  @override
  Future<CodeChallenge> resendCode(CodeChallenge challenge) async {
    resends.add(challenge);
    final r = resendResult;
    if (r is CodeChallenge) return r;
    if (r != null) throw r;
    return challenge.copyWith(resendAvailableAt: DateTime.utc(2030));
  }

  @override
  Future<void> signOut() async {
    signOuts++;
    signedIn = false;
  }
}
