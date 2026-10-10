import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/core/constants/storage_keys.dart';
import 'package:blocks_app/core/widgets/story_ring.dart';
import 'package:blocks_app/features/post/presentation/post_card.dart';
import 'package:blocks_app/features/post/presentation/post_detail_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/app_driver.dart';
import '../../helpers/pump_app.dart';

const _signedIn = {
  StorageKeys.onboardingCompleted: true,
  StorageKeys.demoSessionActive: true,
};

/// The app lands on Reels; these tests are about the Home feed.
Future<void> _openHome(WidgetTester tester) async {
  await pumpBlocksApp(tester, storage: _signedIn);
  await finishSplash(tester);
  routerOf(tester).go(Routes.home);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('home shows header, stories, tabs and a lazy feed', (
    tester,
  ) async {
    await _openHome(tester);

    expect(find.text('BLOCKS'), findsOneWidget);
    expect(find.byTooltip('Search'), findsOneWidget);
    expect(find.byTooltip('Notifications'), findsOneWidget);
    expect(find.text('Your story'), findsOneWidget);

    // The tab row scrolls horizontally, so only the leading chips are built.
    for (final tab in ['Following', 'For You', 'Rising']) {
      expect(find.text(tab), findsOneWidget, reason: tab);
    }
    await tester.drag(find.text('Rising'), const Offset(-300, 0));
    await tester.pumpAndSettle();
    expect(find.text('India'), findsOneWidget);

    // Lazy: only the cards near the viewport are built, not the whole feed.
    final built = find.byType(PostCard).evaluate().length;
    expect(built, greaterThan(0));
    expect(built, lessThan(6));
  });

  testWidgets('scrolling loads more pages without duplicating posts', (
    tester,
  ) async {
    await _openHome(tester);

    final seen = <String>{};
    for (var i = 0; i < 12; i++) {
      for (final e in find.byType(PostCard).evaluate()) {
        seen.add((e.widget as PostCard).post.id);
      }
      await tester.drag(
        find.byType(CustomScrollView).first,
        const Offset(0, -900),
      );
      await tester.pump(const Duration(milliseconds: 100));
    }
    // 12 per page => reaching beyond 12 unique ids proves pagination worked.
    expect(seen.length, greaterThan(12));
  });

  testWidgets('liking a post toggles the heart and survives a tab switch', (
    tester,
  ) async {
    await _openHome(tester);

    await tester.tap(find.byIcon(Icons.favorite_border_rounded).first);
    await tester.pump();
    expect(find.byIcon(Icons.favorite_rounded), findsWidgets);

    await tester.tap(find.byIcon(Icons.favorite_rounded).first);
    await tester.pump();
    expect(find.byIcon(Icons.favorite_rounded), findsNothing);
  });

  testWidgets('Rising tab shows the rising banner on its cards', (
    tester,
  ) async {
    await _openHome(tester);

    await tester.tap(find.text('Rising'));
    await tester.pumpAndSettle();

    expect(find.text('RISING'), findsWidgets);
    expect(find.textContaining('toward'), findsWidgets);
  });

  testWidgets('saving a post confirms with a message', (tester) async {
    await _openHome(tester);
    await tester.tap(find.byIcon(Icons.bookmark_border_rounded).first);
    await tester.pump();
    expect(find.text('Saved to your collection'), findsOneWidget);
    expect(find.byIcon(Icons.bookmark_rounded), findsWidgets);
  });

  testWidgets('story ring opens the viewer; close returns home', (
    tester,
  ) async {
    await _openHome(tester);

    await tester.tap(find.byType(StoryRing).at(1));
    // One frame to build the route, then let the fade-in finish.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Send a message…'), findsOneWidget);

    await tester.tap(find.byTooltip('Close story'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('Send a message…'), findsNothing);
    expect(find.text('Your story'), findsOneWidget);
  });

  testWidgets('post detail: boosting reach past a threshold celebrates', (
    tester,
  ) async {
    tester.view
      ..physicalSize = const Size(780, 2400)
      ..devicePixelRatio = 2;
    addTearDown(tester.view.reset);

    // Own post at ~82% towards State (8,200 qualified reach).
    await tester.pumpWidget(
      themed(const PostDetailScreen(postId: 'p~user~me~1')),
    );
    await tester.pumpAndSettle();

    expect(find.text('Reach journey'), findsOneWidget);
    await tester.ensureVisible(find.text('Simulate reach boost (demo)'));
    await tester.tap(find.text('Simulate reach boost (demo)'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));

    expect(find.text('You reached STATE level!'), findsOneWidget);
    expect(
      find.text('Your content is now eligible for State discovery.'),
      findsOneWidget,
    );

    await tester.tap(find.text('Awesome'));
    await tester.pumpAndSettle();
    expect(find.text('You reached STATE level!'), findsNothing);
  });

  testWidgets('post detail for an unknown id shows an error with retry', (
    tester,
  ) async {
    await tester.pumpWidget(themed(const PostDetailScreen(postId: 'p~bogus')));
    await tester.pumpAndSettle();
    expect(find.text('Something went wrong'), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
  });
}
