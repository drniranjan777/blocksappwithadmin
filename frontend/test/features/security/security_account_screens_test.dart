import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/data/mock/demo_credentials.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/data/services/security_demo_service.dart';
import 'package:blocks_app/features/notifications/application/notification_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/app_driver.dart';

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

/// The category chips scroll horizontally; "Security" is the last one.
Future<void> showSecurityChip(WidgetTester tester) async {
  await tester.scrollUntilVisible(
    find.text('Security'),
    150,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.pumpAndSettle();
}

void main() {
  group('Devices', () {
    testWidgets('lists every device and marks this one', (tester) async {
      await openSignedInApp(tester);
      await pushRoute(tester, Routes.devices);

      expect(find.text('Your Devices'), findsOneWidget);
      expect(find.text('This device'), findsOneWidget);
      expect(find.textContaining('Active now'), findsOneWidget);
      await scrollTo(tester, find.text('Samsung Galaxy'));
      for (final d in ['iPhone 15 Pro', 'Samsung Galaxy', 'MacBook Air']) {
        expect(find.text(d), findsOneWidget, reason: d);
      }
      // Other devices can be logged out; this one is not offered.
      expect(find.text('Log Out'), findsNWidgets(3));
    });

    testWidgets('logging out one device asks first, then removes it', (
      tester,
    ) async {
      await openSignedInApp(tester);
      await pushRoute(tester, Routes.devices);

      await tapText(tester, 'Log Out'); // first "Log Out" = iPhone 15 Pro
      expect(find.text('Log out of this device?'), findsOneWidget);
      expect(
        find.text('iPhone 15 Pro will be signed out of BLOCKS.'),
        findsOneWidget,
      );

      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(find.text('iPhone 15 Pro'), findsOneWidget);

      await tapText(tester, 'Log Out');
      await tester.tap(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.text('Log Out'),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('iPhone 15 Pro'), findsNothing);
      expect(find.text('Device logged out'), findsOneWidget);
      final sessions = await containerOf(tester)
          .read(sessionRepositoryProvider)
          .getSessions();
      expect(sessions, hasLength(3));
    });

    testWidgets('log out all other devices: exact confirmation, then only '
        'this device remains', (tester) async {
      await openSignedInApp(tester);
      await pushRoute(tester, Routes.devices);

      await tapText(tester, 'Log Out From All Other Devices');
      expect(find.text('Log out of all other devices?'), findsOneWidget);
      expect(
        find.text(
          'This will end BLOCKS sessions on every device except this one.',
        ),
        findsOneWidget,
      );
      expect(find.text('Cancel'), findsOneWidget);
      expect(find.text('Log Out Others'), findsOneWidget);

      await tester.tap(find.text('Log Out Others'));
      await tester.pumpAndSettle();

      expect(find.text('Logged out of all other devices'), findsOneWidget);
      expect(find.text('No other devices are signed in.'), findsOneWidget);
      expect(find.text('Log Out'), findsNothing);
    });

    testWidgets('the action is also on the Security hub', (tester) async {
      await openSignedInApp(tester);
      await pushRoute(tester, Routes.security);
      await tapText(tester, 'Log Out From All Other Devices');
      await tester.tap(find.text('Log Out Others'));
      await tester.pumpAndSettle();

      final sessions = await containerOf(tester)
          .read(sessionRepositoryProvider)
          .getSessions();
      expect(sessions, hasLength(1));
      // The hub's device count follows.
      expect(find.text('1 devices'), findsOneWidget);
    });
  });

  group('Login Activity', () {
    testWidgets('groups by day and shows the seeded events', (tester) async {
      await openSignedInApp(tester);
      await pushRoute(tester, Routes.loginActivity);

      expect(find.text('Login Activity'), findsOneWidget);
      expect(find.text('Successful Login'), findsWidgets);
      expect(find.text('Failed Login Attempt'), findsOneWidget);
      expect(find.textContaining('Unknown device · India'), findsOneWidget);
      for (final chip in ['All', 'Successful', 'Failed', 'Suspicious']) {
        expect(find.text(chip), findsOneWidget, reason: chip);
      }
    });

    testWidgets('filters narrow the list', (tester) async {
      await openSignedInApp(tester);
      await pushRoute(tester, Routes.loginActivity);

      await tester.tap(find.text('Failed'));
      await tester.pumpAndSettle();
      expect(find.text('Failed Login Attempt'), findsOneWidget);
      expect(find.text('Successful Login'), findsNothing);

      await tester.tap(find.text('Successful'));
      await tester.pumpAndSettle();
      expect(find.text('Failed Login Attempt'), findsNothing);
      expect(find.text('Successful Login'), findsWidgets);

      await tester.tap(find.text('Suspicious'));
      await tester.pumpAndSettle();
      expect(find.text('No activity to show'), findsOneWidget);

      await tester.tap(find.text('All'));
      await tester.pumpAndSettle();
      expect(find.text('Failed Login Attempt'), findsOneWidget);
    });

    testWidgets('a suspicious attempt appears and opens its alert', (
      tester,
    ) async {
      await openSignedInApp(tester);
      await runScenario(tester, DemoScenario.suspiciousLogin);
      await pushRoute(tester, Routes.loginActivity);

      await tester.tap(find.text('Suspicious'));
      await tester.pumpAndSettle();
      expect(find.text('Suspicious Login Attempt'), findsOneWidget);

      await tester.tap(find.text('Suspicious Login Attempt'));
      await tester.pumpAndSettle();
      expect(currentLocation(tester), startsWith('/settings/security/alert/'));
      expect(find.text('Chrome on Windows'), findsOneWidget);
    });
  });

  group('Security alert', () {
    Future<String> openAlert(WidgetTester tester) async {
      await openSignedInApp(tester);
      final r = await containerOf(tester)
          .read(securityDemoServiceProvider)
          .run(DemoScenario.suspiciousLogin);
      await pushRoute(tester, Routes.securityAlert(r.eventId!));
      return r.eventId!;
    }

    testWidgets('shows what happened, where and when, with approximate '
        'location only', (tester) async {
      await openAlert(tester);

      expect(find.text('Suspicious Login Attempt'), findsOneWidget);
      expect(
        find.text(
          'We detected multiple unsuccessful login attempts on your BLOCKS account.',
        ),
        findsOneWidget,
      );
      expect(find.text('Chrome on Windows'), findsOneWidget);
      expect(find.text('Hyderabad, India'), findsOneWidget);
      expect(find.text('Device'), findsOneWidget);
      expect(find.text('Approximate location'), findsOneWidget);
      expect(find.text('Time'), findsOneWidget);
      expect(
        find.text('For your privacy we only show an approximate location.'),
        findsOneWidget,
      );
      expect(find.text('If this was you'), findsOneWidget);
      expect(find.text("You don't need to do anything."), findsOneWidget);
      expect(find.text("If this wasn't you"), findsOneWidget);
      expect(
        find.text('Change your password and review your logged-in devices.'),
        findsOneWidget,
      );
    });

    testWidgets('confirms an e-mail and device notification went out', (
      tester,
    ) async {
      await openAlert(tester);
      expect(find.text('Security Alert Sent'), findsOneWidget);
      expect(
        find.text(
          "We've sent a security notification to your registered email and active BLOCKS devices.",
        ),
        findsOneWidget,
      );
    });

    testWidgets('offers Secure Account, Review Devices and This Was Me', (
      tester,
    ) async {
      await openAlert(tester);
      for (final b in ['Secure Account', 'Review Devices', 'This Was Me']) {
        await scrollTo(tester, find.text(b));
        expect(find.text(b), findsOneWidget, reason: b);
      }
    });

    testWidgets('Secure Account opens Change Password', (tester) async {
      await openAlert(tester);
      await tapText(tester, 'Secure Account');
      expect(currentLocation(tester), Routes.changePassword);
    });

    testWidgets('Review Devices opens the device list', (tester) async {
      await openAlert(tester);
      await tapText(tester, 'Review Devices');
      expect(currentLocation(tester), Routes.devices);
    });

    testWidgets('This Was Me marks it reviewed and clears the attention flag', (
      tester,
    ) async {
      final id = await openAlert(tester);
      await tapText(tester, 'This Was Me');

      expect(find.text("Thanks. We've marked this as you."), findsOneWidget);
      expect(find.text('Reviewed'), findsOneWidget);
      final e = await containerOf(tester)
          .read(securityRepositoryProvider)
          .getEvent(id);
      expect(e.acknowledged, isTrue);

      // The hub no longer asks for a review.
      await pushRoute(tester, Routes.security);
      expect(find.text('Your account is protected'), findsOneWidget);
    });

    testWidgets('an unknown alert id shows an error, not a crash', (
      tester,
    ) async {
      await openSignedInApp(tester);
      await pushRoute(tester, Routes.securityAlert('sec~missing'));
      expect(find.text('Something went wrong'), findsOneWidget);
    });
  });

  group('Two-factor authentication', () {
    testWidgets('starts on and shows the method', (tester) async {
      await openSignedInApp(tester);
      await pushRoute(tester, Routes.twoFactor);

      expect(find.text('Two-factor authentication is on'), findsOneWidget);
      expect(find.text('Text message (SMS)'), findsOneWidget);
      expect(find.text('Codes are sent to +91 *******210'), findsOneWidget);
      expect(find.text('Email fallback'), findsOneWidget);
    });

    testWidgets('turning it off needs the right password', (tester) async {
      await openSignedInApp(tester);
      await pushRoute(tester, Routes.twoFactor);

      await tester.tap(find.byType(Switch).first);
      await tester.pumpAndSettle();
      expect(find.text('Turn off two-factor authentication?'), findsOneWidget);

      // Turn off stays disabled until something is typed.
      await tester.enterText(find.byType(TextField), 'wrong password');
      await tester.pump();
      await tester.tap(find.widgetWithText(TextButton, 'Turn off'));
      await tester.pumpAndSettle();
      expect(find.text("That password isn't right."), findsOneWidget);
      expect(find.text('Two-factor authentication is on'), findsOneWidget);

      await tester.enterText(find.byType(TextField), DemoCredentials.password);
      await tester.pump();
      await tester.tap(find.widgetWithText(TextButton, 'Turn off'));
      await tester.pumpAndSettle();

      expect(find.text('Two-factor authentication is off'), findsWidgets);
      final tf = await containerOf(tester)
          .read(securityRepositoryProvider)
          .getTwoFactor();
      expect(tf.enabled, isFalse);
    });

    testWidgets('turning it on checks a code', (tester) async {
      await openSignedInApp(tester);
      final repo = containerOf(tester).read(securityRepositoryProvider);
      await repo.disableTwoFactor(currentPassword: DemoCredentials.password);
      await pushRoute(tester, Routes.twoFactor);

      // (section titles render in capitals)
      expect(find.text('CHOOSE HOW TO GET CODES'), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, 'Turn on'));
      await tester.pumpAndSettle();

      expect(find.text('We sent a code to +91 *******210.'), findsOneWidget);
      expect(find.text('Demo OTP: 123456'), findsOneWidget);

      await tester.enterText(find.byType(TextField).last, '000000');
      await tester.pump();
      await tester.tap(find.text('Verify and turn on'));
      await tester.pumpAndSettle();
      expect(
        find.text("That code isn't right. 4 attempts left."),
        findsOneWidget,
      );

      await tester.tap(find.text('Demo OTP: 123456')); // tap to fill
      await tester.pump();
      await tester.tap(find.text('Verify and turn on'));
      await tester.pumpAndSettle();

      expect(find.text('Two-factor authentication is on'), findsWidgets);
      expect((await repo.getTwoFactor()).enabled, isTrue);
    });

    testWidgets('the authenticator-app method can be chosen', (tester) async {
      await openSignedInApp(tester);
      final repo = containerOf(tester).read(securityRepositoryProvider);
      await repo.disableTwoFactor(currentPassword: DemoCredentials.password);
      await pushRoute(tester, Routes.twoFactor);

      await tester.tap(find.text('Authenticator app'));
      await tester.pump();
      await tester.tap(find.widgetWithText(FilledButton, 'Turn on'));
      await tester.pumpAndSettle();
      expect(
        find.text(
          'Open your authenticator app and enter the code shown for BLOCKS.',
        ),
        findsOneWidget,
      );
      await tester.tap(find.text('Demo OTP: 123456'));
      await tester.pump();
      await tester.tap(find.text('Verify and turn on'));
      await tester.pumpAndSettle();

      expect(
        (await repo.getTwoFactor()).method,
        TwoFactorMethod.authenticatorApp,
      );
    });
  });

  group('Security notifications', () {
    testWidgets('optional alerts can be toggled; critical ones cannot', (
      tester,
    ) async {
      await openSignedInApp(tester);
      await pushRoute(tester, Routes.securityNotifications);

      expect(find.text('Security alerts by email'), findsOneWidget);
      expect(
        find.text('Suspicious sign-ins and account changes'),
        findsOneWidget,
      );

      final critical = tester.widget<SwitchListTile>(
        find.widgetWithText(
          SwitchListTile,
          'Suspicious sign-ins and account changes',
        ),
      );
      expect(critical.onChanged, isNull);
      expect(critical.value, isTrue);

      await tester.tap(
        find.widgetWithText(SwitchListTile, 'New device sign-in alerts'),
      );
      await tester.pumpAndSettle();
      final prefs = await containerOf(tester)
          .read(securityRepositoryProvider)
          .getAlertPreferences();
      expect(prefs.newDeviceAlerts, isFalse);
      expect(prefs.emailCopies, isTrue);
    });

    testWidgets('says so when no security e-mail has been sent', (
      tester,
    ) async {
      await openSignedInApp(tester);
      await pushRoute(tester, Routes.securityNotifications);
      await scrollTo(
        tester,
        find.text('No security emails have been sent yet.'),
      );
      expect(
        find.text('No security emails have been sent yet.'),
        findsOneWidget,
      );
    });

    testWidgets('lists the security e-mails that were sent, to a masked '
        'address', (tester) async {
      await openSignedInApp(tester);
      await runScenario(tester, DemoScenario.suspiciousLogin);
      await pushRoute(tester, Routes.securityNotifications);

      await scrollTo(tester, find.text('ALERTS SENT TO YOUR EMAIL'));
      expect(find.text('Suspicious Login Attempt'), findsOneWidget);
      expect(find.text('Sent to a***v@blocks.example'), findsOneWidget);
      expect(find.text('No security emails have been sent yet.'), findsNothing);
    });
  });

  group('Notification centre', () {
    testWidgets('a security alert appears with a badge and opens the alert', (
      tester,
    ) async {
      await openSignedInApp(tester);
      await runScenario(tester, DemoScenario.maxFailedAttempts);
      await pushRoute(tester, Routes.notifications);

      // New chip and the alert text exactly as specified.
      await showSecurityChip(tester);
      expect(find.text('Security'), findsOneWidget);
      expect(find.text('Security Alert'), findsOneWidget);
      expect(find.text('5 failed login attempts detected.'), findsOneWidget);

      await tester.tap(find.text('Security Alert'));
      await tester.pumpAndSettle();
      expect(currentLocation(tester), startsWith('/settings/security/alert/'));
      expect(find.text('Suspicious Login Attempt'), findsOneWidget);
    });

    testWidgets('the Security chip filters to security alerts only', (
      tester,
    ) async {
      await openSignedInApp(tester);
      await runScenario(tester, DemoScenario.passwordChanged);
      await runScenario(tester, DemoScenario.newDeviceLogin);
      await runScenario(tester, DemoScenario.sessionRevoked);
      await pushRoute(tester, Routes.notifications);

      await showSecurityChip(tester);
      await tester.tap(find.text('Security'));
      await tester.pumpAndSettle();
      for (final t in ['Password Changed', 'New Login', 'Device Removed']) {
        expect(find.text(t), findsOneWidget, reason: t);
      }
      expect(find.textContaining('reached STATE'), findsNothing);
    });

    testWidgets('each alert leads somewhere useful', (tester) async {
      await openSignedInApp(tester);
      await runScenario(tester, DemoScenario.sessionRevoked);
      await pushRoute(tester, Routes.notifications);
      await showSecurityChip(tester);
      await tester.tap(find.text('Security'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Device Removed'));
      await tester.pumpAndSettle();
      expect(currentLocation(tester), Routes.devices);
    });
  });
}
