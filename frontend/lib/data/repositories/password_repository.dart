import 'package:blocks_app/data/models/security_models.dart';

/// Changing the password while signed in.
abstract interface class PasswordRepository {
  /// Throws `ValidationFailure` with a reason key: `wrongCurrentPassword`,
  /// `weakPassword`, `samePassword`.
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  });
}

/// "Forgot password": recovery by e-mail or phone.
///
/// Demo: `MockPasswordResetRepository` with a fixed code. Production must add
/// OTP expiry, attempt limits, resend cool-down, brute-force protection,
/// device / risk checks and rate limiting; the app only surfaces the results.
abstract interface class PasswordResetRepository {
  /// Sends a code. For privacy the real server answers identically whether or
  /// not an account exists for [destination].
  Future<OtpChallenge> startReset({
    required OtpChannel channel,
    required String destination,
  });

  Future<OtpChallenge> resendCode(String challengeId);

  Future<OtpResult> verifyCode({
    required String challengeId,
    required String code,
  });

  /// Sets the new password using the token from [verifyCode]. Also lifts any
  /// temporary sign-in protection and signs out the other devices.
  Future<void> completeReset({
    required String token,
    required String newPassword,
  });
}
