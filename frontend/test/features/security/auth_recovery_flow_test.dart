import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/core/constants/storage_keys.dart';
import 'package:blocks_app/data/mock/demo_credentials.dart';
import 'package:blocks_app/data/models/content_models.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/auth/presentation/auth_entry_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/app_driver.dart';
import '../../helpers/pump_app.dart';

const _signedOut = {StorageKeys.onboardingCompleted: true};

/// Boots the app signed OUT on the auth entry screen.
Future<void> openAuth(WidgetTester tester, {DateTime Function()? clock}) async {
  await pumpBlocksApp(
    tester,
    storage: _signedOut,
    overrides: [if (clock != null) clockProvider.overrideWithValue(clock)],
  );
  await finishSplash(tester);
  expect(find.byType(AuthEntryScreen), findsOneWidget);
}

Future<void> openSignIn(
  WidgetTester tester, {
  DateTime Function()? clock,
}) async {
  await openAuth(tester, clock: clock);
  await tester.tap(find.text('Sign in with password'));
  await tester.pumpAndSettle();
}

Finder field(String label) => find.widgetWithText(TextField, label);

Future<void> signIn(
  WidgetTester tester, {
  String id = DemoCredentials.email,
  String password = 'wrong',
}) async {
  await tester.enterText(field('Email, phone or username'), id);
  await tester.enterText(field('Password'), password);
  await tester.pump();
  await tester.tap(find.widgetWithText(FilledButton, 'Sign In'));
  await tester.pumpAndSettle();
}

Future<void> scrollTo(WidgetTester tester, Finder finder) async {
  final scrollable = find.byType(Scrollable).first;
  for (var i = 0; i < 40 && finder.evaluate().isEmpty; i++) {
    await tester.drag(scrollable, const Offset(0, -300));
    await tester.pump();
  }
  await tester.ensureVisible(finder.first);
  await tester.pumpAndSettle();
}

Future<void> scrollToTop(WidgetTester tester) async {
  final scrollable = find.byType(Scrollable).first;
  for (var i = 0; i < 12; i++) {
    await tester.drag(scrollable, const Offset(0, 400));
    await tester.pump();
  }
  await tester.pumpAndSettle();
}

Future<void> tapText(WidgetTester tester, String text) async {
  await scrollTo(tester, find.text(text));
  await tester.tap(find.text(text).first);
  await tester.pumpAndSettle();
}

void main() {
  group('Sign in with password', () {
    testWidgets('the auth screen offers it next to the demo shortcut', (
      tester,
    ) async {
      await openAuth(tester);
      expect(find.text('Continue as Demo User'), findsOneWidget);
      expect(find.text('Sign in with password'), findsOneWidget);
    });

    testWidgets('correct credentials open the app on Reels', (tester) async {
      await openSignIn(tester);
      expect(currentLocation(tester), Routes.signIn);

      await signIn(tester, password: DemoCredentials.password);
      expect(currentLocation(tester), Routes.reels);
    });

    testWidgets('username and phone work as the identifier too', (
      tester,
    ) async {
      await openSignIn(tester);
      await signIn(
        tester,
        id: '@aarav.blocks',
        password: DemoCredentials.password,
      );
      expect(currentLocation(tester), Routes.reels);
    });

    testWidgets('the demo card fills the form (demo builds only)', (
      tester,
    ) async {
      await openSignIn(tester);
      expect(find.text('Demo account'), findsOneWidget);
      await tester.tap(find.text('Demo account'));
      await tester.pump();
      await tester.tap(find.widgetWithText(FilledButton, 'Sign In'));
      await tester.pumpAndSettle();
      expect(currentLocation(tester), Routes.reels);
    });

    testWidgets('Sign In is disabled until both fields are filled', (
      tester,
    ) async {
      await openSignIn(tester);
      FilledButton b() => tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Sign In'),
      );
      expect(b().onPressed, isNull);
      await tester.enterText(field('Email, phone or username'), 'a@b.co');
      await tester.pump();
      expect(b().onPressed, isNull);
      await tester.enterText(field('Password'), 'x');
      await tester.pump();
      expect(b().onPressed, isNotNull);
    });

    testWidgets('a wrong password shows an error and keeps you here', (
      tester,
    ) async {
      await openSignIn(tester);
      await signIn(tester);

      expect(find.text('Incorrect email, phone or password.'), findsOneWidget);
      expect(currentLocation(tester), Routes.signIn);
      // Early on the server does not nag about the limit.
      expect(find.textContaining('attempts left'), findsNothing);
    });

    testWidgets('the server warns when only a couple of attempts remain', (
      tester,
    ) async {
      await openSignIn(tester);
      for (var i = 0; i < 3; i++) {
        await signIn(tester);
      }
      expect(
        find.text(
          '2 attempts left before your account is temporarily protected.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('editing the form clears the error', (tester) async {
      await openSignIn(tester);
      await signIn(tester);
      expect(find.text('Incorrect email, phone or password.'), findsOneWidget);
      await tester.enterText(field('Password'), 'tr');
      await tester.pump();
      expect(find.text('Incorrect email, phone or password.'), findsNothing);
    });
  });

  group('maximum failed attempts', () {
    Future<void> failFiveTimes(WidgetTester tester) async {
      for (var i = 0; i < 5; i++) {
        await signIn(tester);
      }
    }

    testWidgets('the fifth failure shows the protection message', (
      tester,
    ) async {
      await openSignIn(tester);
      await failFiveTimes(tester);

      expect(find.text('Account temporarily protected'), findsOneWidget);
      expect(find.text('5 failed login attempts detected.'), findsOneWidget);
      expect(
        find.text('Your account has been temporarily protected.'),
        findsOneWidget,
      );
      expect(
        find.text("If this wasn't you, secure your account immediately."),
        findsOneWidget,
      );
      expect(find.textContaining('You can try again after'), findsOneWidget);
      // The form is replaced, so nothing more can be tried right now.
      expect(find.widgetWithText(FilledButton, 'Sign In'), findsNothing);
    });

    testWidgets('it generates an event, a notification and an e-mail', (
      tester,
    ) async {
      await openSignIn(tester);
      await failFiveTimes(tester);

      expect(find.text('Security Alert Sent'), findsOneWidget);
      final repo = containerOf(tester).read(securityRepositoryProvider);
      final events = await repo.getEvents();
      expect(
        events.where((e) => e.type == SecurityEventType.suspiciousLogin),
        hasLength(1),
      );
      expect(await repo.getSentAlerts(), hasLength(1));
      final notes = await containerOf(tester)
          .read(notificationRepositoryProvider)
          .getNotifications(category: NotificationCategory.security);
      expect(notes.items.single.body, '5 failed login attempts detected.');
    });

    testWidgets('the right password is refused while protected', (
      tester,
    ) async {
      await openSignIn(tester);
      await failFiveTimes(tester);

      // Leave the screen and come back: the server still protects the account.
      await tester.tap(find.byTooltip('Back'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Sign in with password'));
      await tester.pumpAndSettle();
      await signIn(tester, password: DemoCredentials.password);

      expect(find.text('Account temporarily protected'), findsOneWidget);
      expect(currentLocation(tester), Routes.signIn);
      // A second refusal does not repeat the "5 failed attempts" alert text.
      expect(find.text('5 failed login attempts detected.'), findsNothing);
    });

    testWidgets('protection ends by itself after the protection window', (
      tester,
    ) async {
      var now = DateTime(2026, 10, 9, 20, 40);
      await openSignIn(tester, clock: () => now);
      await failFiveTimes(tester);
      expect(find.text('Account temporarily protected'), findsOneWidget);

      now = now.add(const Duration(minutes: 15));
      await tester.tap(find.byTooltip('Back'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Sign in with password'));
      await tester.pumpAndSettle();
      await signIn(tester, password: DemoCredentials.password);
      expect(currentLocation(tester), Routes.reels);
    });

    testWidgets('Reset password leads to recovery', (tester) async {
      await openSignIn(tester);
      await failFiveTimes(tester);
      await tester.tap(find.text('Reset password'));
      await tester.pumpAndSettle();
      expect(currentLocation(tester), Routes.forgotPassword);
      expect(find.text('Reset password using Email'), findsOneWidget);
    });
  });

  group('forgot password', () {
    Future<void> openForgot(WidgetTester tester) async {
      await openSignIn(tester);
      await tester.tap(find.text('Forgot password?'));
      await tester.pumpAndSettle();
    }

    testWidgets('offers email and phone', (tester) async {
      await openForgot(tester);
      expect(find.text('Step 1 of 4'), findsOneWidget);
      expect(find.text('Reset password using Email'), findsOneWidget);
      expect(find.text('Reset password using Phone'), findsOneWidget);
    });

    testWidgets('EMAIL: code -> new password -> success -> sign in', (
      tester,
    ) async {
      await openForgot(tester);
      await tester.tap(find.text('Reset password using Email'));
      await tester.pumpAndSettle();

      // Destination step, with validation.
      expect(find.text('Step 2 of 4'), findsOneWidget);
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Send Verification Code'),
            )
            .onPressed,
        isNull,
      );
      await tester.enterText(field('Email address'), 'not-an-email');
      await tester.pump();
      await tester.tap(find.text('Send Verification Code'));
      await tester.pumpAndSettle();
      expect(find.text('Enter a valid email address.'), findsOneWidget);

      await tester.enterText(field('Email address'), 'aarav@blocks.example');
      await tester.pump();
      await tester.tap(find.text('Send Verification Code'));
      await tester.pumpAndSettle();

      // Code step.
      expect(find.text('Step 3 of 4'), findsOneWidget);
      expect(
        find.text('We sent a code to a***v@blocks.example.'),
        findsOneWidget,
      );
      expect(find.text('Demo OTP: 123456'), findsOneWidget);

      await tester.enterText(field('6-digit code'), '111111');
      await tester.pump();
      await tester.tap(find.text('Verify Code'));
      await tester.pumpAndSettle();
      expect(
        find.text("That code isn't right. 4 attempts left."),
        findsOneWidget,
      );

      await tester.tap(find.text('Demo OTP: 123456'));
      await tester.pump();
      await tester.tap(find.text('Verify Code'));
      await tester.pumpAndSettle();

      // New password step.
      expect(find.text('Step 4 of 4'), findsOneWidget);
      expect(find.text('Create a new password'), findsOneWidget);
      FilledButton save() => tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Reset Password'),
      );
      expect(save().onPressed, isNull);

      await tester.enterText(field('New password'), 'weak');
      await tester.enterText(field('Confirm new password'), 'weak');
      await tester.pump();
      expect(save().onPressed, isNull); // too weak

      await tester.enterText(field('New password'), 'Rivers@2026!');
      await tester.enterText(field('Confirm new password'), 'Rivers@2027!');
      await tester.pump();
      expect(find.text("Passwords don't match"), findsOneWidget);
      expect(save().onPressed, isNull);

      await tester.enterText(field('Confirm new password'), 'Rivers@2026!');
      await tester.pump();
      await tester.tap(find.widgetWithText(FilledButton, 'Reset Password'));
      await tester.pumpAndSettle();

      expect(find.text('Password Changed Successfully'), findsOneWidget);
      expect(
        find.text('You can now sign in with your new password.'),
        findsOneWidget,
      );

      // Back to sign in, and the new password works.
      await tester.tap(find.text('Back to sign in'));
      await tester.pumpAndSettle();
      expect(currentLocation(tester), Routes.signIn);
      await signIn(tester, password: 'Rivers@2026!');
      expect(currentLocation(tester), Routes.reels);
    });

    testWidgets('PHONE: OTP -> new password -> success', (tester) async {
      await openForgot(tester);
      await tester.tap(find.text('Reset password using Phone'));
      await tester.pumpAndSettle();

      expect(find.text('Send OTP'), findsOneWidget);
      await tester.enterText(field('Phone number'), '12345');
      await tester.pump();
      await tester.tap(find.text('Send OTP'));
      await tester.pumpAndSettle();
      expect(
        find.text('Enter a valid 10-digit mobile number.'),
        findsOneWidget,
      );

      await tester.enterText(field('Phone number'), '98765 43210');
      await tester.pump();
      await tester.tap(find.text('Send OTP'));
      await tester.pumpAndSettle();

      expect(find.text('We sent a code to +91 *******210.'), findsOneWidget);
      await tester.tap(find.text('Demo OTP: 123456'));
      await tester.pump();
      await tester.tap(find.text('Verify Code'));
      await tester.pumpAndSettle();

      await tester.enterText(field('New password'), 'Rivers@2026!');
      await tester.enterText(field('Confirm new password'), 'Rivers@2026!');
      await tester.pump();
      await tester.tap(find.widgetWithText(FilledButton, 'Reset Password'));
      await tester.pumpAndSettle();
      expect(find.text('Password Changed Successfully'), findsOneWidget);
    });

    testWidgets('back steps through the wizard', (tester) async {
      await openForgot(tester);
      await tester.tap(find.text('Reset password using Email'));
      await tester.pumpAndSettle();
      expect(find.text('Step 2 of 4'), findsOneWidget);

      await tester.tap(find.byTooltip('Back'));
      await tester.pumpAndSettle();
      expect(find.text('Step 1 of 4'), findsOneWidget);
      expect(currentLocation(tester), Routes.forgotPassword);

      await tester.tap(find.byTooltip('Back'));
      await tester.pumpAndSettle();
      expect(currentLocation(tester), Routes.signIn);
    });

    testWidgets('resend counts down, then sends a fresh code', (tester) async {
      // The server enforces the cool-down with ITS clock, so the test drives
      // that clock together with the on-screen countdown.
      var now = DateTime(2026, 10, 9, 20, 40);
      await openSignIn(tester, clock: () => now);
      await tester.tap(find.text('Forgot password?'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Reset password using Email'));
      await tester.pumpAndSettle();
      await tester.enterText(field('Email address'), 'aarav@blocks.example');
      await tester.pump();
      await tester.tap(find.text('Send Verification Code'));
      // Plain pumps: pumpAndSettle would run the whole 30 s countdown.
      await tester.pump();
      await tester.pump();

      expect(find.text('Resend in 30s'), findsOneWidget);
      expect(
        tester
            .widget<TextButton>(
              find.widgetWithText(TextButton, 'Resend in 30s'),
            )
            .onPressed,
        isNull,
      );

      now = now.add(const Duration(seconds: 12));
      await tester.pump(const Duration(seconds: 12));
      expect(find.text('Resend in 18s'), findsOneWidget);

      now = now.add(const Duration(seconds: 20));
      await tester.pump(const Duration(seconds: 20));
      expect(find.text('Resend code'), findsOneWidget);

      await tester.tap(find.text('Resend code'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.text('A new code was sent'), findsOneWidget);
      expect(find.text('Resend in 30s'), findsOneWidget);
    });

    testWidgets('too many wrong codes lock the step', (tester) async {
      await openForgot(tester);
      await tester.tap(find.text('Reset password using Email'));
      await tester.pumpAndSettle();
      await tester.enterText(field('Email address'), 'aarav@blocks.example');
      await tester.pump();
      await tester.tap(find.text('Send Verification Code'));
      await tester.pumpAndSettle(const Duration(seconds: 1));

      for (var i = 0; i < 5; i++) {
        await tester.enterText(field('6-digit code'), '000000');
        await tester.pump();
        await tester.tap(find.text('Verify Code'));
        await tester.pumpAndSettle(const Duration(seconds: 1));
        if (i < 4) {
          expect(find.textContaining('attempts left'), findsOneWidget);
        }
      }
      expect(find.textContaining('Too many wrong codes'), findsOneWidget);
      // No code field or verify button any more.
      expect(find.text('Verify Code'), findsNothing);
    });
  });

  group('change email / phone', () {
    Future<void> openEmail(WidgetTester tester) async {
      await openSignedInApp(tester);
      await pushRoute(tester, Routes.changeEmail);
    }

    testWidgets('shows the current (masked) address and needs a password', (
      tester,
    ) async {
      await openEmail(tester);
      expect(find.text('Current email'), findsOneWidget);
      expect(find.text('a***v@blocks.example'), findsOneWidget);

      await tester.enterText(
        field('New email address'),
        'new.address@example.com',
      );
      await tester.enterText(field('Password'), 'wrong password');
      await tester.pump();
      await tester.tap(find.text('Send Verification Code'));
      await tester.pumpAndSettle();
      expect(find.text("That password isn't right."), findsOneWidget);
    });

    testWidgets('rejects an invalid or unchanged address', (tester) async {
      await openEmail(tester);
      await tester.enterText(field('Password'), DemoCredentials.password);

      await tester.enterText(field('New email address'), 'nope');
      await tester.pump();
      await tester.tap(find.text('Send Verification Code'));
      await tester.pumpAndSettle();
      expect(find.text('Enter a valid email address.'), findsOneWidget);

      await tester.enterText(field('New email address'), DemoCredentials.email);
      await tester.pump();
      await tester.tap(find.text('Send Verification Code'));
      await tester.pumpAndSettle();
      expect(find.text('That is already your current email.'), findsOneWidget);
    });

    testWidgets('EMAIL: verify -> confirm -> updated everywhere', (
      tester,
    ) async {
      await openEmail(tester);
      await tester.enterText(
        field('New email address'),
        'new.address@example.com',
      );
      await tester.enterText(field('Password'), DemoCredentials.password);
      await tester.pump();
      await tester.tap(find.text('Send Verification Code'));
      await tester.pumpAndSettle();

      // The code goes to the NEW address.
      expect(find.text('We sent a code to n***s@example.com.'), findsOneWidget);
      await tester.tap(find.text('Demo OTP: 123456'));
      await tester.pump();
      await tester.tap(find.text('Verify Code'));
      await tester.pumpAndSettle();

      // Nothing has changed yet: an explicit confirmation is required.
      expect(find.text('Confirm the change'), findsOneWidget);
      expect(
        find.text('Your BLOCKS email will change to new.address@example.com.'),
        findsOneWidget,
      );
      final before = await containerOf(tester)
          .read(securityRepositoryProvider)
          .getContacts();
      expect(before.maskedEmail, 'a***v@blocks.example');

      await tester.tap(find.text('Confirm'));
      await tester.pumpAndSettle();
      expect(find.text('Email Updated'), findsOneWidget);

      final repo = containerOf(tester).read(securityRepositoryProvider);
      expect((await repo.getContacts()).maskedEmail, 'n***s@example.com');
      // The previous address was alerted.
      final mail = (await repo.getSentAlerts()).first;
      expect(mail.type, SecurityEventType.emailChanged);
      expect(mail.maskedTo, 'a***v@blocks.example');
    });

    testWidgets('PHONE: verify -> confirm -> updated', (tester) async {
      await openSignedInApp(tester);
      await pushRoute(tester, Routes.changePhone);
      expect(find.text('Current phone number'), findsOneWidget);
      expect(find.text('+91 *******210'), findsOneWidget);

      await tester.enterText(field('New phone number'), '91234 56789');
      await tester.enterText(field('Password'), DemoCredentials.password);
      await tester.pump();
      await tester.tap(find.text('Send Verification Code'));
      await tester.pumpAndSettle();
      expect(find.text('We sent a code to +91 *******789.'), findsOneWidget);

      await tester.tap(find.text('Demo OTP: 123456'));
      await tester.pump();
      await tester.tap(find.text('Verify Code'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Confirm'));
      await tester.pumpAndSettle();

      expect(find.text('Phone Number Updated'), findsOneWidget);
      final repo = containerOf(tester).read(securityRepositoryProvider);
      expect((await repo.getContacts()).maskedPhone, '+91 *******789');
    });

    testWidgets('the hub shows the new masked address afterwards', (
      tester,
    ) async {
      await openEmail(tester);
      await tester.enterText(
        field('New email address'),
        'new.address@example.com',
      );
      await tester.enterText(field('Password'), DemoCredentials.password);
      await tester.pump();
      await tester.tap(find.text('Send Verification Code'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Demo OTP: 123456'));
      await tester.pump();
      await tester.tap(find.text('Verify Code'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Confirm'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();

      await pushRoute(tester, Routes.security);
      expect(find.text('n***s@example.com'), findsOneWidget);
    });
  });

  group('in-app password reset', () {
    testWidgets('finishes with a confirmation and a Done button', (
      tester,
    ) async {
      await openSignedInApp(tester);
      await pushRoute(tester, Routes.resetPassword);

      await tester.tap(find.text('Reset password using Phone'));
      await tester.pumpAndSettle();
      await tester.enterText(field('Phone number'), '9876543210');
      await tester.pump();
      await tester.tap(find.text('Send OTP'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Demo OTP: 123456'));
      await tester.pump();
      await tester.tap(find.text('Verify Code'));
      await tester.pumpAndSettle();
      await tester.enterText(field('New password'), 'Rivers@2026!');
      await tester.enterText(field('Confirm new password'), 'Rivers@2026!');
      await tester.pump();
      await tester.tap(find.widgetWithText(FilledButton, 'Reset Password'));
      await tester.pumpAndSettle();

      expect(find.text('Password Changed Successfully'), findsOneWidget);
      expect(
        find.text(
          'Your password is updated and your other devices were signed out for your safety.',
        ),
        findsOneWidget,
      );
      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();
      expect(currentLocation(tester), isNot(Routes.resetPassword));
    });
  });

  group('security demo lab', () {
    testWidgets('lists scenarios A to H with live server status', (
      tester,
    ) async {
      await openSignedInApp(tester);
      await pushRoute(tester, Routes.securityDemo);

      expect(find.text('Failed sign-ins: 0 of 5'), findsOneWidget);
      expect(find.text('Sign-in is not restricted'), findsOneWidget);
      for (final t in [
        'Normal login',
        'Wrong password',
        'Maximum failed attempts',
        'Suspicious login notification',
        'Password changed',
        'New device login',
        'Session revoked',
        'Photo upload fails',
      ]) {
        await scrollTo(tester, find.text(t));
        expect(find.text(t), findsOneWidget, reason: t);
      }
    });

    testWidgets('running the max-attempts scenario raises the alert', (
      tester,
    ) async {
      await openSignedInApp(tester);
      await pushRoute(tester, Routes.securityDemo);

      await scrollTo(tester, find.text('Maximum failed attempts'));
      final run = find.descendant(
        of: find
            .ancestor(
              of: find.text('Maximum failed attempts'),
              matching: find.byType(Row),
            )
            .first,
        matching: find.text('Run'),
      );
      await tester.tap(run.first);
      await tester.pumpAndSettle();

      // The confirmation is a sheet, so it is seen wherever the list is.
      expect(find.text('Security Alert Sent'), findsOneWidget);
      expect(
        find.text(
          "We've sent a security notification to your registered email and active BLOCKS devices.",
        ),
        findsOneWidget,
      );
      final status = await containerOf(tester)
          .read(securityDemoServiceProvider)
          .status();
      expect(status.protectedUntil, isNotNull);
      expect(status.emailsSent, 1);

      await tester.tap(find.text('Open the alert'));
      await tester.pumpAndSettle();
      expect(find.text('Suspicious Login Attempt'), findsOneWidget);
    });

    testWidgets('reset restores the server and the status card', (
      tester,
    ) async {
      await openSignedInApp(tester);
      await pushRoute(tester, Routes.securityDemo);
      await scrollTo(tester, find.text('Wrong password'));
      await tester.tap(
        find
            .descendant(
              of: find
                  .ancestor(
                    of: find.text('Wrong password'),
                    matching: find.byType(Row),
                  )
                  .first,
              matching: find.text('Run'),
            )
            .first,
      );
      await tester.pumpAndSettle();
      await scrollToTop(tester);
      expect(find.text('Failed sign-ins: 1 of 5'), findsOneWidget);

      await tapText(tester, 'Reset demo data');
      expect(find.text('Demo security data reset'), findsOneWidget);
      await scrollToTop(tester);
      expect(find.text('Failed sign-ins: 0 of 5'), findsOneWidget);
    });

    testWidgets('"sign out and try the sign-in screen" opens real sign-in', (
      tester,
    ) async {
      await openSignedInApp(tester);
      await pushRoute(tester, Routes.securityDemo);
      await tapText(tester, 'Sign out and try the sign-in screen');
      expect(currentLocation(tester), Routes.signIn);
    });
  });
}
