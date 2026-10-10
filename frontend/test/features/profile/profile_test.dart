import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/router/main_shell.dart';
import 'package:blocks_app/features/engagement/presentation/follow_button.dart';
import 'package:blocks_app/features/post/presentation/post_tile.dart';
import 'package:blocks_app/features/profile/presentation/profile_screen.dart';
import 'package:blocks_app/features/profile/presentation/reel_tile.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/app_driver.dart';

Future<void> _openOwnProfile(WidgetTester tester) async {
  tester.view
    ..physicalSize = const Size(780, 2400)
    ..devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  await openSignedInApp(tester, size: const Size(390, 1200));
  await tester.tap(
    find.descendant(
      of: find.byType(BlocksBottomNav),
      matching: find.text('Profile'),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('own profile matches the demo user brief', (tester) async {
    await _openOwnProfile(tester);

    expect(find.byType(ProfileScreen), findsOneWidget);
    expect(find.text('Aarav Kumar'), findsOneWidget);
    expect(find.text('@aarav.blocks'), findsWidgets);
    expect(find.text('Hyderabad, Telangana'), findsOneWidget);
    expect(find.text('18.4K'), findsOneWidget); // followers
    expect(find.text('642'), findsOneWidget); // following
    expect(find.text('Verified Creator'), findsOneWidget);
    expect(find.text('Reach level'), findsOneWidget);
    expect(find.text('S1 — STATE'), findsOneWidget);
    expect(find.text('Creator Studio'), findsOneWidget);
    // Own profile has no Follow / Message buttons.
    expect(find.text('Follow'), findsNothing);
    expect(find.text('Message'), findsNothing);
  });

  testWidgets('profile ladder shows State reached and National in progress', (
    tester,
  ) async {
    await _openOwnProfile(tester);
    // 71,201 best-post reach is 68% of the way from State to National.
    expect(find.text('68%'), findsOneWidget);
    expect(find.text('NATIONAL'), findsOneWidget);
  });

  testWidgets('tabs switch between posts, reels and tagged', (tester) async {
    await _openOwnProfile(tester);
    expect(find.byType(PostTile), findsWidgets);

    // First match is the profile tab; the bottom-nav label comes later.
    await tester.tap(find.text('Reels').first);
    await tester.pumpAndSettle();
    expect(find.byType(ReelTile), findsWidgets);
    expect(find.byType(PostTile), findsNothing);

    await tester.tap(find.text('Tagged'));
    await tester.pumpAndSettle();
    expect(find.byType(PostTile), findsWidgets);
    expect(find.byType(ReelTile), findsNothing);
  });

  testWidgets('menu lists the account areas', (tester) async {
    await _openOwnProfile(tester);
    await tester.tap(find.byTooltip('Menu'));
    await tester.pumpAndSettle();
    for (final t in [
      'Creator Studio',
      'Business profile',
      'Verification',
      'Messages',
      'Safety Center',
      'Settings',
    ]) {
      expect(find.text(t), findsWidgets, reason: t);
    }
  });

  testWidgets("another user's profile: follow, unfollow and message", (
    tester,
  ) async {
    tester.view
      ..physicalSize = const Size(780, 2400)
      ..devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    await openSignedInApp(tester, size: const Size(390, 1200));
    // u10 is someone the demo user does not follow yet.
    await pushRoute(tester, Routes.user('u10'));

    expect(find.text('Harpreet Singh'), findsOneWidget);
    expect(find.text('Follow'), findsOneWidget);
    expect(find.text('Message'), findsOneWidget);
    expect(find.text('Creator Studio'), findsNothing);

    // "Following" also labels the stats row, so scope to the button.
    final button = find.byType(FollowButton);
    Finder label(String t) =>
        find.descendant(of: button, matching: find.text(t));

    await tester.tap(label('Follow'));
    await tester.pumpAndSettle();
    expect(label('Following'), findsOneWidget);

    await tester.tap(label('Following'));
    await tester.pumpAndSettle();
    expect(label('Follow'), findsOneWidget);
  });

  testWidgets('unknown user shows an error with retry', (tester) async {
    await openSignedInApp(tester);
    await pushRoute(tester, Routes.user('nobody'));
    expect(find.text('Something went wrong'), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
  });
}
