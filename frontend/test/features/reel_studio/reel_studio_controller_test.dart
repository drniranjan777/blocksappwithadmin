import 'package:blocks_app/core/services/local_store.dart';
import 'package:blocks_app/data/mock/mock_music_catalog.dart';
import 'package:blocks_app/data/models/media_models.dart';
import 'package:blocks_app/data/models/music_models.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/data/models/reel_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/reel_studio/application/reel_providers.dart';
import 'package:blocks_app/features/reel_studio/application/reel_studio_controller.dart';
import 'package:blocks_app/features/reel_studio/domain/reel_validator.dart';
import 'package:blocks_app/features/settings/application/app_settings.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

ProviderContainer makeContainer({Map<String, Object>? storage}) {
  final c = ProviderContainer(
    overrides: [
      localStoreProvider.overrideWithValue(InMemoryLocalStore(storage)),
      mockLatencyProvider.overrideWithValue(Duration.zero),
    ],
  );
  addTearDown(c.dispose);
  return c;
}

List<String> clipIds(ReelStudioState s) => [
  for (final c in s.draft.clips) c.id,
];

void main() {
  late ProviderContainer c;
  late List<MediaAsset> lib;

  ReelStudioController ctl() => c.read(reelStudioProvider.notifier);
  ReelStudioState st() => c.read(reelStudioProvider);

  MediaAsset video(String id) => lib.firstWhere((m) => m.id == 'g~clip~$id');

  setUp(() async {
    c = makeContainer();
    // Keep the editor session alive for the whole test.
    c.listen(reelStudioProvider, (_, _) {});
    lib = await c.read(mediaLibraryRepositoryProvider).getLibrary();
    await ctl().begin(null);
  });

  group('starting', () {
    test(
      'a new reel starts empty with the creator\'s district and server limits',
      () {
        expect(st().draft.isEmpty, isTrue);
        expect(st().isLoading, isFalse);
        expect(st().draft.settings.district, 'Hyderabad');
        expect(st().draft.settings.state, 'Telangana');
        expect(st().draft.settings.durationLimitSeconds, 30);
        expect(st().config.maxClips, 20);
        expect(st().canContinue, isFalse);
      },
    );

    test(
      'quality starts at Balanced, or Data Saver when that setting is on',
      () async {
        expect(st().quality, MediaQuality.balanced);
        final saver = ProviderContainer(
          overrides: [
            localStoreProvider.overrideWithValue(
              InMemoryLocalStore({'pref_flag_dataSaver': true}),
            ),
            mockLatencyProvider.overrideWithValue(Duration.zero),
          ],
        );
        addTearDown(saver.dispose);
        saver.listen(reelStudioProvider, (_, _) {});
        expect(saver.read(flagProvider(AppFlag.dataSaver)), isTrue);
        expect(saver.read(reelStudioProvider).quality, MediaQuality.dataSaver);
      },
    );
  });

  group('building the timeline', () {
    test('3 videos and 2 photos appear in order with their durations', () {
      final photos = lib.where((m) => m.isPhoto).take(2).toList();
      ctl().addMedia([
        video('3101'),
        photos[0],
        video('3303'),
        photos[1],
        video('3404'),
      ]);
      final clips = st().draft.clips;
      expect(clips, hasLength(5));
      expect(
        [for (final x in clips) x.isPhoto],
        [false, true, false, true, false],
      );
      expect([for (final x in clips) x.duration.inSeconds], [4, 3, 8, 3, 5]);
      expect(st().draft.totalDuration, const Duration(seconds: 23));
      expect(st().draft.photoCount, 2);
      expect(st().issues, isEmpty);
      expect(st().canContinue, isTrue);
      expect(st().selectedClipId, clips.last.id);
    });

    test('clip ids are unique even for the same file used twice', () {
      ctl().addMedia([video('3101'), video('3101')]);
      expect(clipIds(st()).toSet(), hasLength(2));
    });

    test('reorder moves a clip (drag and drop)', () {
      ctl().addMedia([video('3101'), video('3303'), video('3404')]);
      final ids = clipIds(st());
      ctl().reorder(0, 3);
      expect(clipIds(st()), [ids[1], ids[2], ids[0]]);
      ctl().reorder(2, 0);
      expect(clipIds(st()), ids);
      expect(st().isDirty, isTrue);
    });

    test('delete removes the clip and clears its selection', () {
      ctl().addMedia([video('3101'), video('3303')]);
      final first = st().draft.clips.first.id;
      ctl().selectClip(first);
      ctl().removeClip(first);
      expect(st().draft.clips, hasLength(1));
      expect(st().selectedClipId, isNull);
    });

    test('duplicate puts an identical copy right after', () {
      ctl().addMedia([video('3101'), video('3303')]);
      final first = st().draft.clips.first;
      ctl().duplicateClip(first.id);
      final clips = st().draft.clips;
      expect(clips, hasLength(3));
      expect(clips[1].media, first.media);
      expect(clips[1].id, isNot(first.id));
      expect(st().selectedClipId, clips[1].id);
      expect(st().draft.totalDuration, const Duration(seconds: 4 + 4 + 8));
    });

    test('trim cuts the playing part and shortens the reel', () {
      ctl().addMedia([video('3303')]);
      final id = st().draft.clips.single.id;
      ctl().trim(
        id,
        start: const Duration(seconds: 2),
        end: const Duration(seconds: 6),
      );
      expect(st().draft.clips.single.duration, const Duration(seconds: 4));
      expect(st().draft.totalDuration, const Duration(seconds: 4));
      // The source file is untouched.
      expect(st().draft.clips.single.media.durationMs, 8000);
    });

    test('split makes two clips that add up to the same length', () {
      ctl().addMedia([video('3303')]);
      final id = st().draft.clips.single.id;
      ctl().splitAt(id, const Duration(seconds: 3));
      final clips = st().draft.clips;
      expect(clips, hasLength(2));
      expect(clips[0].duration, const Duration(seconds: 3));
      expect(clips[1].duration, const Duration(seconds: 5));
      expect(st().draft.totalDuration, const Duration(seconds: 8));
    });

    test('a cut that would leave a sliver is refused with a message', () {
      ctl().addMedia([video('3303')]);
      ctl().splitAt(
        st().draft.clips.single.id,
        const Duration(milliseconds: 100),
      );
      expect(st().draft.clips, hasLength(1));
      expect(st().notice?.kind, StudioNoticeKind.sliverCut);
    });

    test('photo duration can be changed within the allowed range', () {
      final photo = lib.firstWhere((m) => m.isPhoto);
      ctl().addMedia([photo]);
      final id = st().draft.clips.single.id;
      ctl().setPhotoDuration(id, const Duration(seconds: 6));
      expect(st().draft.clips.single.duration, const Duration(seconds: 6));
      ctl().setPhotoDuration(id, const Duration(minutes: 5));
      expect(st().draft.clips.single.duration, const Duration(seconds: 10));
    });

    test('replace swaps the media and keeps the look', () {
      ctl().addMedia([video('3101')]);
      final id = st().draft.clips.single.id;
      ctl().setFilter(id, 'warm');
      ctl().replaceClip(id, video('3404'));
      final c0 = st().draft.clips.single;
      expect(c0.id, id);
      expect(c0.media.id, 'g~clip~3404');
      expect(c0.filterId, 'warm');
    });
  });

  group('limits (from server config)', () {
    test('a video over the size limit is not added', () {
      final huge = lib.firstWhere(
        (m) => m.originalSizeBytes > st().config.maxVideoSizeBytes,
      );
      ctl().addMedia([huge, video('3101')]);
      expect(st().draft.clips, hasLength(1));
      expect(st().notice?.kind, StudioNoticeKind.videoTooLarge);
      expect(st().notice?.count, 1);
    });

    test('the clip cap and the photo cap are enforced', () async {
      final tight = ProviderContainer(
        overrides: [
          localStoreProvider.overrideWithValue(InMemoryLocalStore()),
          mockLatencyProvider.overrideWithValue(Duration.zero),
        ],
      );
      addTearDown(tight.dispose);
      tight.listen(reelStudioProvider, (_, _) {});
      final world = tight.read(mockWorldProvider);
      world.creator.reelConfig = const ReelConfig(maxClips: 3, maxPhotos: 1);
      final n = tight.read(reelStudioProvider.notifier);
      await n.begin(null);
      final photos = lib.where((m) => m.isPhoto).take(2).toList();

      n.addMedia([photos[0], photos[1]]);
      expect(tight.read(reelStudioProvider).draft.clips, hasLength(1));
      expect(
        tight.read(reelStudioProvider).notice?.kind,
        StudioNoticeKind.tooManyPhotos,
      );

      n.addMedia([video('3101'), video('3303'), video('3404')]);
      expect(tight.read(reelStudioProvider).draft.clips, hasLength(3));
      expect(
        tight.read(reelStudioProvider).notice?.kind,
        StudioNoticeKind.tooManyClips,
      );

      n.duplicateClip(tight.read(reelStudioProvider).draft.clips.first.id);
      expect(tight.read(reelStudioProvider).draft.clips, hasLength(3));
    });

    test(
      'a reel longer than the chosen limit cannot continue, until it fits',
      () {
        ctl().addMedia([video('3202')]); // 35 s
        expect(st().issues.map((i) => i.type), contains(ReelIssueType.tooLong));
        expect(st().isOverLimit, isTrue);
        expect(st().canContinue, isFalse);

        ctl().setDurationLimit(60);
        expect(st().canContinue, isTrue);

        ctl().setDurationLimit(30);
        expect(st().canContinue, isFalse);
        ctl().trim(
          st().draft.clips.single.id,
          end: const Duration(seconds: 25),
        );
        expect(st().canContinue, isTrue);
      },
    );

    test('only server-offered limits can be chosen', () {
      ctl().setDurationLimit(45);
      expect(st().draft.settings.durationLimitSeconds, 30);
      ctl().setDurationLimit(90);
      expect(st().draft.settings.durationLimitSeconds, 90);
    });
  });

  group('looks', () {
    setUp(() => ctl().addMedia([video('3101'), video('3303')]));

    test('filter changes the clip; Original clears it', () {
      final id = st().draft.clips.first.id;
      ctl().setFilter(id, 'vivid');
      expect(st().draft.clips.first.filterId, 'vivid');
      ctl().setFilterIntensity(id, 0.4);
      expect(st().draft.clips.first.filterIntensity, 0.4);
      ctl().setFilterIntensity(id, 9);
      expect(st().draft.clips.first.filterIntensity, 1);
      ctl().setFilter(id, 'original');
      expect(st().draft.clips.first.filterId, isNull);
    });

    test('apply to all gives every clip the same look', () {
      final id = st().draft.clips.first.id;
      ctl().setFilter(id, 'golden', intensity: 0.7);
      ctl().setAdjustments(id, const ReelAdjustments(brightness: 0.2));
      ctl().applyLookToAll(id);
      for (final clip in st().draft.clips) {
        expect(clip.filterId, 'golden');
        expect(clip.filterIntensity, 0.7);
        expect(clip.adjustments.brightness, 0.2);
      }
    });

    test('transitions and volume', () {
      final id = st().draft.clips.first.id;
      ctl().setTransition(id, 'fade');
      expect(st().draft.clips.first.transitionId, 'fade');
      ctl().setTransition(id, 'none');
      expect(st().draft.clips.first.transitionId, isNull);
      ctl().setClipVolume(id, 5);
      expect(st().draft.clips.first.volume, 1);
      ctl().setClipVolume(id, 0);
      expect(st().draft.clips.first.volume, 0);
    });
  });

  group('text and stickers', () {
    setUp(() => ctl().addMedia([video('3303')])); // 8 s

    test(
      'text starts where the playhead is, for 3 seconds, and is selected',
      () {
        final id = ctl().addText(
          'Hyderabad ❤️',
          at: const Duration(seconds: 2),
        );
        final o = st().draft.overlays.single;
        expect(o.id, id);
        expect(o.type, OverlayType.text);
        expect(o.content, 'Hyderabad ❤️');
        expect(o.start, const Duration(seconds: 2));
        expect(o.end, const Duration(seconds: 5));
        expect(st().selectedOverlayId, id);
        expect(st().selectedOverlay, o);
      },
    );

    test('it never runs past the end of the reel', () {
      ctl().addText('late', at: const Duration(seconds: 7));
      expect(st().draft.overlays.single.end, const Duration(seconds: 8));
    });

    test('move, resize, rotate, style and edit the text', () {
      final id = ctl().addText('Hi');
      ctl().moveOverlay(id, 0.2, 0.8);
      ctl().transformOverlay(id, scale: 1.5, rotation: 0.3);
      ctl().setOverlayText(id, 'Hello');
      ctl().setOverlayStyle(
        id,
        const OverlayTextStyle(
          fontId: 'serif',
          colorValue: 0xFFFFC107,
          align: OverlayAlign.start,
          animation: TextAnimation.pop,
        ),
      );
      final o = st().draft.overlays.single;
      expect((o.x, o.y), (0.2, 0.8));
      expect((o.scale, o.rotation), (1.5, 0.3));
      expect(o.content, 'Hello');
      expect(o.textStyle.fontId, 'serif');
      expect(o.textStyle.animation, TextAnimation.pop);
    });

    test('position and size are kept inside sensible bounds', () {
      final id = ctl().addSticker('🪔');
      ctl().moveOverlay(id, -2, 9);
      ctl().transformOverlay(id, scale: 100);
      final o = st().draft.overlays.single;
      expect((o.x, o.y), (0.0, 1.0));
      expect(o.scale, 4);
      ctl().transformOverlay(id, scale: 0.01);
      expect(st().draft.overlays.single.scale, 0.4);
    });

    test('timing stays inside the reel and keeps a minimum length', () {
      final id = ctl().addText('x');
      ctl().setOverlayTiming(
        id,
        start: const Duration(seconds: 1),
        end: const Duration(seconds: 99),
      );
      var o = st().draft.overlays.single;
      expect(o.end, const Duration(seconds: 8));
      expect(o.start, const Duration(seconds: 1));
      ctl().setOverlayTiming(id, start: const Duration(seconds: 8));
      o = st().draft.overlays.single;
      expect(
        o.duration,
        greaterThanOrEqualTo(const Duration(milliseconds: 500)),
      );
      expect(o.end <= const Duration(seconds: 8), isTrue);
    });

    test('delete removes it', () {
      final id = ctl().addSticker('🔥');
      ctl().removeOverlay(id);
      expect(st().draft.overlays, isEmpty);
      expect(st().selectedOverlayId, isNull);
    });

    test('shortening the reel trims or removes text that no longer fits', () {
      final a = ctl().addText('early', at: const Duration(seconds: 1));
      final b = ctl().addText('late', at: const Duration(seconds: 6));
      ctl().trim(st().draft.clips.single.id, end: const Duration(seconds: 4));
      final left = st().draft.overlays;
      expect(left.map((o) => o.id), [a]);
      expect(left.single.end, const Duration(seconds: 4));
      expect(b, isNotEmpty);
    });
  });

  group('music', () {
    final track = kMusicCatalog.firstWhere((t) => t.id == 'm01');
    test('the chosen track and its clip are on the draft; removable', () {
      ctl().setMusic(
        MusicSelection(
          track: track,
          start: const Duration(seconds: 20),
          end: const Duration(seconds: 50),
        ),
      );
      expect(st().draft.music!.track.title, 'Charminar Nights');
      expect(st().draft.music!.length, const Duration(seconds: 30));
      ctl().clearMusic();
      expect(st().draft.music, isNull);
    });
  });

  group('publish settings', () {
    test('caption, location, audience and switches', () {
      ctl().setCaption('Sunday #food');
      ctl().setLocation('Warangal', 'Telangana');
      ctl().setAudience(PostAudience.closeFriends);
      ctl().setAllowComments(value: false);
      ctl().setAllowReuse(value: false);
      ctl().setAllowSharing(value: false);
      ctl().setTagged(['u1', 'u2']);
      final s = st().draft.settings;
      expect(s.caption, 'Sunday #food');
      expect((s.district, s.state), ('Warangal', 'Telangana'));
      expect(s.audience, PostAudience.closeFriends);
      expect(
        (s.allowComments, s.allowReuse, s.allowSharing),
        (false, false, false),
      );
      expect(s.taggedUserIds, ['u1', 'u2']);
    });

    test('cover choices', () {
      ctl().setCover(mode: CoverMode.frame, frameMs: 2500, text: 'Charminar');
      final s = st().draft.settings;
      expect(s.coverMode, CoverMode.frame);
      expect(s.coverFrameMs, 2500);
      expect(s.coverText, 'Charminar');
    });

    test('quality can be changed and drives the size estimate', () {
      ctl().addMedia([video('3202')]);
      ctl().setDurationLimit(60);
      ctl().setQuality(MediaQuality.balanced);
      final balanced = st().estimate;
      expect(balanced.originalBytes, 82 * 1024 * 1024);
      expect(balanced.reductionPercent, inInclusiveRange(77, 79));
      ctl().setQuality(MediaQuality.dataSaver);
      expect(st().estimate.optimizedBytes, lessThan(balanced.optimizedBytes));
      ctl().setQuality(MediaQuality.original);
      expect(st().estimate.optimizedBytes, st().estimate.originalBytes);
      expect(st().estimate.reductionPercent, 0);
    });
  });

  group('drafts', () {
    test(
      'Save Draft puts the edit in Drafts and clears the unsaved mark',
      () async {
        ctl().addMedia([video('3101'), video('3303')]);
        ctl().setCaption('my caption');
        expect(st().isDirty, isTrue);
        expect(await ctl().saveDraft(), isTrue);
        expect(st().isDirty, isFalse);
        expect(st().lastSavedAt, isNotNull);
        expect(st().notice?.kind, StudioNoticeKind.draftSaved);

        final drafts = await c.read(reelDraftsProvider.future);
        expect(drafts, hasLength(1));
        expect(drafts.single.clipCount, 2);
        expect(drafts.single.settings.caption, 'my caption');
      },
    );

    test('an empty reel is not saved', () async {
      expect(await ctl().saveDraft(), isFalse);
      expect(await c.read(reelDraftsProvider.future), isEmpty);
    });

    test('Continue Editing restores everything', () async {
      final photo = lib.firstWhere((m) => m.isPhoto);
      ctl().addMedia([video('3101'), photo, video('3303')]);
      final id = st().draft.clips.first.id;
      ctl().setFilter(id, 'cinematic', intensity: 0.5);
      ctl().addText('Hello', at: const Duration(seconds: 1));
      ctl().setMusic(
        MusicSelection(
          track: kMusicCatalog.first,
          start: Duration.zero,
          end: const Duration(seconds: 15),
        ),
      );
      ctl().setCaption('restore me');
      await ctl().saveDraft();
      final draftId = st().draft.id;
      final before = st().draft;

      final c2 = ProviderContainer(
        overrides: [
          localStoreProvider.overrideWithValue(c.read(localStoreProvider)),
          mockLatencyProvider.overrideWithValue(Duration.zero),
        ],
      );
      addTearDown(c2.dispose);
      c2.listen(reelStudioProvider, (_, _) {});
      await c2.read(reelStudioProvider.notifier).begin(draftId);
      final after = c2.read(reelStudioProvider);

      expect(after.draft.id, draftId);
      expect(after.draft.clips.map((x) => x.id), before.clips.map((x) => x.id));
      expect(after.draft.clips.first.filterId, 'cinematic');
      expect(after.draft.clips.first.filterIntensity, 0.5);
      expect(after.draft.overlays.single.content, 'Hello');
      expect(after.draft.music?.track.id, kMusicCatalog.first.id);
      expect(after.draft.settings.caption, 'restore me');
      expect(after.isDirty, isFalse);
      expect(after.draft.totalDuration, before.totalDuration);
    });

    test('opening an unknown draft starts a new reel', () async {
      await ctl().begin('does-not-exist');
      expect(st().draft.isEmpty, isTrue);
    });

    test('draft list actions: duplicate and delete', () async {
      ctl().addMedia([video('3101')]);
      await ctl().saveDraft();
      final list = c.read(reelDraftsProvider.notifier);
      final copy = await list.duplicate(st().draft.id);
      expect(await c.read(reelDraftsProvider.future), hasLength(2));
      await list.delete(copy.id);
      expect(await c.read(reelDraftsProvider.future), hasLength(1));
    });

    test('discarding after publish removes the draft', () async {
      ctl().addMedia([video('3101')]);
      await ctl().saveDraft();
      await ctl().discardDraft();
      expect(await c.read(reelDraftsProvider.future), isEmpty);
    });
  });
}
