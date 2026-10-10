import 'dart:async';

import 'package:blocks_app/app/config/app_config.dart';
import 'package:blocks_app/core/services/local_store.dart';
import 'package:blocks_app/core/services/media_picker.dart';
import 'package:blocks_app/core/services/video_frame.dart';
import 'package:blocks_app/data/api/api_auth_repository.dart';
import 'package:blocks_app/data/api/api_client.dart';
import 'package:blocks_app/data/api/api_creator_repository.dart';
import 'package:blocks_app/data/api/api_feed_repository.dart';
import 'package:blocks_app/data/api/api_moderation_repository.dart';
import 'package:blocks_app/data/api/api_notification_repository.dart';
import 'package:blocks_app/data/api/api_password_repositories.dart';
import 'package:blocks_app/data/api/api_post_repository.dart';
import 'package:blocks_app/data/api/api_profile_repository.dart';
import 'package:blocks_app/data/api/api_reach_repository.dart';
import 'package:blocks_app/data/api/api_reel_repositories.dart';
import 'package:blocks_app/data/api/api_reel_repository.dart';
import 'package:blocks_app/data/api/api_security_repository.dart';
import 'package:blocks_app/data/api/api_session_repository.dart';
import 'package:blocks_app/data/api/api_user_repository.dart';
import 'package:blocks_app/data/api/content_kinds.dart';
import 'package:blocks_app/data/api/device_media_library_repository.dart';
import 'package:blocks_app/data/api/device_identity.dart';
import 'package:blocks_app/data/api/media_uploader.dart';
import 'package:blocks_app/data/api/mappers.dart';
import 'package:blocks_app/data/api/token_store.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Where session tokens live. `main()` replaces this with a [SecureTokenStore]
/// that has already been read from the Keychain / Keystore; the default exists
/// only so tests and mock builds never touch platform storage.
final tokenStoreProvider = Provider<TokenStore>((ref) => MemoryTokenStore());

/// This install's random id. `main()` replaces it with a [SecureDeviceIdStore].
final deviceIdStoreProvider = Provider<DeviceIdStore>(
  (ref) => MemoryDeviceIdStore(),
);

final deviceIdentityProvider = Provider<DeviceIdentity>(
  (ref) => DeviceIdentity.describe(ref.watch(deviceIdStoreProvider).id),
);

/// Tells the app that the server ended the session (it was revoked, expired, or
/// the refresh token was refused), so it can go back to sign-in.
class SessionEvents {
  final _ended = StreamController<void>.broadcast();

  /// Emits once each time the session ends.
  Stream<void> get ended => _ended.stream;

  void sessionEnded() {
    if (!_ended.isClosed) _ended.add(null);
  }

  void dispose() => unawaited(_ended.close());
}

final sessionEventsProvider = Provider<SessionEvents>((ref) {
  final events = SessionEvents();
  ref.onDispose(events.dispose);
  return events;
});

/// The HTTP client for the real API. Only read in API mode (the repository
/// providers never touch it while `DEMO_MODE` is on).
final apiClientProvider = Provider<ApiClient>((ref) {
  final config = ref.watch(appConfigProvider);
  final dio = createApiDio(
    baseUri: config.apiBaseUri,
    tokens: ref.watch(tokenStoreProvider),
    onSessionEnded: ref.read(sessionEventsProvider).sessionEnded,
    // One redacted line per request, in debug output only.
    log: config.enableLogging && kDebugMode
        ? (line) => debugPrint('[api] $line')
        : null,
  );
  ref.onDispose(dio.close);
  return ApiClient(dio);
});

// ------------------------------------------------------ API repositories --

final contentKindsProvider = Provider<ContentKinds>((ref) => ContentKinds());

final apiCreatorRepositoryProvider = Provider<ApiCreatorRepository>(
  (ref) => ApiCreatorRepository(ref.watch(apiClientProvider)),
);

final apiCreatorInsightsRepositoryProvider =
    Provider<ApiCreatorInsightsRepository>(
      (ref) => ApiCreatorInsightsRepository(ref.watch(apiClientProvider)),
    );

final apiModerationRepositoryProvider = Provider<ApiModerationRepository>(
  (ref) => ApiModerationRepository(ref.watch(apiClientProvider)),
);

final apiReachRepositoryProvider = Provider<ApiReachRepository>(
  (ref) => ApiReachRepository(ref.watch(apiClientProvider)),
);

/// The Reach Ladder's thresholds, for turning a server-decided rung into the
/// number the models carry (see `postFromView`).
final reachFloorProvider = Provider<Future<ReachFloor> Function()>(
  (ref) => ref.watch(apiReachRepositoryProvider).floors,
);

final apiAuthRepositoryProvider = Provider<ApiAuthRepository>(
  (ref) => ApiAuthRepository(
    api: ref.watch(apiClientProvider),
    tokens: ref.watch(tokenStoreProvider),
    store: ref.watch(localStoreProvider),
    device: ref.watch(deviceIdentityProvider),
  ),
);

final apiUserRepositoryProvider = Provider<ApiUserRepository>(
  (ref) => ApiUserRepository(ref.watch(apiClientProvider)),
);

final apiFeedRepositoryProvider = Provider<ApiFeedRepository>(
  (ref) => ApiFeedRepository(
    ref.watch(apiClientProvider),
    ref.watch(reachFloorProvider),
    ref.watch(contentKindsProvider),
  ),
);

final apiPostRepositoryProvider = Provider<ApiPostRepository>(
  (ref) => ApiPostRepository(
    ref.watch(apiClientProvider),
    ref.watch(reachFloorProvider),
    ref.watch(contentKindsProvider),
    ref.watch(mediaUploaderProvider),
  ),
);

final apiReelRepositoryProvider = Provider<ApiReelRepository>(
  (ref) => ApiReelRepository(
    ref.watch(apiClientProvider),
    ref.watch(reachFloorProvider),
    ref.watch(contentKindsProvider),
  ),
);

final apiNotificationRepositoryProvider = Provider<ApiNotificationRepository>(
  (ref) => ApiNotificationRepository(ref.watch(apiClientProvider)),
);

/// The person's own phone as the reel studio's media library.
///
/// One instance per signed-in scope, so what one person picked is never offered to the next.
final deviceMediaLibraryRepositoryProvider =
    Provider<DeviceMediaLibraryRepository>(
      (ref) => DeviceMediaLibraryRepository(
        ref.watch(deviceMediaPickerProvider),
        frame: ref.watch(videoFrameReaderProvider),
      ),
    );

final deviceMediaProcessingRepositoryProvider =
    Provider<DeviceMediaProcessingRepository>(
      (ref) => const DeviceMediaProcessingRepository(),
    );

final apiMediaUploadRepositoryProvider = Provider<ApiMediaUploadRepository>(
  (ref) => ApiMediaUploadRepository(ref.watch(mediaUploaderProvider)),
);

final apiReelPublishRepositoryProvider = Provider<ApiReelPublishRepository>(
  (ref) => ApiReelPublishRepository(ref.watch(apiClientProvider)),
);

final apiCreatorConfigRepositoryProvider = Provider<ApiCreatorConfigRepository>(
  (ref) => ApiCreatorConfigRepository(ref.watch(apiClientProvider)),
);

/// Sends photos and videos to storage (see [MediaUploader]).
final mediaUploaderProvider = Provider<MediaUploader>(
  (ref) => MediaUploader(ref.watch(apiClientProvider)),
);

final apiProfileRepositoryProvider = Provider<ApiProfileRepository>(
  (ref) => ApiProfileRepository(
    ref.watch(apiClientProvider),
    ref.watch(mediaUploaderProvider),
    ref.watch(apiUserRepositoryProvider),
  ),
);

final apiSessionRepositoryProvider = Provider<ApiSessionRepository>(
  (ref) => ApiSessionRepository(ref.watch(apiClientProvider)),
);

final apiPasswordRepositoryProvider = Provider<ApiPasswordRepository>(
  (ref) => ApiPasswordRepository(ref.watch(apiClientProvider)),
);

final apiPasswordResetRepositoryProvider = Provider<ApiPasswordResetRepository>(
  (ref) => ApiPasswordResetRepository(ref.watch(apiClientProvider)),
);

final apiSecurityRepositoryProvider = Provider<ApiSecurityRepository>(
  (ref) => ApiSecurityRepository(ref.watch(apiClientProvider)),
);
