import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/api/api_password_repositories.dart';
import 'package:blocks_app/data/api/api_security_repository.dart';
import 'package:blocks_app/data/api/api_session_repository.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fake_api.dart';
import 'fixtures.dart';

final _now = DateTime.utc(2026, 10, 9, 12);

Reply _page(List<Object?> items, {String? next}) => Reply.ok({
  'data': items,
  'meta': {'nextCursor': next, 'hasMore': next != null},
});

Reply _otpError(int status, String code, {Map<String, Object?>? details}) =>
    Reply(status, {
      'error': {
        'code': code,
        'message': 'x',
        'requestId': 'r',
        'details': ?details,
      },
    });

Map<String, Object?> _session({
  String id = uuidA,
  bool current = false,
  String platform = 'ANDROID',
  String lastUsedAt = '2026-10-09T10:00:00.000Z',
  String? appVersion = '1.2.0',
}) => {
  'id': id,
  'deviceName': 'Pixel 8',
  'platform': platform,
  'appVersion': appVersion,
  'locationLabel': 'Hyderabad, India',
  'ip': '49.37.***.***',
  'createdAt': '2026-10-01T10:00:00.000Z',
  'lastUsedAt': lastUsedAt,
  'current': current,
};

Map<String, Object?> _event({
  String id = uuidA,
  String type = 'LOGIN_SUCCESS',
  String severity = 'INFO',
  String? deviceLabel = 'Pixel 8 (android)',
  bool acknowledged = false,
}) => {
  'id': id,
  'type': type,
  'severity': severity,
  'ip': '49.37.***.***',
  'deviceLabel': deviceLabel,
  'locationLabel': 'Hyderabad, India',
  'riskScore': 0,
  'createdAt': '2026-10-09T09:00:00.000Z',
  'acknowledged': acknowledged,
};

void main() {
  group('devices', () {
    test('lists this device first, then the most recently used', () async {
      final rig = Rig(
        (_) async => Reply.ok({
          'data': [
            _session(id: uuidA, lastUsedAt: '2026-10-09T08:00:00.000Z'),
            _session(id: uuidB, lastUsedAt: '2026-10-09T11:00:00.000Z'),
            _session(
              id: uuidC,
              current: true,
              platform: 'WEB',
              lastUsedAt: '2026-10-09T07:00:00.000Z',
              appVersion: null,
            ),
          ],
        }),
      );
      final list = await ApiSessionRepository(rig.api).getSessions();
      expect(list.map((s) => s.id), [uuidC, uuidB, uuidA]);
      expect(list.first.isCurrent, isTrue);
      expect(list.first.platform, 'Web');
      expect(list.first.appOrBrowser, 'Browser');
      expect(list.last.platform, 'Android');
      expect(list.last.appOrBrowser, 'BLOCKS app 1.2.0');
      expect(list.last.approximateLocation, 'Hyderabad, India');
    });

    test(
      'signs one other device out, but never this one from the list',
      () async {
        final rig = Rig(
          (r) async => r.method == 'GET'
              ? Reply.ok({
                  'data': [
                    _session(id: uuidA, current: true),
                    _session(id: uuidB),
                  ],
                })
              : const Reply(204),
        );
        final repo = ApiSessionRepository(rig.api);
        await repo.getSessions();

        await repo.revokeSession(uuidB);
        expect(rig.fake.requests.last.method, 'DELETE');
        expect(rig.fake.requests.last.path, '/api/v1/sessions/$uuidB');

        final before = rig.fake.requests.length;
        await expectLater(
          repo.revokeSession(uuidA),
          throwsA(isA<ValidationFailure>()),
        );
        expect(
          rig.fake.requests,
          hasLength(before),
          reason: 'nothing was sent',
        );
      },
    );

    test(
      'signs every other device out, and an unknown device is not found',
      () async {
        final rig = Rig(
          (r) async => r.path.endsWith('revoke-others')
              ? Reply.ok({
                  'data': {'signedOut': 2},
                })
              : Reply.error(404, 'NOT_FOUND'),
        );
        final repo = ApiSessionRepository(rig.api);
        await repo.revokeAllOtherSessions();
        expect(rig.fake.requests.single.path, '/api/v1/sessions/revoke-others');
        await expectLater(
          repo.revokeSession(uuidC),
          throwsA(isA<NotFoundFailure>()),
        );
      },
    );
  });

  group('changing the password', () {
    test('sends both passwords and signs other devices out', () async {
      final rig = Rig(
        (_) async => Reply.ok({
          'data': {'otherSessionsEnded': 1},
        }),
      );
      await ApiPasswordRepository(rig.api).changePassword(
        currentPassword: 'Old#Pass-1234',
        newPassword: 'New#Pass-5678',
      );
      expect(rig.fake.requests.single.path, '/api/v1/auth/password/change');
      expect(rig.fake.requests.single.body, {
        'currentPassword': 'Old#Pass-1234',
        'newPassword': 'New#Pass-5678',
        'signOutOtherDevices': true,
      });
    });

    test('puts each refusal in the form the screen understands', () async {
      Future<Object?> run(Reply reply) async {
        final rig = Rig((_) async => reply);
        try {
          await ApiPasswordRepository(rig.api)
              .changePassword(currentPassword: 'a', newPassword: 'b');
          return null;
        } on Object catch (e) {
          return e;
        }
      }

      expect(
        await run(
          _otpError(
            401,
            'INVALID_CREDENTIALS',
            details: {'attemptsRemaining': 2},
          ),
        ),
        const ValidationFailure('wrongCurrentPassword'),
      );
      expect(
        await run(
          Reply.error(
            400,
            'VALIDATION_FAILED',
            details: [
              {
                'field': 'newPassword',
                'reasons': ['too_short', 'no_digit'],
              },
            ],
          ),
        ),
        const ValidationFailure('weakPassword'),
      );
      expect(
        await run(
          Reply.error(
            400,
            'VALIDATION_FAILED',
            details: [
              {
                'field': 'newPassword',
                'reasons': ['same_as_current'],
              },
            ],
          ),
        ),
        const ValidationFailure('samePassword'),
      );
      expect(
        await run(
          _otpError(
            423,
            'ACCOUNT_LOCKED',
            details: {'until': '2026-10-09T12:15:00.000Z'},
          ),
        ),
        const ValidationFailure('tooManyAttempts'),
      );
      expect(
        await run(Reply.error(503, 'UNAVAILABLE')),
        isA<ServiceUnavailableFailure>(),
      );
    });

    test(
      'a wrong current password is not sent twice (it would count two tries)',
      () async {
        final rig = Rig(
          (_) async => _otpError(
            401,
            'INVALID_CREDENTIALS',
            details: {'attemptsRemaining': 2},
          ),
        );
        await expectLater(
          ApiPasswordRepository(rig.api)
              .changePassword(currentPassword: 'a', newPassword: 'b'),
          throwsA(isA<ValidationFailure>()),
        );
        expect(rig.fake.requests, hasLength(1));
      },
    );
  });

  group('forgot password', () {
    ApiPasswordResetRepository repo(Rig rig) =>
        ApiPasswordResetRepository(rig.api, now: () => _now);

    test('starts with what was typed and says where the code went when the server does', () async {
      final rig = Rig(
        (_) async => Reply(202, {
          'data': {'verification': verificationBody()},
        }),
      );
      final c = await repo(
        rig,
      ).startReset(channel: OtpChannel.email, destination: ' a@example.com ');
      expect(rig.fake.requests.single.path, '/api/v1/auth/password/forgot');
      expect(rig.fake.requests.single.body, {'identifier': 'a@example.com'});
      expect(rig.fake.requests.single.header('authorization'), isNull);
      expect(c.id, uuidA);
      expect(c.channel, OtpChannel.email);
      expect(c.maskedDestination, 'a***@example.com');
      expect(c.length, 6);
      expect(c.resendAvailableAt, DateTime.utc(2026, 10, 9, 12, 1));
    });

    test('a resend keeps showing where the first code went, though the server will not repeat it', () async {
      final rig = Rig((r) async {
        if (r.path.endsWith('/forgot')) {
          return Reply(202, {
            'data': {'verification': verificationBody()},
          });
        }
        return Reply.ok({
          'data': {...verificationBody(), 'destinationMasked': null},
        });
      });
      final resets = repo(rig);
      final first = await resets.startReset(
        channel: OtpChannel.email,
        destination: 'a@example.com',
      );
      final again = await resets.resendCode(first.id);
      expect(rig.fake.requests.last.path, '/api/v1/auth/password/resend');
      expect(again.maskedDestination, 'a***@example.com');
    });

    test('a right code gives the reset token; wrong, expired and locked codes are results, not crashes', () async {
      Future<OtpResult> verify(Reply reply) async {
        final rig = Rig((_) async => reply);
        return repo(rig).verifyCode(challengeId: uuidA, code: ' 123456 ');
      }

      final ok = await verify(
        Reply.ok({
          'data': {'resetToken': 'abc.def', 'expiresAt': 'x'},
        }),
      );
      expect((ok as OtpVerified).token, 'abc.def');
      expect(ok.applied, isFalse);

      final wrong = await verify(
        _otpError(400, 'OTP_INVALID', details: {'attemptsLeft': 3}),
      );
      expect((wrong as OtpIncorrect).attemptsRemaining, 3);

      expect(await verify(_otpError(400, 'OTP_EXPIRED')), isA<OtpExpired>());
      final locked = await verify(_otpError(429, 'OTP_LOCKED'));
      expect(locked, isA<OtpLocked>());
      expect((locked as OtpLocked).retryAt.isAfter(_now), isTrue);
    });

    test('trims the code, and a dead connection is thrown, not mistaken for a wrong code', () async {
      final rig = Rig((r) async => throw connectionLost(r.options));
      await expectLater(
        repo(rig).verifyCode(challengeId: uuidA, code: '123456'),
        throwsA(isA<NetworkFailure>()),
      );
      final ok = Rig(
        (_) async => Reply.ok({
          'data': {'resetToken': 't'},
        }),
      );
      await repo(ok).verifyCode(challengeId: uuidA, code: ' 123456 ');
      expect((ok.fake.requests.single.body! as Map)['code'], '123456');
    });

    test(
      'completing sends the token and the new password, with no session',
      () async {
        final rig = Rig((_) async => const Reply(204));
        await repo(rig)
            .completeReset(token: 'abc.def', newPassword: 'New#Pass-5678');
        expect(rig.fake.requests.single.path, '/api/v1/auth/password/reset');
        expect(rig.fake.requests.single.body, {
          'resetToken': 'abc.def',
          'newPassword': 'New#Pass-5678',
        });
        expect(rig.fake.requests.single.header('authorization'), isNull);
      },
    );

    test('a weak password asks for another; a spent or lapsed token means start again', () async {
      Future<Object?> complete(Reply reply) async {
        final rig = Rig((_) async => reply);
        try {
          await repo(rig).completeReset(token: 't', newPassword: 'x');
          return null;
        } on Object catch (e) {
          return e;
        }
      }

      expect(
        await complete(
          Reply.error(
            400,
            'VALIDATION_FAILED',
            details: [
              {
                'field': 'newPassword',
                'reasons': ['too_short'],
              },
            ],
          ),
        ),
        const ValidationFailure('weakPassword'),
      );
      expect(
        await complete(_otpError(400, 'OTP_INVALID')),
        isA<UnauthorizedFailure>(),
      );
      expect(
        await complete(_otpError(400, 'OTP_EXPIRED')),
        isA<UnauthorizedFailure>(),
      );
    });
  });

  group('account security', () {
    ApiSecurityRepository repo(Rig rig) =>
        ApiSecurityRepository(rig.api, now: () => _now);

    test('the policy is the server\'s own numbers', () async {
      final rig = Rig(
        (_) async => Reply.ok({
          'data': {
            'password': {
              'minLength': 12,
              'maxLength': 128,
              'requireUppercase': true,
              'requireLowercase': false,
              'requireDigit': true,
              'requireSpecial': false,
            },
            'signIn': {'maxFailedAttempts': 7, 'lockMinutes': 30},
            'code': {
              'length': 6,
              'expiresMinutes': 8,
              'maxAttempts': 4,
              'resendCooldownSeconds': 45,
              'maxResends': 3,
            },
          },
        }),
      );
      final p = await repo(rig).getPolicy();
      expect(p.maxFailedAttempts, 7);
      expect(p.protectionDuration, const Duration(minutes: 30));
      expect(p.otpExpiry, const Duration(minutes: 8));
      expect(p.otpMaxAttempts, 4);
      expect(p.otpResendCooldown, const Duration(seconds: 45));
      expect(p.password.minLength, 12);
      expect(p.password.requireLowercase, isFalse);
      expect(rig.fake.requests.single.path, '/api/v1/auth/policy');
    });

    test('login activity maps types, status, device and place; and drops what the app has no screen for', () async {
      final rig = Rig(
        (_) async => _page([
          _event(id: uuidA),
          _event(id: uuidB, type: 'ACCOUNT_LOCKED', severity: 'WARNING'),
          _event(id: uuidC, type: 'REFRESH_TOKEN_REUSE', severity: 'CRITICAL'),
          _event(id: 'x', type: 'ADMIN_ACTION'),
          _event(id: 'y', type: 'PASSWORD_RESET', deviceLabel: null),
        ]),
      );
      final events = await repo(rig)
          .getEvents(filter: SecurityEventFilter.failed);
      expect(rig.fake.requests.single.query['kind'], 'failed');
      expect(events.map((e) => e.id), [uuidA, uuidB, uuidC, 'y']);
      final first = events.first;
      expect(first.type, SecurityEventType.loginSuccess);
      expect(first.status, SecurityEventStatus.success);
      expect(first.deviceName, 'Pixel 8 (android)');
      expect(first.platform, 'Android');
      expect(first.approximateLocation, 'Hyderabad, India');
      expect(events[1].status, SecurityEventStatus.failed);
      expect(events[2].type, SecurityEventType.suspiciousLogin);
      expect(events[2].status, SecurityEventStatus.suspicious);
      expect(events[3].type, SecurityEventType.passwordChanged);
      expect(events[3].status, SecurityEventStatus.info);
      expect(events[3].platform, '');
    });

    test('login activity follows the cursor until the limit', () async {
      var page = 0;
      final rig = Rig((_) async {
        page++;
        return page == 1
            ? _page([_event(id: uuidA), _event(id: uuidB)], next: 'p2')
            : _page([_event(id: uuidC)]);
      });
      final events = await repo(rig).getEvents(limit: 100);
      expect(events, hasLength(3));
      expect(rig.fake.requests.last.query['cursor'], 'p2');
    });

    test('one event can be read and acknowledged ("this was me")', () async {
      final rig = Rig(
        (_) async => Reply.ok({'data': _event(acknowledged: true)}),
      );
      final r = repo(rig);
      expect((await r.getEvent(uuidA)).acknowledged, isTrue);
      expect((await r.acknowledgeEvent(uuidA)).acknowledged, isTrue);
      expect(rig.fake.requests.map((q) => '${q.method} ${q.path}'), [
        'GET /api/v1/security/events/$uuidA',
        'POST /api/v1/security/events/$uuidA/acknowledge',
      ]);
    });

    test(
      'contacts arrive already masked, and a missing one is empty',
      () async {
        final rig = Rig(
          (_) async => Reply.ok({
            'data': {
              'email': {'value': 'a***@example.com', 'verified': true},
              'phone': null,
            },
          }),
        );
        final c = await repo(rig).getContacts();
        expect(c.maskedEmail, 'a***@example.com');
        expect(c.maskedPhone, '');
      },
    );

    group('changing the e-mail or phone', () {
      test(
        'asks for the password and sends the code to the new address',
        () async {
          final rig = Rig(
            (_) async => Reply.ok({
              'data': {'verification': verificationBody()},
            }),
          );
          final c = await repo(rig).startContactChange(
            channel: OtpChannel.email,
            newValue: ' new@example.com ',
            currentPassword: 'Pass#1234567',
          );
          expect(
            rig.fake.requests.single.path,
            '/api/v1/account/contacts/change',
          );
          expect(rig.fake.requests.single.body, {
            'kind': 'email',
            'newValue': 'new@example.com',
            'password': 'Pass#1234567',
          });
          expect(c.id, uuidA);
        },
      );

      test('uses the phone kind for a phone', () async {
        final rig = Rig(
          (_) async => Reply.ok({
            'data': {'verification': verificationBody()},
          }),
        );
        await repo(rig).startContactChange(
          channel: OtpChannel.phone,
          newValue: '9876543210',
          currentPassword: 'p',
        );
        expect((rig.fake.requests.single.body! as Map)['kind'], 'phone');
      });

      test('refusals are the reasons the screen understands', () async {
        Future<Object?> start(Reply reply, OtpChannel channel) async {
          final rig = Rig((_) async => reply);
          try {
            await repo(rig).startContactChange(
              channel: channel,
              newValue: 'x',
              currentPassword: 'p',
            );
            return null;
          } on Object catch (e) {
            return e;
          }
        }

        expect(
          await start(
            _otpError(
              401,
              'INVALID_CREDENTIALS',
              details: {'attemptsRemaining': 1},
            ),
            OtpChannel.email,
          ),
          const ValidationFailure('wrongPassword'),
        );
        expect(
          await start(
            Reply.error(
              400,
              'VALIDATION_FAILED',
              details: [
                {
                  'field': 'newValue',
                  'reasons': ['invalid'],
                },
              ],
            ),
            OtpChannel.email,
          ),
          const ValidationFailure('invalidEmail'),
        );
        expect(
          await start(
            Reply.error(
              400,
              'VALIDATION_FAILED',
              details: [
                {
                  'field': 'newValue',
                  'reasons': ['invalid'],
                },
              ],
            ),
            OtpChannel.phone,
          ),
          const ValidationFailure('invalidPhone'),
        );
        expect(
          await start(_otpError(423, 'ACCOUNT_LOCKED'), OtpChannel.email),
          const ValidationFailure('tooManyAttempts'),
        );
      });

      test('a resend keeps the address shown, and the right code applies the change at once', () async {
        final rig = Rig((r) async {
          if (r.path.endsWith('/change')) {
            return Reply.ok({
              'data': {'verification': verificationBody()},
            });
          }
          if (r.path.endsWith('/resend')) {
            return Reply.ok({
              'data': {...verificationBody(), 'destinationMasked': null},
            });
          }
          return Reply.ok({
            'data': {
              'email': {'value': 'n***@example.com', 'verified': true},
              'phone': null,
            },
          });
        });
        final r = repo(rig);
        final start = await r.startContactChange(
          channel: OtpChannel.email,
          newValue: 'new@example.com',
          currentPassword: 'p',
        );
        final again = await r.resendContactChangeCode(start.id);
        expect(again.maskedDestination, 'a***@example.com');

        final result = await r.verifyContactChange(
          challengeId: start.id,
          code: '123456',
        );
        expect(result, isA<OtpVerified>());
        expect((result as OtpVerified).applied, isTrue);
        expect(
          rig.fake.requests.last.path,
          '/api/v1/account/contacts/change/confirm',
        );
        expect(rig.fake.requests.last.body, {
          'challengeId': uuidA,
          'code': '123456',
        });

        // The old confirm step has nothing left to do but show the result.
        expect(
          (await r.confirmContactChange(token: result.token)).maskedEmail,
          'n***@example.com',
        );
      });

      test('a wrong, expired or locked code is a result', () async {
        Future<OtpResult> confirm(Reply reply) async {
          final rig = Rig((_) async => reply);
          return repo(rig)
              .verifyContactChange(challengeId: uuidA, code: '000000');
        }

        expect(
          (await confirm(
            _otpError(400, 'OTP_INVALID', details: {'attemptsLeft': 2}),
          ) as OtpIncorrect).attemptsRemaining,
          2,
        );
        expect(await confirm(_otpError(400, 'OTP_EXPIRED')), isA<OtpExpired>());
        expect(await confirm(_otpError(429, 'OTP_LOCKED')), isA<OtpLocked>());
      });
    });

    group('two-step sign-in', () {
      test(
        'status: an authenticator app is told apart from a texted code',
        () async {
          Future<TwoFactorSettings> status(Map<String, Object?> body) async {
            final rig = Rig((_) async => Reply.ok({'data': body}));
            return repo(rig).getTwoFactor();
          }

          final app = await status({
            'enabled': true,
            'method': 'totp',
            'backupCodesLeft': 8,
          });
          expect(app.enabled, isTrue);
          expect(app.method, TwoFactorMethod.authenticatorApp);
          final sms = await status({
            'enabled': true,
            'method': 'sms',
            'backupCodesLeft': 8,
          });
          expect(sms.method, TwoFactorMethod.sms);
          final off = await status({
            'enabled': false,
            'method': null,
            'backupCodesLeft': 0,
          });
          expect(off.enabled, isFalse);
        },
      );

      test('turning it off needs the password; a wrong one is a reason, not a crash', () async {
        var calls = 0;
        final rig = Rig((r) async {
          calls++;
          if (r.path.endsWith('/disable')) {
            return Reply.ok({
              'data': {'enabled': false},
            });
          }
          return Reply.ok({
            'data': {'enabled': false, 'method': null, 'backupCodesLeft': 0},
          });
        });
        final after = await repo(rig)
            .disableTwoFactor(currentPassword: 'Pass#1234567');
        expect(after.enabled, isFalse);
        expect(rig.fake.requests.first.body, {'password': 'Pass#1234567'});
        expect(calls, 2);

        final wrong = Rig(
          (_) async => _otpError(
            401,
            'INVALID_CREDENTIALS',
            details: {'attemptsRemaining': 2},
          ),
        );
        await expectLater(
          repo(wrong).disableTwoFactor(currentPassword: 'nope'),
          throwsA(const ValidationFailure('wrongPassword')),
        );
      });

      test(
        'turning it on is not offered yet, and says so rather than pretending',
        () async {
          final rig = Rig((_) async => Reply.ok({'data': {}}));
          final r = repo(rig);
          await expectLater(
            r.startTwoFactorSetup(TwoFactorMethod.sms),
            throwsA(
              isA<ForbiddenFailure>().having(
                (f) => f.code,
                'code',
                'NOT_AVAILABLE',
              ),
            ),
          );
          await expectLater(
            r.resendTwoFactorCode('c'),
            throwsA(isA<ForbiddenFailure>()),
          );
          await expectLater(
            r.confirmTwoFactorSetup(challengeId: 'c', code: '123456'),
            throwsA(isA<ForbiddenFailure>()),
          );
          await expectLater(
            r.setEmailFallback(enabled: true),
            throwsA(isA<ForbiddenFailure>()),
          );
          expect(rig.fake.requests, isEmpty);
        },
      );
    });

    group('alerts', () {
      test('options map both ways', () async {
        final rig = Rig(
          (_) async => Reply.ok({
            'data': {
              'securityAlertEmail': false,
              'securityAlertPush': true,
              'loginAlerts': false,
            },
          }),
        );
        final r = repo(rig);
        final prefs = await r.getAlertPreferences();
        expect(prefs.emailCopies, isFalse);
        expect(prefs.pushAlerts, isTrue);
        expect(prefs.newDeviceAlerts, isFalse);

        await r.setAlertPreferences(
          const SecurityAlertPreferences(
            emailCopies: true,
            pushAlerts: false,
            newDeviceAlerts: true,
          ),
        );
        expect(rig.fake.requests.last.method, 'PUT');
        expect(rig.fake.requests.last.body, {
          'securityAlertEmail': true,
          'securityAlertPush': false,
          'loginAlerts': true,
        });
      });

      test('the list of alerts sent maps the template to a type, and leaves out the rest', () async {
        Map<String, Object?> row(
          String id,
          String template, {
          String subject = 'Subject',
        }) => {
          'id': id,
          'channel': 'EMAIL',
          'template': template,
          'subject': subject,
          'to': 'a***@example.com',
          'status': 'SENT',
          'sentAt': '2026-10-09T09:30:00.000Z',
        };
        final rig = Rig(
          (_) async => Reply.ok({
            'data': [
              row('1', 'security_password_changed'),
              row(
                '2',
                'security_contact_changed',
                subject: 'Your phone number was changed',
              ),
              row(
                '3',
                'security_contact_changed',
                subject: 'Your e-mail address was changed',
              ),
              row('4', 'security_token_reuse'),
              row('5', 'security_account_exists'),
              row('6', 'security_deletion_scheduled'),
            ],
          }),
        );
        final alerts = await repo(rig).getSentAlerts();
        expect(alerts.map((a) => a.id), ['1', '2', '3', '4']);
        expect(alerts.map((a) => a.type), [
          SecurityEventType.passwordChanged,
          SecurityEventType.phoneChanged,
          SecurityEventType.emailChanged,
          SecurityEventType.suspiciousLogin,
        ]);
        expect(alerts.first.maskedTo, 'a***@example.com');
        expect(alerts.first.sentAt, DateTime.utc(2026, 10, 9, 9, 30));
      });
    });
  });
}
