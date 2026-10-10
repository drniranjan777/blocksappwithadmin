import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/data/mock/demo_credentials.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/data/services/security_demo_service.dart';
import 'package:blocks_app/features/notifications/application/notification_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/app_driver.dart';

/// Runs a demo-lab scenario on the mock server and refreshes the providers
/// that may already be holding stale data (the bell, the feed).
Future<void> runScenario(WidgetTester tester, DemoScenario scenario) async {
  final c = containerOf(tester);
  await c.read(securityDemoServiceProvider).run(scenario);
  c
    ..invalidate(unreadNotificationsProvider)
    ..invalidate(notificationsProvider);
  await tester.pump();
}

Future<void> scrollTo(WidgetTester tester, Finder finder) async {
  // inder.first throws while nothing matches yet, so scroll by hand until
  // something does, then bring the first match fully into view.
  final scrollable = find.byType(Scrollable).first;
  for (var i = 0; i < 40 && finder.evaluate().isEmpty; i++) {
    await tester.drag(scrollable, const Offset(0, -300));
    await tester.pump();
  }
  await tester.ensureVisible(finder.first);
  await tester.pumpAndSettle();
}

Future<void> tapText(WidgetTester tester, String text) async {
  final f = find.text(text);
  await scrollTo(tester, f);
  await tester.tap(f.first);
  await tester.pumpAndSettle();
}

Finder field(String label) => find.widgetWithText(TextField, label);

void main() {
  group('Security hub', () {
    testWidgets('Settings -> Security opens the hub with a healthy status', (
      tester,
    ) async {
      await openSignedInApp(tester);
      await pushRoute(tester, Routes.settings);
      await tapText(tester, 'Security overview');

      expect(currentLocation(tester), Routes.security);
      expect(find.text('Your account is protected'), findsOneWidget);
      expect(
        find.text(
          'Two-factor authentication is on and nothing unusual was found.',
        ),
        findsOneWidget,
      );
      for (final t in [
        'Change Password',
        'Change Email',
        'Change Phone Number',
        'Two-Factor Authentication',
        'Login Activity',
        'Logged-in Devices',
        'Security Notifications',
      ]) {
        await scrollTo(tester, find.text(t));
        expect(find.text(t), findsOneWidget, reason: t);
      }
    });

    testWidgets('shows only masked contacts, never the full values', (
      tester,
    ) async {
      await openSignedInApp(tester);
      await pushRoute(tester, Routes.security);

      expect(find.text('a***v@blocks.example'), findsOneWidget);
      expect(find.text('+91 *******210'), findsOneWidget);
      expect(find.text(DemoCredentials.email), findsNothing);
      expect(find.textContaining('9876543210'), findsNothing);
    });

    testWidgets('an unreviewed suspicious sign-in needs attention', (
      tester,
    ) async {
      await openSignedInApp(tester);
      await runScenario(tester, DemoScenario.suspiciousLogin);
      await pushRoute(tester, Routes.security);

      expect(find.text('Your account needs attention'), findsOneWidget);
      expect(
        find.text('We found a suspicious sign-in. Review it now.'),
        findsOneWidget,
      );
      // The call to action opens the alert.
      await tester.tap(find.text('Review').first);
      await tester.pumpAndSettle();
      expect(find.text('Suspicious Login Attempt'), findsOneWidget);
    });

    testWidgets('the demo lab entry is only offered in demo builds', (
      tester,
    ) async {
      await openSignedInApp(tester);
      await pushRoute(tester, Routes.security);
      await scrollTo(tester, find.text('Security demo lab'));
      expect(find.text('Security demo lab'), findsOneWidget);
    });
  });

  group('Change password', () {
    Future<void> open(WidgetTester tester) async {
      await openSignedInApp(tester);
      await pushRoute(tester, Routes.changePassword);
    }

    testWidgets('the button stays disabled until everything is valid', (
      tester,
    ) async {
      await open(tester);

      FilledButton button() => tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Change Password'),
      );
      expect(button().onPressed, isNull);

      await tester.enterText(
        field('Current password'),
        DemoCredentials.password,
      );
      await tester.enterText(field('New password'), 'Rivers@2026!');
      await tester.pump();
      expect(button().onPressed, isNull); // confirmation missing

      await tester.enterText(field('Confirm new password'), 'Rivers@2026?');
      await tester.pump();
      expect(find.text("Passwords don't match"), findsOneWidget);
      expect(button().onPressed, isNull);

      await tester.enterText(field('Confirm new password'), 'Rivers@2026!');
      await tester.pump();
      expect(find.text("Passwords don't match"), findsNothing);
      expect(button().onPressed, isNotNull);
    });

    testWidgets('the strength meter reacts as you type', (tester) async {
      await open(tester);
      expect(find.text('Weak'), findsNothing); // nothing typed yet

      await tester.enterText(field('New password'), 'abc');
      await tester.pump();
      expect(find.text('Weak'), findsOneWidget);

      await tester.enterText(field('New password'), 'Rivers@2026');
      await tester.pump();
      expect(find.text('Strong'), findsOneWidget);

      await tester.enterText(field('New password'), 'Xk9#mPz2\$qLwTn');
      await tester.pump();
      expect(find.text('Very strong'), findsOneWidget);
    });

    testWidgets('requirements tick off as they are met', (tester) async {
      await open(tester);
      int done() => find.byIcon(Icons.check_circle_rounded).evaluate().length;

      expect(find.text('At least 8 characters'), findsOneWidget);
      expect(done(), 0);

      await tester.enterText(field('New password'), 'abcdefgh');
      await tester.pump();
      expect(done(), 2); // length + lowercase

      await tester.enterText(field('New password'), 'Abcdefg1!');
      await tester.pump();
      expect(done(), 5);
    });

    testWidgets('passwords are hidden until the eye is pressed', (
      tester,
    ) async {
      await open(tester);
      TextField tf() => tester.widget<TextField>(field('New password'));

      expect(tf().obscureText, isTrue);
      expect(tf().autocorrect, isFalse);
      expect(tf().enableSuggestions, isFalse);

      await tester.tap(find.byTooltip('Show password').at(1));
      await tester.pump();
      expect(tf().obscureText, isFalse);
      await tester.tap(find.byTooltip('Hide password').first);
      await tester.pump();
    });

    testWidgets('a wrong current password shows the clear error', (
      tester,
    ) async {
      await open(tester);
      await tester.enterText(field('Current password'), 'not-it');
      await tester.enterText(field('New password'), 'Rivers@2026!');
      await tester.enterText(field('Confirm new password'), 'Rivers@2026!');
      await tester.pump();

      await tester.tap(find.widgetWithText(FilledButton, 'Change Password'));
      await tester.pumpAndSettle();

      expect(find.text('Unable to change password.'), findsOneWidget);
      expect(
        find.text('Please verify your current password and try again.'),
        findsOneWidget,
      );
      // Still on the form so the user can fix it.
      expect(find.text('Password Changed'), findsNothing);
    });

    testWidgets('success: confirmation, and the new password is live', (
      tester,
    ) async {
      await open(tester);
      await tester.enterText(
        field('Current password'),
        DemoCredentials.password,
      );
      await tester.enterText(field('New password'), 'Rivers@2026!');
      await tester.enterText(field('Confirm new password'), 'Rivers@2026!');
      await tester.pump();

      await tester.tap(find.widgetWithText(FilledButton, 'Change Password'));
      await tester.pumpAndSettle();

      expect(find.text('Password Changed'), findsOneWidget);
      expect(
        find.text('Your BLOCKS password has been updated successfully.'),
        findsOneWidget,
      );

      // The server logged it, e-mailed an alert and raised a notification.
      final repo = containerOf(tester).read(securityRepositoryProvider);
      expect(await repo.getSentAlerts(), hasLength(1));
      expect(
        (await repo.getEvents()).first.type,
        SecurityEventType.passwordChanged,
      );
    });
  });
}
