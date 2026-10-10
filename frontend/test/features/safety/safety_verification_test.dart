import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/post/presentation/post_card.dart';
import 'package:blocks_app/features/profile/application/user_providers.dart';
import 'package:blocks_app/features/safety/application/safety_actions.dart';
import 'package:blocks_app/features/create/application/create_controllers.dart';
import 'package:blocks_app/features/settings/application/app_settings.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/app_driver.dart';

void _tall(WidgetTester tester) {
  tester.view
    ..physicalSize = const Size(780, 3200)
    ..devicePixelRatio = 2;
  addTearDown(tester.view.reset);
}

void main() {
  group('Verification', () {
    testWidgets('starts verified as a creator', (tester) async {
      _tall(tester);
      await openSignedInApp(tester, size: const Size(390, 1600));
      await pushRoute(tester, Routes.verification);

      expect(find.text('Verification status'.toUpperCase()), findsOneWidget);
      expect(find.text('Verified'), findsOneWidget);
      expect(find.text('Current badge'), findsOneWidget);
      expect(find.textContaining('never bought'), findsOneWidget);
    });

    testWidgets('request -> pending -> demo approval -> new badge', (
      tester,
    ) async {
      _tall(tester);
      await openSignedInApp(tester, size: const Size(390, 1600));
      await pushRoute(tester, Routes.verification);

      // Buttons: Identity, Business, Publisher (Creator is the current badge).
      await tester.tap(find.widgetWithText(FilledButton, 'Request').at(1));
      await tester.pumpAndSettle();
      expect(find.text('Pending review'), findsOneWidget);
      expect(find.text('Demo admin'), findsOneWidget);
      expect(find.text('Verification requested'), findsOneWidget);
      // While pending, other requests are disabled.
      final other = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Request').first,
      );
      expect(other.onPressed, isNull);

      await tester.ensureVisible(find.text('Approve (demo)'));
      await tester.tap(find.text('Approve (demo)'));
      await tester.pumpAndSettle();
      expect(find.text('Verified'), findsOneWidget);
      expect(find.text('Pending review'), findsNothing);
      expect(find.text('Demo admin'), findsNothing);

      final me = await containerOf(tester).read(currentUserProvider.future);
      expect(me.verificationType.toString(), contains('business'));
    });
  });

  group('Safety Center', () {
    testWidgets('controls persist and apply', (tester) async {
      _tall(tester);
      await openSignedInApp(tester, size: const Size(390, 2000));
      await pushRoute(tester, Routes.safety);

      expect(find.text('Safety Center'), findsOneWidget);
      await tester.tap(find.text('Less'));
      await tester.pump();
      final c = containerOf(tester);
      expect(c.read(appSettingsProvider).sensitive, SensitiveContentLevel.less);

      await tester.tap(find.text('Followers').first); // who can comment
      await tester.pump();
      expect(
        c.read(appSettingsProvider).whoCanComment,
        InteractionScope.followers,
      );

      await tester.tap(find.widgetWithText(SwitchListTile, 'Private account'));
      await tester.pump();
      expect(c.read(appSettingsProvider).isOn(AppFlag.privateAccount), isTrue);
    });

    testWidgets('turning 2FA off removes Live access', (tester) async {
      _tall(tester);
      await openSignedInApp(tester, size: const Size(390, 2000));
      await pushRoute(tester, Routes.safety);
      final c = containerOf(tester);

      expect(c.read(liveEligibilityProvider).value!.isEligible, isTrue);
      await tester.ensureVisible(
        find.widgetWithText(SwitchListTile, 'Two-factor authentication'),
      );
      await tester.tap(
        find.widgetWithText(SwitchListTile, 'Two-factor authentication'),
      );
      await tester.pumpAndSettle();

      expect(c.read(liveEligibilityProvider).value!.isEligible, isFalse);
    });

    testWidgets('report flow records a report and thanks the user', (
      tester,
    ) async {
      await openSignedInApp(tester);
      await tester.tap(find.byIcon(Icons.more_horiz_rounded).first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Report'));
      await tester.pumpAndSettle();

      expect(find.text('Why are you reporting this?'), findsOneWidget);
      // Submit is disabled until a reason is chosen.
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Submit report'),
            )
            .onPressed,
        isNull,
      );
      await tester.tap(find.text('Scam / Fraud'));
      await tester.pump();
      await tester.tap(find.text('Submit report'));
      await tester.pumpAndSettle();

      expect(find.text('Thanks for letting us know'), findsOneWidget);
      expect(containerOf(tester).read(mockWorldProvider).reports, hasLength(1));
      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();
      expect(find.text('Thanks for letting us know'), findsNothing);
    });

    testWidgets('blocking from a post hides the author and lists them', (
      tester,
    ) async {
      _tall(tester);
      await openSignedInApp(tester, size: const Size(390, 1600));
      final author =
          (find.byType(PostCard).first.evaluate().first.widget as PostCard)
              .post
              .author;

      await tester.tap(find.byIcon(Icons.more_horiz_rounded).first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Block ${author.username}'));
      await tester.pumpAndSettle();
      expect(find.text('Block ${author.username}?'), findsOneWidget);
      await tester.tap(find.text('Block ${author.username}').last);
      await tester.pumpAndSettle();
      expect(find.text('${author.username} blocked'), findsOneWidget);

      // No card from that author remains in the refreshed feed.
      final authors = find
          .byType(PostCard)
          .evaluate()
          .map((e) => (e.widget as PostCard).post.author.id);
      expect(authors.contains(author.id), isFalse);

      await pushRoute(tester, Routes.blocked);
      expect(find.text(author.name), findsOneWidget);
      await tester.tap(find.text('Unblock'));
      await tester.pumpAndSettle();
      expect(find.text('${author.username} unblocked'), findsOneWidget);
      expect(containerOf(tester).read(blockedUsersProvider).value, isEmpty);
    });

    testWidgets('muting and unmuting works from the muted list', (
      tester,
    ) async {
      await openSignedInApp(tester);
      final c = containerOf(tester);
      await c.read(safetyActionsProvider).mute('u3');
      await pushRoute(tester, Routes.muted);
      expect(find.text('Tanvi Nair'), findsOneWidget);

      await tester.tap(find.text('Unmute'));
      await tester.pumpAndSettle();
      expect(c.read(mutedUsersProvider).value, isEmpty);
      expect(find.text('Muted accounts'), findsWidgets);
    });

    testWidgets('empty blocked list explains itself', (tester) async {
      await openSignedInApp(tester);
      await pushRoute(tester, Routes.blocked);
      expect(
        find.text("People you block can't find your profile."),
        findsOneWidget,
      );
    });
  });
}
