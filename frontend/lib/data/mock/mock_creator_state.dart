import 'package:blocks_app/core/constants/demo_media.dart';
import 'package:blocks_app/data/mock/mock_name_matcher.dart';
import 'package:blocks_app/data/mock/mock_world.dart';
import 'package:blocks_app/data/models/kyc_models.dart';
import 'package:blocks_app/data/models/media_models.dart';
import 'package:blocks_app/data/models/payout_models.dart';
import 'package:blocks_app/data/models/reel_models.dart';
import 'package:blocks_app/data/services/creator_demo_service.dart';

/// Everything the mock "creator back-end" knows: configuration, identity
/// verification, bank accounts, balances, payouts, tax details and uploads.
///
/// This object plays the server. Statuses move with the (mock) clock, never
/// because the UI says so: KYC is `pending` -> `underReview` -> an outcome,
/// and a payout is `requested` -> `processing` -> an outcome. Nothing the UI
/// holds can mark a creator verified or a payout paid.
class MockCreatorState {
  MockCreatorState(this.world) {
    reset();
  }

  final MockWorld world;

  DateTime now() => world.now();

  // Server-controlled configuration ---------------------------------------
  ReelConfig reelConfig = const ReelConfig.demo();
  KycConfig kycConfig = defaultKycConfig;
  PayoutConfig payoutConfig = const PayoutConfig.demo();

  // How long (mock time) each review step takes -----------------------------
  static const kycPendingFor = Duration(seconds: 2);
  static const kycReviewFor = Duration(seconds: 6);
  static const payoutRequestedFor = Duration(seconds: 4);
  static const payoutProcessingFor = Duration(seconds: 12);

  // Demo-lab switches --------------------------------------------------------
  DemoKycOutcome kycOutcome = DemoKycOutcome.verified;
  DemoPayoutOutcome payoutOutcome = DemoPayoutOutcome.completed;
  DemoPublishOutcome publishOutcome = DemoPublishOutcome.published;

  // Identity (KYC) -----------------------------------------------------------
  KycApplication _kyc = const KycApplication.none();

  // Money --------------------------------------------------------------------
  final List<BankAccount> banks = [];
  final List<PayoutRequest> payouts = [];
  final Map<String, DemoPayoutOutcome> _payoutPlan = {};
  final Set<String> _settled = {};
  DateTime? payoutHoldUntil;
  int available = 12420;
  int pending = 4800;
  int paid = 48200;
  TaxInfo tax = const TaxInfo.none();

  // Music ---------------------------------------------------------------------
  /// Reels the creator already has per track id, before anything made in this
  /// session. Includes tracks whose licence has since ended.
  final Map<String, int> musicUses = {'m01': 6, 'm02': 3, 'm43': 2, 'x01': 1};
  final Set<String> reusableAudio = {'oa1'};

  // Uploads and publishing ----------------------------------------------------
  final Map<String, UploadSession> uploadSessions = {};

  /// Sessions the server has assembled and issued a receipt for.
  final Set<String> completedUploads = {};
  final Map<String, ReelDraft> jobDrafts = {};

  // Media library ---------------------------------------------------------------
  final List<MediaAsset> recorded = [];

  int _seq = 0;
  String nextId(String prefix) => '$prefix~${++_seq}';

  /// Back to the seeded demo state.
  void reset() {
    reelConfig = const ReelConfig.demo();
    kycConfig = defaultKycConfig;
    payoutConfig = const PayoutConfig.demo();
    kycOutcome = DemoKycOutcome.verified;
    payoutOutcome = DemoPayoutOutcome.completed;
    publishOutcome = DemoPublishOutcome.published;
    _kyc = const KycApplication.none();
    banks.clear();
    payouts
      ..clear()
      ..addAll(_seedPayouts());
    _payoutPlan.clear();
    _settled
      ..clear()
      ..addAll(payouts.map((p) => p.id));
    payoutHoldUntil = null;
    available = 12420;
    pending = 4800;
    paid = 48200;
    tax = const TaxInfo.none();
    reusableAudio
      ..clear()
      ..add('oa1');
    uploadSessions.clear();
    completedUploads.clear();
    jobDrafts.clear();
    recorded.clear();
  }

  List<PayoutRequest> _seedPayouts() {
    final t = now();
    PayoutRequest p(
      int daysAgo,
      int amount,
      PayoutStatus status, {
      String? reason,
    }) {
      final at = t.subtract(Duration(days: daysAgo));
      return PayoutRequest(
        id: nextId('po'),
        amount: amount,
        status: status,
        requestedAt: at,
        estimatedFrom: at.add(const Duration(days: 2)),
        estimatedTo: at.add(const Duration(days: 5)),
        bankLabel: 'Axis Bank •••• 7740',
        reference: 'BLK${at.millisecondsSinceEpoch % 1000000}',
        completedAt: status == PayoutStatus.completed
            ? at.add(const Duration(days: 3))
            : null,
        reasonCode: reason,
      );
    }

    return [
      p(24, 10000, PayoutStatus.completed),
      p(52, 5000, PayoutStatus.failed, reason: 'bankRejected'),
      p(58, 18200, PayoutStatus.completed),
      p(86, 20000, PayoutStatus.completed),
    ];
  }

  // ------------------------------------------------------------------ KYC --

  KycApplication get kyc {
    syncKyc();
    return _kyc;
  }

  set kyc(KycApplication value) => _kyc = value;

  KycStatus get kycStatus => kyc.status;

  /// Moves a submitted application along with the clock.
  void syncKyc() {
    final t = now();
    final k = _kyc;

    if (k.status == KycStatus.verified &&
        k.expiresAt != null &&
        !t.isBefore(k.expiresAt!)) {
      _kyc = _copyKyc(k, status: KycStatus.expired);
      return;
    }
    if (!k.status.isInProgress || k.submittedAt == null) return;

    final age = t.difference(k.submittedAt!);
    if (age < kycPendingFor) return;
    if (age < kycReviewFor) {
      if (k.status != KycStatus.underReview) {
        _kyc = _copyKyc(k, status: KycStatus.underReview);
      }
      return;
    }

    switch (kycOutcome) {
      case DemoKycOutcome.verified:
        _kyc = _copyKyc(
          k,
          status: KycStatus.verified,
          reviewedAt: t,
          expiresAt: t.add(kycConfig.validity),
          docState: KycDocumentState.accepted,
        );
        _reviewBanksAfterIdentity();
      case DemoKycOutcome.rejected:
        _kyc = _copyKyc(
          k,
          status: KycStatus.rejected,
          reviewedAt: t,
          reason: 'mismatch',
          docState: KycDocumentState.rejected,
        );
      case DemoKycOutcome.actionRequired:
        _kyc = _copyKyc(
          k,
          status: KycStatus.actionRequired,
          reviewedAt: t,
          reason: 'unreadable',
          docState: KycDocumentState.rejected,
        );
    }
  }

  KycApplication _copyKyc(
    KycApplication k, {
    required KycStatus status,
    DateTime? reviewedAt,
    DateTime? expiresAt,
    String? reason,
    KycDocumentState? docState,
  }) => KycApplication(
    status: status,
    subject: k.subject,
    legalName: k.legalName,
    businessName: k.businessName,
    businessType: k.businessType,
    documents: [
      for (final d in k.documents)
        KycDocumentRecord(
          typeId: d.typeId,
          label: d.label,
          maskedNumber: d.maskedNumber,
          fileName: d.fileName,
          uploadedAt: d.uploadedAt,
          state: docState ?? d.state,
        ),
    ],
    submittedAt: k.submittedAt,
    reviewedAt: reviewedAt ?? k.reviewedAt,
    expiresAt: expiresAt ?? k.expiresAt,
    reasonCode: reason,
  );

  /// Accounts saved before identity was verified get their name check now.
  void _reviewBanksAfterIdentity() {
    for (var i = 0; i < banks.length; i++) {
      if (banks[i].status == BankVerificationStatus.awaitingIdentity) {
        banks[i] = resolveBank(banks[i]);
      }
    }
  }

  /// Decides a bank account's status against the verified identity.
  BankAccount resolveBank(BankAccount a) {
    if (!_kyc.status.isVerified) {
      return a.copyWith(status: BankVerificationStatus.awaitingIdentity);
    }
    final ok = NameMatcher.matches(a.holderName, _kyc.legalName);
    return ok
        ? a.copyWith(
            status: BankVerificationStatus.verified,
            verifiedAt: now(),
            clearFailure: true,
          )
        : a.copyWith(
            status: BankVerificationStatus.nameMismatch,
            failureReason: 'nameMismatch',
          );
  }

  // -------------------------------------------------------------- payouts --

  /// Applies the clock to every open payout, settling money exactly once.
  void syncPayouts() {
    final t = now();
    for (var i = 0; i < payouts.length; i++) {
      final p = payouts[i];
      if (_settled.contains(p.id)) continue;
      final age = t.difference(p.requestedAt);
      final plan = _payoutPlan[p.id] ?? DemoPayoutOutcome.completed;

      if (age < payoutRequestedFor) continue;
      if (age < payoutProcessingFor) {
        if (p.status != PayoutStatus.processing) {
          payouts[i] = p.copyWith(status: PayoutStatus.processing);
        }
        continue;
      }
      switch (plan) {
        case DemoPayoutOutcome.completed:
          payouts[i] = p.copyWith(
            status: PayoutStatus.completed,
            completedAt: t,
          );
          paid += p.amount;
          _settled.add(p.id);
        case DemoPayoutOutcome.failed:
          payouts[i] = p.copyWith(
            status: PayoutStatus.failed,
            reasonCode: 'bankRejected',
          );
          available += p.amount;
          _settled.add(p.id);
        case DemoPayoutOutcome.onHold:
          // Stays open (and keeps the money set aside) until reviewed.
          if (p.status != PayoutStatus.onHold) {
            payouts[i] = p.copyWith(
              status: PayoutStatus.onHold,
              reasonCode: 'securityReview',
            );
          }
        case DemoPayoutOutcome.reversed:
          payouts[i] = p.copyWith(
            status: PayoutStatus.reversed,
            reasonCode: 'bankReturned',
            completedAt: t,
          );
          available += p.amount;
          _settled.add(p.id);
      }
    }
  }

  void planPayout(String id) => _payoutPlan[id] = payoutOutcome;

  /// Starts the safety hold after a payout-account change (if configured).
  void startAccountHold() {
    final hold = payoutConfig.holdAfterAccountChange;
    payoutHoldUntil = hold == Duration.zero ? null : now().add(hold);
  }

  // ------------------------------------------------------------- uploads --

  /// Whether the simulated connection drop is due now. It fires **once**, then
  /// the switch resets, so the creator's retry succeeds and resumes.
  bool shouldFailUpload(String assetId) {
    if (publishOutcome != DemoPublishOutcome.uploadFails) return false;
    publishOutcome = DemoPublishOutcome.published;
    return true;
  }

  /// The moderation verdict for the job being published. A rejection applies
  /// to one publish, then the switch resets.
  ModerationResult takeModerationVerdict() {
    if (publishOutcome == DemoPublishOutcome.moderationRejects) {
      publishOutcome = DemoPublishOutcome.published;
      return const ModerationResult(
        verdict: ModerationVerdict.rejected,
        reason: 'copyright',
      );
    }
    return const ModerationResult(verdict: ModerationVerdict.approved);
  }
}

// ----------------------------------------------------------- default config --

/// Accepted documents (India). Demo values; the real list is server config.
const defaultKycConfig = KycConfig(
  individualDocuments: [
    KycDocumentType(
      id: 'aadhaar',
      label: 'Aadhaar',
      numberLabel: 'Aadhaar number',
      numberPattern: r'^[2-9]\d{11}$',
      numberHint: '12 digits',
      needsBackSide: true,
    ),
    KycDocumentType(
      id: 'pan',
      label: 'PAN card',
      numberLabel: 'PAN number',
      numberPattern: r'^[A-Z]{5}\d{4}[A-Z]$',
      numberHint: 'ABCDE1234F',
    ),
    KycDocumentType(
      id: 'passport',
      label: 'Passport',
      numberLabel: 'Passport number',
      numberPattern: r'^[A-Z]\d{7}$',
      numberHint: 'A1234567',
    ),
    KycDocumentType(
      id: 'voter',
      label: 'Voter ID',
      numberLabel: 'EPIC number',
      numberPattern: r'^[A-Z]{3}\d{7}$',
      numberHint: 'ABC1234567',
    ),
    KycDocumentType(
      id: 'driving',
      label: 'Driving licence',
      numberLabel: 'Licence number',
      numberPattern: r'^[A-Z]{2}[0-9A-Z]{9,14}$',
      numberHint: 'TS0920110012345',
    ),
  ],
  businessDocuments: [
    KycDocumentType(
      id: 'gst',
      label: 'GST certificate',
      numberLabel: 'GSTIN',
      numberPattern: r'^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$',
      numberHint: '36ABCDE1234F1Z5',
    ),
    KycDocumentType(
      id: 'udyam',
      label: 'Udyam registration',
      numberLabel: 'Udyam number',
      numberPattern: r'^UDYAM[A-Z]{2}\d{9}$',
      numberHint: 'UDYAM-TS-00-0012345',
    ),
    KycDocumentType(
      id: 'businessPan',
      label: 'Business PAN',
      numberLabel: 'PAN number',
      numberPattern: r'^[A-Z]{5}\d{4}[A-Z]$',
      numberHint: 'ABCDE1234F',
    ),
    KycDocumentType(
      id: 'incorporation',
      label: 'Certificate of incorporation',
      numberLabel: 'CIN',
      numberPattern: r'^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$',
      numberHint: 'U12345TS2020PTC123456',
    ),
  ],
  businessTypes: [
    KycBusinessType(id: 'sole', label: 'Sole proprietorship'),
    KycBusinessType(id: 'partnership', label: 'Partnership firm'),
    KycBusinessType(id: 'llp', label: 'Limited liability partnership'),
    KycBusinessType(id: 'private', label: 'Private limited company'),
    KycBusinessType(id: 'public', label: 'Public limited company'),
    KycBusinessType(id: 'trust', label: 'Trust or society'),
    KycBusinessType(id: 'other', label: 'Other'),
  ],
  signatoryDocuments: [
    KycDocumentType(
      id: 'aadhaar',
      label: 'Aadhaar',
      numberLabel: 'Aadhaar number',
      numberPattern: r'^[2-9]\d{11}$',
      numberHint: '12 digits',
      needsBackSide: true,
    ),
    KycDocumentType(
      id: 'pan',
      label: 'PAN card',
      numberLabel: 'PAN number',
      numberPattern: r'^[A-Z]{5}\d{4}[A-Z]$',
      numberHint: 'ABCDE1234F',
    ),
    KycDocumentType(
      id: 'passport',
      label: 'Passport',
      numberLabel: 'Passport number',
      numberPattern: r'^[A-Z]\d{7}$',
      numberHint: 'A1234567',
    ),
  ],
);

// -------------------------------------------------------------- demo gallery --

/// The generated "gallery" the demo offers. Sizes are realistic so the
/// optimisation numbers mean something ("82 MB -> 18 MB").
List<MediaAsset> buildDemoGallery() {
  MediaAsset video(
    int seed, {
    required int seconds,
    required int mb,
    int w = 1080,
    int h = 1920,
    String? name,
  }) => MediaAsset(
    id: 'g~clip~$seed',
    type: MediaType.video,
    origin: MediaOrigin.demo,
    localPath: 'demo://clip/$seed',
    thumbnailPath: demoPhotoUrl(seed),
    originalSizeBytes: mb * 1024 * 1024,
    durationMs: seconds * 1000,
    width: w,
    height: h,
    name: name ?? 'VID_$seed.mp4',
  );

  MediaAsset photo(int seed, {required int kb, int w = 4000, int h = 3000}) =>
      MediaAsset(
        id: 'g~photo~$seed',
        type: MediaType.photo,
        origin: MediaOrigin.demo,
        localPath: 'demo://photo/$seed',
        thumbnailPath: demoPhotoUrl(seed),
        originalSizeBytes: kb * 1024,
        durationMs: 0,
        width: w,
        height: h,
        name: 'IMG_$seed.jpg',
      );

  return [
    video(3101, seconds: 4, mb: 18),
    // A long 1080p60 phone clip: ~82 MB, so Balanced shows ~78% smaller.
    video(3202, seconds: 35, mb: 82),
    video(3303, seconds: 8, mb: 41),
    video(3404, seconds: 5, mb: 27),
    video(3505, seconds: 12, mb: 96, w: 2160, h: 3840),
    video(3606, seconds: 7, mb: 33),
    video(3707, seconds: 9, mb: 54),
    // Deliberately over the limit: shows the size check.
    video(3808, seconds: 40, mb: 612, w: 2160, h: 3840),
    for (var i = 0; i < kDemoPhotoSeeds.length; i++)
      photo(
        kDemoPhotoSeeds[i],
        kb: 1800 + (i * 370) % 4200,
        w: i.isEven ? 4000 : 3024,
        h: i.isEven ? 3000 : 4032,
      ),
  ];
}
