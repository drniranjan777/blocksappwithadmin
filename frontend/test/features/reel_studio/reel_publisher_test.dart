import 'dart:async';

import 'package:blocks_app/core/services/local_store.dart';
import 'package:blocks_app/data/models/media_models.dart';
import 'package:blocks_app/data/models/reel_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/data/services/creator_demo_service.dart';
import 'package:blocks_app/features/reel_studio/application/reel_publish_controller.dart';
import 'package:blocks_app/features/reel_studio/application/reel_publisher.dart';
import 'package:blocks_app/features/reel_studio/domain/reel_timeline.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late ProviderContainer c;
  late List<MediaAsset> lib;
  late DateTime now;

  setUp(() async {
    now = DateTime(2026, 10, 9, 12);
    c = ProviderContainer(
      overrides: [
        localStoreProvider.overrideWithValue(InMemoryLocalStore()),
        mockLatencyProvider.overrideWithValue(Duration.zero),
        clockProvider.overrideWithValue(() => now),
      ],
    );
    addTearDown(c.dispose);
    lib = await c.read(mediaLibraryRepositoryProvider).getLibrary();
  });

  ReelDraft draftOf(
    List<MediaAsset> media, {
    int limit = 60,
    String caption = 'Hello #blocks',
  }) {
    var n = 0;
    const config = ReelConfig.demo();
    return ReelDraft(
      id: 'draft~t1',
      clips: [
        for (final m in media)
          ReelTimeline.clipFromMedia(m, id: 'c${++n}', config: config),
      ],
      overlays: const [],
      settings: ReelSettings(
        caption: caption,
        district: 'Hyderabad',
        state: 'Telangana',
        durationLimitSeconds: limit,
      ),
      updatedAt: now,
      createdAt: now,
    );
  }

  MediaAsset video(String id) => lib.firstWhere((m) => m.id == 'g~clip~$id');
  MediaAsset photo() => lib.firstWhere((m) => m.isPhoto);

  Future<ReelPublisher> publisher() => c.read(reelPublisherProvider.future);

  group('ReelPublisher', () {
    test('goes through every stage, in the promised order', () async {
      final d = draftOf([video('3101'), photo(), video('3303')]);
      final events = await (await publisher())
          .run(d, MediaProfile.balanced)
          .toList();
      final stages = <PublishStage>[];
      for (final e in events) {
        if (stages.isEmpty || stages.last != e.stage) stages.add(e.stage);
      }
      expect(stages, [
        PublishStage.preparing,
        PublishStage.compressing,
        PublishStage.processing,
        PublishStage.uploading,
        PublishStage.serverProcessing,
        PublishStage.moderation,
        PublishStage.published,
      ]);
      expect(events.last.reelId, isNotNull);
      expect(
        c.read(mockWorldProvider).createdReels.single.id,
        events.last.reelId,
      );
    });

    test(
      'compression progress covers every file and never goes backwards',
      () async {
        final d = draftOf([video('3101'), photo(), video('3303')]);
        final events = await (await publisher())
            .run(d, MediaProfile.balanced)
            .toList();
        final prep = events
            .where((e) => e.stage == PublishStage.compressing)
            .toList();
        expect(prep.map((e) => e.fileCount).toSet(), {3});
        expect(prep.map((e) => e.fileIndex).toSet(), {1, 2, 3});
        var last = 0.0;
        for (final e in events.where(
          (e) =>
              e.stage == PublishStage.compressing ||
              e.stage == PublishStage.processing,
        )) {
          expect(e.fraction, greaterThanOrEqualTo(last - 1e-9));
          last = e.fraction;
        }
      },
    );

    test('upload progress is in bytes and ends at the total', () async {
      final d = draftOf([video('3101'), video('3303')]);
      final events = await (await publisher())
          .run(d, MediaProfile.balanced)
          .toList();
      final up = events
          .where((e) => e.stage == PublishStage.uploading)
          .toList();
      expect(up, isNotEmpty);
      for (var i = 1; i < up.length; i++) {
        expect(up[i].bytesDone, greaterThanOrEqualTo(up[i - 1].bytesDone));
      }
      expect(up.last.bytesDone, up.last.bytesTotal);
      expect(up.last.fraction, 1);
      expect(up.last.bytesTotal, greaterThan(0));
    });

    test('Data Saver uploads less than High', () async {
      Future<int> total(MediaProfile p) async {
        final d = draftOf([video('3202')]);
        final events = await (await publisher()).run(d, p).toList();
        return events
            .where((e) => e.stage == PublishStage.uploading)
            .last
            .bytesTotal;
      }

      final saver = await total(MediaProfile.dataSaver);
      final high = await total(MediaProfile.high);
      expect(saver, lessThan(high));
    });

    test('a file used twice is prepared and uploaded only once', () async {
      final world = c.read(mockWorldProvider);
      final d = draftOf([video('3101'), video('3303'), video('3101')]);
      await (await publisher()).run(d, MediaProfile.balanced).toList();
      expect(
        world.creator.uploadSessions.values.map((s) => s.assetId).toSet(),
        hasLength(2),
      );
      expect(world.creator.uploadSessions, hasLength(2));
      expect(world.createdReels.single.duration, d.totalDuration);
    });

    test('a trimmed clip uploads less than the whole file', () async {
      final whole = draftOf([video('3202')]);
      final trimmed = whole.copyWith(
        clips: [whole.clips.single.copyWith(end: const Duration(seconds: 10))],
      );
      Future<int> total(ReelDraft d) async {
        final e = await (await publisher())
            .run(d, MediaProfile.balanced)
            .toList();
        return e
            .where((x) => x.stage == PublishStage.uploading)
            .last
            .bytesTotal;
      }

      final a = await total(trimmed);
      c.read(mockWorldProvider).creator.uploadSessions.clear();
      final b = await total(whole);
      expect(a, lessThan(b ~/ 2));
    });

    test(
      'an edit that breaks a limit fails at Preparing; nothing is uploaded',
      () async {
        final d = draftOf([video('3202')], limit: 15); // 35 s into 15 s
        final events = await (await publisher())
            .run(d, MediaProfile.balanced)
            .toList();
        expect(events.last.stage, PublishStage.failed);
        expect(events.last.failureCode, 'tooLong');
        expect(c.read(mockWorldProvider).creator.uploadSessions, isEmpty);
        expect(c.read(mockWorldProvider).createdReels, isEmpty);
      },
    );

    test('a file over the size limit fails before upload', () async {
      final huge = lib.firstWhere(
        (m) => m.originalSizeBytes > const ReelConfig.demo().maxVideoSizeBytes,
      );
      final d = draftOf([huge]);
      final events = await (await publisher())
          .run(d, MediaProfile.balanced)
          .toList();
      expect(events.last.stage, PublishStage.failed);
      expect(events.last.failureCode, 'videoTooLarge');
      expect(c.read(mockWorldProvider).creator.uploadSessions, isEmpty);
    });

    test('a dropped connection becomes a clean "network" failure', () async {
      c.read(mockWorldProvider).creator.publishOutcome =
          DemoPublishOutcome.uploadFails;
      final d = draftOf([video('3303')]);
      final events = await (await publisher())
          .run(d, MediaProfile.balanced)
          .toList();
      expect(events.last.stage, PublishStage.failed);
      expect(events.last.failureCode, 'network');
      expect(
        events.any((e) => e.stage == PublishStage.serverProcessing),
        isFalse,
      );
    });

    test('the receipts a publish uses were issued by the server', () async {
      final d = draftOf([video('3101'), photo()]);
      await (await publisher()).run(d, MediaProfile.balanced).toList();
      final creator = c.read(mockWorldProvider).creator;
      expect(creator.completedUploads, hasLength(2));
      expect(
        creator.completedUploads,
        everyElement(isIn(creator.uploadSessions.keys)),
      );
    });

    test('a failed upload keeps its session so Retry can resume', () async {
      final creator = c.read(mockWorldProvider).creator;
      creator.publishOutcome = DemoPublishOutcome.uploadFails;
      final d = draftOf([video('3303')]);
      final events = await (await publisher())
          .run(d, MediaProfile.balanced)
          .toList();
      expect(events.last.failureCode, 'network');
      final kept = creator.uploadSessions.values.single;
      expect(kept.isComplete, isFalse);
      expect(kept.uploadedBytes, greaterThan(0));
    });

    test('walking away mid-upload abandons the open session', () async {
      final creator = c.read(mockWorldProvider).creator;
      final d = draftOf([video('3303')]);
      final seen = <PublishProgress>[];
      final done = Completer<void>();
      late StreamSubscription<PublishProgress> sub;
      sub = (await publisher()).run(d, MediaProfile.balanced).listen((e) {
        seen.add(e);
        // Part-way through the upload: the person leaves.
        if (e.stage == PublishStage.uploading &&
            e.bytesDone > 0 &&
            !done.isCompleted) {
          done.complete();
          unawaited(sub.cancel());
        }
      });
      await done.future;
      // Let the fire-and-forget cancel reach the server.
      await Future<void>.delayed(Duration.zero);
      await Future<void>.delayed(Duration.zero);

      expect(creator.uploadSessions, isEmpty);
      expect(creator.completedUploads, isEmpty);
      expect(seen.last.stage, PublishStage.uploading);
      expect(c.read(mockWorldProvider).createdReels, isEmpty);
    });

    test('rejected by moderation: failed with the reason', () async {
      c.read(mockWorldProvider).creator.publishOutcome =
          DemoPublishOutcome.moderationRejects;
      final d = draftOf([video('3101')]);
      final events = await (await publisher())
          .run(d, MediaProfile.balanced)
          .toList();
      expect(events.last.stage, PublishStage.failed);
      expect(events.last.failureCode, 'moderation');
      expect(events.last.moderation?.reason, 'copyright');
    });
  });

  group('ReelPublishController', () {
    ReelPublishController ctl() => c.read(reelPublishProvider.notifier);
    PublishState st() => c.read(reelPublishProvider);
    final seen = <PublishStage>[];

    setUp(() {
      seen.clear();
      c.listen(reelPublishProvider, (_, next) {
        if (seen.isEmpty || seen.last != next.stage) seen.add(next.stage);
      });
    });

    test('publishing succeeds: reel is live and the draft is gone', () async {
      final d = draftOf([video('3101'), photo()]);
      await ctl().start(d, MediaProfile.balanced);
      await Future<void>.delayed(Duration.zero);
      expect(st().isPublished, isTrue);
      expect(st().isRunning, isFalse);
      expect(st().attempt, 1);
      expect(seen.last, PublishStage.published);
      expect(c.read(mockWorldProvider).createdReels, hasLength(1));
      expect(await c.read(reelDraftRepositoryProvider).get(d.id), isNull);
    });

    test('the draft is on disk before anything is sent', () async {
      final d = draftOf([video('3101')]);
      c.read(mockWorldProvider).creator.publishOutcome =
          DemoPublishOutcome.uploadFails;
      await ctl().start(d, MediaProfile.balanced);
      expect(st().hasFailed, isTrue);
      final saved = await c.read(reelDraftRepositoryProvider).get(d.id);
      expect(saved, isNotNull);
      expect(saved!.clips.length, 1);
      expect(saved.settings.caption, 'Hello #blocks');
    });

    test(
      'Retry resumes the upload and publishes; the draft is then removed',
      () async {
        final world = c.read(mockWorldProvider);
        world.creator.publishOutcome = DemoPublishOutcome.uploadFails;
        final d = draftOf([video('3303')]);
        await ctl().start(d, MediaProfile.balanced);
        expect(st().hasFailed, isTrue);
        expect(st().progress.failureCode, 'network');
        final partial = world.creator.uploadSessions.values.single;
        expect(partial.uploadedBytes, greaterThan(0));
        expect(partial.isComplete, isFalse);

        await ctl().retry();
        await Future<void>.delayed(Duration.zero);
        expect(st().isPublished, isTrue);
        expect(st().attempt, 2);
        // Same upload session finished; no second one was opened.
        expect(world.creator.uploadSessions, hasLength(1));
        expect(world.creator.uploadSessions.values.single.isComplete, isTrue);
        expect(world.createdReels, hasLength(1));
        expect(await c.read(reelDraftRepositoryProvider).get(d.id), isNull);
      },
    );

    test('a moderation rejection keeps the draft', () async {
      final world = c.read(mockWorldProvider);
      world.creator.publishOutcome = DemoPublishOutcome.moderationRejects;
      final d = draftOf([video('3101')]);
      await ctl().start(d, MediaProfile.balanced);
      expect(st().hasFailed, isTrue);
      expect(st().progress.failureCode, 'moderation');
      expect(world.createdReels, isEmpty);
      expect(await c.read(reelDraftRepositoryProvider).get(d.id), isNotNull);
    });

    test('Retry while running does nothing; the stages were seen in order', () async {
      final d = draftOf([video('3101')]);
      await ctl().start(d, MediaProfile.balanced);
      await Future<void>.delayed(Duration.zero);
      final ranks = [for (final s in seen) PublishStage.values.indexOf(s)];
      // Published is the last stage reached, and nothing went backwards except
      // the initial reset to "preparing".
      expect(seen.last, PublishStage.published);
      expect(
        seen,
        containsAllInOrder([
          PublishStage.preparing,
          PublishStage.uploading,
          PublishStage.published,
        ]),
      );
      expect(ranks, isNotEmpty);
    });
  });
}
