import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/core/utils/number_format.dart';
import 'package:blocks_app/features/business/presentation/business_profile_screen.dart';
import 'package:blocks_app/features/business/presentation/promote_screen.dart';
import 'package:blocks_app/features/creator/presentation/creator_studio_screen.dart';
import 'package:blocks_app/features/engagement/presentation/follow_button.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/app_driver.dart';

void _tall(WidgetTester tester) {
  tester.view
    ..physicalSize = const Size(780, 3000)
    ..devicePixelRatio = 2;
  addTearDown(tester.view.reset);
}

Future<void> _tapButton(WidgetTester tester, String label) async {
  final finder = find.widgetWithText(FilledButton, label);
  await tester.ensureVisible(finder.last);
  await tester.tap(finder.last);
  await tester.pumpAndSettle();
}

void main() {
  group('formatRupees', () {
    test('uses Indian digit grouping', () {
      expect(formatRupees(0), '₹0');
      expect(formatRupees(999), '₹999');
      expect(formatRupees(18420), '₹18,420');
      expect(formatRupees(123456), '₹1,23,456');
      expect(formatRupees(12345678), '₹1,23,45,678');
      expect(formatRupees(-1500), '₹-1,500');
    });
  });

  group('Creator Studio', () {
    testWidgets('shows the dashboard from the product brief', (tester) async {
      // Tall enough that the whole (lazy) list is built.
      tester.view
        ..physicalSize = const Size(780, 8000)
        ..devicePixelRatio = 2;
      addTearDown(tester.view.reset);
      await openSignedInApp(tester, size: const Size(390, 4000));
      await pushRoute(tester, Routes.creatorStudio);

      expect(find.byType(CreatorStudioScreen), findsOneWidget);
      expect(find.text('ESTIMATED EARNINGS'), findsOneWidget);
      // The hero is the server ledger's estimate, never views x a rate.
      expect(find.text('₹24,580'), findsOneWidget);
      expect(find.text('This month ₹8,420'), findsOneWidget);
      expect(find.text('18.4K'), findsOneWidget); // followers
      expect(find.text('1.28M'), findsOneWidget); // qualified reach
      expect(find.text('100%'), findsWidgets); // district
      expect(find.text('82%'), findsWidgets); // state
      expect(find.text('31%'), findsWidgets); // national
      expect(find.text('Reach performance'), findsOneWidget);
      expect(find.text('Next milestone'), findsOneWidget);
      expect(find.text('NATIONAL'), findsWidgets);
      expect(find.text('68% complete'), findsOneWidget);
      expect(
        find.text('Keep growing your cross-state audience.'),
        findsOneWidget,
      );
    });
  });

  group('Business profile', () {
    testWidgets('shows Nexonweb with verified badge and actions', (
      tester,
    ) async {
      _tall(tester);
      await openSignedInApp(tester, size: const Size(390, 1500));
      await pushRoute(tester, Routes.business('biz_me'));

      expect(find.byType(BusinessProfileScreen), findsOneWidget);
      expect(find.text('BLOCKS Business'), findsOneWidget);
      expect(find.text('Nexonweb Solutions'), findsOneWidget);
      expect(find.text('Verified Business'), findsOneWidget);
      expect(find.text('18.2K followers'), findsOneWidget);
      expect(find.text('Follow'), findsOneWidget);
      expect(find.text('Contact'), findsOneWidget);
      expect(find.text('Promote'), findsOneWidget);
    });

    testWidgets('tabs: offers and about content', (tester) async {
      _tall(tester);
      await openSignedInApp(tester, size: const Size(390, 1500));
      await pushRoute(tester, Routes.business('biz_me'));

      await tester.tap(find.text('Offers'));
      await tester.pumpAndSettle();
      expect(find.text('Festive launch: 20% off'), findsOneWidget);
      expect(find.text('Code: BLOCKS20'), findsOneWidget);

      await tester.tap(find.text('About'));
      await tester.pumpAndSettle();
      expect(find.text('Software & IT Services'), findsOneWidget);
      expect(find.text('+91 40 5555 0100'), findsOneWidget);
    });

    testWidgets('contact sheet lists call, WhatsApp and website', (
      tester,
    ) async {
      _tall(tester);
      await openSignedInApp(tester, size: const Size(390, 1500));
      await pushRoute(tester, Routes.business('biz_me'));

      await tester.tap(find.text('Contact'));
      await tester.pumpAndSettle();
      expect(find.text('Call'), findsOneWidget);
      expect(find.text('WhatsApp'), findsOneWidget);
      expect(find.text('Website'), findsOneWidget);

      await tester.tap(find.text('Website'));
      // The clipboard write is asynchronous; give it a frame to complete.
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pumpAndSettle();
      expect(find.text('Website copied'), findsOneWidget);
    });

    testWidgets('a business page can be followed', (tester) async {
      _tall(tester);
      await openSignedInApp(tester, size: const Size(390, 1500));
      await pushRoute(tester, Routes.business('biz_u25'));

      Finder inButton(String t) => find.descendant(
        of: find.byType(FollowButton),
        matching: find.text(t),
      );
      await tester.tap(inButton('Follow'));
      await tester.pumpAndSettle();
      expect(inButton('Following'), findsOneWidget);
    });

    testWidgets('unknown business shows an error', (tester) async {
      await openSignedInApp(tester);
      await pushRoute(tester, Routes.business('biz_nope'));
      expect(find.text('Something went wrong'), findsOneWidget);
    });
  });

  group('Promote flow', () {
    testWidgets('walks all seven steps and creates a demo campaign', (
      tester,
    ) async {
      _tall(tester);
      await openSignedInApp(tester, size: const Size(390, 1500));
      await pushRoute(tester, Routes.promote);

      expect(find.byType(PromoteScreen), findsOneWidget);
      expect(find.text('Step 1 of 7'), findsOneWidget);
      expect(find.text('Select post'), findsOneWidget);

      // Step 1 — cannot continue without a post.
      await _tapButton(tester, 'Continue');
      expect(find.text('Select a post to promote'), findsOneWidget);
      expect(find.text('Step 1 of 7'), findsOneWidget);

      await tester.tap(find.byIcon(Icons.radio_button_unchecked_rounded).first);
      await tester.pump();
      await _tapButton(tester, 'Continue');

      // Step 2 — goal.
      expect(find.text('Step 2 of 7'), findsOneWidget);
      await _tapButton(tester, 'Continue');
      expect(find.text('Choose a goal'), findsWidgets);
      await tester.tap(find.text('More followers'));
      await tester.pump();
      await _tapButton(tester, 'Continue');

      // Step 3 — audience (optional).
      expect(find.text('Step 3 of 7'), findsOneWidget);
      expect(
        find.textContaining('Personal details are never shared'),
        findsOneWidget,
      );
      await tester.tap(find.text('Food lovers'));
      await tester.pump();
      await _tapButton(tester, 'Continue');

      // Step 4 — location (defaults to the user's district).
      expect(find.text('Step 4 of 7'), findsOneWidget);
      await tester.tap(find.text('Warangal'));
      await tester.pump();
      await _tapButton(tester, 'Continue');

      // Step 5 — budget, defaults to Rs 500 x 7 days.
      expect(find.text('Step 5 of 7'), findsOneWidget);
      expect(find.text('₹3,500'), findsOneWidget);
      await _tapButton(tester, 'Continue');

      // Step 6 — review with the demo banner.
      expect(find.text('Step 6 of 7'), findsOneWidget);
      expect(
        find.text('Demo campaign. No real money is processed.'),
        findsOneWidget,
      );
      expect(find.textContaining('Hyderabad'), findsWidgets);
      await _tapButton(tester, 'Publish demo campaign');

      // Step 7 — success.
      expect(find.text('Step 7 of 7'), findsOneWidget);
      expect(find.text('Demo campaign created'), findsOneWidget);
      expect(find.text('Done'), findsOneWidget);

      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();
      expect(find.byType(PromoteScreen), findsNothing);
    });

    testWidgets('requires at least one location', (tester) async {
      _tall(tester);
      await openSignedInApp(tester, size: const Size(390, 1500));
      await pushRoute(tester, '${Routes.promote}?postId=p~biz~biz_me~0');

      await tester.tap(find.text('Continue').last); // step 1, post preselected
      await tester.pumpAndSettle();
      await tester.tap(find.text('More reach'));
      await tester.pump();
      await _tapButton(tester, 'Continue');
      await _tapButton(tester, 'Continue'); // audience

      // Deselect the default district, then try to continue.
      await tester.tap(find.text('Hyderabad'));
      await tester.pump();
      await _tapButton(tester, 'Continue');
      expect(find.text('Pick at least one location'), findsOneWidget);
      expect(find.text('Step 4 of 7'), findsOneWidget);
    });

    testWidgets('Back returns to the previous step', (tester) async {
      _tall(tester);
      await openSignedInApp(tester, size: const Size(390, 1500));
      await pushRoute(tester, '${Routes.promote}?postId=p~biz~biz_me~0');
      await _tapButton(tester, 'Continue');
      expect(find.text('Step 2 of 7'), findsOneWidget);

      await tester.tap(find.text('Back'));
      await tester.pumpAndSettle();
      expect(find.text('Step 1 of 7'), findsOneWidget);
    });

    testWidgets('budget step shows a live reach estimate', (tester) async {
      _tall(tester);
      await openSignedInApp(tester, size: const Size(390, 1500));
      await pushRoute(tester, '${Routes.promote}?postId=p~biz~biz_me~0');
      await _tapButton(tester, 'Continue');
      await tester.tap(find.text('More reach'));
      await tester.pump();
      await _tapButton(tester, 'Continue');
      await _tapButton(tester, 'Continue');
      await _tapButton(tester, 'Continue');

      expect(find.text('Step 5 of 7'), findsOneWidget);
      expect(find.text('Estimated reach'), findsOneWidget);
      expect(find.textContaining('people'), findsOneWidget);
    });
  });
}
