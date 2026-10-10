import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/models/media_models.dart';
import 'package:blocks_app/data/models/reel_models.dart';
import 'package:blocks_app/data/repositories/business_repository.dart';
import 'package:blocks_app/data/repositories/creator_repositories.dart';
import 'package:blocks_app/data/repositories/kyc_repository.dart';
import 'package:blocks_app/data/repositories/media_repositories.dart';
import 'package:blocks_app/data/repositories/message_repository.dart';
import 'package:blocks_app/data/repositories/misc_repositories.dart';
import 'package:blocks_app/data/repositories/music_repository.dart';
import 'package:blocks_app/data/repositories/payout_repository.dart';
import 'package:blocks_app/data/repositories/reel_draft_repository.dart';
import 'package:blocks_app/data/repositories/reel_publish_repository.dart';
import 'package:blocks_app/data/repositories/step_up_repository.dart';
import 'package:blocks_app/data/repositories/story_repository.dart';

// Features the live service does not offer to the app yet.
//
// With the real service on, these answer every call with the same failure
// instead of quietly serving demo data (a person must never mistake invented
// money, messages or ads for real ones) and instead of crashing. Each screen
// already has an error state with a retry, so the person sees that the section
// is not available rather than a broken one. `docs/IMPLEMENTATION_PLAN.md`
// lists which of these are waiting on the server and which on the app.

/// What every call to one of these answers with.
const featureUnavailable = ForbiddenFailure(
  'This is not available yet',
  'NOT_AVAILABLE',
);

// `Future<Never>` is a subtype of every `Future<T>`, so the failure can stand
// in for whatever the call was meant to return.
Future<Never> _fail() => Future<Never>.error(featureUnavailable);

class UnavailableStoryRepository implements StoryRepository {
  const UnavailableStoryRepository();

  @override
  dynamic noSuchMethod(Invocation invocation) => _fail();
}

class UnavailableMessageRepository implements MessageRepository {
  const UnavailableMessageRepository();

  @override
  dynamic noSuchMethod(Invocation invocation) => _fail();
}

class UnavailableBusinessRepository implements BusinessRepository {
  const UnavailableBusinessRepository();

  @override
  dynamic noSuchMethod(Invocation invocation) => _fail();
}

class UnavailableCreatorRepository implements CreatorRepository {
  const UnavailableCreatorRepository();

  @override
  dynamic noSuchMethod(Invocation invocation) => _fail();
}

class UnavailableAdRepository implements AdRepository {
  const UnavailableAdRepository();

  @override
  dynamic noSuchMethod(Invocation invocation) => _fail();
}

class UnavailableVerificationRepository implements VerificationRepository {
  const UnavailableVerificationRepository();

  @override
  dynamic noSuchMethod(Invocation invocation) => _fail();
}

class UnavailableModerationRepository implements ModerationRepository {
  const UnavailableModerationRepository();

  @override
  dynamic noSuchMethod(Invocation invocation) => _fail();
}

class UnavailableExploreRepository implements ExploreRepository {
  const UnavailableExploreRepository();

  @override
  dynamic noSuchMethod(Invocation invocation) => _fail();
}

class UnavailableMediaLibraryRepository implements MediaLibraryRepository {
  const UnavailableMediaLibraryRepository();

  // A getter, not a future: it must answer plainly instead of failing like the rest.
  @override
  bool get picksFromDevice => false;

  @override
  dynamic noSuchMethod(Invocation invocation) => _fail();
}

class UnavailableMediaProcessingRepository
    implements MediaProcessingRepository {
  const UnavailableMediaProcessingRepository();

  @override
  Stream<MediaPipelineEvent> prepare(
    MediaAsset asset,
    MediaProfile profile, {
    Duration? usedDuration,
  }) => Stream.error(featureUnavailable);

  @override
  dynamic noSuchMethod(Invocation invocation) => _fail();
}

class UnavailableMediaUploadRepository implements MediaUploadRepository {
  const UnavailableMediaUploadRepository();

  @override
  Stream<ChunkUploadProgress> upload(UploadSession session) =>
      Stream.error(featureUnavailable);

  @override
  dynamic noSuchMethod(Invocation invocation) => _fail();
}

class UnavailableMusicRepository implements MusicRepository {
  const UnavailableMusicRepository();

  @override
  dynamic noSuchMethod(Invocation invocation) => _fail();
}

class UnavailableReelDraftRepository implements ReelDraftRepository {
  const UnavailableReelDraftRepository();

  @override
  dynamic noSuchMethod(Invocation invocation) => _fail();
}

class UnavailableReelPublishRepository implements ReelPublishRepository {
  const UnavailableReelPublishRepository();

  @override
  Stream<PublishJobStatus> watch(String jobId) =>
      Stream.error(featureUnavailable);

  @override
  dynamic noSuchMethod(Invocation invocation) => _fail();
}

class UnavailableCreatorConfigRepository implements CreatorConfigRepository {
  const UnavailableCreatorConfigRepository();

  @override
  dynamic noSuchMethod(Invocation invocation) => _fail();
}

class UnavailableCreatorMusicRepository implements CreatorMusicRepository {
  const UnavailableCreatorMusicRepository();

  @override
  dynamic noSuchMethod(Invocation invocation) => _fail();
}

class UnavailableCreatorInsightsRepository
    implements CreatorInsightsRepository {
  const UnavailableCreatorInsightsRepository();

  @override
  dynamic noSuchMethod(Invocation invocation) => _fail();
}

class UnavailableKycRepository implements KycRepository {
  const UnavailableKycRepository();

  @override
  dynamic noSuchMethod(Invocation invocation) => _fail();
}

class UnavailableBankAccountRepository implements BankAccountRepository {
  const UnavailableBankAccountRepository();

  @override
  dynamic noSuchMethod(Invocation invocation) => _fail();
}

class UnavailablePayoutRepository implements PayoutRepository {
  const UnavailablePayoutRepository();

  @override
  dynamic noSuchMethod(Invocation invocation) => _fail();
}

class UnavailableTaxRepository implements TaxRepository {
  const UnavailableTaxRepository();

  @override
  dynamic noSuchMethod(Invocation invocation) => _fail();
}

class UnavailableStepUpRepository implements StepUpRepository {
  const UnavailableStepUpRepository();

  @override
  dynamic noSuchMethod(Invocation invocation) => _fail();
}

/// What each provider in `lib/data/providers.dart` falls back to when the live
/// service is on and no API implementation exists, by the name it passes to
/// `_resolve`. A provider that is not here throws instead (the demo-only
/// services, which no live screen reads).
final Map<String, Object Function()> unavailableRepositories = {
  'StoryRepository': () => const UnavailableStoryRepository(),
  'MessageRepository': () => const UnavailableMessageRepository(),
  'BusinessRepository': () => const UnavailableBusinessRepository(),
  'CreatorRepository': () => const UnavailableCreatorRepository(),
  'AdRepository': () => const UnavailableAdRepository(),
  'VerificationRepository': () => const UnavailableVerificationRepository(),
  'ModerationRepository': () => const UnavailableModerationRepository(),
  'ExploreRepository': () => const UnavailableExploreRepository(),
  'MediaLibraryRepository': () => const UnavailableMediaLibraryRepository(),
  'MediaProcessingRepository': () =>
      const UnavailableMediaProcessingRepository(),
  'MediaUploadRepository': () => const UnavailableMediaUploadRepository(),
  'MusicRepository': () => const UnavailableMusicRepository(),
  'ReelDraftRepository': () => const UnavailableReelDraftRepository(),
  'ReelPublishRepository': () => const UnavailableReelPublishRepository(),
  'CreatorConfigRepository': () => const UnavailableCreatorConfigRepository(),
  'CreatorMusicRepository': () => const UnavailableCreatorMusicRepository(),
  'CreatorInsightsRepository': () =>
      const UnavailableCreatorInsightsRepository(),
  'KycRepository': () => const UnavailableKycRepository(),
  'BankAccountRepository': () => const UnavailableBankAccountRepository(),
  'PayoutRepository': () => const UnavailablePayoutRepository(),
  'TaxRepository': () => const UnavailableTaxRepository(),
  'StepUpRepository': () => const UnavailableStepUpRepository(),
};
