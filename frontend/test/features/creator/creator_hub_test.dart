import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/data/models/media_models.dart';
import 'package:blocks_app/data/models/reel_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/creator/presentation/creator_analytics_screen.dart';
import 'package:blocks_app/features/creator/presentation/creator_content_screens.dart';
import 'package:blocks_app/features/creator/presentation/creator_earnings_screen.dart';
import 'package:blocks_app/features/creator/presentation/creator_reach_screen.dart';
import 'package:blocks_app/features/creator/presentation/creator_studio_screen.dart';
import 'package:blocks_app/features/reach/presentation/widgets/reach_level_badge.dart';
import 'package:blocks_app/features/reel_studio/application/reel_providers.dart';
import 'package:blocks_app/features/reel_studio/application/reel_studio_controller.dart';
import 'package:blocks_app/features/reel_studio/domain/reel_timeline.dart';
import 'package:blocks_app/features/reel_studio/presentation/reel_studio_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/app_driver.dart';

const _tall = Size(390, 1600);

/// Runs [body] with the accessibility tree on and a tall phone-width screen.
void hubTest(String name, Future<void> Function(WidgetTester) body) {
  testWidgets(name, (tester) async {
    final handle = tester.ensureSemantics();
    tester.view
      ..physicalSize = _tall * 2
      ..devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    try {
      await body(tester);
    } finally {
      handle.dispose();
    }
  });
}

Future<void> openHub(WidgetTester tester, String route) async {
  await openSignedInApp(tester, size: _tall);
  await pushRoute(tester, route);
}

/// Saves a three-clip draft straight to the repository (as "Save Draft" does).
Future<ReelDraft> saveDraft(
  WidgetTester tester, {
  String caption = 'Evening in Hyderabad',
}) async {
  final container = containerOf(tester);
  final lib = await container.read(mediaLibraryRepositoryProvider).getLibrary();
  const config = ReelConfig.demo();
  MediaAsset clip(String id) => lib.firstWhere((m) => m.id == 'g~clip~$id');
  var n = 0;
  final now = container.read(clockProvider)();
  final draft = ReelDraft(
    id: 'draft~hub${DateTime.now().microsecondsSinceEpoch}',
    clips: [
      for (final m in [
        clip('3101'),
        lib.firstWhere((m) => m.isPhoto),
        clip('3303'),
      ])
        ReelTimeline.clipFromMedia(m, id: 'c${++n}', config: config),
    ],
    overlays: const [],
    settings: ReelSettings(
      caption: caption,
      district: 'Hyderabad',
      state: 'Telangana',
    ),
    updatedAt: now,
    createdAt: now,
  );
  await container.read(reelDraftRepositoryProvider).save(draft);
  container.invalidate(reelDraftsProvider);
  return draft;
}

void main() {
  group('Overview', () {
    hubTest('shows the estimated ledger, balances and the way to get paid', (
      tester,
    ) async {
      await openHub(tester, Routes.creatorStudio);
      expect(find.byType(CreatorStudioScreen), findsOneWidget);

      // The hero is an estimate from the ledger, and says so.
      expect(find.text('ESTIMATED EARNINGS'), findsOneWidget);
      expect(find.text('₹24,580'), findsOneWidget);
      expect(find.text('This month ₹8,420'), findsOneWidget);
      expect(find.bySemanticsLabel('Available: ₹12,420'), findsOneWidget);
      expect(find.bySemanticsLabel('Pending: ₹4,800'), findsOneWidget);
      expect(find.bySemanticsLabel('Paid: ₹48,200'), findsOneWidget);

      // A new creator is told what is left to do before money can move.
      expect(find.text('Get paid'), findsOneWidget);
      expect(find.text('Verify identity'), findsOneWidget);
      expect(find.text('Add a bank account'), findsOneWidget);
      expect(find.text('Set up payouts'), findsOneWidget);
    });

    hubTest(
      'has the full navigation: content, analytics, reach, earnings, payout',
      (tester) async {
        await openHub(tester, Routes.creatorStudio);
        for (final label in [
          'Overview',
          'Reels',
          'Posts',
          'Drafts',
          'Analytics',
          'Reach',
          'Earnings',
          'Payout',
        ]) {
          expect(find.bySemanticsLabel(label), findsWidgets, reason: label);
        }
        // The menu tiles lead to the same places.
        await tester.tap(
          find.bySemanticsLabel(RegExp(r'^Earnings\. Estimated rewards')),
        );
        await tester.pumpAndSettle();
        expect(find.byType(CreatorEarningsScreen), findsOneWidget);
      },
    );

    hubTest('section chips switch screens without piling up the back stack', (
      tester,
    ) async {
      await openHub(tester, Routes.creatorStudio);
      for (final (label, type) in <(String, Type)>[
        ('Reach', CreatorReachScreen),
        ('Analytics', CreatorAnalyticsScreen),
        ('Earnings', CreatorEarningsScreen),
        ('Reels', CreatorReelsScreen),
        ('Drafts', CreatorDraftsScreen),
      ]) {
        final chip = find.bySemanticsLabel(label).first;
        await tester.ensureVisible(chip);
        await tester.pumpAndSettle();
        await tester.tap(chip);
        await tester.pumpAndSettle();
        expect(find.byType(type), findsOneWidget, reason: label);
      }
      // One Back returns to where Creator Studio was opened from.
      routerOf(tester).pop();
      await tester.pumpAndSettle();
      expect(find.byType(CreatorDraftsScreen), findsNothing);
      expect(find.byType(CreatorStudioScreen), findsNothing);
    });
  });

  group('Content', () {
    hubTest('Reels lists published reels with views and Reach level', (
      tester,
    ) async {
      await openHub(tester, Routes.creatorReels);
      expect(find.byType(CreatorReelsScreen), findsOneWidget);
      expect(find.textContaining(' views'), findsWidgets);
      // Each reel carries its Reach Ladder level.
      expect(find.byType(ReachLevelBadge), findsWidgets);
    });

    hubTest('Posts lists the creator\'s posts', (tester) async {
      await openHub(tester, Routes.creatorPosts);
      expect(find.byType(CreatorPostsScreen), findsOneWidget);
      expect(find.text('New post'), findsOneWidget);
      expect(find.textContaining(' views'), findsWidgets);
    });

    hubTest('Drafts is empty until something is saved', (tester) async {
      await openHub(tester, Routes.creatorDrafts);
      expect(find.text('No drafts'), findsOneWidget);
      expect(find.text('New reel'), findsWidgets);
    });

    hubTest('a saved draft shows thumbnail details, status and actions', (
      tester,
    ) async {
      await openSignedInApp(tester, size: _tall);
      await saveDraft(tester);
      await pushRoute(tester, Routes.creatorDrafts);

      expect(find.text('Evening in Hyderabad'), findsOneWidget);
      expect(find.text('3 clips · 0:15'), findsOneWidget);
      expect(find.text('Original audio'), findsOneWidget);
      expect(find.text('Ready to publish'), findsOneWidget);
      expect(find.textContaining('Edited'), findsOneWidget);
      expect(find.text('Continue editing'), findsOneWidget);
      expect(find.byTooltip('Duplicate'), findsOneWidget);
      expect(find.byTooltip('Delete'), findsOneWidget);
    });

    hubTest('Continue editing reopens the draft in the editor', (tester) async {
      await openSignedInApp(tester, size: _tall);
      final d = await saveDraft(tester);
      await pushRoute(tester, Routes.creatorDrafts);
      await tester.tap(find.text('Continue editing'));
      await tester.pumpAndSettle();

      expect(find.byType(ReelStudioScreen), findsOneWidget);
      final s = containerOf(tester).read(reelStudioProvider);
      expect(s.draft.id, d.id);
      expect(s.draft.clips.map((c) => c.id), d.clips.map((c) => c.id));
      expect(s.draft.settings.caption, 'Evening in Hyderabad');
      expect(s.isDirty, isFalse);
    });

    hubTest('Duplicate adds a copy; Delete asks first and removes it', (
      tester,
    ) async {
      await openSignedInApp(tester, size: _tall);
      await saveDraft(tester);
      await pushRoute(tester, Routes.creatorDrafts);

      await tester.tap(find.byTooltip('Duplicate'));
      await tester.pumpAndSettle();
      expect(find.text('Draft duplicated'), findsOneWidget);
      expect(find.text('Evening in Hyderabad'), findsNWidgets(2));
      expect(
        await containerOf(tester).read(reelDraftsProvider.future),
        hasLength(2),
      );

      await tester.tap(find.byTooltip('Delete').first);
      await tester.pumpAndSettle();
      expect(find.text('Delete this draft?'), findsOneWidget);
      // Cancelling changes nothing.
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(
        await containerOf(tester).read(reelDraftsProvider.future),
        hasLength(2),
      );

      await tester.tap(find.byTooltip('Delete').first);
      await tester.pumpAndSettle();
      await tester.tap(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.text('Delete'),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Draft deleted'), findsOneWidget);
      expect(
        await containerOf(tester).read(reelDraftsProvider.future),
        hasLength(1),
      );
    });

    hubTest('a draft that breaks a limit says it needs changes', (
      tester,
    ) async {
      await openSignedInApp(tester, size: _tall);
      final container = containerOf(tester);
      final lib = await container
          .read(mediaLibraryRepositoryProvider)
          .getLibrary();
      final long = lib.firstWhere((m) => m.id == 'g~clip~3202'); // 35 s
      final now = container.read(clockProvider)();
      await container
          .read(reelDraftRepositoryProvider)
          .save(
            ReelDraft(
              id: 'draft~long',
              clips: [
                ReelTimeline.clipFromMedia(
                  long,
                  id: 'c1',
                  config: const ReelConfig.demo(),
                ),
              ],
              overlays: const [],
              settings: const ReelSettings(),
              updatedAt: now,
              createdAt: now,
            ),
          );
      container.invalidate(reelDraftsProvider);
      await pushRoute(tester, Routes.creatorDrafts);
      expect(find.text('Needs changes'), findsOneWidget);
      expect(find.text('Ready to publish'), findsNothing);
    });
  });

  group('Analytics', () {
    hubTest('shows views, qualified views, watch time and engagement', (
      tester,
    ) async {
      await openHub(tester, Routes.creatorAnalytics);
      expect(find.byType(CreatorAnalyticsScreen), findsOneWidget);
      for (final label in [
        'Views per day',
        'Qualified views',
        'Watch time',
        'Engagement',
        'Likes',
        'Comments',
        'Shares',
        'Saves',
        'New followers',
        'Where your viewers are',
        'Your reels',
      ]) {
        expect(find.text(label), findsWidgets, reason: label);
      }
      expect(find.text('Hyderabad'), findsOneWidget);
    });

    hubTest('the time range changes the chart', (tester) async {
      await openHub(tester, Routes.creatorAnalytics);
      expect(find.textContaining('in 28 days'), findsOneWidget);
      await tester.tap(find.text('7 days'));
      await tester.pumpAndSettle();
      expect(find.textContaining('in 7 days'), findsOneWidget);
      await tester.tap(find.text('90 days'));
      await tester.pumpAndSettle();
      expect(find.textContaining('in 90 days'), findsOneWidget);
    });

    hubTest(
      'a reel opens its own numbers: reach, retention, earnings estimate',
      (tester) async {
        await openHub(tester, Routes.creatorAnalytics);
        await tester.dragUntilVisible(
          find.text('Your reels'),
          find.byType(ListView).first,
          const Offset(0, -300),
        );
        await tester.tap(find.bySemanticsLabel(RegExp(r', .* views$')).first);
        await tester.pumpAndSettle();
        expect(find.byType(ReelAnalyticsScreen), findsOneWidget);
        expect(find.text('Reach Ladder'), findsOneWidget);
        expect(find.text('Estimated earnings'), findsOneWidget);
        await tester.dragUntilVisible(
          find.text('Audience retention'),
          find.byType(ListView).first,
          const Offset(0, -300),
        );
        expect(find.text('Audience retention'), findsOneWidget);
      },
    );
  });

  group('Reach', () {
    hubTest('explains the four levels from the configured thresholds', (
      tester,
    ) async {
      await openHub(tester, Routes.creatorReach);
      expect(find.byType(CreatorReachScreen), findsOneWidget);
      expect(find.text('0 – 10,000 qualified reach'), findsOneWidget);
      expect(find.text('10,001 – 1,00,000 qualified reach'), findsOneWidget);
      expect(find.text('1,00,001 – 10,00,000 qualified reach'), findsOneWidget);
      expect(find.text('10,00,001+ qualified reach'), findsOneWidget);
      await tester.dragUntilVisible(
        find.text('What is qualified reach?'),
        find.byType(ListView).first,
        const Offset(0, -300),
      );
      expect(find.text('What is qualified reach?'), findsOneWidget);
    });

    hubTest('shows how far each reel is from its next level', (tester) async {
      await openHub(tester, Routes.creatorReach);
      await tester.dragUntilVisible(
        find.text('Your reels on the ladder'),
        find.byType(ListView).first,
        const Offset(0, -300),
      );
      expect(find.textContaining('more to reach'), findsWidgets);
    });
  });

  group('Earnings', () {
    hubTest('shows estimates by Reach level that add up', (tester) async {
      await openHub(tester, Routes.creatorEarnings);
      expect(find.byType(CreatorEarningsScreen), findsOneWidget);
      expect(find.text('₹24,580'), findsWidgets);
      expect(find.text('Estimated'), findsWidgets);
      for (final amount in ['₹1,250', '₹4,820', '₹12,420', '₹6,090']) {
        expect(find.text(amount), findsWidgets, reason: amount);
      }
      expect(find.text('Estimated total'), findsOneWidget);
    });

    hubTest(
      'explains the Qualified Creator Reward and the reward pool, not a rate',
      (tester) async {
        await openHub(tester, Routes.creatorEarnings);
        await tester.dragUntilVisible(
          find.text('Qualified Creator Reward'),
          find.byType(ListView).first,
          const Offset(0, -300),
        );
        expect(
          find.textContaining('not a fixed amount per view'),
          findsOneWidget,
        );
        expect(find.text('Reward pool'), findsOneWidget);
        expect(find.textContaining('1.28M qualified reach'), findsOneWidget);
        // No "per view" money rate anywhere on the screen.
        expect(find.textContaining('₹ per view'), findsNothing);
        expect(find.textContaining('per 1,000'), findsNothing);

        await tester.ensureVisible(find.text('How rewards work'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('How rewards work'));
        await tester.pumpAndSettle();
        expect(
          find.text('How the Qualified Creator Reward works'),
          findsOneWidget,
        );
        expect(
          find.textContaining('never a promise of payment'),
          findsOneWidget,
        );
      },
    );

    hubTest('leads on to the Payout Center', (tester) async {
      await openHub(tester, Routes.creatorEarnings);
      await tester.dragUntilVisible(
        find.text('Go to Payout Center'),
        find.byType(ListView).first,
        const Offset(0, -300),
      );
      await tester.tap(find.text('Go to Payout Center'));
      await tester.pumpAndSettle();
      expect(find.text('Payout Center'), findsOneWidget);
    });
  });
}
