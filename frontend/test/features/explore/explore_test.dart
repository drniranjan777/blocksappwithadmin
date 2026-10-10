import 'package:blocks_app/app/router/main_shell.dart';
import 'package:blocks_app/core/constants/storage_keys.dart';
import 'package:blocks_app/features/explore/presentation/explore_screen.dart';
import 'package:blocks_app/features/post/presentation/post_tile.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/app_driver.dart';
import '../../helpers/pump_app.dart';

const _signedIn = {
  StorageKeys.onboardingCompleted: true,
  StorageKeys.demoSessionActive: true,
};

Future<void> _openExplore(WidgetTester tester) async {
  await pumpBlocksApp(tester, storage: _signedIn);
  await finishSplash(tester);
  await tester.tap(
    find.descendant(
      of: find.byType(BlocksBottomNav),
      matching: find.text('Explore'),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('shows scopes, district trending, categories and a post grid', (
    tester,
  ) async {
    await _openExplore(tester);

    expect(find.byType(ExploreScreen), findsOneWidget);
    for (final s in ['District', 'State', 'India', 'Global']) {
      expect(find.text(s), findsWidgets, reason: s);
    }
    expect(find.text('Trending in Hyderabad'), findsOneWidget);
    expect(find.text('Hyderabad Food Festival'), findsOneWidget);
    expect(find.text('Local Business Expo'), findsOneWidget);
    expect(find.textContaining('never your exact location'), findsOneWidget);
    expect(find.text('Categories'), findsOneWidget);
    expect(find.byType(PostTile), findsWidgets);
  });

  testWidgets('switching scope changes the trending list', (tester) async {
    await _openExplore(tester);

    await tester.tap(find.text('State'));
    await tester.pumpAndSettle();
    expect(find.text('Trending in Telangana'), findsOneWidget);
    expect(find.text('Bathukamma Celebrations'), findsOneWidget);
    expect(find.text('Hyderabad Food Festival'), findsNothing);

    await tester.tap(find.text('Global'));
    await tester.pumpAndSettle();
    expect(find.text('Trending in the world'), findsOneWidget);
  });

  testWidgets('category chip reloads the grid', (tester) async {
    await _openExplore(tester);
    final before = find
        .byType(PostTile)
        .evaluate()
        .map((e) => (e.widget as PostTile).post.id)
        .toList();

    // Categories sit in a horizontal row; "News" is the first after "All".
    await tester.tap(find.text('News'));
    await tester.pumpAndSettle();

    final after = find
        .byType(PostTile)
        .evaluate()
        .map((e) => (e.widget as PostTile).post.id)
        .toList();
    expect(after, isNotEmpty);
    expect(after, isNot(equals(before)));
  });

  testWidgets('search is debounced and shows people, then clears', (
    tester,
  ) async {
    await _openExplore(tester);

    await tester.enterText(find.byType(TextField), 'meera');
    // Debounce: nothing yet.
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('People'), findsNothing);

    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();
    expect(find.text('People'), findsOneWidget);
    expect(find.text('Meera Reddy'), findsOneWidget);

    await tester.tap(find.byTooltip('Clear search'));
    await tester.pumpAndSettle();
    expect(find.text('People'), findsNothing);
    expect(find.text('Categories'), findsOneWidget);
  });

  testWidgets('no matches shows an empty state with the query', (tester) async {
    await _openExplore(tester);
    await tester.enterText(find.byType(TextField), 'zzzzqqq');
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pumpAndSettle();
    expect(find.text('No results for “zzzzqqq”'), findsOneWidget);
  });

  testWidgets('tapping a trending topic searches for it', (tester) async {
    await _openExplore(tester);
    await tester.tap(find.text('Hyderabad Tech Meetup'));
    await tester.pumpAndSettle();
    expect(
      tester.widget<TextField>(find.byType(TextField)).controller!.text,
      'Hyderabad Tech Meetup',
    );
  });

  testWidgets('Home search icon opens Explore and focuses the field', (
    tester,
  ) async {
    await openSignedInApp(tester); // Home (the app itself lands on Reels)

    await tester.tap(find.byTooltip('Search'));
    await tester.pumpAndSettle();
    expect(find.byType(ExploreScreen), findsOneWidget);
    expect(
      tester.widget<TextField>(find.byType(TextField)).focusNode!.hasFocus,
      isTrue,
    );
  });
}
