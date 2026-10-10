import 'dart:async';
import 'dart:convert';

import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/mock/mock_creator_repositories.dart';
import 'package:blocks_app/data/mock/mock_music_catalog.dart';
import 'package:blocks_app/data/mock/mock_reel_draft_repository.dart';
import 'package:blocks_app/data/models/creator_models.dart';
import 'package:blocks_app/data/models/media_models.dart';
import 'package:blocks_app/data/models/music_models.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/data/models/reel_models.dart';
import 'package:blocks_app/data/services/creator_demo_service.dart';
import 'package:blocks_app/features/reel_studio/domain/media_optimizer.dart';
import 'package:blocks_app/features/reel_studio/domain/reel_timeline.dart';
import 'package:flutter_test/flutter_test.dart';

import '../helpers/creator_server.dart';

const _config = ReelConfig.demo();

ReelDraft draftOf(
  CreatorServer s,
  List<MediaAsset> media, {
  String caption = 'Sunday at Charminar #hyderabad #food',
  MusicSelection? music,
  int limit = 60,
}) {
  var n = 0;
  return ReelDraft(
    id: 'd1',
    clips: [
      for (final m in media)
        ReelTimeline.clipFromMedia(m, id: 'c${++n}', config: _config),
    ],
    overlays: const [],
    settings: ReelSettings(
      caption: caption,
      district: 'Hyderabad',
      state: 'Telangana',
      durationLimitSeconds: limit,
    ),
    music: music,
    updatedAt: s.now,
    createdAt: s.now,
  );
}

Future<List<UploadReceipt>> uploadAll(CreatorServer s, ReelDraft d) async {
  final receipts = <UploadReceipt>[];
  for (final id in {for (final c in d.clips) c.media.id}) {
    final asset = d.clips.firstWhere((c) => c.media.id == id).media;
    final prepared = await s.processing
        .prepare(asset, MediaProfile.balanced)
        .last
        .then((e) => e.asset!);
    final session = await s.upload.createSession(
      prepared,
      bytes: prepared.optimizedSizeBytes,
    );
    await s.upload.upload(session).drain<void>();
    // The server issues the receipt; a client-made one is not accepted.
    receipts.add(await s.upload.completeUpload(session));
  }
  return receipts;
}

void main() {
  late CreatorServer s;
  setUp(() => s = CreatorServer());

  group('music library', () {
    Future<List<MusicTrack>> everything() async {
      final out = <MusicTrack>[];
      String? cursor;
      do {
        final page = await s.music.browse(cursor: cursor, limit: 50);
        out.addAll(page.items);
        cursor = page.nextCursor;
      } while (cursor != null);
      return out;
    }

    test('all 17 categories have music in them', () async {
      expect(MusicCategory.values, hasLength(17));
      for (final c in MusicCategory.values) {
        final page = await s.music.browse(category: c, limit: 50);
        expect(page.items, isNotEmpty, reason: c.name);
        expect(page.items.every((t) => t.categories.contains(c)), isTrue);
      }
    });

    test(
      'tracks that fail the rights check are never offered anywhere',
      () async {
        final all = await everything();
        final ids = all.map((t) => t.id).toSet();
        expect(ids, isNot(contains('x01'))); // expired licence
        expect(ids, isNot(contains('x02'))); // not licensed in this country
        expect(ids, isNot(contains('x03'))); // restricted
        for (final t in all) {
          expect(t.rightsType, isNot(MusicRightsType.restricted));
          expect(
            t.isAvailable(country: 'IN', now: s.now),
            isTrue,
            reason: t.id,
          );
        }
        // ...not even by searching for them.
        final hit = await s.music.browse(query: 'Expired Licence');
        expect(hit.items, isEmpty);
        await expectLater(
          s.music.getTrack('x01'),
          throwsA(isA<NotFoundFailure>()),
        );
        await expectLater(
          s.music.getTrack('nope'),
          throwsA(isA<NotFoundFailure>()),
        );
        expect(kMusicCatalog.any((t) => t.id == 'x01'), isTrue);
      },
    );

    test('every kind of legitimate rights holder is represented', () async {
      final kinds = (await everything()).map((t) => t.rightsType).toSet();
      expect(kinds, {
        MusicRightsType.platformOwned,
        MusicRightsType.licensed,
        MusicRightsType.creatorOwned,
        MusicRightsType.royaltyFree,
      });
    });

    test('search matches title, artist, language and genre', () async {
      Future<Set<String>> ids(String q) async => (await s.music.browse(
        query: q,
        limit: 50,
      )).items.map((t) => t.id).toSet();

      expect(await ids('charminar'), contains('m01'));
      expect(await ids('CHARMINAR'), contains('m01'));
      expect(await ids('anika rao'), containsAll(['m01', 'm13']));
      expect(
        (await s.music.browse(
          query: 'telugu',
          limit: 50,
        )).items.every((t) => t.language == 'Telugu'),
        isTrue,
      );
      expect(await ids('lo-fi'), containsAll(['m01', 'm15', 'm31']));
      expect(await ids('zzzzzz'), isEmpty);
      expect((await s.music.browse(query: '   ', limit: 50)).items, isNotEmpty);
    });

    test('search within a category', () async {
      final r = await s.music.browse(
        category: MusicCategory.punjabi,
        query: 'bhangra',
      );
      expect(r.items.map((t) => t.id), ['m22']);
    });

    test('trending is the most-used, with reel counts', () async {
      final t = await s.music.getTrending();
      expect(t, hasLength(6));
      expect(t.first.id, 'm01');
      expect(t.first.reelsCount, 128400);
      for (var i = 1; i < t.length; i++) {
        expect(t[i - 1].reelsCount, greaterThanOrEqualTo(t[i].reelsCount));
      }
      expect(
        t.every((x) => x.categories.contains(MusicCategory.trending)),
        isTrue,
      );
      expect((await s.music.getTrending(limit: 3)), hasLength(3));
    });

    test('paging is stable and complete', () async {
      final seen = <String>[];
      String? cursor;
      var pages = 0;
      do {
        final p = await s.music.browse(cursor: cursor, limit: 7);
        seen.addAll(p.items.map((t) => t.id));
        cursor = p.nextCursor;
        pages++;
      } while (cursor != null);
      expect(pages, greaterThan(3));
      expect(seen.toSet(), hasLength(seen.length));
      expect(seen, hasLength((await everything()).length));
    });

    test('titles, artists and licences are all filled in', () async {
      for (final t in await everything()) {
        expect(t.title, isNotEmpty);
        expect(t.artist, isNotEmpty);
        expect(t.duration, greaterThan(const Duration(seconds: 10)));
        expect(t.categories, isNotEmpty);
        expect(t.allowedCountries, isNotEmpty);
      }
    });
  });

  group('drafts', () {
    ReelDraft build(String id, {String caption = 'a'}) => ReelDraft(
      id: id,
      clips: const [],
      overlays: const [],
      settings: ReelSettings(caption: caption),
      updatedAt: DateTime(2026),
      createdAt: DateTime(2026),
    );

    test('save appears in the list, newest edited first', () async {
      await s.drafts.save(build('a', caption: 'first'));
      s.advance(const Duration(minutes: 5));
      await s.drafts.save(build('b', caption: 'second'));
      final list = await s.drafts.list();
      expect(list.map((d) => d.id), ['b', 'a']);
      expect(list.first.updatedAt, s.now);
    });

    test('saving again replaces and re-orders', () async {
      await s.drafts.save(build('a'));
      s.advance(const Duration(minutes: 1));
      await s.drafts.save(build('b'));
      s.advance(const Duration(minutes: 1));
      await s.drafts.save(build('a', caption: 'edited'));
      final list = await s.drafts.list();
      expect(list.map((d) => d.id), ['a', 'b']);
      expect(list.first.settings.caption, 'edited');
      expect(list, hasLength(2));
    });

    test('a saved edit is restored exactly', () async {
      final media = await s.library.getLibrary();
      final videos = media
          .where((m) => m.isVideo && m.originalSizeBytes < 60 * 1024 * 1024)
          .take(3)
          .toList();
      final photos = media.where((m) => m.isPhoto).take(2).toList();
      var d = draftOf(s, [
        videos[0],
        photos[0],
        videos[1],
        photos[1],
        videos[2],
      ]);
      d = d.copyWith(
        clips: [
          d.clips[0].copyWith(
            filterId: 'warm',
            filterIntensity: 0.6,
            volume: 0.4,
          ),
          ...d.clips.skip(1),
        ],
        overlays: const [
          ReelOverlay(
            id: 'o1',
            type: OverlayType.text,
            content: 'Hello Hyderabad',
            start: Duration.zero,
            end: Duration(seconds: 3),
          ),
        ],
        music: MusicSelection(
          track: kMusicCatalog.first,
          start: const Duration(seconds: 10),
          end: const Duration(seconds: 40),
        ),
      );
      await s.drafts.save(d);
      final restored = (await s.drafts.get('d1'))!;
      expect(restored.clips.map((c) => c.id), d.clips.map((c) => c.id));
      expect(
        restored.clips.map((c) => c.media.id),
        d.clips.map((c) => c.media.id),
      );
      expect(restored.clips.first.filterId, 'warm');
      expect(restored.clips.first.volume, 0.4);
      expect(restored.overlays.single.content, 'Hello Hyderabad');
      expect(restored.music!.track.id, kMusicCatalog.first.id);
      expect(restored.music!.length, const Duration(seconds: 30));
      expect(restored.settings.caption, d.settings.caption);
      expect(restored.totalDuration, d.totalDuration);
    });

    test(
      'a restart (new repository, same storage) still has the drafts',
      () async {
        await s.drafts.save(build('a', caption: 'persist'));
        final reopened = MockReelDraftRepository(s.store, s.world);
        expect((await reopened.list()).single.settings.caption, 'persist');
      },
    );

    test('duplicate makes an independent copy', () async {
      await s.drafts.save(build('a', caption: 'orig'));
      final copy = await s.drafts.duplicate('a');
      expect(copy.id, isNot('a'));
      expect(copy.settings.caption, 'orig');
      await s.drafts.delete('a');
      expect((await s.drafts.list()).single.id, copy.id);
      await expectLater(
        s.drafts.duplicate('missing'),
        throwsA(isA<NotFoundFailure>()),
      );
    });

    test('delete removes it; unknown ids are harmless', () async {
      await s.drafts.save(build('a'));
      await s.drafts.delete('a');
      await s.drafts.delete('a');
      expect(await s.drafts.list(), isEmpty);
      expect(await s.drafts.get('a'), isNull);
    });

    test('unreadable storage does not crash the app', () async {
      await s.store.setString(MockReelDraftRepository.storageKey, '{not json');
      expect(await s.drafts.list(), isEmpty);
      await s.store.setString(
        MockReelDraftRepository.storageKey,
        jsonEncode([1, 2]),
      );
      expect(await s.drafts.list(), isEmpty);
    });
  });

  group('media library', () {
    test('offers videos and photos, including one that is too large', () async {
      final lib = await s.library.getLibrary();
      expect(lib.where((m) => m.isVideo).length, greaterThanOrEqualTo(6));
      expect(lib.where((m) => m.isPhoto).length, greaterThanOrEqualTo(8));
      expect(
        lib.where(
          (m) => m.isVideo && m.originalSizeBytes > _config.maxVideoSizeBytes,
        ),
        isNotEmpty,
      );
      expect(lib.map((m) => m.id).toSet(), hasLength(lib.length));
      for (final m in lib) {
        expect(m.thumbnailPath, isNotNull);
        expect(m.originalSizeBytes, greaterThan(0));
        if (m.isVideo) expect(m.durationMs, greaterThan(0));
      }
    });

    test('recording adds a fresh clip at the front', () async {
      final before = await s.library.getLibrary();
      final clip = await s.library.record();
      expect(clip.isVideo, isTrue);
      final after = await s.library.getLibrary();
      expect(after.length, before.length + 1);
      expect(after.first.id, clip.id);
      final second = await s.library.record();
      expect(second.id, isNot(clip.id));
    });
  });

  group('media processing pipeline', () {
    Future<MediaAsset> longClip() async =>
        (await s.library.getLibrary()).firstWhere((m) => m.id == 'g~clip~3202');

    test('runs every step, in order, and ends upload-ready', () async {
      final asset = await longClip();
      final events = await s.processing
          .prepare(asset, MediaProfile.balanced)
          .toList();
      final steps = events.map((e) => e.step).toList();
      expect(steps.first, MediaPipelineStep.inspect);
      expect(steps.last, MediaPipelineStep.uploadReady);
      const order = MediaPipelineStep.values;
      for (var i = 1; i < steps.length; i++) {
        expect(
          order.indexOf(steps[i]),
          greaterThanOrEqualTo(order.indexOf(steps[i - 1])),
        );
      }
      expect(steps.toSet(), MediaPipelineStep.values.toSet());
      for (var i = 1; i < events.length; i++) {
        expect(
          events[i].fraction,
          greaterThanOrEqualTo(events[i - 1].fraction),
        );
      }
      expect(events.last.fraction, 1);
      expect(events.last.isDone, isTrue);
      expect(events.where((e) => e.asset != null), hasLength(1));
    });

    test('Original 82 MB becomes about 18 MB: roughly 78% smaller', () async {
      final asset = await longClip();
      expect(asset.originalSizeBytes, 82 * 1024 * 1024);
      final done =
          (await s.processing.prepare(asset, MediaProfile.balanced).last)
              .asset!;
      expect(done.status, MediaProcessingStatus.ready);
      expect(done.isOptimized, isTrue);
      expect(MediaOptimizer.formatBytes(done.originalSizeBytes), '82 MB');
      final mb = done.optimizedSizeBytes / (1024 * 1024);
      expect(mb, inInclusiveRange(17, 19));
      final est = OptimizationEstimate(
        originalBytes: done.originalSizeBytes,
        optimizedBytes: done.optimizedSizeBytes,
      );
      expect(est.reductionPercent, inInclusiveRange(77, 79));
    });

    test(
      'quality changes the result: Data Saver < Balanced < High < Original',
      () async {
        final asset = await longClip();
        Future<int> size(MediaProfile p) async =>
            (await s.processing.prepare(asset, p).last)
                .asset!
                .optimizedSizeBytes;
        final saver = await size(MediaProfile.dataSaver);
        final balanced = await size(MediaProfile.balanced);
        final high = await size(MediaProfile.high);
        final original = await size(MediaProfile.original);
        expect(saver, lessThan(balanced));
        expect(balanced, lessThan(high));
        expect(high, lessThan(original));
        expect(original, asset.originalSizeBytes);
      },
    );

    test('a trimmed clip is smaller to upload', () async {
      final asset = await longClip();
      Future<int> size(Duration? used) async =>
          (await s.processing
                  .prepare(asset, MediaProfile.balanced, usedDuration: used)
                  .last)
              .asset!
              .optimizedSizeBytes;
      final whole = await size(null);
      final tenSeconds = await size(const Duration(seconds: 10));
      expect(tenSeconds, lessThan(whole ~/ 2));
    });

    test(
      'a file over the size limit is refused before any work is done',
      () async {
        final huge = (await s.library.getLibrary()).firstWhere(
          (m) => m.originalSizeBytes > _config.maxVideoSizeBytes,
        );
        await expectLater(
          s.processing.prepare(huge, MediaProfile.balanced).toList(),
          throwsA(isA<ValidationFailure>()),
        );
      },
    );

    test('photos are prepared too', () async {
      final photo = (await s.library.getLibrary()).firstWhere((m) => m.isPhoto);
      final done =
          (await s.processing.prepare(photo, MediaProfile.balanced).last)
              .asset!;
      expect(done.optimizedSizeBytes, lessThan(photo.originalSizeBytes));
    });

    test('inspect returns the file unchanged', () async {
      final a = await longClip();
      expect(await s.processing.inspect(a), a);
    });
  });

  group('chunked, resumable upload', () {
    Future<MediaAsset> readyClip() async {
      final a = (await s.library.getLibrary()).firstWhere(
        (m) => m.id == 'g~clip~3202',
      );
      return (await s.processing.prepare(a, MediaProfile.balanced).last).asset!;
    }

    test('uploads in chunks and reports confirmed progress', () async {
      final asset = await readyClip();
      final session = await s.upload.createSession(
        asset,
        bytes: asset.optimizedSizeBytes,
      );
      expect(
        session.chunkCount,
        (asset.optimizedSizeBytes / session.chunkBytes).ceil(),
      );
      expect(session.chunkCount, greaterThan(10));

      final events = await s.upload.upload(session).toList();
      expect(events, hasLength(session.chunkCount));
      for (var i = 1; i < events.length; i++) {
        expect(
          events[i].uploadedBytes,
          greaterThan(events[i - 1].uploadedBytes),
        );
      }
      expect(events.last.isComplete, isTrue);
      expect(events.last.fraction, 1);
      expect(events.last.uploadedBytes, asset.optimizedSizeBytes);
      expect((await s.upload.getSession(session.id)).isComplete, isTrue);
    });

    test(
      'a dropped connection keeps what arrived and resumes from there',
      () async {
        s.world.creator.publishOutcome = DemoPublishOutcome.uploadFails;
        final asset = await readyClip();
        final session = await s.upload.createSession(
          asset,
          bytes: asset.optimizedSizeBytes,
        );

        final firstTry = <ChunkUploadProgress>[];
        await expectLater(
          s.upload.upload(session).listen(firstTry.add).asFuture<void>(),
          throwsA(isA<NetworkFailure>()),
        );
        final saved = await s.upload.getSession(session.id);
        expect(saved.uploadedBytes, greaterThan(0));
        expect(saved.uploadedBytes, lessThan(saved.totalBytes));
        expect(saved.isComplete, isFalse);
        expect(
          saved.uploadedBytes / saved.totalBytes,
          greaterThanOrEqualTo(0.6),
        );

        // Opening the session again resumes the same one.
        final again = await s.upload.createSession(
          asset,
          bytes: asset.optimizedSizeBytes,
        );
        expect(again.id, session.id);
        expect(again.uploadedBytes, saved.uploadedBytes);

        final retry = await s.upload.upload(again).toList();
        expect(retry.first.uploadedBytes, greaterThan(saved.uploadedBytes));
        expect(retry.last.isComplete, isTrue);
        // Only the remainder was sent.
        expect(retry.length, lessThan(session.chunkCount));
      },
    );

    test('the simulated failure happens once, not forever', () async {
      s.world.creator.publishOutcome = DemoPublishOutcome.uploadFails;
      final asset = await readyClip();
      final session = await s.upload.createSession(
        asset,
        bytes: asset.optimizedSizeBytes,
      );
      await expectLater(
        s.upload.upload(session).drain<void>(),
        throwsA(isA<NetworkFailure>()),
      );
      expect(s.world.creator.publishOutcome, DemoPublishOutcome.published);
    });

    test('unknown sessions are not found', () async {
      await expectLater(
        s.upload.getSession('nope'),
        throwsA(isA<NotFoundFailure>()),
      );
    });

    group('completing and cancelling', () {
      test('completing issues a receipt for what the server stored', () async {
        final asset = await readyClip();
        final session = await s.upload.createSession(
          asset,
          bytes: asset.optimizedSizeBytes,
        );
        await s.upload.upload(session).drain<void>();
        final receipt = await s.upload.completeUpload(session);
        expect(receipt.sessionId, session.id);
        expect(receipt.assetId, asset.id);
        expect(receipt.bytes, asset.optimizedSizeBytes);
      });

      test('cannot be completed while parts are missing', () async {
        s.world.creator.publishOutcome = DemoPublishOutcome.uploadFails;
        final asset = await readyClip();
        final session = await s.upload.createSession(
          asset,
          bytes: asset.optimizedSizeBytes,
        );
        await expectLater(
          s.upload.upload(session).drain<void>(),
          throwsA(isA<NetworkFailure>()),
        );
        // Claiming it is whole does not make it so: the server checks.
        final claimed = session.copyWith(uploadedBytes: session.totalBytes);
        await expectLater(
          s.upload.completeUpload(claimed),
          throwsA(isA<ValidationFailure>()),
        );
      });

      test('a cancelled session is gone and cannot be resumed', () async {
        final asset = await readyClip();
        final session = await s.upload.createSession(
          asset,
          bytes: asset.optimizedSizeBytes,
        );
        await s.upload.cancelUpload(session.id);

        await expectLater(
          s.upload.getSession(session.id),
          throwsA(isA<NotFoundFailure>()),
        );
        await expectLater(
          s.upload.upload(session).drain<void>(),
          throwsA(isA<NotFoundFailure>()),
        );
        await expectLater(
          s.upload.completeUpload(session),
          throwsA(isA<NotFoundFailure>()),
        );
        // Opening the file again starts a fresh session from zero.
        final fresh = await s.upload.createSession(
          asset,
          bytes: asset.optimizedSizeBytes,
        );
        expect(fresh.id, isNot(session.id));
        expect(fresh.uploadedBytes, 0);
      });

      test('cancelling twice, or an unknown id, is harmless', () async {
        final asset = await readyClip();
        final session = await s.upload.createSession(
          asset,
          bytes: asset.optimizedSizeBytes,
        );
        await s.upload.cancelUpload(session.id);
        await s.upload.cancelUpload(session.id);
        await s.upload.cancelUpload('never-existed');
      });

      test('cancelling part-way stops the transfer', () async {
        final asset = await readyClip();
        final session = await s.upload.createSession(
          asset,
          bytes: asset.optimizedSizeBytes,
        );
        final events = <ChunkUploadProgress>[];
        final done = s.upload.upload(session).listen((e) {
          events.add(e);
          // The person gives up after the second part.
          if (events.length == 2) {
            unawaited(s.upload.cancelUpload(session.id));
          }
        }).asFuture<void>();
        await expectLater(done, throwsA(isA<NotFoundFailure>()));
        expect(events, hasLength(2));
        expect(events.length, lessThan(session.chunkCount));
      });

      test(
        'a publish with a receipt the server did not issue is refused',
        () async {
          final lib = await s.library.getLibrary();
          final draft = draftOf(s, [
            lib.firstWhere((m) => m.id == 'g~clip~3101'),
          ]);
          final asset = draft.clips.single.media;
          final prepared =
              (await s.processing.prepare(asset, MediaProfile.balanced).last)
                  .asset!;
          final session = await s.upload.createSession(
            prepared,
            bytes: prepared.optimizedSizeBytes,
          );
          await s.upload.upload(session).drain<void>();
          // Fully uploaded, but never completed: the client forges a receipt.
          final forged = UploadReceipt(
            assetId: asset.id,
            sessionId: session.id,
            bytes: prepared.optimizedSizeBytes,
          );
          await expectLater(
            s.publish.submit(draft, [forged]),
            throwsA(isA<ValidationFailure>()),
          );
          // After the server has completed it, the same receipt is accepted.
          await s.upload.completeUpload(session);
          final job = await s.publish.submit(draft, [forged]);
          expect(job.id, isNotEmpty);
        },
      );
    });
  });

  group('publishing', () {
    Future<List<MediaAsset>> picks() async {
      final lib = await s.library.getLibrary();
      return [
        lib.firstWhere((m) => m.id == 'g~clip~3101'), // 4 s
        lib.firstWhere((m) => m.isPhoto),
        lib.firstWhere((m) => m.id == 'g~clip~3303'), // 8 s
      ];
    }

    test(
      'the full pipeline publishes a reel to the creator\'s profile',
      () async {
        final d = draftOf(s, await picks());
        final receipts = await uploadAll(s, d);
        final job = await s.publish.submit(d, receipts);
        final stages = await s.publish.watch(job.id).toList();

        final order = stages.map((e) => e.stage).toList();
        expect(order.first, PublishStage.serverProcessing);
        expect(order, contains(PublishStage.moderation));
        expect(order.last, PublishStage.published);
        final last = stages.last;
        expect(last.isTerminal, isTrue);
        expect(last.moderation?.verdict, ModerationVerdict.approved);

        final reel = s.world.createdReels.single;
        expect(last.reelId, reel.id);
        expect(reel.caption, 'Sunday at Charminar #hyderabad #food');
        expect(reel.hashtags, ['#hyderabad', '#food']);
        expect(reel.district, 'Hyderabad');
        expect(reel.state, 'Telangana');
        expect(reel.musicTitle, 'Original audio');
        expect(reel.duration, d.totalDuration);
        expect(reel.author.id, s.world.me.id);
        expect(reel.qualifiedReach, 0);
      },
    );

    test('the soundtrack chosen is the soundtrack published', () async {
      final track = kMusicCatalog.firstWhere((t) => t.id == 'm28');
      final d = draftOf(
        s,
        [(await picks()).first],
        music: MusicSelection(
          track: track,
          start: Duration.zero,
          end: const Duration(seconds: 4),
        ),
      );
      final job = await s.publish.submit(d, await uploadAll(s, d));
      await s.publish.watch(job.id).drain<void>();
      expect(s.world.createdReels.single.musicTitle, 'Sitar Sunrise');
    });

    test(
      'the server re-validates the edit, whatever the client said',
      () async {
        final media = await picks();
        // Nothing on the timeline.
        await expectLater(
          s.publish.submit(draftOf(s, const []), const []),
          throwsA(
            isA<ValidationFailure>().having(
              (f) => f.message,
              'message',
              'noClips',
            ),
          ),
        );
        // Longer than the length the creator chose.
        final long = (await s.library.getLibrary()).firstWhere(
          (m) => m.id == 'g~clip~3202',
        );
        final tooLong = draftOf(s, [long], limit: 15);
        await expectLater(
          s.publish.submit(tooLong, await uploadAll(s, tooLong)),
          throwsA(
            isA<ValidationFailure>().having(
              (f) => f.message,
              'message',
              'tooLong',
            ),
          ),
        );
        expect(s.world.createdReels, isEmpty);
        expect(media, isNotEmpty);
      },
    );

    test('files that never fully arrived block the publish', () async {
      final d = draftOf(s, await picks());
      await expectLater(
        s.publish.submit(d, const []),
        throwsA(
          isA<ValidationFailure>().having(
            (f) => f.message,
            'message',
            'uploadIncomplete',
          ),
        ),
      );
      // One file interrupted part-way.
      final receipts = await uploadAll(s, d);
      final broken = s.world.creator.uploadSessions[receipts.first.sessionId]!;
      s.world.creator.uploadSessions[broken.id] = broken.copyWith(
        uploadedBytes: broken.totalBytes ~/ 2,
      );
      await expectLater(
        s.publish.submit(d, receipts),
        throwsA(
          isA<ValidationFailure>().having(
            (f) => f.message,
            'message',
            'uploadIncomplete',
          ),
        ),
      );
    });

    test('a caption over the limit is refused by the server', () async {
      final d = draftOf(s, [(await picks()).first], caption: 'x' * 2201);
      await expectLater(
        s.publish.submit(d, await uploadAll(s, d)),
        throwsA(
          isA<ValidationFailure>().having(
            (f) => f.message,
            'message',
            'captionTooLong',
          ),
        ),
      );
    });

    test('moderation can reject; the reel is then not created', () async {
      s.world.creator.publishOutcome = DemoPublishOutcome.moderationRejects;
      final d = draftOf(s, [(await picks()).first]);
      final job = await s.publish.submit(d, await uploadAll(s, d));
      final stages = await s.publish.watch(job.id).toList();
      expect(stages.last.stage, PublishStage.failed);
      expect(stages.last.failureCode, 'moderation');
      expect(stages.last.moderation?.verdict, ModerationVerdict.rejected);
      expect(stages.last.moderation?.reason, 'copyright');
      expect(s.world.createdReels, isEmpty);

      // The rejection applied to that one publish only.
      final job2 = await s.publish.submit(d, await uploadAll(s, d));
      expect(
        (await s.publish.watch(job2.id).last).stage,
        PublishStage.published,
      );
      expect(s.world.createdReels, hasLength(1));
    });

    test('an unknown job is not found', () async {
      await expectLater(
        s.publish.watch('nope').toList(),
        throwsA(isA<NotFoundFailure>()),
      );
    });

    test('new reels get distinct ids', () async {
      for (var i = 0; i < 2; i++) {
        final d = draftOf(s, [(await picks()).first]);
        final job = await s.publish.submit(d, await uploadAll(s, d));
        await s.publish.watch(job.id).drain<void>();
      }
      expect(s.world.createdReels.map((r) => r.id).toSet(), hasLength(2));
    });
  });

  group('copyright and music', () {
    Future<void> publish(ReelDraft d) async {
      final job = await s.publish.submit(d, await uploadAll(s, d));
      await s.publish.watch(job.id).drain<void>();
    }

    Future<MediaAsset> aClip() async =>
        (await s.library.getLibrary()).firstWhere((m) => m.id == 'g~clip~3101');

    test(
      'every track the creator used is listed with its rights status',
      () async {
        final m = await s.creatorMusic.getOverview();
        final byId = {for (final u in m.usage) u.track.id: u};

        expect(byId['m01']!.status, MusicUsageStatus.available);
        expect(byId['m01']!.reelCount, 6);
        expect(byId['m43']!.status, MusicUsageStatus.expiringSoon);
        expect(byId['x01']!.status, MusicUsageStatus.unavailable);
        expect(byId['x01']!.reason, 'expired');
      },
    );

    test('what needs attention comes first, then the most used', () async {
      final m = await s.creatorMusic.getOverview();
      final order = [for (final u in m.usage) u.status.index];
      expect(order, [...order]..sort((a, b) => b.compareTo(a)));
      expect(m.usage.first.status, MusicUsageStatus.unavailable);
      expect(m.usage.last.status, MusicUsageStatus.available);
    });

    test(
      'the server decides: when the licence ends, the status flips',
      () async {
        expect(
          (await s.creatorMusic.getOverview()).usage
              .firstWhere((u) => u.track.id == 'm43')
              .status,
          MusicUsageStatus.expiringSoon,
        );
        s.advance(const Duration(days: 30)); // past 30 Oct 2026
        final after = (await s.creatorMusic.getOverview()).usage.firstWhere(
          (u) => u.track.id == 'm43',
        );
        expect(after.status, MusicUsageStatus.unavailable);
        expect(after.reason, 'expired');
        // ...and it is no longer offered for new reels either.
        await expectLater(
          s.music.getTrack('m43'),
          throwsA(isA<NotFoundFailure>()),
        );
      },
    );

    test('a track that is not licensed here says so', () async {
      final here = MockCreatorMusicRepository(s.world, country: 'US');
      final m = await here.getOverview();
      // Seeded m01 is India-only: from the US it cannot be used.
      final u = m.usage.firstWhere((x) => x.track.id == 'm01');
      expect(u.status, MusicUsageStatus.unavailable);
      expect(u.reason, 'region');
    });

    test('publishing a reel with a library track raises its count', () async {
      final track = kMusicCatalog.firstWhere((t) => t.id == 'm01');
      final d = draftOf(
        s,
        [await aClip()],
        music: MusicSelection(
          track: track,
          start: Duration.zero,
          end: const Duration(seconds: 4),
        ),
      );
      await publish(d);
      final u = (await s.creatorMusic.getOverview()).usage.firstWhere(
        (x) => x.track.id == 'm01',
      );
      expect(u.reelCount, 7);
    });

    test('a reel with its own sound adds original audio, reuse off', () async {
      final before = (await s.creatorMusic.getOverview()).originals;
      await publish(draftOf(s, [await aClip()], caption: 'Dawn at the ghat'));
      final after = (await s.creatorMusic.getOverview()).originals;

      expect(after, hasLength(before.length + 1));
      final mine = after.firstWhere((a) => a.title == 'Dawn at the ghat');
      expect(mine.reusable, isFalse);
      expect(mine.reelsUsing, 1);
    });

    test('reuse is the creator\'s choice, and it sticks', () async {
      final first = (await s.creatorMusic.getOverview()).originals;
      final off = first.firstWhere((a) => !a.reusable);
      expect(first.where((a) => a.reusable), isNotEmpty);

      final on = await s.creatorMusic.setReusable(off.id, reusable: true);
      expect(on.reusable, isTrue);
      final again = (await s.creatorMusic.getOverview()).originals;
      expect(again.firstWhere((a) => a.id == off.id).reusable, isTrue);

      await s.creatorMusic.setReusable(off.id, reusable: false);
      final back = (await s.creatorMusic.getOverview()).originals;
      expect(back.firstWhere((a) => a.id == off.id).reusable, isFalse);
    });

    test('audio that is not theirs cannot be changed', () async {
      await expectLater(
        s.creatorMusic.setReusable('oa~someone-else', reusable: true),
        throwsA(isA<NotFoundFailure>()),
      );
    });

    test('resetting the demo restores the starting choices', () async {
      await s.creatorMusic.setReusable('oa2', reusable: true);
      await s.creatorMusic.setReusable('oa1', reusable: false);
      s.world.creator.reset();
      final o = (await s.creatorMusic.getOverview()).originals;
      expect(o.firstWhere((a) => a.id == 'oa1').reusable, isTrue);
      expect(o.firstWhere((a) => a.id == 'oa2').reusable, isFalse);
    });
  });

  group('analytics', () {
    test('a series per day of the chosen range', () async {
      for (final r in AnalyticsRange.values) {
        final a = await s.insights.getAnalytics(r);
        expect(a.viewsSeries, hasLength(r.days));
        expect(a.range, r);
        expect(a.views, greaterThan(0));
        expect(a.reels, isNotEmpty);
        expect(a.followersGained, greaterThan(0));
        expect(
          a.audience.fold<double>(0, (x, y) => x + y.fraction),
          lessThanOrEqualTo(1),
        );
      }
    });

    test('per-reel numbers are consistent', () async {
      final a = await s.insights.getAnalytics(AnalyticsRange.days28);
      for (final r in a.reels) {
        expect(r.qualifiedViews, lessThanOrEqualTo(r.views));
        expect(r.completionRate, inInclusiveRange(0, 1));
        expect(r.retention, hasLength(10));
        expect(r.retention.first, 1);
        for (var i = 1; i < r.retention.length; i++) {
          expect(r.retention[i], lessThanOrEqualTo(r.retention[i - 1]));
        }
        expect(r.avgWatchSeconds, lessThanOrEqualTo(r.durationSeconds));
      }
      expect(a.engagementRate, inInclusiveRange(0, 1));
      expect(a.engagements, a.likes + a.comments + a.shares + a.saves);
    });

    test('per-reel earnings add up to the cycle estimate', () async {
      final a = await s.insights.getAnalytics(AnalyticsRange.days28);
      final total = a.reels.fold(0, (x, r) => x + r.estimatedEarnings);
      expect(total, closeTo(24580, a.reels.length));
    });

    test(
      'a reel just published shows up first and says it is still collecting',
      () async {
        final d = draftOf(s, [
          (await s.library.getLibrary()).firstWhere(
            (m) => m.id == 'g~clip~3101',
          ),
        ]);
        final job = await s.publish.submit(d, await uploadAll(s, d));
        await s.publish.watch(job.id).drain<void>();

        final a = await s.insights.getAnalytics(AnalyticsRange.days7);
        final fresh = a.reels.first;
        expect(fresh.reelId, s.world.createdReels.single.id);
        expect(fresh.isCollecting, isTrue);
        expect(fresh.estimatedEarnings, 0);
        expect(fresh.engagementRate, 0);
      },
    );

    test('one reel by id; unknown is not found', () async {
      final a = await s.insights.getAnalytics(AnalyticsRange.days28);
      final one = await s.insights.getReelPerformance(a.reels.first.reelId);
      expect(one, a.reels.first);
      await expectLater(
        s.insights.getReelPerformance('nope'),
        throwsA(isA<NotFoundFailure>()),
      );
    });
  });

  test(
    'audience: everyone, followers, close friends and private all exist',
    () {
      expect(
        PostAudience.values.map((a) => a.name),
        containsAll(['everyone', 'followers', 'closeFriends', 'private']),
      );
    },
  );
}
