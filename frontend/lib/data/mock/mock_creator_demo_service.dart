import 'package:blocks_app/data/mock/mock_creator_state.dart';
import 'package:blocks_app/data/mock/mock_world.dart';
import 'package:blocks_app/data/models/kyc_models.dart';
import 'package:blocks_app/data/models/payout_models.dart';
import 'package:blocks_app/data/services/creator_demo_service.dart';

class MockCreatorDemoService implements CreatorDemoService {
  MockCreatorDemoService(this._w);

  final MockWorld _w;
  MockCreatorState get _c => _w.creator;

  @override
  Future<CreatorDemoStatus> status() async {
    _c.syncKyc();
    _c.syncPayouts();
    return CreatorDemoStatus(
      kycOutcome: _c.kycOutcome,
      payoutOutcome: _c.payoutOutcome,
      publishOutcome: _c.publishOutcome,
      safetyHoldOn: _c.payoutConfig.holdAfterAccountChange > Duration.zero,
      kycStatus: _c.kycStatus,
      available: _c.available,
      bankAccounts: _c.banks.length,
      openPayouts: _c.payouts.where((p) => p.status.isOpen).length,
    );
  }

  @override
  Future<void> setKycOutcome(DemoKycOutcome outcome) async {
    _c.kycOutcome = outcome;
  }

  @override
  Future<void> setPayoutOutcome(DemoPayoutOutcome outcome) async {
    _c.payoutOutcome = outcome;
  }

  @override
  Future<void> setPublishOutcome(DemoPublishOutcome outcome) async {
    _c.publishOutcome = outcome;
  }

  @override
  Future<void> setSafetyHold({required bool enabled}) async {
    _c.payoutConfig = _c.payoutConfig.copyWith(
      holdAfterAccountChange: enabled
          ? const Duration(hours: 24)
          : Duration.zero,
    );
    if (!enabled) _c.payoutHoldUntil = null;
  }

  @override
  Future<void> expireVerification() async {
    final k = _c.kyc;
    if (k.status != KycStatus.verified) return;
    _c.kyc = KycApplication(
      status: KycStatus.expired,
      subject: k.subject,
      legalName: k.legalName,
      businessName: k.businessName,
      businessType: k.businessType,
      documents: k.documents,
      submittedAt: k.submittedAt,
      reviewedAt: k.reviewedAt,
      expiresAt: _w.now(),
    );
  }

  @override
  Future<void> reset() async {
    _c.reset();
  }
}
