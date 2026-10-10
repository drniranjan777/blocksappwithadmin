import 'package:blocks_app/app/router/main_shell.dart';
import 'package:blocks_app/core/constants/storage_keys.dart';
import 'package:blocks_app/features/auth/presentation/auth_entry_screen.dart';
import 'package:blocks_app/features/create/presentation/create_hub_screen.dart';
import 'package:blocks_app/features/explore/presentation/explore_screen.dart';
import 'package:blocks_app/features/home/presentation/home_screen.dart';
import 'package:blocks_app/features/onboarding/presentation/onboarding_screen.dart';
import 'package:blocks_app/features/reels/presentation/reels_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../helpers/pump_app.dart';

void main() {
  testWidgets('splash shows BLOCKS and "Made in India"', (tester) async {
    await pumpBlocksApp(tester);
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('BLOCKS'), findsOneWidget);
    expect(find.text('Made in India'), findsOneWidget);
    expect(find.byIcon(Icons.favorite_rounded), findsOneWidget);

    // Drain the splash timers so the test ends cleanly.
    await finishSplash(tester);
  });

  testWidgets('first launch: splash -> onboarding -> Explore Demo -> Reels', (
    tester,
  ) async {
    await pumpBlocksApp(tester);
    await finishSplash(tester);

    expect(find.byType(OnboardingScreen), findsOneWidget);
    expect(find.text('Welcome to BLOCKS'), findsOneWidget);

    // Pages 1-4 show "Next"; the last page offers both entry buttons.
    for (var i = 0; i < 4; i++) {
      await tester.tap(find.text('Next'));
      await tester.pumpAndSettle();
    }
    expect(find.text('Build Your Business'), findsOneWidget);
    expect(find.text('Get Started'), findsOneWidget);
    expect(find.text('Explore Demo'), findsOneWidget);

    await tester.tap(find.text('Explore Demo'));
    await tester.pumpAndSettle();

    expect(find.byType(MainShell), findsOneWidget);
    expect(find.byType(BlocksBottomNav), findsOneWidget);
    expect(find.byType(ReelsScreen), findsOneWidget);
    expect(find.byType(HomeScreen), findsNothing);
  });

  testWidgets('Get Started -> auth -> Continue as Demo User -> Reels', (
    tester,
  ) async {
    await pumpBlocksApp(tester);
    await finishSplash(tester);

    for (var i = 0; i < 4; i++) {
      await tester.tap(find.text('Next'));
      await tester.pumpAndSettle();
    }
    await tester.tap(find.text('Get Started'));
    await tester.pumpAndSettle();

    expect(find.byType(AuthEntryScreen), findsOneWidget);
    expect(find.text('Aarav Kumar'), findsOneWidget);

    await tester.tap(find.text('Continue as Demo User'));
    await tester.pumpAndSettle();
    expect(find.byType(MainShell), findsOneWidget);
    expect(find.byType(ReelsScreen), findsOneWidget);
  });

  testWidgets('Skip on page 1 completes onboarding and opens auth', (
    tester,
  ) async {
    await pumpBlocksApp(tester);
    await finishSplash(tester);

    await tester.tap(find.text('Skip'));
    await tester.pumpAndSettle();
    expect(find.byType(AuthEntryScreen), findsOneWidget);
  });

  testWidgets('returning onboarded user lands on auth entry', (tester) async {
    await pumpBlocksApp(
      tester,
      storage: {StorageKeys.onboardingCompleted: true},
    );
    await finishSplash(tester);
    expect(find.byType(AuthEntryScreen), findsOneWidget);
  });

  testWidgets('returning signed-in user: splash -> Reels, not the Home feed', (
    tester,
  ) async {
    await pumpBlocksApp(
      tester,
      storage: {
        StorageKeys.onboardingCompleted: true,
        StorageKeys.demoSessionActive: true,
      },
    );
    await finishSplash(tester);
    expect(find.byType(MainShell), findsOneWidget);
    expect(find.byType(ReelsScreen), findsOneWidget);
    expect(find.byType(HomeScreen), findsNothing);
  });

  testWidgets('bottom nav switches tabs and Create opens a full-screen flow', (
    tester,
  ) async {
    await pumpBlocksApp(
      tester,
      storage: {
        StorageKeys.onboardingCompleted: true,
        StorageKeys.demoSessionActive: true,
      },
    );
    await finishSplash(tester);

    await tester.tap(
      find.descendant(
        of: find.byType(BlocksBottomNav),
        matching: find.text('Explore'),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(ExploreScreen), findsOneWidget);

    // Create is pushed above the shell (no bottom nav) and can be closed.
    await tester.tap(find.bySemanticsLabel('Create'));
    await tester.pumpAndSettle();
    expect(find.byType(BlocksBottomNav), findsNothing);
    expect(find.byType(CreateHubScreen), findsOneWidget);

    await tester.tap(find.byTooltip('Close'));
    await tester.pumpAndSettle();
    expect(find.byType(BlocksBottomNav), findsOneWidget);
  });

  testWidgets('onboarding does not overflow on a small phone', (tester) async {
    await pumpBlocksApp(tester, size: const Size(320, 568));
    await finishSplash(tester);

    for (var i = 0; i < 4; i++) {
      expect(tester.takeException(), isNull);
      await tester.tap(find.text('Next'));
      await tester.pumpAndSettle();
    }
    expect(tester.takeException(), isNull);
  });
}
