import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/create/presentation/create_hub_screen.dart';
import 'package:blocks_app/features/create/presentation/create_post_screen.dart';
import 'package:blocks_app/features/create/presentation/go_live_screen.dart';
import 'package:blocks_app/features/home/presentation/home_screen.dart';
import 'package:blocks_app/features/profile/application/user_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/app_driver.dart';

void main() {
  testWidgets('Create button opens the hub with all four options', (
    tester,
  ) async {
    await openSignedInApp(tester);
    await pushRoute(tester, Routes.create);

    expect(find.byType(CreateHubScreen), findsOneWidget);
    for (final t in ['Post', 'Reel', 'Story', 'Go Live']) {
      expect(find.text(t), findsOneWidget, reason: t);
    }
  });

  testWidgets('publishing a photo post shows it first in For You', (
    tester,
  ) async {
    tester.view
      ..physicalSize = const Size(780, 2200)
      ..devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    await openSignedInApp(tester, size: const Size(390, 1100));
    await pushRoute(tester, Routes.createPost);
    expect(find.byType(CreatePostScreen), findsOneWidget);

    // Pick the first gallery tile, write a caption with hashtags.
    await tester.tap(find.bySemanticsLabel('Photo 1'), warnIfMissed: false);
    await tester.pump();
    await tester.enterText(
      find.byType(TextField).first,
      'Golden hour at Hussain Sagar #Hyderabad #Evenings',
    );
    await tester.pump();

    await tester.ensureVisible(find.widgetWithText(FilledButton, 'Post').last);
    await tester.tap(find.widgetWithText(FilledButton, 'Post').last);
    await tester.pumpAndSettle();

    expect(find.byType(HomeScreen), findsOneWidget);
    expect(find.text('Your post is live in Hyderabad'), findsOneWidget);
    expect(
      find.text('Golden hour at Hussain Sagar #Hyderabad #Evenings'),
      findsOneWidget,
    );
    expect(find.text('#Hyderabad  #Evenings'), findsOneWidget);
  });

  testWidgets('invalid post shows localisable errors and does not publish', (
    tester,
  ) async {
    tester.view
      ..physicalSize = const Size(780, 2400)
      ..devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    await openSignedInApp(tester, size: const Size(390, 1200));
    await pushRoute(tester, Routes.createPost);

    await tester.ensureVisible(find.widgetWithText(FilledButton, 'Post').last);
    await tester.tap(find.widgetWithText(FilledButton, 'Post').last);
    await tester.pumpAndSettle();
    expect(find.text('Choose a photo or video first'), findsOneWidget);
    expect(find.byType(CreatePostScreen), findsOneWidget);

    // Text-only post with an empty caption.
    await tester.tap(find.text('Text'));
    await tester.pump();
    await tester.ensureVisible(find.widgetWithText(FilledButton, 'Post').last);
    await tester.tap(find.widgetWithText(FilledButton, 'Post').last);
    await tester.pumpAndSettle();
    expect(find.text('Write something to share'), findsOneWidget);
    expect(find.text('Choose a photo or video first'), findsNothing);

    // Fixing the problem clears the error live.
    await tester.enterText(find.byType(TextField).first, 'Hello Hyderabad');
    await tester.pump();
    expect(find.text('Write something to share'), findsNothing);
  });

  testWidgets('location picker changes district and state', (tester) async {
    tester.view
      ..physicalSize = const Size(780, 2400)
      ..devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    await openSignedInApp(tester, size: const Size(390, 1200));
    await pushRoute(tester, Routes.createPost);

    expect(find.text('Hyderabad, Telangana'), findsOneWidget);
    await tester.tap(find.text('Change'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, '').last, 'pune');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Pune'));
    await tester.pumpAndSettle();

    expect(find.text('Pune, Maharashtra'), findsOneWidget);
    // The reach card sits lower in the (lazy) form; scroll to it.
    await tester.dragUntilVisible(
      find.text('Starts at District · Pune'),
      find.byType(ListView).first,
      const Offset(0, -300),
    );
    expect(find.text('Starts at District · Pune'), findsOneWidget);
  });

  testWidgets('sharing a story returns home with a confirmation', (
    tester,
  ) async {
    tester.view
      ..physicalSize = const Size(780, 2400)
      ..devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    await openSignedInApp(tester, size: const Size(390, 1200));
    await pushRoute(tester, Routes.createStory);

    await tester.enterText(
      find.byType(TextField).first,
      'Good morning Hyderabad',
    );
    await tester.pump();
    expect(find.text('Good morning Hyderabad'), findsWidgets);

    await tester.ensureVisible(find.text('Share to story'));
    await tester.tap(find.text('Share to story'));
    await tester.pumpAndSettle();
    expect(find.byType(HomeScreen), findsOneWidget);
    expect(find.text('Added to your story'), findsOneWidget);
  });

  group('Go Live', () {
    testWidgets('demo creator is eligible and sees their numbers', (
      tester,
    ) async {
      tester.view
        ..physicalSize = const Size(780, 2400)
        ..devicePixelRatio = 2;
      addTearDown(tester.view.reset);
      await openSignedInApp(tester, size: const Size(390, 1200));
      await pushRoute(tester, Routes.createLive);

      expect(find.byType(GoLiveScreen), findsOneWidget);
      expect(find.text('LIVE ACCESS GRANTED'), findsOneWidget);
      expect(find.text('Followers: 5,000 required'), findsOneWidget);
      expect(find.text('Your followers: 18,450'), findsOneWidget);
      expect(find.text('Account age: 30 days required'), findsOneWidget);
      expect(find.text('Your account: 412 days'), findsOneWidget);
      expect(find.text('Eligible'), findsOneWidget);
      // Streaming itself is not part of the demo.
      final start = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Start live'),
      );
      expect(start.onPressed, isNull);
    });

    testWidgets('without 2FA access is not granted until it is enabled', (
      tester,
    ) async {
      tester.view
        ..physicalSize = const Size(780, 2400)
        ..devicePixelRatio = 2;
      addTearDown(tester.view.reset);
      await openSignedInApp(tester, size: const Size(390, 1200));

      final c = containerOf(tester);
      await c.read(userRepositoryProvider).setTwoFactorEnabled(enabled: false);
      c.invalidate(currentUserProvider);
      await pushRoute(tester, Routes.createLive);

      expect(find.text('Not eligible yet'), findsOneWidget);
      expect(find.text('Not enabled'), findsOneWidget);
      expect(find.text('LIVE ACCESS GRANTED'), findsNothing);

      await tester.ensureVisible(
        find.text('Turn on two-factor authentication'),
      );
      await tester.tap(find.text('Turn on two-factor authentication'));
      await tester.pumpAndSettle();
      expect(find.text('LIVE ACCESS GRANTED'), findsOneWidget);
    });
  });
}
