import 'dart:convert';

import 'package:blocks_app/data/models/media_models.dart';
import 'package:blocks_app/data/models/music_models.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/data/models/reel_models.dart';
import 'package:blocks_app/features/reel_studio/domain/media_optimizer.dart';
import 'package:blocks_app/features/reel_studio/domain/reel_look.dart';
import 'package:blocks_app/features/reel_studio/domain/reel_timeline.dart';
import 'package:blocks_app/features/reel_studio/domain/reel_validator.dart';
import 'package:blocks_app/features/reel_studio/domain/sticker_catalog.dart';
import 'package:flutter_test/flutter_test.dart';

const _config = ReelConfig.demo();
final _now = DateTime(2026, 10, 9, 12);

MediaAsset video(
  String id, {
  int seconds = 6,
  int sizeMb = 40,
  int w = 1080,
  int h = 1920,
}) => MediaAsset(
  id: id,
  type: MediaType.video,
  origin: MediaOrigin.demo,
  localPath: 'demo://clip/$id',
  originalSizeBytes: sizeMb * 1024 * 1024,
  durationMs: seconds * 1000,
  width: w,
  height: h,
);

MediaAsset photo(String id, {int sizeKb = 3000, int w = 4000, int h = 3000}) =>
    MediaAsset(
      id: id,
      type: MediaType.photo,
      origin: MediaOrigin.demo,
      localPath: 'demo://photo/$id',
      originalSizeBytes: sizeKb * 1024,
      durationMs: 0,
      width: w,
      height: h,
    );

ReelClip clip(MediaAsset m, String id) =>
    ReelTimeline.clipFromMedia(m, id: id, config: _config);

List<String> ids(List<ReelClip> c) => [for (final x in c) x.id];

ReelDraft draftOf(List<ReelClip> clips, {int limit = 30}) => ReelDraft(
  id: 'd1',
  clips: clips,
  overlays: const [],
  settings: ReelSettings(durationLimitSeconds: limit),
  updatedAt: _now,
  createdAt: _now,
);

void main() {
  group('clipFromMedia', () {
    test('a video plays in full; a photo for the default duration', () {
      final v = clip(video('v', seconds: 6), 'c1');
      expect(v.start, Duration.zero);
      expect(v.end, const Duration(seconds: 6));
      final p = clip(photo('p'), 'c2');
      expect(p.duration, const Duration(milliseconds: 3000));
      expect(p.isPhoto, isTrue);
    });
  });

  group('reorder', () {
    final clips = [
      clip(video('a'), 'a'),
      clip(video('b'), 'b'),
      clip(video('c'), 'c'),
      clip(video('d'), 'd'),
    ];

    test('moves a clip forward (ReorderableListView convention)', () {
      // Dragging "a" below "c" reports newIndex 3 (before removal).
      expect(ids(ReelTimeline.reorder(clips, 0, 3)), ['b', 'c', 'a', 'd']);
    });

    test('moves a clip backward', () {
      expect(ids(ReelTimeline.reorder(clips, 3, 1)), ['a', 'd', 'b', 'c']);
    });

    test('to the very end and to the very start', () {
      expect(ids(ReelTimeline.reorder(clips, 0, 4)), ['b', 'c', 'd', 'a']);
      expect(ids(ReelTimeline.reorder(clips, 2, 0)), ['c', 'a', 'b', 'd']);
    });

    test('no-ops and bad indexes leave the list unchanged', () {
      expect(ids(ReelTimeline.reorder(clips, 1, 1)), ids(clips));
      expect(ids(ReelTimeline.reorder(clips, 1, 2)), ids(clips));
      expect(ids(ReelTimeline.reorder(clips, 9, 0)), ids(clips));
    });

    test('never mutates the original list', () {
      final copy = ids(clips);
      ReelTimeline.reorder(clips, 0, 3);
      expect(ids(clips), copy);
    });

    test('mixed video + photo timeline keeps every item', () {
      final mixed = [
        clip(video('v1'), 'v1'),
        clip(photo('p1'), 'p1'),
        clip(video('v2'), 'v2'),
        clip(photo('p2'), 'p2'),
        clip(video('v3'), 'v3'),
      ];
      final out = ReelTimeline.reorder(mixed, 4, 0);
      expect(ids(out), ['v3', 'v1', 'p1', 'v2', 'p2']);
      expect(out.length, 5);
    });
  });

  group('remove / duplicate', () {
    final clips = [clip(video('a'), 'a'), clip(video('b'), 'b')];

    test('remove drops only that clip', () {
      expect(ids(ReelTimeline.remove(clips, 'a')), ['b']);
      expect(ids(ReelTimeline.remove(clips, 'zzz')), ['a', 'b']);
    });

    test('duplicate inserts an identical copy right after', () {
      final out = ReelTimeline.duplicate(clips, 'a', newId: 'a2');
      expect(ids(out), ['a', 'a2', 'b']);
      expect(out[1].media, out[0].media);
      expect(out[1].duration, out[0].duration);
      expect(ReelTimeline.duplicate(clips, 'nope', newId: 'x'), clips);
    });
  });

  group('trim', () {
    final base = [clip(video('a', seconds: 10), 'a')];

    test('sets start and end inside the media', () {
      final out = ReelTimeline.trim(
        base,
        'a',
        config: _config,
        start: const Duration(seconds: 2),
        end: const Duration(seconds: 7),
      );
      expect(out.single.start, const Duration(seconds: 2));
      expect(out.single.end, const Duration(seconds: 7));
      expect(out.single.duration, const Duration(seconds: 5));
    });

    test('cannot go outside the source video', () {
      final out = ReelTimeline.trim(
        base,
        'a',
        config: _config,
        start: const Duration(seconds: -3),
        end: const Duration(seconds: 99),
      );
      expect(out.single.start, Duration.zero);
      expect(out.single.end, const Duration(seconds: 10));
    });

    test('enforces the minimum clip length', () {
      const min = Duration(milliseconds: 500);
      // Dragging the start handle up to the end stops at the minimum.
      final a = ReelTimeline.trim(
        base,
        'a',
        config: _config,
        start: const Duration(seconds: 10),
      );
      expect(a.single.duration, min);
      expect(a.single.end, const Duration(seconds: 10));
      // Dragging the end handle down to the start stops at the minimum too.
      final b = ReelTimeline.trim(
        base,
        'a',
        config: _config,
        end: Duration.zero,
      );
      expect(b.single.duration, min);
      expect(b.single.start, Duration.zero);
    });

    test('photos are not trimmed (they have a duration instead)', () {
      final p = [clip(photo('p'), 'p')];
      final out = ReelTimeline.trim(
        p,
        'p',
        config: _config,
        end: const Duration(seconds: 1),
      );
      expect(out, p);
    });

    test('only the named clip changes', () {
      final two = [...base, clip(video('b', seconds: 8), 'b')];
      final out = ReelTimeline.trim(
        two,
        'a',
        config: _config,
        end: const Duration(seconds: 4),
      );
      expect(out[1], two[1]);
    });
  });

  group('photo duration', () {
    final p = [clip(photo('p'), 'p')];

    test('is clamped to the configured range', () {
      Duration d(List<ReelClip> c) => c.single.duration;
      expect(
        d(
          ReelTimeline.setPhotoDuration(
            p,
            'p',
            const Duration(seconds: 5),
            config: _config,
          ),
        ),
        const Duration(seconds: 5),
      );
      expect(
        d(
          ReelTimeline.setPhotoDuration(p, 'p', Duration.zero, config: _config),
        ),
        const Duration(milliseconds: 1000),
      );
      expect(
        d(
          ReelTimeline.setPhotoDuration(
            p,
            'p',
            const Duration(minutes: 5),
            config: _config,
          ),
        ),
        const Duration(milliseconds: 10000),
      );
    });

    test('does not apply to videos', () {
      final v = [clip(video('v'), 'v')];
      expect(
        ReelTimeline.setPhotoDuration(
          v,
          'v',
          const Duration(seconds: 1),
          config: _config,
        ),
        v,
      );
    });
  });

  group('split', () {
    final base = [
      clip(video('a', seconds: 10), 'a').copyWith(transitionId: 'fade'),
    ];

    test('cuts one clip into two that play back to back', () {
      final out = ReelTimeline.split(
        base,
        'a',
        const Duration(seconds: 4),
        newId: 'a2',
        config: _config,
      );
      expect(ids(out), ['a', 'a2']);
      expect(out[0].start, Duration.zero);
      expect(out[0].end, const Duration(seconds: 4));
      expect(out[1].start, const Duration(seconds: 4));
      expect(out[1].end, const Duration(seconds: 10));
      // Total length is unchanged.
      expect(ReelTimeline.total(out), ReelTimeline.total(base));
      // The transition to the next clip moves to the second half.
      expect(out[0].transitionId, isNull);
      expect(out[1].transitionId, 'fade');
    });

    test('refuses a cut that would leave a sliver', () {
      for (final at in [
        Duration.zero,
        const Duration(milliseconds: 200),
        const Duration(milliseconds: 9800),
        const Duration(seconds: 10),
      ]) {
        expect(
          ReelTimeline.split(base, 'a', at, newId: 'x', config: _config),
          base,
          reason: '$at',
        );
      }
    });

    test('splitting a trimmed clip is relative to its own start', () {
      final trimmed = [
        clip(video('a', seconds: 10), 'a').copyWith(
          start: const Duration(seconds: 2),
          end: const Duration(seconds: 8),
        ),
      ];
      final out = ReelTimeline.split(
        trimmed,
        'a',
        const Duration(seconds: 3),
        newId: 'a2',
        config: _config,
      );
      expect(out[0].end, const Duration(seconds: 5));
      expect(out[1].start, const Duration(seconds: 5));
      expect(out[1].end, const Duration(seconds: 8));
    });

    test('unknown id is a no-op', () {
      expect(
        ReelTimeline.split(
          base,
          'zz',
          const Duration(seconds: 3),
          newId: 'x',
          config: _config,
        ),
        base,
      );
    });
  });

  group('replace', () {
    test('swaps the media but keeps the look', () {
      final c = clip(video('a'), 'a').copyWith(filterId: 'warm');
      final out = ReelTimeline.replace([c], 'a', photo('p'), config: _config);
      expect(out.single.id, 'a');
      expect(out.single.media.id, 'p');
      expect(out.single.filterId, 'warm');
      expect(out.single.duration, const Duration(milliseconds: 3000));
    });
  });

  group('offsets and locate', () {
    final clips = [
      clip(video('a', seconds: 4), 'a'),
      clip(photo('p'), 'p'), // 3 s
      clip(video('b', seconds: 6), 'b'),
    ];

    test('start offsets accumulate', () {
      expect(ReelTimeline.startOffsets(clips), [
        Duration.zero,
        const Duration(seconds: 4),
        const Duration(seconds: 7),
      ]);
      expect(ReelTimeline.total(clips), const Duration(seconds: 13));
    });

    test('locate finds the clip and the time inside it', () {
      var r = ReelTimeline.locate(clips, const Duration(seconds: 1))!;
      expect((r.index, r.local), (0, const Duration(seconds: 1)));
      r = ReelTimeline.locate(clips, const Duration(seconds: 4))!;
      expect((r.index, r.local), (1, Duration.zero));
      r = ReelTimeline.locate(clips, const Duration(seconds: 8))!;
      expect((r.index, r.local), (2, const Duration(seconds: 1)));
    });

    test('past the end clamps to the last frame; empty is null', () {
      final r = ReelTimeline.locate(clips, const Duration(minutes: 5))!;
      expect(r.index, 2);
      expect(r.local, const Duration(seconds: 6));
      expect(ReelTimeline.locate(const [], Duration.zero), isNull);
    });
  });

  group('overlays follow a shorter reel', () {
    ReelOverlay o(String id, int s, int e) => ReelOverlay(
      id: id,
      type: OverlayType.text,
      content: id,
      start: Duration(seconds: s),
      end: Duration(seconds: e),
    );

    test('drops those past the end, shortens those that overrun', () {
      final out = ReelTimeline.fitOverlays([
        o('in', 0, 5),
        o('over', 8, 20),
        o('gone', 12, 15),
      ], const Duration(seconds: 10));
      expect([for (final x in out) x.id], ['in', 'over']);
      expect(out[1].end, const Duration(seconds: 10));
    });
  });

  group('ReelValidator', () {
    test('empty reel', () {
      expect(ReelValidator.validate(draftOf(const []), _config), [
        const ReelIssue(ReelIssueType.noClips),
      ]);
    });

    test('a reel within every limit is valid', () {
      final d = draftOf([clip(video('a', seconds: 10), 'a')]);
      expect(ReelValidator.validate(d, _config), isEmpty);
    });

    test('length limit comes from the creator\'s choice and the config', () {
      final d = draftOf([clip(video('a', seconds: 20), 'a')], limit: 15);
      expect(ReelValidator.validate(d, _config), [
        const ReelIssue(ReelIssueType.tooLong),
      ]);
      final ok = draftOf([clip(video('a', seconds: 20), 'a')], limit: 30);
      expect(ReelValidator.validate(ok, _config), isEmpty);
    });

    test('a chosen limit can never exceed the platform maximum', () {
      const strict = ReelConfig(maxDurationSeconds: 60);
      final d = draftOf([clip(video('a', seconds: 90), 'a')], limit: 180);
      expect(
        ReelValidator.effectiveLimit(d, strict),
        const Duration(seconds: 60),
      );
      expect(ReelValidator.validate(d, strict), [
        const ReelIssue(ReelIssueType.tooLong),
      ]);
    });

    test('selectable durations respect the maximum', () {
      expect(_config.selectableDurations, [15, 30, 60, 90, 180]);
      expect(const ReelConfig(maxDurationSeconds: 60).selectableDurations, [
        15,
        30,
        60,
      ]);
    });

    test('clip and photo counts', () {
      const tight = ReelConfig(maxClips: 3, maxPhotos: 1);
      final d = draftOf([
        clip(video('a', seconds: 2), 'a'),
        clip(photo('p1'), 'p1'),
        clip(photo('p2'), 'p2'),
        clip(video('b', seconds: 2), 'b'),
      ], limit: 60);
      expect(
        ReelValidator.validate(d, tight).map((i) => i.type),
        containsAll([ReelIssueType.tooManyClips, ReelIssueType.tooManyPhotos]),
      );
    });

    test('an oversized source video is flagged on its clip', () {
      const tiny = ReelConfig(maxVideoSizeMb: 10);
      final d = draftOf([clip(video('big', seconds: 5, sizeMb: 80), 'c1')]);
      expect(ReelValidator.validate(d, tiny), [
        const ReelIssue(ReelIssueType.videoTooLarge, clipId: 'c1'),
      ]);
    });

    test('canAdd checks hard limits before something joins the timeline', () {
      const tight = ReelConfig(maxClips: 1, maxPhotos: 0, maxVideoSizeMb: 10);
      final empty = draftOf(const []);
      expect(
        ReelValidator.canAdd(empty, video('v', sizeMb: 80), tight),
        ReelIssueType.videoTooLarge,
      );
      expect(
        ReelValidator.canAdd(empty, photo('p'), tight),
        ReelIssueType.tooManyPhotos,
      );
      final one = draftOf([clip(video('v', sizeMb: 5), 'c')]);
      expect(
        ReelValidator.canAdd(one, video('w', sizeMb: 5), tight),
        ReelIssueType.tooManyClips,
      );
      expect(ReelValidator.canAdd(empty, video('v', sizeMb: 5), tight), isNull);
    });
  });

  group('MediaOptimizer', () {
    final big = video('big', seconds: 30, sizeMb: 300, w: 2160, h: 3840);

    test('a large 4K video shrinks a lot at Balanced', () {
      final bytes = MediaOptimizer.estimateAssetBytes(
        big,
        MediaProfile.balanced,
      );
      // 4 Mbps + 128 kbps over 30 s ~ 15.5 MB
      expect(bytes, closeTo(15.5 * 1024 * 1024, 1.5 * 1024 * 1024));
      expect(bytes, lessThan(big.originalSizeBytes));
    });

    test('quality profiles are ordered: Data Saver < Balanced < High', () {
      int e(MediaProfile p) => MediaOptimizer.estimateAssetBytes(big, p);
      expect(e(MediaProfile.dataSaver), lessThan(e(MediaProfile.balanced)));
      expect(e(MediaProfile.balanced), lessThan(e(MediaProfile.high)));
      expect(e(MediaProfile.high), lessThan(big.originalSizeBytes));
    });

    test('Original keeps the source size', () {
      expect(
        MediaOptimizer.estimateAssetBytes(big, MediaProfile.original),
        big.originalSizeBytes,
      );
    });

    test('an already-small video never "grows"', () {
      final small = video('s', seconds: 10, sizeMb: 1, w: 540, h: 960);
      expect(
        MediaOptimizer.estimateAssetBytes(small, MediaProfile.high),
        lessThanOrEqualTo(small.originalSizeBytes),
      );
    });

    test('a trimmed clip uploads proportionally less', () {
      final full = MediaOptimizer.estimateAssetBytes(
        big,
        MediaProfile.balanced,
      );
      final half = MediaOptimizer.estimateAssetBytes(
        big,
        MediaProfile.balanced,
        usedDuration: const Duration(seconds: 15),
      );
      expect(half, closeTo(full / 2, full * 0.02));
    });

    test('photos are resized and recompressed; Original leaves them', () {
      final p = photo('p', sizeKb: 6000, w: 6000, h: 4000);
      final saver = MediaOptimizer.estimateAssetBytes(
        p,
        MediaProfile.dataSaver,
      );
      final high = MediaOptimizer.estimateAssetBytes(p, MediaProfile.high);
      expect(saver, lessThan(high));
      expect(high, lessThan(p.originalSizeBytes));
      expect(
        MediaOptimizer.estimateAssetBytes(p, MediaProfile.original),
        p.originalSizeBytes,
      );
    });

    test('the reduction figure is a sensible percentage', () {
      final d = draftOf([clip(big, 'c')], limit: 60);
      final est = MediaOptimizer.estimateDraft(d, MediaProfile.balanced);
      expect(est.originalBytes, big.originalSizeBytes);
      expect(est.reductionPercent, inInclusiveRange(90, 97));
      expect(est.reduction, closeTo(est.reductionPercent / 100, 0.005));
      const none = OptimizationEstimate(originalBytes: 0, optimizedBytes: 0);
      expect(none.reduction, 0);
    });

    test('data saver mode picks the conservative profile', () {
      expect(
        MediaOptimizer.defaultProfile(dataSaver: true).quality,
        MediaQuality.dataSaver,
      );
      expect(
        MediaOptimizer.defaultProfile(dataSaver: false).quality,
        MediaQuality.balanced,
      );
      expect(MediaProfile.dataSaver.resolution, MediaResolution.p720);
      expect(MediaProfile.balanced.resolution, MediaResolution.p1080);
      expect(
        MediaProfile.dataSaver.thumbnailEdge,
        lessThan(MediaProfile.balanced.thumbnailEdge),
      );
      expect(
        MediaProfile.dataSaver.uploadChunkBytes,
        lessThan(MediaProfile.high.uploadChunkBytes),
      );
    });

    test('future resolutions exist in the model', () {
      expect(MediaResolution.values.map((r) => r.shortSide), [
        720,
        1080,
        1440,
        2160,
      ]);
    });

    test('formatBytes', () {
      expect(MediaOptimizer.formatBytes(82 * 1024 * 1024), '82 MB');
      expect(MediaOptimizer.formatBytes((1.5 * 1024 * 1024).round()), '1.5 MB');
      expect(MediaOptimizer.formatBytes(640 * 1024), '640 KB');
      expect(MediaOptimizer.formatBytes(12), '12 B');
    });
  });

  group('colour matrices', () {
    List<double> apply(List<double> m, double r, double g, double b) => [
      m[0] * r + m[1] * g + m[2] * b + m[4],
      m[5] * r + m[6] * g + m[7] * b + m[9],
      m[10] * r + m[11] * g + m[12] * b + m[14],
    ];

    test('identity changes nothing and is detected', () {
      expect(apply(ColorMatrices.identity, 10, 120, 240), [10, 120, 240]);
      expect(ColorMatrices.isIdentity(ColorMatrices.identity), isTrue);
      expect(ColorMatrices.isIdentity(ColorMatrices.brightness(0.2)), isFalse);
    });

    test('saturation -1 is greyscale', () {
      final out = apply(ColorMatrices.saturation(-1), 200, 80, 40);
      expect(out[0], closeTo(out[1], 1e-6));
      expect(out[1], closeTo(out[2], 1e-6));
    });

    test('brightness raises, then lowers', () {
      expect(
        apply(ColorMatrices.brightness(0.4), 100, 100, 100)[0],
        greaterThan(100),
      );
      expect(
        apply(ColorMatrices.brightness(-0.4), 100, 100, 100)[0],
        lessThan(100),
      );
    });

    test('contrast spreads values away from mid grey', () {
      final hi = apply(ColorMatrices.contrast(0.5), 200, 200, 200)[0];
      final lo = apply(ColorMatrices.contrast(0.5), 60, 60, 60)[0];
      expect(hi, greaterThan(200));
      expect(lo, lessThan(60));
      expect(
        apply(ColorMatrices.contrast(0.5), 128, 128, 128)[0],
        closeTo(128, 1e-6),
      );
    });

    test('warm temperature adds red and removes blue', () {
      final w = apply(ColorMatrices.temperature(0.8), 100, 100, 100);
      expect(w[0], greaterThan(100));
      expect(w[2], lessThan(100));
      final c = apply(ColorMatrices.temperature(-0.8), 100, 100, 100);
      expect(c[0], lessThan(100));
      expect(c[2], greaterThan(100));
    });

    test('shadows lift dark tones; highlights tame bright ones', () {
      expect(apply(ColorMatrices.shadows(1), 20, 20, 20)[0], greaterThan(20));
      expect(
        apply(ColorMatrices.highlights(-1), 240, 240, 240)[0],
        lessThan(240),
      );
    });

    test('fade lifts the blacks', () {
      expect(apply(ColorMatrices.fade(1), 0, 0, 0)[0], greaterThan(10));
    });

    test('compose applies the first matrix, then the second', () {
      final both = ColorMatrices.compose(
        ColorMatrices.brightness(0.2),
        ColorMatrices.contrast(0.5),
      );
      final first = apply(ColorMatrices.brightness(0.2), 90, 90, 90);
      final stepwise = apply(
        ColorMatrices.contrast(0.5),
        first[0],
        first[1],
        first[2],
      );
      expect(apply(both, 90, 90, 90)[0], closeTo(stepwise[0], 1e-6));
    });

    test('lerp blends between two matrices', () {
      final m = ColorMatrices.saturation(-1);
      expect(
        ColorMatrices.lerp(ColorMatrices.identity, m, 0),
        ColorMatrices.identity,
      );
      final full = ColorMatrices.lerp(ColorMatrices.identity, m, 1);
      for (var i = 0; i < 20; i++) {
        expect(full[i], closeTo(m[i], 1e-9), reason: 'cell $i');
      }
      final half = ColorMatrices.lerp(ColorMatrices.identity, m, 0.5);
      expect(half[0], closeTo((1 + m[0]) / 2, 1e-9));
    });
  });

  group('filters', () {
    test('BLOCKS has its own set of 14 distinct filters', () {
      final ids = ReelFilters.catalog.map((f) => f.id).toList();
      expect(ids, hasLength(14));
      expect(ids.toSet(), hasLength(14));
      expect(ids.first, ReelFilters.originalId);
      expect(
        ids,
        containsAll([
          'vivid',
          'warm',
          'cool',
          'cinematic',
          'portrait',
          'vintage',
          'bw',
          'golden',
          'india',
          'urban',
          'food',
          'travel',
          'night',
        ]),
      );
    });

    test('Original is a no-op; every other filter changes the picture', () {
      for (final f in ReelFilters.catalog) {
        expect(ColorMatrices.isIdentity(f.matrix), f.isOriginal, reason: f.id);
      }
    });

    test('Black & White is greyscale', () {
      final m = ReelFilters.byId('bw')!.matrix;
      final r = m[0] * 200 + m[1] * 80 + m[2] * 40 + m[4];
      final g = m[5] * 200 + m[6] * 80 + m[7] * 40 + m[9];
      expect(r, closeTo(g, 1e-6));
    });

    test('intensity scales the effect, 0 = none', () {
      final c = clip(video('a'), 'a').copyWith(filterId: 'vivid');
      expect(ReelLook.matrixFor(c.copyWith(filterIntensity: 0)), isNull);
      final half = ReelLook.matrixFor(c.copyWith(filterIntensity: 0.5))!;
      final full = ReelLook.matrixFor(c)!;
      expect(half, isNot(equals(full)));
      // Half-way between identity and full.
      expect(half[0], closeTo((1 + full[0]) / 2, 1e-9));
    });

    test('a clip with nothing applied has no colour layer at all', () {
      expect(ReelLook.matrixFor(clip(video('a'), 'a')), isNull);
      expect(
        ReelLook.matrixFor(
          clip(video('a'), 'a').copyWith(filterId: 'original'),
        ),
        isNull,
      );
    });

    test('adjustments alone also produce a matrix', () {
      final c = clip(video('a'), 'a').copyWith(
        adjustments: const ReelAdjustments(brightness: 0.3, saturation: -0.4),
      );
      expect(ReelLook.matrixFor(c), isNotNull);
    });
  });

  group('stickers', () {
    test('ten categories, in the specified order, all populated', () {
      expect(StickerCatalog.categories.map((c) => c.id), [
        'emoji',
        'india',
        'travel',
        'food',
        'business',
        'love',
        'funny',
        'festival',
        'sports',
        'celebration',
      ]);
      for (final c in StickerCatalog.categories) {
        expect(c.stickers, isNotEmpty, reason: c.id);
      }
      expect(StickerCatalog.byId('food')!.id, 'food');
      expect(StickerCatalog.byId('nope'), isNull);
    });
  });

  group('JSON round trip (drafts are saved as JSON)', () {
    test('a full draft survives encode/decode unchanged', () {
      const track = MusicTrack(
        id: 't1',
        title: 'Sunrise',
        artist: 'Artist',
        language: 'Hindi',
        duration: Duration(minutes: 3, seconds: 30),
        rightsType: MusicRightsType.platformOwned,
        categories: [MusicCategory.trending, MusicCategory.hindi],
        reelsCount: 12400,
        previewSeed: 7,
      );
      final draft = ReelDraft(
        id: 'd1',
        clips: [
          clip(video('a', seconds: 8), 'c1').copyWith(
            filterId: 'warm',
            filterIntensity: 0.6,
            transitionId: 'fade',
            volume: 0.5,
            start: const Duration(seconds: 1),
            end: const Duration(seconds: 6),
            adjustments: const ReelAdjustments(brightness: 0.2, vignette: 0.4),
          ),
          clip(photo('p'), 'c2'),
        ],
        overlays: const [
          ReelOverlay(
            id: 'o1',
            type: OverlayType.text,
            content: 'Hyderabad ❤️',
            start: Duration.zero,
            end: Duration(seconds: 5),
            x: 0.3,
            y: 0.7,
            scale: 1.4,
            rotation: 0.2,
            textStyle: OverlayTextStyle(
              fontId: 'serif',
              colorValue: 0xFFFFC107,
              backgroundValue: 0xFF000000,
              align: OverlayAlign.start,
              animation: TextAnimation.pop,
              bold: false,
            ),
          ),
          ReelOverlay(
            id: 'o2',
            type: OverlayType.sticker,
            content: '🪔',
            start: Duration(seconds: 2),
            end: Duration(seconds: 4),
          ),
        ],
        settings: const ReelSettings(
          caption: 'Hello #blocks',
          district: 'Hyderabad',
          state: 'Telangana',
          audience: PostAudience.closeFriends,
          allowReuse: false,
          taggedUserIds: ['u1', 'u2'],
          coverMode: CoverMode.frame,
          coverFrameMs: 2500,
          coverText: 'Charminar',
          durationLimitSeconds: 60,
        ),
        music: const MusicSelection(
          track: track,
          start: Duration(seconds: 72),
          end: Duration(seconds: 102),
        ),
        updatedAt: _now,
        createdAt: _now,
      );

      final restored = ReelDraft.fromJson(
        (jsonDecode(jsonEncode(draft.toJson())) as Map).cast<String, Object?>(),
      );
      expect(restored, draft);
      expect(restored.music!.length, const Duration(seconds: 30));
      expect(restored.clipCount, 2);
      expect(restored.photoCount, 1);
    });

    test('totalDuration sums the clips', () {
      final d = draftOf([
        clip(video('a', seconds: 4), 'a'),
        clip(photo('p'), 'p'),
      ]);
      expect(d.totalDuration, const Duration(seconds: 7));
    });
  });

  group('MusicTrack rights', () {
    final now = DateTime(2026, 10, 9);
    MusicTrack t({
      MusicRightsType rights = MusicRightsType.licensed,
      List<String> countries = const ['IN'],
      DateTime? expiry,
    }) => MusicTrack(
      id: 'x',
      title: 'x',
      artist: 'x',
      language: 'Hindi',
      duration: const Duration(minutes: 3),
      rightsType: rights,
      categories: const [MusicCategory.popular],
      allowedCountries: countries,
      licenseExpiry: expiry,
    );

    test('a licensed track is available in its countries', () {
      expect(t().isAvailable(country: 'IN', now: now), isTrue);
      expect(t().isAvailable(country: 'US', now: now), isFalse);
    });

    test('an expired licence makes it unavailable', () {
      expect(
        t(expiry: DateTime(2026, 10, 10)).isAvailable(country: 'IN', now: now),
        isTrue,
      );
      expect(
        t(expiry: DateTime(2026, 10, 9)).isAvailable(country: 'IN', now: now),
        isFalse,
      );
      expect(
        t(expiry: DateTime(2025)).isAvailable(country: 'IN', now: now),
        isFalse,
      );
    });

    test('restricted tracks are never available', () {
      expect(
        t(rights: MusicRightsType.restricted)
            .isAvailable(country: 'IN', now: now),
        isFalse,
      );
    });
  });
}
