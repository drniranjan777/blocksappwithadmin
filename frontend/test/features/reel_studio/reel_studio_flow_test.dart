import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/data/services/creator_demo_service.dart';
import 'package:blocks_app/features/reel_studio/application/reel_providers.dart';
import 'package:blocks_app/features/reel_studio/application/reel_studio_controller.dart';
import 'package:blocks_app/features/reel_studio/presentation/music_picker_screen.dart';
import 'package:blocks_app/features/reel_studio/presentation/reel_details_screen.dart';
import 'package:blocks_app/features/reel_studio/presentation/reel_publishing_screen.dart';
import 'package:blocks_app/features/reel_studio/presentation/reel_studio_screen.dart';
import 'package:blocks_app/features/reel_studio/presentation/widgets/overlay_lanes.dart';
import 'package:blocks_app/features/reel_studio/presentation/widgets/reel_preview.dart';
import 'package:blocks_app/features/reels/presentation/reels_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/app_driver.dart';

const _tall = Size(390, 1500);

ReelStudioState studio(WidgetTester t) =>
    containerOf(t).read(reelStudioProvider);

Future<void> openStudio(WidgetTester tester) async {
  tester.view
    ..physicalSize = _tall * 2
    ..devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  await openSignedInApp(tester, size: _tall);
  await pushRoute(tester, Routes.createReel);
  await tester.pumpAndSettle();
}

/// Opens a tool in the strip, scrolling it into view first (the strip scrolls
/// sideways on a phone).
Future<void> selectTool(WidgetTester tester, String name) async {
  final tool = find.bySemanticsLabel(name).first;
  await tester.ensureVisible(tool);
  await tester.pumpAndSettle();
  await tester.tap(tool);
  await tester.pumpAndSettle();
}

/// Opens the gallery and taps 3 videos and 2 photos, in that mixed order.
Future<void> addThreeVideosAndTwoPhotos(WidgetTester tester) async {
  await tester.tap(find.bySemanticsLabel('Add media').first);
  await tester.pumpAndSettle();

  Future<void> tap(Pattern label, [int at = 0]) async {
    await tester.tap(find.bySemanticsLabel(label).at(at));
    await tester.pump();
  }

  await tap(RegExp(r'^Video, 4s, ')); // 4 s
  await tap(RegExp(r'^Photo, ')); // 3 s
  await tap(RegExp(r'^Video, 8s, ')); // 8 s
  await tap(RegExp(r'^Photo, '), 1); // 3 s
  await tap(RegExp(r'^Video, 5s, ')); // 5 s

  await tester.tap(find.text('Add 5 to reel'));
  await tester.pumpAndSettle();
}

/// Runs [body] with the accessibility tree switched on (the editor is driven
/// through its semantic labels), and releases it inside the test as required.
void studioTest(String name, Future<void> Function(WidgetTester) body) {
  testWidgets(name, (tester) async {
    final handle = tester.ensureSemantics();
    try {
      await body(tester);
    } finally {
      handle.dispose();
    }
  });
}

void main() {
  studioTest('Create hub opens the reel editor', (tester) async {
    await openSignedInApp(tester);
    await pushRoute(tester, Routes.create);
    await tester.tap(find.text('Reel'));
    await tester.pumpAndSettle();
    expect(find.byType(ReelStudioScreen), findsOneWidget);
    expect(find.text('New reel'), findsOneWidget);
    // Nothing yet: the preview invites the creator to add media.
    expect(
      find.text('Add videos or photos to start your reel.'),
      findsOneWidget,
    );
  });

  studioTest('3 videos + 2 photos appear on the timeline in the order picked', (
    tester,
  ) async {
    await openStudio(tester);
    await addThreeVideosAndTwoPhotos(tester);

    final clips = studio(tester).draft.clips;
    expect(clips, hasLength(5));
    expect(
      [for (final c in clips) c.isPhoto],
      [false, true, false, true, false],
    );
    expect([for (final c in clips) c.duration.inSeconds], [4, 3, 8, 3, 5]);

    // The timeline shows each one, labelled for screen readers.
    expect(find.bySemanticsLabel('Clip 1 of 5, Video, 4s'), findsOneWidget);
    expect(find.bySemanticsLabel('Clip 2 of 5, Photo, 3s'), findsOneWidget);
    expect(find.bySemanticsLabel('Clip 3 of 5, Video, 8s'), findsOneWidget);
    // The strip scrolls sideways; the last two clips are reached by scrolling.
    await tester.drag(find.byType(ReorderableListView), const Offset(-400, 0));
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('Clip 4 of 5, Photo, 3s'), findsOneWidget);
    expect(find.bySemanticsLabel('Clip 5 of 5, Video, 5s'), findsOneWidget);
    // Total length is shown against the chosen limit.
    expect(find.text('0:23 of 0:30'), findsOneWidget);
  });

  studioTest('reordering a clip changes the timeline', (tester) async {
    await openStudio(tester);
    await addThreeVideosAndTwoPhotos(tester);

    final before = [for (final c in studio(tester).draft.clips) c.id];
    // The last clip is selected; move it earlier.
    await tester.tap(find.bySemanticsLabel('Move earlier').last);
    await tester.pumpAndSettle();
    final after = [for (final c in studio(tester).draft.clips) c.id];
    expect(after[3], before[4]);
    expect(after[4], before[3]);
    // The 5 s video is now 4th, and the 3 s photo last.
    expect(studio(tester).draft.clips[3].duration, const Duration(seconds: 5));
    expect(studio(tester).draft.clips[4].isPhoto, isTrue);
  });

  studioTest('long-press and drag reorders the timeline', (tester) async {
    await openStudio(tester);
    await addThreeVideosAndTwoPhotos(tester);

    final before = [for (final c in studio(tester).draft.clips) c.id];
    final first = find.bySemanticsLabel(RegExp(r'^Clip 1 of 5'));
    final third = find.bySemanticsLabel(RegExp(r'^Clip 3 of 5'));
    final from = tester.getCenter(first);
    final to = tester.getCenter(third) + const Offset(40, 0);

    final g = await tester.startGesture(from);
    await tester.pump(const Duration(milliseconds: 700)); // long press
    await g.moveTo(to, timeStamp: const Duration(milliseconds: 900));
    await tester.pump(const Duration(milliseconds: 200));
    await g.up();
    await tester.pumpAndSettle();

    final after = [for (final c in studio(tester).draft.clips) c.id];
    expect(after, isNot(before));
    expect(after.toSet(), before.toSet());
    expect(after.first, isNot(before.first));
  });

  studioTest('choosing a filter changes the preview', (tester) async {
    await openStudio(tester);
    await addThreeVideosAndTwoPhotos(tester);

    // No filter yet: the preview has no colour layer.
    final preview = find.byType(ReelPreview);
    expect(
      find.descendant(of: preview, matching: find.byType(ColorFiltered)),
      findsNothing,
    );

    await selectTool(tester, 'Filters');
    await tester.pumpAndSettle();
    // 14 filters are offered.
    for (final name in [
      'Original',
      'Vivid',
      'Warm',
      'Cool',
      'Cinematic',
      'Portrait',
      'Vintage',
      'Black & White',
      'Golden Hour',
      'India',
      'Urban',
    ]) {
      expect(find.bySemanticsLabel(name), findsWidgets, reason: name);
    }
    await tester.tap(find.bySemanticsLabel('Warm').first);
    await tester.pumpAndSettle();

    expect(studio(tester).selectedClip!.filterId, 'warm');
    expect(
      find.descendant(of: preview, matching: find.byType(ColorFiltered)),
      findsWidgets,
    );

    // Intensity changes the strength; Original removes the effect again.
    await tester.tap(find.bySemanticsLabel('Original').first);
    await tester.pumpAndSettle();
    expect(studio(tester).selectedClip!.filterId, isNull);
    expect(
      find.descendant(of: preview, matching: find.byType(ColorFiltered)),
      findsNothing,
    );
  });

  studioTest('adding text shows it on the preview and edits update it', (
    tester,
  ) async {
    await openStudio(tester);
    await addThreeVideosAndTwoPhotos(tester);

    // Go back to the start so the text is on screen at the playhead.
    await tester.tap(find.bySemanticsLabel(RegExp(r'^Clip 1 of 5')));
    await tester.pumpAndSettle();
    await selectTool(tester, 'Text');
    await tester.pumpAndSettle();

    final input = find.widgetWithText(TextField, 'New text');
    await tester.enterText(input, 'Hello Hyderabad');
    await tester.tap(find.bySemanticsLabel('Add').last);
    await tester.pumpAndSettle();

    final preview = find.byType(ReelPreview);
    expect(
      find.descendant(of: preview, matching: find.text('Hello Hyderabad')),
      findsOneWidget,
    );
    expect(studio(tester).draft.overlays.single.content, 'Hello Hyderabad');

    // Editing the selected text changes the preview.
    await tester.enterText(
      find.widgetWithText(TextField, 'Edit text'),
      'Namaste',
    );
    await tester.pumpAndSettle();
    expect(
      find.descendant(of: preview, matching: find.text('Namaste')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: preview, matching: find.text('Hello Hyderabad')),
      findsNothing,
    );
  });

  studioTest('a sticker can be added from a category', (tester) async {
    await openStudio(tester);
    await addThreeVideosAndTwoPhotos(tester);
    await tester.tap(find.bySemanticsLabel(RegExp(r'^Clip 1 of 5')));
    await tester.pumpAndSettle();

    await selectTool(tester, 'Stickers');
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('Festival'), findsOneWidget);
    await tester.ensureVisible(find.bySemanticsLabel('Festival'));
    await tester.pumpAndSettle();
    await tester.tap(find.bySemanticsLabel('Festival'));
    await tester.pumpAndSettle();
    await tester.tap(find.bySemanticsLabel('Add sticker 🎆'));
    await tester.pumpAndSettle();

    expect(studio(tester).draft.overlays.single.content, '🎆');
    expect(
      find.descendant(of: find.byType(ReelPreview), matching: find.text('🎆')),
      findsOneWidget,
    );
  });

  studioTest('text and stickers get a lane each, drawn against the reel', (
    tester,
  ) async {
    await openStudio(tester);
    await addThreeVideosAndTwoPhotos(tester);

    // Nothing to show until there is a caption or sticker.
    expect(find.byType(OverlayLanes), findsNothing);
    expect(find.text('Text and stickers on the timeline'), findsNothing);

    final c = containerOf(tester).read(reelStudioProvider.notifier);
    final textId = c.addText('Hello Hyderabad');
    final stickerId = c.addSticker('🎆', at: const Duration(seconds: 5));
    await tester.pumpAndSettle();

    expect(find.text('Text and stickers on the timeline'), findsOneWidget);
    // One lane each, named for a screen reader with when it is on screen.
    expect(
      find.bySemanticsLabel(
        'Text “Hello Hyderabad”, on screen from 0:00 to 0:03',
      ),
      findsOneWidget,
    );
    expect(
      find.bySemanticsLabel('Sticker 🎆, on screen from 0:05 to 0:08'),
      findsOneWidget,
    );

    // The sticker was added last, so it is the one selected.
    expect(studio(tester).selectedOverlayId, stickerId);

    // Tapping a lane selects that overlay and opens its tool.
    await tester.tap(find.bySemanticsLabel(RegExp(r'^Text “Hello Hyderabad”')));
    await tester.pumpAndSettle();
    expect(studio(tester).selectedOverlayId, textId);
    expect(studio(tester).tool, StudioTool.text);

    await tester.tap(find.bySemanticsLabel(RegExp(r'^Sticker 🎆')));
    await tester.pumpAndSettle();
    expect(studio(tester).selectedOverlayId, stickerId);
    expect(studio(tester).tool, StudioTool.stickers);
  });

  studioTest('changing when a caption shows moves its lane', (tester) async {
    await openStudio(tester);
    await addThreeVideosAndTwoPhotos(tester);
    final c = containerOf(tester).read(reelStudioProvider.notifier);
    final id = c.addText('Hello Hyderabad');
    await tester.pumpAndSettle();

    Rect barOf() => tester.getRect(
      find.descendant(
        of: find.byType(OverlayLanes),
        matching: find.text('Hello Hyderabad'),
      ),
    );
    final before = barOf();

    c.setOverlayTiming(
      id,
      start: const Duration(seconds: 8),
      end: const Duration(seconds: 14),
    );
    await tester.pumpAndSettle();

    expect(
      find.bySemanticsLabel(
        'Text “Hello Hyderabad”, on screen from 0:08 to 0:14',
      ),
      findsOneWidget,
    );
    // Later in the reel means further along the lane.
    expect(barOf().left, greaterThan(before.left));
  });

  studioTest('removing the overlay removes its lane', (tester) async {
    await openStudio(tester);
    await addThreeVideosAndTwoPhotos(tester);
    final c = containerOf(tester).read(reelStudioProvider.notifier);
    final id = c.addText('Hello Hyderabad');
    await tester.pumpAndSettle();
    expect(find.text('Text and stickers on the timeline'), findsOneWidget);

    c.removeOverlay(id);
    await tester.pumpAndSettle();
    expect(find.text('Text and stickers on the timeline'), findsNothing);
  });

  studioTest('the selected music appears in the editor', (tester) async {
    await openStudio(tester);
    await addThreeVideosAndTwoPhotos(tester);

    await selectTool(tester, 'Music');
    await tester.pumpAndSettle();
    expect(find.text('Original audio'), findsWidgets);

    await tester.tap(find.bySemanticsLabel('Add music').first);
    await tester.pumpAndSettle();
    expect(find.byType(MusicPickerScreen), findsOneWidget);
    // Trending shows social proof; rights are visible.
    expect(find.text('Trending now'), findsOneWidget);
    expect(find.text('128.4K reels'), findsWidgets);
    expect(find.text('BLOCKS Library'), findsWidgets);

    await tester.tap(find.textContaining('Charminar Nights').first);
    await tester.pumpAndSettle();
    expect(find.text('Choose the part to use'), findsOneWidget);
    await tester.tap(find.text('Use this part'));
    await tester.pumpAndSettle();

    expect(find.byType(ReelStudioScreen), findsOneWidget);
    expect(studio(tester).draft.music!.track.title, 'Charminar Nights');
    // The reel is 23 s long, so the clip is at most that.
    expect(studio(tester).draft.music!.length, const Duration(seconds: 23));
    expect(
      find.descendant(
        of: find.byType(ReelPreview),
        matching: find.text('Charminar Nights'),
      ),
      findsOneWidget,
    );
  });

  studioTest('music search narrows the list; a category filters it', (
    tester,
  ) async {
    await openStudio(tester);
    await addThreeVideosAndTwoPhotos(tester);
    await selectTool(tester, 'Music');
    await tester.pumpAndSettle();
    await tester.tap(find.bySemanticsLabel('Add music').first);
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'punjabi');
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pumpAndSettle();
    expect(find.textContaining('Bhangra Bonanza'), findsWidgets);
    expect(find.textContaining('Charminar Nights'), findsNothing);
    expect(find.text('Trending now'), findsNothing);

    await tester.enterText(find.byType(TextField), 'zzzz');
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pumpAndSettle();
    expect(find.text('No music found'), findsOneWidget);
  });

  studioTest('Save Draft puts the reel in Drafts', (tester) async {
    await openStudio(tester);
    await addThreeVideosAndTwoPhotos(tester);

    // An icon button: its name is the tooltip, which the semantics tree exposes
    // as `tooltip` (not `label`).
    await tester.tap(find.byTooltip('Save Draft'));
    await tester.pumpAndSettle();
    expect(find.text('Saved to Drafts'), findsOneWidget);

    final drafts = await containerOf(tester).read(reelDraftsProvider.future);
    expect(drafts, hasLength(1));
    expect(drafts.single.clipCount, 5);
    expect(drafts.single.photoCount, 2);
    expect(studio(tester).isDirty, isFalse);
  });

  studioTest('leaving with unsaved edits asks what to do', (tester) async {
    await openStudio(tester);
    await addThreeVideosAndTwoPhotos(tester);

    await tester.tap(find.byTooltip('Close'));
    await tester.pumpAndSettle();
    expect(find.text('Leave the editor?'), findsOneWidget);

    await tester.tap(find.text('Keep editing'));
    await tester.pumpAndSettle();
    expect(find.byType(ReelStudioScreen), findsOneWidget);

    await tester.tap(find.byTooltip('Close'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save draft').last);
    await tester.pumpAndSettle();
    expect(find.byType(ReelStudioScreen), findsNothing);
    expect(
      await containerOf(tester).read(reelDraftsProvider.future),
      hasLength(1),
    );
  });

  studioTest('a reel that is too long cannot continue until it fits', (
    tester,
  ) async {
    await openStudio(tester);
    await tester.tap(find.bySemanticsLabel('Add media').first);
    await tester.pumpAndSettle();
    await tester.tap(find.bySemanticsLabel(RegExp(r'^Video, 35s, ')));
    await tester.pump();
    await tester.tap(find.text('Add 1 to reel'));
    await tester.pumpAndSettle();

    expect(find.textContaining('longer than 30 seconds'), findsWidgets);
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    expect(find.byType(ReelDetailsScreen), findsNothing);

    // Choosing a longer reel length fixes it.
    await tester.ensureVisible(find.bySemanticsLabel('1 min'));
    await tester.pumpAndSettle();
    await tester.tap(find.bySemanticsLabel('1 min'));
    await tester.pumpAndSettle();
    // (let the earlier "can't continue" snack bar go away first)
    await tester.pump(const Duration(seconds: 3));
    await tester.pumpAndSettle();
    expect(find.textContaining('longer than'), findsNothing);
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    expect(find.byType(ReelDetailsScreen), findsOneWidget);
  });

  studioTest('a video over the size limit cannot be added', (tester) async {
    await openStudio(tester);
    await tester.tap(find.bySemanticsLabel('Add media').first);
    await tester.pumpAndSettle();
    expect(find.text('Too large'), findsOneWidget);
    final tile = find.bySemanticsLabel(RegExp(r'Too large to add'));
    expect(tile, findsOneWidget);
    await tester.tap(tile, warnIfMissed: false);
    await tester.pump();
    expect(find.text('Add 1 to reel'), findsNothing);
    expect(find.text('Select videos or photos'), findsOneWidget);
  });

  studioTest('delete, duplicate and split work from the Clips panel', (
    tester,
  ) async {
    await openStudio(tester);
    await addThreeVideosAndTwoPhotos(tester);

    await tester.tap(find.bySemanticsLabel('Duplicate'));
    await tester.pumpAndSettle();
    expect(studio(tester).draft.clips, hasLength(6));

    await tester.tap(find.bySemanticsLabel('Split here'));
    await tester.pumpAndSettle();
    expect(studio(tester).draft.clips, hasLength(7));
    expect(studio(tester).draft.totalDuration, const Duration(seconds: 28));

    await tester.tap(find.bySemanticsLabel('Delete'));
    await tester.pumpAndSettle();
    expect(studio(tester).draft.clips, hasLength(6));
  });

  studioTest('trim, adjust, transitions and cover tools open', (tester) async {
    await openStudio(tester);
    await addThreeVideosAndTwoPhotos(tester);

    await tester.tap(find.bySemanticsLabel('Clip 3 of 5, Video, 8s'));
    await tester.pumpAndSettle();

    await selectTool(tester, 'Trim');
    await tester.pumpAndSettle();
    expect(find.byType(RangeSlider), findsOneWidget);
    expect(find.text('Length 8s'), findsOneWidget);

    await selectTool(tester, 'Adjust');
    await tester.pumpAndSettle();
    for (final s in [
      'Brightness',
      'Contrast',
      'Saturation',
      'Warmth',
      'Highlights',
      'Shadows',
      'Sharpness',
      'Fade',
      'Vignette',
    ]) {
      expect(find.bySemanticsLabel(s), findsWidgets, reason: s);
    }

    await selectTool(tester, 'Transitions');
    await tester.pumpAndSettle();
    await tester.tap(find.bySemanticsLabel('Zoom'));
    await tester.pumpAndSettle();
    expect(studio(tester).selectedClip!.transitionId, 'zoom');

    await selectTool(tester, 'Cover');
    await tester.pumpAndSettle();
    await tester.tap(find.bySemanticsLabel('Pick a frame'));
    await tester.pumpAndSettle();
    expect(find.text('Frame at'), findsOneWidget);
  });

  studioTest('details → publish → progress → "Reel Published ✓"', (
    tester,
  ) async {
    await openStudio(tester);
    await addThreeVideosAndTwoPhotos(tester);

    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    expect(find.byType(ReelDetailsScreen), findsOneWidget);

    await tester.enterText(
      find.widgetWithText(TextField, 'Caption'),
      'Sunday at Charminar #hyderabad',
    );
    await tester.pump();
    // Reach Ladder explanation, audience (incl. private) and quality.
    await tester.dragUntilVisible(
      find.text('Upload quality'),
      find.byType(ListView).first,
      const Offset(0, -300),
    );
    expect(find.text('Private'), findsWidgets);
    expect(find.text('Starts at District · Hyderabad'), findsOneWidget);
    expect(find.text('Upload quality'), findsOneWidget);

    await tester.dragUntilVisible(
      find.text('Publish reel'),
      find.byType(ListView).first,
      const Offset(0, -300),
    );
    await tester.tap(find.text('Publish reel'));
    await tester.pumpAndSettle();

    expect(find.byType(ReelPublishingScreen), findsOneWidget);
    expect(find.text('Reel Published ✓'), findsOneWidget);
    expect(
      find.text('Your reel is eligible for Hyderabad discovery.'),
      findsOneWidget,
    );

    final world = containerOf(tester).read(mockWorldProvider);
    expect(world.createdReels, hasLength(1));
    expect(world.createdReels.single.caption, 'Sunday at Charminar #hyderabad');
    expect(world.createdReels.single.hashtags, ['#hyderabad']);
    // The draft is gone once the reel is live.
    expect(await containerOf(tester).read(reelDraftsProvider.future), isEmpty);

    await tester.tap(find.text('Go to Reels'));
    await tester.pumpAndSettle();
    expect(find.byType(ReelsScreen), findsOneWidget);
  });

  studioTest('a failed upload offers Retry, and the draft is safe', (
    tester,
  ) async {
    await openStudio(tester);
    await addThreeVideosAndTwoPhotos(tester);
    final world = containerOf(tester).read(mockWorldProvider);
    world.creator.publishOutcome = DemoPublishOutcome.uploadFails;

    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    await tester.dragUntilVisible(
      find.text('Publish reel'),
      find.byType(ListView).first,
      const Offset(0, -300),
    );
    await tester.tap(find.text('Publish reel'));
    await tester.pumpAndSettle();

    expect(find.text('Upload failed'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
    expect(find.text('Your reel is saved as a draft.'), findsOneWidget);
    expect(
      await containerOf(tester).read(reelDraftsProvider.future),
      hasLength(1),
    );
    expect(world.createdReels, isEmpty);

    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.text('Reel Published ✓'), findsOneWidget);
    expect(world.createdReels, hasLength(1));
    expect(await containerOf(tester).read(reelDraftsProvider.future), isEmpty);
  });
}
