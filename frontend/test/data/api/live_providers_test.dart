import 'package:blocks_app/app/config/app_config.dart';
import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/core/services/local_store.dart';
import 'package:blocks_app/data/api/api_auth_repository.dart';
import 'package:blocks_app/data/api/api_feed_repository.dart';
import 'package:blocks_app/data/api/api_notification_repository.dart';
import 'package:blocks_app/data/api/api_password_repositories.dart';
import 'package:blocks_app/data/api/api_post_repository.dart';
import 'package:blocks_app/data/api/api_profile_repository.dart';
import 'package:blocks_app/data/api/api_reach_repository.dart';
import 'package:blocks_app/data/api/api_reel_repository.dart';
import 'package:blocks_app/data/api/api_security_repository.dart';
import 'package:blocks_app/data/api/api_session_repository.dart';
import 'package:blocks_app/data/api/api_user_repository.dart';
import 'package:blocks_app/data/api/unavailable_repositories.dart';
import 'package:blocks_app/data/mock/mock_content_repositories.dart';
import 'package:blocks_app/data/models/discovery_models.dart';
import 'package:blocks_app/data/models/media_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

ProviderContainer _container(AppConfig config) {
  final c = ProviderContainer(
    overrides: [
      localStoreProvider.overrideWithValue(InMemoryLocalStore()),
      appConfigProvider.overrideWithValue(config),
    ],
  );
  addTearDown(c.dispose);
  return c;
}

const _live = AppConfig(
  environment: AppEnvironment.staging,
  useMockData: false,
  apiBaseUrl: 'https://api.example.test',
  enableLogging: false,
);

const _demo = AppConfig(
  environment: AppEnvironment.demo,
  useMockData: true,
  apiBaseUrl: '',
  enableLogging: false,
);

void main() {
  group('with the live service on', () {
    test('everything the API implements is the API\'s', () {
      final c = _container(_live);
      expect(c.read(authRepositoryProvider), isA<ApiAuthRepository>());
      expect(c.read(userRepositoryProvider), isA<ApiUserRepository>());
      expect(c.read(profileRepositoryProvider), isA<ApiProfileRepository>());
      expect(c.read(feedRepositoryProvider), isA<ApiFeedRepository>());
      expect(c.read(postRepositoryProvider), isA<ApiPostRepository>());
      expect(c.read(reelRepositoryProvider), isA<ApiReelRepository>());
      expect(
        c.read(notificationRepositoryProvider),
        isA<ApiNotificationRepository>(),
      );
      expect(c.read(reachRepositoryProvider), isA<ApiReachRepository>());
      expect(c.read(securityRepositoryProvider), isA<ApiSecurityRepository>());
      expect(c.read(sessionRepositoryProvider), isA<ApiSessionRepository>());
      expect(c.read(passwordRepositoryProvider), isA<ApiPasswordRepository>());
      expect(
        c.read(passwordResetRepositoryProvider),
        isA<ApiPasswordResetRepository>(),
      );
    });

    test(
      'nothing is the demo\'s, so no invented data can reach a real account',
      () {
        final c = _container(_live);
        final all = <Object>[
          c.read(authRepositoryProvider),
          c.read(userRepositoryProvider),
          c.read(profileRepositoryProvider),
          c.read(feedRepositoryProvider),
          c.read(postRepositoryProvider),
          c.read(storyRepositoryProvider),
          c.read(reelRepositoryProvider),
          c.read(notificationRepositoryProvider),
          c.read(messageRepositoryProvider),
          c.read(businessRepositoryProvider),
          c.read(reachRepositoryProvider),
          c.read(creatorRepositoryProvider),
          c.read(adRepositoryProvider),
          c.read(verificationRepositoryProvider),
          c.read(moderationRepositoryProvider),
          c.read(exploreRepositoryProvider),
          c.read(securityRepositoryProvider),
          c.read(sessionRepositoryProvider),
          c.read(passwordRepositoryProvider),
          c.read(passwordResetRepositoryProvider),
          c.read(mediaLibraryRepositoryProvider),
          c.read(mediaProcessingRepositoryProvider),
          c.read(mediaUploadRepositoryProvider),
          c.read(musicRepositoryProvider),
          c.read(reelDraftRepositoryProvider),
          c.read(reelPublishRepositoryProvider),
          c.read(creatorConfigRepositoryProvider),
          c.read(creatorMusicRepositoryProvider),
          c.read(creatorInsightsRepositoryProvider),
          c.read(kycRepositoryProvider),
          c.read(bankAccountRepositoryProvider),
          c.read(payoutRepositoryProvider),
          c.read(taxRepositoryProvider),
          c.read(stepUpRepositoryProvider),
        ];
        for (final repo in all) {
          expect(
            repo.runtimeType.toString(),
            isNot(startsWith('Mock')),
            reason: '${repo.runtimeType}',
          );
        }
      },
    );

    test('a section the service does not offer yet fails with NOT_AVAILABLE, typed and untyped', () async {
      final c = _container(_live);
      final stories = c.read(storyRepositoryProvider);
      expect(stories, isA<UnavailableStoryRepository>());
      // Through the interface: the failure stands in for the promised list.
      await expectLater(
        stories.getStoryGroups(),
        throwsA(
          isA<ForbiddenFailure>().having(
            (f) => f.code,
            'code',
            'NOT_AVAILABLE',
          ),
        ),
      );
      await expectLater(
        c.read(kycRepositoryProvider).getApplication(),
        throwsA(isA<ForbiddenFailure>()),
      );
      await expectLater(
        c.read(payoutRepositoryProvider).getHistory(),
        throwsA(isA<ForbiddenFailure>()),
      );
      await expectLater(
        c.read(exploreRepositoryProvider).getTrending(ExploreScope.district),
        throwsA(isA<ForbiddenFailure>()),
      );
    });

    test('the calls that return streams fail as a stream error', () async {
      final c = _container(_live);
      await expectLater(
        c
            .read(mediaUploadRepositoryProvider)
            .upload(
              const UploadSession(
                id: 's',
                assetId: 'a',
                totalBytes: 10,
                chunkBytes: 5,
              ),
            ),
        emitsError(isA<ForbiddenFailure>()),
      );
      await expectLater(
        c.read(reelPublishRepositoryProvider).watch('job'),
        emitsError(isA<ForbiddenFailure>()),
      );
    });

    test(
      'every fallback in the table is a repository that fails every call',
      () async {
        for (final entry in unavailableRepositories.entries) {
          final repo = entry.value();
          await expectLater(
            Future<void>.sync(
              () => (repo as dynamic).anything() as Future<Object?>,
            ),
            throwsA(isA<ForbiddenFailure>()),
            reason: entry.key,
          );
        }
      },
    );
  });

  test('the demo build keeps its own repositories', () {
    final c = _container(_demo);
    expect(c.read(feedRepositoryProvider), isA<MockFeedRepository>());
    expect(c.read(storyRepositoryProvider), isA<MockStoryRepository>());
  });
}
