import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/mock/mock_world.dart';
import 'package:blocks_app/data/models/payout_models.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/data/repositories/step_up_repository.dart';

String _purposeKey(StepUpPurpose p) => 'stepup:${p.name}';

/// Spends the single-use step-up [token] for [purpose]. The mock bank, payout
/// and tax servers call this before changing anything. Throws
/// `UnauthorizedFailure` when it is missing, already used, expired or was
/// issued for a different action.
void requireStepUp(MockWorld w, String? token, StepUpPurpose purpose) {
  if (token == null || token.isEmpty) {
    throw const UnauthorizedFailure('Extra confirmation is required.');
  }
  w.security.otp.consume(token, _purposeKey(purpose));
}

/// Password, then a one-time code: two-factor code if two-factor is on, else
/// a code to the account's e-mail.
class MockStepUpRepository implements StepUpRepository {
  MockStepUpRepository(this._w);

  final MockWorld _w;

  @override
  Future<OtpChallenge> begin(
    StepUpPurpose purpose, {
    required String password,
  }) async {
    await _w.pause();
    final s = _w.security;
    if (password != s.password) throw const ValidationFailure('wrongPassword');

    final twoFactor = s.twoFactor;
    final (channel, destination) = twoFactor.enabled
        ? (
            twoFactor.method == TwoFactorMethod.authenticatorApp
                ? OtpChannel.authenticator
                : OtpChannel.phone,
            s.phone,
          )
        : (OtpChannel.email, s.email);
    return s.otp.issue(
      channel: channel,
      destination: destination,
      purpose: _purposeKey(purpose),
    );
  }

  @override
  Future<OtpChallenge> resend(String challengeId) async {
    await _w.pause();
    return _w.security.otp.resend(challengeId);
  }

  @override
  Future<OtpResult> verify({
    required String challengeId,
    required String code,
  }) async {
    await _w.pause();
    return _w.security.otp.verify(challengeId, code);
  }
}
