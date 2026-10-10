import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/core/services/local_store.dart';
import 'package:blocks_app/data/mock/demo_credentials.dart';
import 'package:blocks_app/data/mock/mock_account_repositories.dart';
import 'package:blocks_app/data/mock/mock_security_repositories.dart';
import 'package:blocks_app/data/mock/mock_world.dart';
import 'package:blocks_app/data/models/content_models.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/data/services/security_demo_service.dart';
import 'package:flutter_test/flutter_test.dart';

/// A mock server with a clock the test controls.
class _Server {
  _Server() {
    world = MockWorld(clock: () => now);
    auth = MockAuthRepository(InMemoryLocalStore(), world);
    security = MockSecurityRepository(world);
    sessions = MockSessionRepository(world);
    password = MockPasswordRepository(world);
    reset = MockPasswordResetRepository(world);
    demo = MockSecurityDemoService(world);
    notifications = MockNotificationRepository(world);
  }

  DateTime now = DateTime(2026, 10, 8, 20, 40);
  late final MockWorld world;
  late final MockAuthRepository auth;
  late final MockSecurityRepository security;
  late final MockSessionRepository sessions;
  late final MockPasswordRepository password;
  late final MockPasswordResetRepository reset;
  late final MockSecurityDemoService demo;
  late final MockNotificationRepository notifications;

  void advance(Duration d) => now = now.add(d);

  Future<LoginResult> signIn([String pw = 'wrong']) =>
      auth.signInWithPassword(identifier: DemoCredentials.email, password: pw);

  Future<List<SecurityEvent>> events([
    SecurityEventFilter f = SecurityEventFilter.all,
  ]) => security.getEvents(filter: f);

  Future<List<AppNotification>> securityNotes() async {
    final page = await notifications.getNotifications(
      category: NotificationCategory.security,
      limit: 50,
    );
    return page.items;
  }
}

Matcher _failure(String message) =>
    isA<ValidationFailure>().having((f) => f.message, 'message', message);

void main() {
  late _Server s;
  setUp(() => s = _Server());

  group('password sign-in', () {
    test('correct credentials sign in and are logged', () async {
      final r = await s.signIn(DemoCredentials.password);
      expect(r, isA<LoginSucceeded>());
      expect(s.auth.isSignedIn, isTrue);
      final e = (await s.events()).first;
      expect(e.type, SecurityEventType.loginSuccess);
      expect(e.status, SecurityEventStatus.success);
    });

    test('accepts e-mail, username (with or without @) and phone', () async {
      for (final id in [
        DemoCredentials.email,
        'AARAV@blocks.example',
        'aarav.blocks',
        '@aarav.blocks',
        '98765 43210',
        '+91 98765 43210',
      ]) {
        final r = await MockAuthRepository(InMemoryLocalStore(), s.world)
            .signInWithPassword(
              identifier: id,
              password: DemoCredentials.password,
            );
        expect(r, isA<LoginSucceeded>(), reason: id);
      }
    });

    test(
      'a wrong password or unknown account is rejected the same way',
      () async {
        final wrong = await s.auth.signInWithPassword(
          identifier: DemoCredentials.email,
          password: 'nope',
        );
        final unknown = await s.auth.signInWithPassword(
          identifier: 'someone.else@example.com',
          password: DemoCredentials.password,
        );
        expect(wrong, isA<LoginRejected>());
        expect(unknown, isA<LoginRejected>());
        expect(s.auth.isSignedIn, isFalse);
      },
    );

    test('the server counts the attempts and reports what is left', () async {
      for (var left = 4; left >= 1; left--) {
        final r = await s.signIn() as LoginRejected;
        expect(r.attemptsRemaining, left);
      }
    });

    test(
      'the maximum number of failures triggers temporary protection',
      () async {
        for (var i = 0; i < 4; i++) {
          await s.signIn();
        }
        final fifth = await s.signIn();
        expect(fifth, isA<LoginProtected>());
        expect((fifth as LoginProtected).justTriggered, isTrue);
        expect(fifth.retryAt, s.now.add(const Duration(minutes: 15)));

        // The five failures and the alert are all on the timeline...
        final all = await s.events();
        // (The seed already holds one older failure from an unknown device.)
        expect(
          all.where(
            (e) =>
                e.type == SecurityEventType.loginFailed &&
                e.deviceName == 'This device',
          ),
          hasLength(5),
        );
        final alert = all.firstWhere(
          (e) => e.type == SecurityEventType.suspiciousLogin,
        );
        expect(alert.attempts, 5);
        expect(alert.status, SecurityEventStatus.suspicious);

        // ...a security notification was raised...
        final notes = await s.securityNotes();
        expect(notes, hasLength(1));
        expect(notes.first.title, 'Security Alert');
        expect(notes.first.body, '5 failed login attempts detected.');
        expect(notes.first.isRead, isFalse);

        // ...and an e-mail went out to the registered address.
        final mails = await s.security.getSentAlerts();
        expect(mails, hasLength(1));
        expect(mails.first.type, SecurityEventType.suspiciousLogin);
        expect(mails.first.maskedTo, 'a***v@blocks.example');
      },
    );

    test('while protected even the right password is refused', () async {
      for (var i = 0; i < 5; i++) {
        await s.signIn();
      }
      final r = await s.signIn(DemoCredentials.password);
      expect(r, isA<LoginProtected>());
      expect((r as LoginProtected).justTriggered, isFalse);
      expect(s.auth.isSignedIn, isFalse);
      // Refusing again must not spam alerts.
      expect(await s.security.getSentAlerts(), hasLength(1));
    });

    test('protection is temporary: it ends by itself', () async {
      for (var i = 0; i < 5; i++) {
        await s.signIn();
      }
      s.advance(const Duration(minutes: 15));
      expect(await s.signIn(DemoCredentials.password), isA<LoginSucceeded>());
    });

    test('a success clears earlier failures', () async {
      await s.signIn();
      await s.signIn();
      await s.signIn(DemoCredentials.password);
      expect(((await s.signIn()) as LoginRejected).attemptsRemaining, 4);
    });

    test('the limit comes from the server policy', () async {
      expect((await s.security.getPolicy()).maxFailedAttempts, 5);
    });
  });

  group('timeline', () {
    test('seeded activity: success, failure, older sign-ins', () async {
      final all = await s.events();
      expect(all.first.type, SecurityEventType.loginSuccess);
      expect(all[1].type, SecurityEventType.loginFailed);
      expect(all[1].deviceName, 'Unknown device');
      // Newest first.
      for (var i = 1; i < all.length; i++) {
        expect(
          all[i - 1].timestamp.isAfter(all[i].timestamp) ||
              all[i - 1].timestamp == all[i].timestamp,
          isTrue,
        );
      }
    });

    test('filters: successful, failed, suspicious', () async {
      await s.demo.run(DemoScenario.suspiciousLogin);
      final ok = await s.events(SecurityEventFilter.successful);
      final bad = await s.events(SecurityEventFilter.failed);
      final sus = await s.events(SecurityEventFilter.suspicious);
      expect(ok, isNotEmpty);
      expect(ok.every((e) => e.status == SecurityEventStatus.success), isTrue);
      expect(bad.every((e) => e.type == SecurityEventType.loginFailed), isTrue);
      expect(sus, hasLength(1));
      expect(
        (await s.events()).length,
        greaterThanOrEqualTo(ok.length + bad.length + sus.length),
      );
    });

    test('"This was me" marks an alert acknowledged', () async {
      final r = await s.demo.run(DemoScenario.suspiciousLogin);
      expect((await s.security.getEvent(r.eventId!)).acknowledged, isFalse);
      await s.security.acknowledgeEvent(r.eventId!);
      expect((await s.security.getEvent(r.eventId!)).acknowledged, isTrue);
    });

    test('unknown event ids are a NotFoundFailure', () async {
      await expectLater(
        s.security.getEvent('nope'),
        throwsA(isA<NotFoundFailure>()),
      );
      await expectLater(
        s.security.acknowledgeEvent('nope'),
        throwsA(isA<NotFoundFailure>()),
      );
    });
  });

  group('change password', () {
    test('rejects a wrong current password', () async {
      await expectLater(
        s.password.changePassword(
          currentPassword: 'wrong',
          newPassword: 'Rivers@2026!',
        ),
        throwsA(_failure('wrongCurrentPassword')),
      );
    });

    test('rejects a weak or unchanged new password', () async {
      await expectLater(
        s.password.changePassword(
          currentPassword: DemoCredentials.password,
          newPassword: 'short',
        ),
        throwsA(_failure('weakPassword')),
      );
      await expectLater(
        s.password.changePassword(
          currentPassword: DemoCredentials.password,
          newPassword: DemoCredentials.password,
        ),
        throwsA(_failure('samePassword')),
      );
    });

    test(
      'success: new password works, old one does not, alerts go out',
      () async {
        await s.password.changePassword(
          currentPassword: DemoCredentials.password,
          newPassword: 'Rivers@2026!',
        );

        expect(await s.signIn(DemoCredentials.password), isA<LoginRejected>());
        expect(await s.signIn('Rivers@2026!'), isA<LoginSucceeded>());

        final e = (await s.events()).firstWhere(
          (e) => e.type == SecurityEventType.passwordChanged,
        );
        expect(e.status, SecurityEventStatus.success);
        final notes = await s.securityNotes();
        expect(notes.any((n) => n.title == 'Password Changed'), isTrue);
        expect(
          (await s.security.getSentAlerts()).any(
            (m) => m.type == SecurityEventType.passwordChanged,
          ),
          isTrue,
        );
      },
    );
  });

  group('one-time codes', () {
    Future<OtpChallenge> start() => s.reset.startReset(
      channel: OtpChannel.email,
      destination: 'aarav@blocks.example',
    );

    test('validates the destination format', () async {
      await expectLater(
        s.reset.startReset(channel: OtpChannel.email, destination: 'nope'),
        throwsA(_failure('invalidEmail')),
      );
      await expectLater(
        s.reset.startReset(channel: OtpChannel.phone, destination: '12345'),
        throwsA(_failure('invalidPhone')),
      );
    });

    test('the challenge only shows a masked destination', () async {
      final c = await start();
      expect(c.maskedDestination, 'a***v@blocks.example');
      expect(c.length, 6);
      expect(c.expiresAt, s.now.add(const Duration(minutes: 5)));
      final p = await s.reset.startReset(
        channel: OtpChannel.phone,
        destination: '98765 43210',
      );
      expect(p.maskedDestination, '+91 *******210');
    });

    test(
      'a wrong code reports attempts left; the right code verifies',
      () async {
        final c = await start();
        final wrong = await s.reset.verifyCode(
          challengeId: c.id,
          code: '000000',
        );
        expect((wrong as OtpIncorrect).attemptsRemaining, 4);
        final ok = await s.reset.verifyCode(
          challengeId: c.id,
          code: DemoCredentials.otp,
        );
        expect(ok, isA<OtpVerified>());
      },
    );

    test('too many wrong codes lock the destination', () async {
      final c = await start();
      OtpResult last = const OtpExpired();
      for (var i = 0; i < 5; i++) {
        last = await s.reset.verifyCode(challengeId: c.id, code: '111111');
      }
      expect(last, isA<OtpLocked>());
      // Even the right code is refused now...
      expect(
        await s.reset.verifyCode(challengeId: c.id, code: DemoCredentials.otp),
        isA<OtpLocked>(),
      );
      // ...and a fresh request for the same address is blocked too.
      await expectLater(start(), throwsA(_failure('tooManyAttempts')));
      // The lock is temporary.
      s.advance(const Duration(minutes: 5));
      expect(await start(), isA<OtpChallenge>());
    });

    test('codes expire', () async {
      final c = await start();
      s.advance(const Duration(minutes: 5));
      expect(
        await s.reset.verifyCode(challengeId: c.id, code: DemoCredentials.otp),
        isA<OtpExpired>(),
      );
    });

    test('resend is rate limited, then refreshes the expiry', () async {
      final c = await start();
      await expectLater(
        s.reset.resendCode(c.id),
        throwsA(_failure('resendTooSoon')),
      );
      s.advance(const Duration(seconds: 30));
      final again = await s.reset.resendCode(c.id);
      expect(again.id, c.id);
      expect(again.expiresAt, s.now.add(const Duration(minutes: 5)));
      expect(again.resendAvailableAt, s.now.add(const Duration(seconds: 30)));
    });

    test('unknown challenge ids are a NotFoundFailure', () async {
      await expectLater(
        s.reset.verifyCode(challengeId: 'otp~x', code: DemoCredentials.otp),
        throwsA(isA<NotFoundFailure>()),
      );
    });
  });

  group('forgot / reset password', () {
    Future<String> verifiedToken({OtpChannel ch = OtpChannel.email}) async {
      final c = await s.reset.startReset(
        channel: ch,
        destination: ch == OtpChannel.email
            ? 'aarav@blocks.example'
            : '9876543210',
      );
      final r = await s.reset.verifyCode(
        challengeId: c.id,
        code: DemoCredentials.otp,
      );
      return (r as OtpVerified).token;
    }

    for (final ch in [OtpChannel.email, OtpChannel.phone]) {
      test('${ch.name}: code -> new password -> can sign in', () async {
        final token = await verifiedToken(ch: ch);
        await s.reset.completeReset(token: token, newPassword: 'Rivers@2026!');
        expect(await s.signIn('Rivers@2026!'), isA<LoginSucceeded>());
        expect(
          (await s.events()).any(
            (e) => e.type == SecurityEventType.passwordChanged,
          ),
          isTrue,
        );
      });
    }

    test('the new password must meet the policy', () async {
      final token = await verifiedToken();
      await expectLater(
        s.reset.completeReset(token: token, newPassword: 'weak'),
        throwsA(_failure('weakPassword')),
      );
    });

    test('the verification token works once, only for resets', () async {
      final token = await verifiedToken();
      await s.reset.completeReset(token: token, newPassword: 'Rivers@2026!');
      await expectLater(
        s.reset.completeReset(token: token, newPassword: 'Another@2026!'),
        throwsA(isA<UnauthorizedFailure>()),
      );
      await expectLater(
        s.reset.completeReset(token: 'forged', newPassword: 'Another@2026!'),
        throwsA(isA<UnauthorizedFailure>()),
      );
    });

    test('a password reset lifts temporary protection', () async {
      for (var i = 0; i < 5; i++) {
        await s.signIn();
      }
      expect(await s.signIn(DemoCredentials.password), isA<LoginProtected>());

      final token = await verifiedToken();
      await s.reset.completeReset(token: token, newPassword: 'Rivers@2026!');
      expect(await s.signIn('Rivers@2026!'), isA<LoginSucceeded>());
    });

    test('a reset signs out every other device', () async {
      expect((await s.sessions.getSessions()).length, 4);
      final token = await verifiedToken();
      await s.reset.completeReset(token: token, newPassword: 'Rivers@2026!');
      final left = await s.sessions.getSessions();
      expect(left, hasLength(1));
      expect(left.single.isCurrent, isTrue);
    });
  });

  group('change e-mail / phone', () {
    Future<OtpChallenge> startEmail([
      String value = 'new.address@example.com',
      String pw = DemoCredentials.password,
    ]) => s.security.startContactChange(
      channel: OtpChannel.email,
      newValue: value,
      currentPassword: pw,
    );

    test('requires the current password', () async {
      await expectLater(
        startEmail('new.address@example.com', 'wrong'),
        throwsA(_failure('wrongPassword')),
      );
    });

    test('validates the new value and refuses the same one', () async {
      await expectLater(startEmail('nope'), throwsA(_failure('invalidEmail')));
      await expectLater(
        startEmail('AARAV@blocks.example'),
        throwsA(_failure('sameValue')),
      );
      await expectLater(
        s.security.startContactChange(
          channel: OtpChannel.phone,
          newValue: '12345',
          currentPassword: DemoCredentials.password,
        ),
        throwsA(_failure('invalidPhone')),
      );
      await expectLater(
        s.security.startContactChange(
          channel: OtpChannel.phone,
          newValue: '+91 98765 43210',
          currentPassword: DemoCredentials.password,
        ),
        throwsA(_failure('sameValue')),
      );
    });

    test('nothing changes until the code is verified and confirmed', () async {
      final c = await startEmail();
      expect(c.maskedDestination, 'n***s@example.com'); // the NEW address
      expect(
        (await s.security.getContacts()).maskedEmail,
        'a***v@blocks.example',
      );

      await s.security.verifyContactChange(challengeId: c.id, code: '000000');
      expect(
        (await s.security.getContacts()).maskedEmail,
        'a***v@blocks.example',
      );
    });

    test('e-mail: verify -> confirm -> updated, old address alerted', () async {
      final c = await startEmail();
      final v = await s.security.verifyContactChange(
        challengeId: c.id,
        code: DemoCredentials.otp,
      );
      final contacts = await s.security.confirmContactChange(
        token: (v as OtpVerified).token,
      );
      expect(contacts.maskedEmail, 'n***s@example.com');

      final mail = (await s.security.getSentAlerts()).firstWhere(
        (m) => m.type == SecurityEventType.emailChanged,
      );
      expect(mail.maskedTo, 'a***v@blocks.example'); // the previous address
      expect(
        (await s.securityNotes()).any((n) => n.title == 'Email Changed'),
        isTrue,
      );
    });

    test('phone: verify -> confirm -> updated', () async {
      final c = await s.security.startContactChange(
        channel: OtpChannel.phone,
        newValue: '9123456789',
        currentPassword: DemoCredentials.password,
      );
      final v = await s.security.verifyContactChange(
        challengeId: c.id,
        code: DemoCredentials.otp,
      );
      final contacts = await s.security.confirmContactChange(
        token: (v as OtpVerified).token,
      );
      expect(contacts.maskedPhone, '+91 *******789');
      expect(
        (await s.events()).any((e) => e.type == SecurityEventType.phoneChanged),
        isTrue,
      );
    });

    test('a verification token cannot be reused or forged', () async {
      final c = await startEmail();
      final v = await s.security.verifyContactChange(
        challengeId: c.id,
        code: DemoCredentials.otp,
      );
      final token = (v as OtpVerified).token;
      await s.security.confirmContactChange(token: token);
      await expectLater(
        s.security.confirmContactChange(token: token),
        throwsA(isA<UnauthorizedFailure>()),
      );
      await expectLater(
        s.security.confirmContactChange(token: 'forged'),
        throwsA(isA<UnauthorizedFailure>()),
      );
    });

    test('a reset token cannot confirm a contact change', () async {
      final r = await s.reset.startReset(
        channel: OtpChannel.email,
        destination: 'aarav@blocks.example',
      );
      final v = await s.reset.verifyCode(
        challengeId: r.id,
        code: DemoCredentials.otp,
      );
      await expectLater(
        s.security.confirmContactChange(token: (v as OtpVerified).token),
        throwsA(isA<UnauthorizedFailure>()),
      );
    });
  });

  group('two-factor authentication', () {
    test('starts enabled (the demo user has 2FA on)', () async {
      expect((await s.security.getTwoFactor()).enabled, isTrue);
      expect(s.world.me.isTwoFactorEnabled, isTrue);
    });

    test('turning it off needs the password and updates the profile', () async {
      await expectLater(
        s.security.disableTwoFactor(currentPassword: 'wrong'),
        throwsA(_failure('wrongPassword')),
      );
      final t = await s.security.disableTwoFactor(
        currentPassword: DemoCredentials.password,
      );
      expect(t.enabled, isFalse);
      // Live eligibility reads this flag, so it must follow.
      expect(s.world.me.isTwoFactorEnabled, isFalse);
      expect(
        (await s.events()).first.type,
        SecurityEventType.twoFactorDisabled,
      );
    });

    test('enabling verifies a code for the chosen method', () async {
      await s.security.disableTwoFactor(
        currentPassword: DemoCredentials.password,
      );

      final c = await s.security.startTwoFactorSetup(
        TwoFactorMethod.authenticatorApp,
      );
      expect(c.channel, OtpChannel.authenticator);
      expect(
        await s.security.confirmTwoFactorSetup(
          challengeId: c.id,
          code: '999999',
        ),
        isA<OtpIncorrect>(),
      );
      expect((await s.security.getTwoFactor()).enabled, isFalse);

      final r = await s.security.confirmTwoFactorSetup(
        challengeId: c.id,
        code: DemoCredentials.otp,
      );
      expect(r, isA<OtpVerified>());
      final t = await s.security.getTwoFactor();
      expect(t.enabled, isTrue);
      expect(t.method, TwoFactorMethod.authenticatorApp);
      expect(s.world.me.isTwoFactorEnabled, isTrue);
    });

    test('SMS setup sends the code to the phone', () async {
      final c = await s.security.startTwoFactorSetup(TwoFactorMethod.sms);
      expect(c.channel, OtpChannel.phone);
      expect(c.maskedDestination, '+91 *******210');
    });

    test('e-mail fallback can be switched', () async {
      expect(
        (await s.security.setEmailFallback(enabled: false)).emailFallback,
        isFalse,
      );
      expect((await s.security.getTwoFactor()).emailFallback, isFalse);
    });
  });

  group('devices', () {
    test('current device first, then by recent activity', () async {
      final list = await s.sessions.getSessions();
      expect(list.first.isCurrent, isTrue);
      for (var i = 2; i < list.length; i++) {
        expect(list[i - 1].lastActive.isAfter(list[i].lastActive), isTrue);
      }
    });

    test('logging out one device removes it and records it', () async {
      final other = (await s.sessions.getSessions()).last;
      await s.sessions.revokeSession(other.id);

      expect(
        (await s.sessions.getSessions()).any((x) => x.id == other.id),
        isFalse,
      );
      final e = (await s.events()).first;
      expect(e.type, SecurityEventType.sessionRevoked);
      expect(e.deviceName, other.deviceName);
      expect(
        (await s.securityNotes()).any((n) => n.title == 'Device Removed'),
        isTrue,
      );
    });

    test('the current device cannot be logged out from this list', () async {
      await expectLater(
        s.sessions.revokeSession('sess~current'),
        throwsA(_failure('currentSession')),
      );
      await expectLater(
        s.sessions.revokeSession('sess~nope'),
        throwsA(isA<NotFoundFailure>()),
      );
    });

    test('log out all other devices leaves only this one', () async {
      await s.sessions.revokeAllOtherSessions();
      final list = await s.sessions.getSessions();
      expect(list, hasLength(1));
      expect(list.single.isCurrent, isTrue);

      // Doing it again is a harmless no-op and records nothing new.
      final before = (await s.events()).length;
      await s.sessions.revokeAllOtherSessions();
      expect((await s.events()).length, before);
    });
  });

  group('alert preferences', () {
    test('new-device alerts can be switched off', () async {
      await s.security.setAlertPreferences(
        const SecurityAlertPreferences(newDeviceAlerts: false),
      );
      await s.demo.run(DemoScenario.newDeviceLogin);
      expect(await s.securityNotes(), isEmpty);
      // The event is still on the timeline.
      expect((await s.events()).first.type, SecurityEventType.loginSuccess);
    });

    test('e-mail copies are optional; critical e-mails are not', () async {
      await s.security.setAlertPreferences(
        const SecurityAlertPreferences(emailCopies: false, pushAlerts: false),
      );
      await s.demo.run(DemoScenario.sessionRevoked); // optional
      expect(await s.security.getSentAlerts(), isEmpty);
      expect(await s.securityNotes(), isEmpty);

      await s.demo.run(DemoScenario.suspiciousLogin); // critical
      expect(await s.security.getSentAlerts(), hasLength(1));
      expect(await s.securityNotes(), hasLength(1));
    });

    test('with defaults an optional event sends a copy', () async {
      await s.demo.run(DemoScenario.sessionRevoked);
      expect(await s.security.getSentAlerts(), hasLength(1));
    });
  });

  group('notification centre', () {
    test('security alerts lead the feed and drive the unread badge', () async {
      final before = await s.notifications.getUnreadCount();
      await s.demo.run(DemoScenario.suspiciousLogin);
      expect(await s.notifications.getUnreadCount(), before + 1);

      final first = (await s.notifications.getNotifications()).items.first;
      expect(first.category, NotificationCategory.security);
      expect(first.isRead, isFalse);
    });

    test('they can be marked read individually and all at once', () async {
      await s.demo.run(DemoScenario.suspiciousLogin);
      await s.demo.run(DemoScenario.passwordChanged);
      final notes = await s.securityNotes();
      expect(notes, hasLength(2));

      await s.notifications.markRead(notes.first.id);
      expect((await s.securityNotes()).first.isRead, isTrue);
      expect((await s.securityNotes()).last.isRead, isFalse);

      await s.notifications.markAllRead();
      expect((await s.securityNotes()).every((n) => n.isRead), isTrue);
    });

    test('paging still walks the whole feed without duplicates', () async {
      await s.demo.run(DemoScenario.suspiciousLogin);
      final ids = <String>{};
      String? cursor;
      var pages = 0;
      do {
        final page = await s.notifications.getNotifications(
          cursor: cursor,
          limit: 20,
        );
        for (final n in page.items) {
          expect(ids.add(n.id), isTrue, reason: 'duplicate ${n.id}');
        }
        cursor = page.nextCursor;
        pages++;
      } while (cursor != null && pages < 20);
      expect(ids.length, greaterThan(80));
    });

    test('security notifications point at the right screen', () async {
      await s.demo.run(DemoScenario.suspiciousLogin);
      await s.demo.run(DemoScenario.sessionRevoked);
      final notes = await s.securityNotes();
      expect(notes.any((n) => n.targetId!.startsWith('alert:sec~')), isTrue);
      expect(notes.any((n) => n.targetId == 'devices'), isTrue);
    });
  });

  group('demo scenarios', () {
    test('A normal login: a success, no alert', () async {
      final r = await s.demo.run(DemoScenario.normalLogin);
      expect(r.alertRaised, isFalse);
      expect((await s.events()).first.type, SecurityEventType.loginSuccess);
      expect(await s.securityNotes(), isEmpty);
    });

    test('B wrong password: one more failure, still unprotected', () async {
      final r = await s.demo.run(DemoScenario.wrongPassword);
      expect(r.alertRaised, isFalse);
      expect((await s.demo.status()).failedAttempts, 1);
      expect((await s.events()).first.type, SecurityEventType.loginFailed);
    });

    test('B repeated reaches the limit and raises the alert', () async {
      DemoScenarioResult? last;
      for (var i = 0; i < 5; i++) {
        last = await s.demo.run(DemoScenario.wrongPassword);
      }
      expect(last!.alertRaised, isTrue);
      expect((await s.demo.status()).protectedUntil, isNotNull);
    });

    test('C maximum failed attempts: protection, alert, e-mail', () async {
      final r = await s.demo.run(DemoScenario.maxFailedAttempts);
      expect(r.alertRaised, isTrue);
      final status = await s.demo.status();
      expect(status.protectedUntil, isNotNull);
      expect(status.emailsSent, 1);
      expect(await s.securityNotes(), hasLength(1));
      // The real sign-in is now refused.
      expect(await s.signIn(DemoCredentials.password), isA<LoginProtected>());
    });

    test('D suspicious login: alert + e-mail + notification', () async {
      final r = await s.demo.run(DemoScenario.suspiciousLogin);
      expect(r.alertRaised, isTrue);
      final e = await s.security.getEvent(r.eventId!);
      expect(e.deviceName, 'Chrome on Windows');
      expect(e.approximateLocation, 'Hyderabad, India');
      expect((await s.demo.status()).emailsSent, 1);
    });

    test(
      'E password changed: event, e-mail, notification (password untouched)',
      () async {
        await s.demo.run(DemoScenario.passwordChanged);
        expect(
          (await s.events()).first.type,
          SecurityEventType.passwordChanged,
        );
        expect(await s.signIn(DemoCredentials.password), isA<LoginSucceeded>());
        expect(
          (await s.securityNotes()).any((n) => n.title == 'Password Changed'),
          isTrue,
        );
      },
    );

    test('F new device login adds a device and a "New Login" alert', () async {
      final before = (await s.sessions.getSessions()).length;
      await s.demo.run(DemoScenario.newDeviceLogin);
      expect((await s.sessions.getSessions()).length, before + 1);
      expect(
        (await s.securityNotes()).any((n) => n.title == 'New Login'),
        isTrue,
      );
    });

    test('G session revoked removes the most recent other device', () async {
      final before = await s.sessions.getSessions();
      await s.demo.run(DemoScenario.sessionRevoked);
      final after = await s.sessions.getSessions();
      expect(after.length, before.length - 1);
      expect(after.any((x) => x.id == before[1].id), isFalse);
      expect(
        (await s.securityNotes()).any((n) => n.title == 'Device Removed'),
        isTrue,
      );
    });

    test('G still works when there is no other device', () async {
      await s.sessions.revokeAllOtherSessions();
      await s.demo.run(DemoScenario.sessionRevoked);
      expect((await s.sessions.getSessions()), hasLength(1));
    });

    test('H arms a photo-upload failure', () async {
      await s.demo.run(DemoScenario.photoUploadFails);
      expect((await s.demo.status()).photoUploadWillFail, isTrue);
    });

    test('reset restores the seeded data and lifts protection', () async {
      await s.demo.run(DemoScenario.maxFailedAttempts);
      await s.password.changePassword(
        currentPassword: DemoCredentials.password,
        newPassword: 'Rivers@2026!',
      );
      await s.sessions.revokeAllOtherSessions();

      await s.demo.reset();

      final status = await s.demo.status();
      expect(status.failedAttempts, 0);
      expect(status.protectedUntil, isNull);
      expect(status.emailsSent, 0);
      expect(status.activeSessions, 4);
      expect(await s.securityNotes(), isEmpty);
      expect(await s.signIn(DemoCredentials.password), isA<LoginSucceeded>());
    });
  });
}
