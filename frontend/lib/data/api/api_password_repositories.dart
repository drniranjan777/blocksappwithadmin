import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/api/api_client.dart';
import 'package:blocks_app/data/api/json_reader.dart';
import 'package:blocks_app/data/api/otp_support.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/data/repositories/password_repository.dart';

/// Changing the password while signed in.
class ApiPasswordRepository implements PasswordRepository {
  ApiPasswordRepository(this._api);

  final ApiClient _api;

  /// Reasons are the keys the Change Password screen understands:
  /// `wrongCurrentPassword`, `weakPassword`, `samePassword`, `tooManyAttempts`.
  ///
  /// Other devices are signed out with the change: if the old password was in
  /// someone else's hands, their session ends here.
  @override
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    try {
      await _api.post(
        '/auth/password/change',
        body: {
          'currentPassword': currentPassword,
          'newPassword': newPassword,
          'signOutOtherDevices': true,
        },
      );
    } on UnauthorizedFailure catch (e) {
      if (e.code == 'INVALID_CREDENTIALS') {
        throw const ValidationFailure('wrongCurrentPassword');
      }
      rethrow;
    } on ForbiddenFailure catch (e) {
      if (e.code == 'ACCOUNT_LOCKED') {
        throw const ValidationFailure('tooManyAttempts');
      }
      rethrow;
    } on FieldValidationFailure catch (e) {
      throw ValidationFailure(
        e.errors['newPassword'] == 'same_as_current'
            ? 'samePassword'
            : 'weakPassword',
      );
    }
  }
}

/// "Forgot password" against the real API. Everything here is reachable while
/// signed out, so none of it carries a token.
///
/// The server answers the same whether or not an account matches what was typed,
/// and a wrong guess at the code is counted there; this class only translates.
class ApiPasswordResetRepository implements PasswordResetRepository {
  ApiPasswordResetRepository(this._api, {DateTime Function()? now})
    : _now = now ?? DateTime.now;

  final ApiClient _api;
  final DateTime Function() _now;

  /// Where each code went, as first shown. A resend does not repeat it.
  final Map<String, OtpChallenge> _challenges = {};

  @override
  Future<OtpChallenge> startReset({
    required OtpChannel channel,
    required String destination,
  }) async {
    final answer = await _api.post(
      '/auth/password/forgot',
      body: {'identifier': destination.trim()},
      authenticated: false,
    );
    final challenge = otpChallengeFrom(
      JsonObject.of(answer.data).object('verification'),
      now: _now(),
    );
    _challenges[challenge.id] = challenge;
    return challenge;
  }

  @override
  Future<OtpChallenge> resendCode(String challengeId) async {
    final answer = await _api.post(
      '/auth/password/resend',
      body: {'challengeId': challengeId},
      authenticated: false,
    );
    final before = _challenges[challengeId];
    final fresh = otpChallengeFrom(
      JsonObject.of(answer.data),
      now: _now(),
      fallbackDestination: before?.maskedDestination ?? '',
    );
    _challenges[fresh.id] = fresh;
    return fresh;
  }

  @override
  Future<OtpResult> verifyCode({
    required String challengeId,
    required String code,
  }) async {
    try {
      final answer = await _api.post(
        '/auth/password/verify',
        body: {'challengeId': challengeId, 'code': code.trim()},
        authenticated: false,
      );
      return OtpVerified(
        token: JsonObject.of(answer.data).string('resetToken'),
      );
    } on AppFailure catch (e) {
      final retryAt =
          _challenges[challengeId]?.resendAvailableAt ??
          _now().add(const Duration(seconds: 30));
      final result = otpResultOf(e, newCodeAt: retryAt);
      if (result != null) return result;
      rethrow;
    }
  }

  /// Reasons the screen understands: `weakPassword`, and an
  /// `UnauthorizedFailure` when the token was spent or has lapsed.
  @override
  Future<void> completeReset({
    required String token,
    required String newPassword,
  }) async {
    try {
      await _api.post(
        '/auth/password/reset',
        body: {'resetToken': token, 'newPassword': newPassword},
        authenticated: false,
      );
    } on FieldValidationFailure {
      throw const ValidationFailure('weakPassword');
    } on ValidationFailure catch (e) {
      if (e.code == 'OTP_INVALID' || e.code == 'OTP_EXPIRED') {
        throw const UnauthorizedFailure('expired');
      }
      rethrow;
    }
  }
}
