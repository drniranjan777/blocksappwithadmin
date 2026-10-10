import 'package:blocks_app/core/services/local_store.dart';
import 'package:blocks_app/data/mock/demo_credentials.dart';
import 'package:blocks_app/data/mock/mock_creator_repositories.dart';
import 'package:blocks_app/data/mock/mock_kyc_repository.dart';
import 'package:blocks_app/data/mock/mock_media_repositories.dart';
import 'package:blocks_app/data/mock/mock_music_repository.dart';
import 'package:blocks_app/data/mock/mock_payout_repositories.dart';
import 'package:blocks_app/data/mock/mock_reel_draft_repository.dart';
import 'package:blocks_app/data/mock/mock_reel_publish_repository.dart';
import 'package:blocks_app/data/mock/mock_step_up_repository.dart';
import 'package:blocks_app/data/mock/mock_world.dart';
import 'package:blocks_app/data/models/kyc_models.dart';
import 'package:blocks_app/data/models/payout_models.dart';
import 'package:blocks_app/data/models/security_models.dart';

/// The mock creator back-end with a clock the test controls (a Friday, so
/// business-day arithmetic is easy to follow).
class CreatorServer {
  CreatorServer() {
    world = MockWorld(clock: () => now);
    store = InMemoryLocalStore();
    kyc = MockKycRepository(world);
    bank = MockBankAccountRepository(world);
    payout = MockPayoutRepository(world);
    tax = MockTaxRepository(world);
    stepUp = MockStepUpRepository(world);
    insights = MockCreatorInsightsRepository(world);
    creatorMusic = MockCreatorMusicRepository(world);
    config = MockCreatorConfigRepository(world);
    music = MockMusicRepository(world);
    drafts = MockReelDraftRepository(store, world);
    library = MockMediaLibraryRepository(world);
    processing = MockMediaProcessingRepository(world);
    upload = MockMediaUploadRepository(world);
    publish = MockReelPublishRepository(world);
  }

  DateTime now = DateTime(2026, 10, 9, 12);
  late final MockWorld world;
  late final InMemoryLocalStore store;
  late final MockKycRepository kyc;
  late final MockBankAccountRepository bank;
  late final MockPayoutRepository payout;
  late final MockTaxRepository tax;
  late final MockStepUpRepository stepUp;
  late final MockCreatorInsightsRepository insights;
  late final MockCreatorMusicRepository creatorMusic;
  late final MockCreatorConfigRepository config;
  late final MockMusicRepository music;
  late final MockReelDraftRepository drafts;
  late final MockMediaLibraryRepository library;
  late final MockMediaProcessingRepository processing;
  late final MockMediaUploadRepository upload;
  late final MockReelPublishRepository publish;

  void advance(Duration d) => now = now.add(d);

  /// Runs the real two-step confirmation (password, then code) and returns
  /// the single-use token.
  Future<String> token(StepUpPurpose purpose) async {
    final challenge = await stepUp.begin(
      purpose,
      password: DemoCredentials.password,
    );
    final result = await stepUp.verify(
      challengeId: challenge.id,
      code: DemoCredentials.otp,
    );
    return (result as OtpVerified).token;
  }

  KycDocumentInput panDoc([String number = 'ABCDE1234F']) => KycDocumentInput(
    typeId: 'pan',
    number: number,
    file: const KycFile(name: 'pan.jpg', sizeBytes: 600 * 1024),
  );

  Future<KycApplication> submitKyc({
    String name = 'Aarav Kumar',
    String number = 'ABCDE1234F',
  }) => kyc.submit(
    KycSubmission(
      subject: KycSubject.individual,
      legalName: name,
      dateOfBirth: DateTime(1992, 4, 12),
      documents: [panDoc(number)],
    ),
  );

  /// Submits identity and lets the review finish.
  Future<KycApplication> verifyIdentity({String name = 'Aarav Kumar'}) async {
    await submitKyc(name: name);
    advance(const Duration(seconds: 7));
    return kyc.getApplication();
  }

  Future<BankAccount> addBank({
    String holder = 'Aarav Kumar',
    String account = '123456784821',
    String? confirm,
    String ifsc = 'HDFC0001234',
    String? stepUpToken,
  }) async => bank.addAccount(
    BankAccountInput(
      holderName: holder,
      accountNumber: account,
      confirmAccountNumber: confirm ?? account,
      ifsc: ifsc,
    ),
    stepUpToken: stepUpToken ?? await token(StepUpPurpose.addBankAccount),
  );
}
