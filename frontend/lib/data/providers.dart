import 'package:blocks_app/app/config/app_config.dart';
import 'package:blocks_app/core/services/local_media_store.dart';
import 'package:blocks_app/core/services/local_store.dart';
import 'package:blocks_app/data/api/api_providers.dart';
import 'package:blocks_app/data/api/unavailable_repositories.dart';
import 'package:blocks_app/data/mock/mock_account_repositories.dart';
import 'package:blocks_app/data/mock/mock_content_repositories.dart';
import 'package:blocks_app/data/mock/mock_creator_demo_service.dart';
import 'package:blocks_app/data/mock/mock_creator_repositories.dart';
import 'package:blocks_app/data/mock/mock_device.dart';
import 'package:blocks_app/data/mock/mock_kyc_repository.dart';
import 'package:blocks_app/data/mock/mock_media_repositories.dart';
import 'package:blocks_app/data/mock/mock_music_repository.dart';
import 'package:blocks_app/data/mock/mock_payout_repositories.dart';
import 'package:blocks_app/data/mock/mock_profile_repository.dart';
import 'package:blocks_app/data/mock/mock_reel_draft_repository.dart';
import 'package:blocks_app/data/mock/mock_reel_publish_repository.dart';
import 'package:blocks_app/data/mock/mock_security_repositories.dart';
import 'package:blocks_app/data/mock/mock_step_up_repository.dart';
import 'package:blocks_app/data/mock/mock_world.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/data/repositories/auth_repository.dart';
import 'package:blocks_app/data/repositories/business_repository.dart';
import 'package:blocks_app/data/repositories/creator_repositories.dart';
import 'package:blocks_app/data/repositories/feed_repository.dart';
import 'package:blocks_app/data/repositories/kyc_repository.dart';
import 'package:blocks_app/data/repositories/media_repositories.dart';
import 'package:blocks_app/data/repositories/message_repository.dart';
import 'package:blocks_app/data/repositories/misc_repositories.dart';
import 'package:blocks_app/data/repositories/music_repository.dart';
import 'package:blocks_app/data/repositories/notification_repository.dart';
import 'package:blocks_app/data/repositories/password_repository.dart';
import 'package:blocks_app/data/repositories/payout_repository.dart';
import 'package:blocks_app/data/repositories/post_repository.dart';
import 'package:blocks_app/data/repositories/profile_repository.dart';
import 'package:blocks_app/data/repositories/reach_repository.dart';
import 'package:blocks_app/data/repositories/reel_draft_repository.dart';
import 'package:blocks_app/data/repositories/reel_publish_repository.dart';
import 'package:blocks_app/data/repositories/reel_repository.dart';
import 'package:blocks_app/data/repositories/security_repository.dart';
import 'package:blocks_app/data/repositories/session_repository.dart';
import 'package:blocks_app/data/repositories/step_up_repository.dart';
import 'package:blocks_app/data/repositories/story_repository.dart';
import 'package:blocks_app/data/repositories/user_repository.dart';
import 'package:blocks_app/data/services/creator_demo_service.dart';
import 'package:blocks_app/data/services/security_demo_service.dart';
import 'package:blocks_app/data/services/security_notification_service.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

// ----------------------------------------------------------- Environment --

final clockProvider = Provider<DateTime Function()>((_) => DateTime.now);

/// Simulated network latency for the demo. Tests override this with zero.
final mockLatencyProvider = Provider<Duration>(
  (_) => const Duration(milliseconds: 280),
);

/// How the mock server sees this device. Tests override it for determinism.
final currentDeviceProvider = Provider<DeviceDescriptor>(
  (_) => describeThisDevice(),
);

/// The single in-memory "server". Only mock repositories touch it.
final mockWorldProvider = Provider<MockWorld>(
  (ref) => MockWorld(
    clock: ref.watch(clockProvider),
    latency: ref.watch(mockLatencyProvider),
    device: ref.watch(currentDeviceProvider),
  ),
);

// ---------------------------------------------------------- Repositories --
//
// The UI only ever watches these providers, typed as interfaces. Moving to a
// real backend means returning `ApiXRepository(dio)` in the `else` branch —
// no widget or controller changes.

/// Picks the implementation for the build: the mock server in demo mode, the
/// real API otherwise. [api] is given only for what the API implements. For the
/// rest, the live build gets a repository that answers every call with
/// "not available" (see `unavailable_repositories.dart`) instead of quietly
/// serving demo data to a person who thinks it is real; `docs/IMPLEMENTATION_PLAN.md`
/// lists which these are.
T _resolve<T>(
  Ref ref,
  String name,
  T Function(MockWorld world) mock, {
  T Function(Ref ref)? api,
}) {
  if (ref.watch(appConfigProvider).useMockData) {
    return mock(ref.watch(mockWorldProvider));
  }
  if (api != null) return api(ref);
  final unavailable = unavailableRepositories[name];
  if (unavailable != null) return unavailable() as T;
  throw UnimplementedError('Api$name is not implemented yet');
}

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  if (ref.watch(appConfigProvider).useMockData) {
    return MockAuthRepository(
      ref.watch(localStoreProvider),
      ref.watch(mockWorldProvider),
    );
  }
  return ref.watch(apiAuthRepositoryProvider);
});
final profileRepositoryProvider = Provider<ProfileRepository>(
  (ref) => _resolve(
    ref,
    'ProfileRepository',
    (world) => MockProfileRepository(world, ref.watch(localMediaStoreProvider)),
    api: (ref) => ref.watch(apiProfileRepositoryProvider),
  ),
);
final securityRepositoryProvider = Provider<SecurityRepository>(
  (ref) => _resolve(
    ref,
    'SecurityRepository',
    MockSecurityRepository.new,
    api: (ref) => ref.watch(apiSecurityRepositoryProvider),
  ),
);
final sessionRepositoryProvider = Provider<SessionRepository>(
  (ref) => _resolve(
    ref,
    'SessionRepository',
    MockSessionRepository.new,
    api: (ref) => ref.watch(apiSessionRepositoryProvider),
  ),
);
final passwordRepositoryProvider = Provider<PasswordRepository>(
  (ref) => _resolve(
    ref,
    'PasswordRepository',
    MockPasswordRepository.new,
    api: (ref) => ref.watch(apiPasswordRepositoryProvider),
  ),
);
final passwordResetRepositoryProvider = Provider<PasswordResetRepository>(
  (ref) => _resolve(
    ref,
    'PasswordResetRepository',
    MockPasswordResetRepository.new,
    api: (ref) => ref.watch(apiPasswordResetRepositoryProvider),
  ),
);

/// Backend-side in production (see the interface); here only so the mock
/// server can show that an alert e-mail was generated.
final securityNotificationServiceProvider =
    Provider<SecurityNotificationService>(
      (ref) => _resolve(
        ref,
        'SecurityNotificationService',
        (world) => world.security.notificationService,
      ),
    );

/// Demo builds only: drives the mock server through the security scenarios.
final securityDemoServiceProvider = Provider<SecurityDemoService>(
  (ref) => _resolve(ref, 'SecurityDemoService', MockSecurityDemoService.new),
);
final userRepositoryProvider = Provider<UserRepository>(
  (ref) => _resolve(
    ref,
    'UserRepository',
    MockUserRepository.new,
    api: (ref) => ref.watch(apiUserRepositoryProvider),
  ),
);
final feedRepositoryProvider = Provider<FeedRepository>(
  (ref) => _resolve(
    ref,
    'FeedRepository',
    MockFeedRepository.new,
    api: (ref) => ref.watch(apiFeedRepositoryProvider),
  ),
);
final postRepositoryProvider = Provider<PostRepository>(
  (ref) => _resolve(
    ref,
    'PostRepository',
    MockPostRepository.new,
    api: (ref) => ref.watch(apiPostRepositoryProvider),
  ),
);
final storyRepositoryProvider = Provider<StoryRepository>(
  (ref) => _resolve(ref, 'StoryRepository', MockStoryRepository.new),
);
final reelRepositoryProvider = Provider<ReelRepository>(
  (ref) => _resolve(
    ref,
    'ReelRepository',
    MockReelRepository.new,
    api: (ref) => ref.watch(apiReelRepositoryProvider),
  ),
);
final notificationRepositoryProvider = Provider<NotificationRepository>(
  (ref) => _resolve(
    ref,
    'NotificationRepository',
    MockNotificationRepository.new,
    api: (ref) => ref.watch(apiNotificationRepositoryProvider),
  ),
);
final messageRepositoryProvider = Provider<MessageRepository>(
  (ref) => _resolve(ref, 'MessageRepository', MockMessageRepository.new),
);
final businessRepositoryProvider = Provider<BusinessRepository>(
  (ref) => _resolve(ref, 'BusinessRepository', MockBusinessRepository.new),
);
final reachRepositoryProvider = Provider<ReachRepository>(
  (ref) => _resolve(
    ref,
    'ReachRepository',
    MockReachRepository.new,
    api: (ref) => ref.watch(apiReachRepositoryProvider),
  ),
);
final creatorRepositoryProvider = Provider<CreatorRepository>(
  (ref) => _resolve(ref, 'CreatorRepository', MockCreatorRepository.new),
);
final adRepositoryProvider = Provider<AdRepository>(
  (ref) => _resolve(ref, 'AdRepository', MockAdRepository.new),
);
final verificationRepositoryProvider = Provider<VerificationRepository>(
  (ref) =>
      _resolve(ref, 'VerificationRepository', MockVerificationRepository.new),
);
final moderationRepositoryProvider = Provider<ModerationRepository>(
  (ref) => _resolve(
    ref,
    'ModerationRepository',
    MockModerationRepository.new,
    api: (ref) => ref.watch(apiModerationRepositoryProvider),
  ),
);
final exploreRepositoryProvider = Provider<ExploreRepository>(
  (ref) => _resolve(ref, 'ExploreRepository', MockExploreRepository.new),
);

// ----------------------------------------- Reels, media, music, creator money --

final mediaLibraryRepositoryProvider = Provider<MediaLibraryRepository>(
  (ref) =>
      _resolve(ref, 'MediaLibraryRepository', MockMediaLibraryRepository.new),
);
final mediaProcessingRepositoryProvider = Provider<MediaProcessingRepository>(
  (ref) => _resolve(
    ref,
    'MediaProcessingRepository',
    MockMediaProcessingRepository.new,
  ),
);
final mediaUploadRepositoryProvider = Provider<MediaUploadRepository>(
  (ref) =>
      _resolve(ref, 'MediaUploadRepository', MockMediaUploadRepository.new),
);
final musicRepositoryProvider = Provider<MusicRepository>(
  (ref) => _resolve(ref, 'MusicRepository', MockMusicRepository.new),
);
final reelDraftRepositoryProvider = Provider<ReelDraftRepository>(
  (ref) => _resolve(
    ref,
    'ReelDraftRepository',
    (world) => MockReelDraftRepository(ref.watch(localStoreProvider), world),
  ),
);
final reelPublishRepositoryProvider = Provider<ReelPublishRepository>(
  (ref) =>
      _resolve(ref, 'ReelPublishRepository', MockReelPublishRepository.new),
);
final creatorConfigRepositoryProvider = Provider<CreatorConfigRepository>(
  (ref) =>
      _resolve(ref, 'CreatorConfigRepository', MockCreatorConfigRepository.new),
);
final creatorMusicRepositoryProvider = Provider<CreatorMusicRepository>(
  (ref) =>
      _resolve(ref, 'CreatorMusicRepository', MockCreatorMusicRepository.new),
);
final creatorInsightsRepositoryProvider = Provider<CreatorInsightsRepository>(
  (ref) => _resolve(
    ref,
    'CreatorInsightsRepository',
    MockCreatorInsightsRepository.new,
  ),
);
final kycRepositoryProvider = Provider<KycRepository>(
  (ref) => _resolve(ref, 'KycRepository', MockKycRepository.new),
);
final bankAccountRepositoryProvider = Provider<BankAccountRepository>(
  (ref) =>
      _resolve(ref, 'BankAccountRepository', MockBankAccountRepository.new),
);
final payoutRepositoryProvider = Provider<PayoutRepository>(
  (ref) => _resolve(ref, 'PayoutRepository', MockPayoutRepository.new),
);
final taxRepositoryProvider = Provider<TaxRepository>(
  (ref) => _resolve(ref, 'TaxRepository', MockTaxRepository.new),
);
final stepUpRepositoryProvider = Provider<StepUpRepository>(
  (ref) => _resolve(ref, 'StepUpRepository', MockStepUpRepository.new),
);

/// Demo builds only: steers the mock creator back-end (KYC outcome, upload
/// failure, held payout, ...). A production build has no such service.
final creatorDemoServiceProvider = Provider<CreatorDemoService>(
  (ref) => _resolve(ref, 'CreatorDemoService', MockCreatorDemoService.new),
);
