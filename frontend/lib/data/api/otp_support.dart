import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/api/json_reader.dart';
import 'package:blocks_app/data/models/security_models.dart';

/// The server's `verification` object as the app's [OtpChallenge].
///
/// [fallbackDestination] is what to show when the answer deliberately does not
/// name where the code went (a password reset reached by username, or a resend).
OtpChallenge otpChallengeFrom(
  JsonObject verification, {
  required DateTime now,
  String fallbackDestination = '',
  int length = 6,
}) {
  final channel = verification.stringOr('channel', 'EMAIL') == 'SMS'
      ? OtpChannel.phone
      : OtpChannel.email;
  return OtpChallenge(
    id: verification.string('challengeId'),
    channel: channel,
    maskedDestination:
        verification.stringOrNull('destinationMasked') ?? fallbackDestination,
    length: length,
    expiresAt:
        verification.dateOrNull('expiresAt') ??
        now.add(const Duration(minutes: 10)),
    resendAvailableAt:
        verification.dateOrNull('resendAvailableAt') ??
        now.add(const Duration(seconds: 30)),
  );
}

/// What a refused code means, or null when the failure is about something else
/// (the connection, a server error) and should be thrown as it is.
///
/// A locked entry has no end time of its own: the person must ask for a new code,
/// which is possible at [newCodeAt].
OtpResult? otpResultOf(AppFailure failure, {required DateTime newCodeAt}) {
  switch (failure.code) {
    case 'OTP_INVALID':
      final left = failure.details['attemptsLeft'];
      return OtpIncorrect(attemptsRemaining: left is num ? left.toInt() : 0);
    case 'OTP_EXPIRED':
      return const OtpExpired();
    case 'OTP_LOCKED':
      return OtpLocked(retryAt: newCodeAt);
  }
  return null;
}
