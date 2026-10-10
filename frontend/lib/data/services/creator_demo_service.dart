import 'package:blocks_app/data/models/kyc_models.dart';

/// How the (mock) server will treat the next KYC review.
enum DemoKycOutcome { verified, rejected, actionRequired }

/// How the (mock) server will treat the next payout.
enum DemoPayoutOutcome { completed, failed, onHold, reversed }

/// How the (mock) server will treat the next reel publish.
enum DemoPublishOutcome { published, uploadFails, moderationRejects }

/// What the mock server currently believes (shown in the demo lab).
class CreatorDemoStatus {
  const CreatorDemoStatus({
    required this.kycOutcome,
    required this.payoutOutcome,
    required this.publishOutcome,
    required this.safetyHoldOn,
    required this.kycStatus,
    required this.available,
    required this.bankAccounts,
    required this.openPayouts,
  });

  final DemoKycOutcome kycOutcome;
  final DemoPayoutOutcome payoutOutcome;
  final DemoPublishOutcome publishOutcome;
  final bool safetyHoldOn;
  final KycStatus kycStatus;
  final int available;
  final int bankAccounts;
  final int openPayouts;
}

/// Demo-only: steers the mock creator back-end so a walk-through can show the
/// failure paths too (rejected KYC, failed upload, held payout, ...). It is not
/// part of any production build.
abstract interface class CreatorDemoService {
  Future<CreatorDemoStatus> status();

  Future<void> setKycOutcome(DemoKycOutcome outcome);

  Future<void> setPayoutOutcome(DemoPayoutOutcome outcome);

  /// Applies to the next publish only.
  Future<void> setPublishOutcome(DemoPublishOutcome outcome);

  /// Pauses payouts for 24 h after every payout-account change.
  Future<void> setSafetyHold({required bool enabled});

  /// Makes a verified identity expire now.
  Future<void> expireVerification();

  /// Back to the seeded money, identity, bank and payout state.
  Future<void> reset();
}
