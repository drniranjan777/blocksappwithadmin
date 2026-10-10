import 'package:blocks_app/data/models/payout_models.dart';
import 'package:blocks_app/data/models/security_models.dart';

/// Extra confirmation for sensitive money actions: changing a payout account,
/// withdrawing a large amount, updating tax details.
///
/// The user proves it is really them, again: their **password**, then a
/// **one-time code** (their two-factor code when two-factor is on, otherwise a
/// code sent to their e-mail). The result is a single-use token bound to the
/// [StepUpPurpose]. The server refuses the action without a valid token; the
/// app can't skip the step by editing local state.
abstract interface class StepUpRepository {
  /// Checks the password and sends the code. Throws
  /// `ValidationFailure('wrongPassword')`.
  Future<OtpChallenge> begin(StepUpPurpose purpose, {required String password});

  Future<OtpChallenge> resend(String challengeId);

  /// On success, [OtpVerified.token] is the step-up token for the action.
  Future<OtpResult> verify({required String challengeId, required String code});
}
