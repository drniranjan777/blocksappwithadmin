import 'dart:io';

import 'package:blocks_app/app/router/app_router.dart';
import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/core/services/local_store.dart';
import 'package:blocks_app/core/services/media_picker.dart';
import 'package:blocks_app/data/api/api_reel_repositories.dart';
import 'package:blocks_app/data/api/device_media_library_repository.dart';
import 'package:blocks_app/data/api/media_uploader.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/reel_studio/application/reel_studio_controller.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';

import '../../data/api/fake_api.dart';
import '../../data/api/fixtures.dart';
import '../../helpers/app_driver.dart';
import '../../helpers/mp4.dart';

/// The reel studio as a person in a LIVE build uses it: their own phone's files, the server's
/// limits, the server's upload and the server's reel. The phone's picker and the network are
/// replaced; every repository and every screen is the real one.
class _Picker implements DeviceMediaPicker {
  _Picker(this.path);

  final String path;

  @override
  Future<List<PickedMediaFile>> pickMedia({required int limit}) async => [
    PickedMediaFile(
      path: path,
      name: 'holiday.mp4',
      sizeBytes: File(path).lengthSync(),
      isVideo: true,
    ),
  ];

  @override
  Future<PickedMediaFile?> recordVideo({Duration? maxDuration}) async => null;
}

void main() {
  late Directory dir;
  late String clip;

  setUp(() {
    dir = Directory.systemTemp.createTempSync('live_studio_');
    clip = writeTestMp4(dir, 'holiday.mp4', durationMs: 5000);
  });
  tearDown(() {
    if (dir.existsSync()) dir.deleteSync(recursive: true);
  });

  Rig serverFor(String publishState) => Rig((r) async {
    final path = r.path;
    if (path.endsWith('/creator/reel-config')) {
      return Reply.ok({
        'data': {
          'maxDurationSeconds': 180,
          'durationOptionsSeconds': [15, 30, 60, 90, 180],
          'defaultLimitSeconds': 30,
          'maxClips': 20,
          'minClipDurationMs': 300,
          'defaultPhotoDurationMs': 3000,
          'minPhotoDurationMs': 500,
          'maxPhotoDurationMs': 15000,
          'maxVideoSizeMb': 250,
        },
      });
    }
    if (path.endsWith('/media/uploads')) {
      return Reply.ok({
        'data': {
          'assetId': uuidA,
          'sessionId': uuidB,
          'expiresAt': '2026-10-10T12:15:00.000Z',
          'mode': 'single',
          'upload': {
            'method': 'PUT',
            'url': 'https://storage.example.test/orig/holiday.mp4?sig=1',
            'headers': {'Content-Type': 'video/mp4'},
            'expiresAt': '2026-10-10T12:15:00.000Z',
          },
        },
      });
    }
    if (path.endsWith('/complete')) {
      return Reply.ok({
        'data': {'id': uuidA, 'status': 'UPLOADED', 'ready': false},
      });
    }
    if (path.contains('/media/')) {
      return Reply.ok({
        'data': {
          'id': uuidA,
          'kind': 'VIDEO',
          'status': 'READY',
          'ready': true,
          'moderation': 'APPROVED',
          'width': 1080,
          'height': 1920,
          'durationMs': 5000,
        },
      });
    }
    if (r.method == 'POST' && path.endsWith('/reels')) {
      return const Reply(201, {
        'data': {
          'id': uuidB,
          'status': {'publish': 'PROCESSING', 'moderation': 'PENDING'},
        },
      });
    }
    if (path.contains('/reels/')) {
      return Reply.ok({
        'data': {
          'id': uuidB,
          'status': {
            'publish': publishState,
            'moderation': publishState == 'PUBLISHED' ? 'APPROVED' : 'PENDING',
          },
        },
      });
    }
    return Reply.error(404, 'NOT_FOUND');
  });

  List<Override> overrides(Rig rig) {
    final picker = _Picker(clip);
    return [
      deviceMediaPickerProvider.overrideWithValue(picker),
      mediaLibraryRepositoryProvider.overrideWithValue(
        DeviceMediaLibraryRepository(picker),
      ),
      mediaProcessingRepositoryProvider.overrideWithValue(
        const DeviceMediaProcessingRepository(),
      ),
      creatorConfigRepositoryProvider.overrideWithValue(
        ApiCreatorConfigRepository(rig.api),
      ),
      mediaUploadRepositoryProvider.overrideWithValue(
        ApiMediaUploadRepository(
          MediaUploader(
            rig.api,
            storage: Dio()
              ..httpClientAdapter = FakeApi(
                (_) async => const Reply(200, null, {'ETag': '"e1"'}),
              ),
            wait: (_) async {},
          ),
        ),
      ),
      reelPublishRepositoryProvider.overrideWithValue(
        ApiReelPublishRepository(
          rig.api,
          holdAfter: Duration.zero,
          wait: (_) async {},
        ),
      ),
      reelDraftRepositoryProvider.overrideWithValue(
        LocalReelDraftRepository(InMemoryLocalStore(), () async => 'person'),
      ),
    ];
  }

  /// Real file and timer work needs real time: give it some, then let the screen react.
  Future<void> settle(
    WidgetTester tester,
    Finder until, {
    int tries = 80,
  }) async {
    for (var i = 0; i < tries; i++) {
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 50)),
      );
      await tester.pump(const Duration(milliseconds: 100));
      if (until.evaluate().isNotEmpty) {
        // A sheet that has just appeared is still sliding in: let it arrive before anyone taps.
        await tester.pump(const Duration(milliseconds: 600));
        await tester.pump(const Duration(milliseconds: 600));
        return;
      }
    }
  }

  Future<void> openStudio(WidgetTester tester, Rig rig) async {
    await openSignedInApp(
      tester,
      size: const Size(390, 1600),
      overrides: overrides(rig),
    );
    // ignore: unawaited_futures
    containerOf(tester).read(routerProvider).push(Routes.createReel);
    await settle(tester, find.bySemanticsLabel('Add media'));
  }

  testWidgets(
    'a person picks a video from their phone and it lands on the timeline',
    (tester) async {
      final handle = tester.ensureSemantics();
      final rig = serverFor('PUBLISHED');
      await openStudio(tester, rig);

      await tester.tap(find.bySemanticsLabel('Add media').first);
      await settle(tester, find.text('Choose from your phone'));
      expect(find.text('Choose from your phone'), findsOneWidget);
      // Nothing is chosen yet, and the demo's invented gallery is not offered.
      expect(find.textContaining('Select videos or photos'), findsOneWidget);

      await tester.tap(find.text('Choose from your phone'));
      await settle(tester, find.text('Add 1 to reel'));
      await tester.tap(find.text('Add 1 to reel'));
      await settle(tester, find.text('Next'));

      final s = containerOf(tester).read(reelStudioProvider);
      expect(s.draft.clips, hasLength(1));
      expect(
        s.canContinue,
        isTrue,
        reason: 'issues: ${s.issues.map((i) => i.type.name).toList()}',
      );
      final media = s.draft.clips.single.media;
      expect(media.localPath, clip);
      expect(media.durationMs, 5000);
      expect(media.name, 'holiday.mp4');
      handle.dispose();
    },
  );

  testWidgets('and publishes it, all the way to "published"', (tester) async {
    final handle = tester.ensureSemantics();
    final rig = serverFor('PUBLISHED');
    await openStudio(tester, rig);

    await tester.tap(find.bySemanticsLabel('Add media').first);
    await settle(tester, find.text('Choose from your phone'));
    await tester.tap(find.text('Choose from your phone'));
    await settle(tester, find.text('Add 1 to reel'));
    await tester.tap(find.text('Add 1 to reel'));
    await settle(tester, find.text('Next'));

    await tester.tap(find.text('Next'));
    await settle(tester, find.text('Caption'));
    await tester.scrollUntilVisible(
      find.text('Publish reel'),
      400,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Publish reel'));
    await settle(tester, find.textContaining('Reel Published'));

    expect(find.textContaining('Reel Published'), findsOneWidget);
    // The edit was described to the server, not rendered on the phone.
    final made = rig.fake.requests.where(
      (r) => r.method == 'POST' && r.path.endsWith('/reels'),
    );
    expect(made, hasLength(1));
    expect(made.single.header('idempotency-key'), startsWith('reel-'));
    handle.dispose();
  });

  testWidgets('a reel held for review says so, and does not claim to be live', (
    tester,
  ) async {
    final handle = tester.ensureSemantics();
    final rig = serverFor('MODERATION');
    await openStudio(tester, rig);

    await tester.tap(find.bySemanticsLabel('Add media').first);
    await settle(tester, find.text('Choose from your phone'));
    await tester.tap(find.text('Choose from your phone'));
    await settle(tester, find.text('Add 1 to reel'));
    await tester.tap(find.text('Add 1 to reel'));
    await settle(tester, find.text('Next'));
    await tester.tap(find.text('Next'));
    await settle(tester, find.text('Caption'));
    await tester.scrollUntilVisible(
      find.text('Publish reel'),
      400,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Publish reel'));
    await settle(tester, find.text('Reel submitted'));

    expect(find.text('Reel submitted'), findsOneWidget);
    expect(find.textContaining('Reel Published'), findsNothing);
    expect(find.textContaining('review team'), findsOneWidget);
    handle.dispose();
  });
}
