import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/core/services/local_store.dart';
import 'package:blocks_app/data/api/api_auth_repository.dart';
import 'package:blocks_app/data/api/device_identity.dart';
import 'package:blocks_app/data/api/token_store.dart';
import 'package:blocks_app/data/models/auth_models.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fake_api.dart';
import 'fixtures.dart';

final _now = DateTime.utc(2026, 10, 9, 12);

const _device = DeviceIdentity(
  id: 'abcdef012345abcdef012345',
  name: 'Android phone',
  platform: 'ANDROID',
);

class _Setup {
  _Setup(Future<Reply> Function(SeenRequest) handler, {TokenStore? tokens})
    : rig = Rig(handler, tokens: tokens ?? MemoryTokenStore()) {
    repo = ApiAuthRepository(
      api: rig.api,
      tokens: rig.store,
      store: store,
      device: _device,
      now: () => _now,
    );
  }

  final Rig rig;
  final InMemoryLocalStore store = InMemoryLocalStore();
  late final ApiAuthRepository repo;

  SeenRequest get last => rig.fake.requests.last;
}

Reply _authenticated({bool newDevice = false}) => Reply.ok({
  'data': {
    'status': 'authenticated',
    'tokens': tokensBody(),
    'user': meBody(),
    'newDevice': newDevice,
  },
});

void main() {
  group('signing in', () {
    test(
      'keeps the tokens, sends the device, and carries no token itself',
      () async {
        final s = _Setup((_) async => _authenticated(newDevice: true));

        final result = await s.repo.signInWithPassword(
          identifier: 'asha.k',
          password: 'S3cret!pass',
        );

        expect(result, isA<LoginSucceeded>());
        expect((result as LoginSucceeded).isNewDevice, isTrue);
        expect(s.rig.store.current?.accessToken, 'access-new');
        expect(s.rig.store.current?.refreshToken, 'refresh-new');
        expect(s.repo.isSignedIn, isTrue);
        expect(s.last.path, '/api/v1/auth/login');
        expect(s.last.header('authorization'), isNull);
        expect(s.last.body, {
          'identifier': 'asha.k',
          'password': 'S3cret!pass',
          'device': {
            'deviceId': 'abcdef012345abcdef012345',
            'deviceName': 'Android phone',
            'platform': 'ANDROID',
          },
        });
      },
    );

    test('a wrong password is a rejection with the tries left, and nothing is kept', () async {
      final s = _Setup(
        (_) async => const Reply(401, {
          'error': {
            'code': 'INVALID_CREDENTIALS',
            'message': 'The details you entered are not correct.',
            'details': {'attemptsRemaining': 2},
            'requestId': 'r',
          },
        }),
      );
      final result = await s.repo.signInWithPassword(
        identifier: 'a',
        password: 'b',
      );
      expect(result, isA<LoginRejected>());
      expect((result as LoginRejected).attemptsRemaining, 2);
      expect(s.rig.store.current, isNull);
      expect(s.repo.isSignedIn, isFalse);
    });

    test(
      'too many wrong passwords is protection until the time the server gives',
      () async {
        final s = _Setup(
          (_) async => const Reply(423, {
            'error': {
              'code': 'ACCOUNT_LOCKED',
              'message': 'Paused',
              'details': {
                'until': '2026-10-09T12:15:00.000Z',
                'justTriggered': true,
              },
              'requestId': 'r',
            },
          }),
        );
        final result = await s.repo.signInWithPassword(
          identifier: 'a',
          password: 'b',
        );
        expect(result, isA<LoginProtected>());
        final p = result as LoginProtected;
        expect(p.retryAt, DateTime.utc(2026, 10, 9, 12, 15));
        expect(p.justTriggered, isTrue);
      },
    );

    test(
      'other refusals are thrown, not turned into a wrong-password message',
      () async {
        final suspended = _Setup(
          (_) async => Reply.error(403, 'ACCOUNT_SUSPENDED', message: 'No'),
        );
        await expectLater(
          suspended.repo.signInWithPassword(identifier: 'a', password: 'b'),
          throwsA(
            isA<ForbiddenFailure>().having(
              (f) => f.code,
              'code',
              'ACCOUNT_SUSPENDED',
            ),
          ),
        );
        final busy = _Setup((_) async => Reply.error(503, 'UNAVAILABLE'));
        await expectLater(
          busy.repo.signInWithPassword(identifier: 'a', password: 'b'),
          throwsA(isA<ServiceUnavailableFailure>()),
        );
        // A sign-in is never repeated on its own (no Idempotency-Key).
        expect(busy.rig.fake.requests, hasLength(1));
      },
    );

    test(
      'a second step is a code challenge with the methods the server allows',
      () async {
        final s = _Setup(
          (_) async => Reply.ok({
            'data': {
              'status': 'two_factor_required',
              'challengeId': uuidB,
              'methods': ['totp', 'backup_code', 'something_new'],
              'destinationMasked': null,
            },
          }),
        );
        final result = await s.repo.signInWithPassword(
          identifier: 'a',
          password: 'b',
        );
        final c = (result as LoginNeedsCode).challenge;
        expect(c.id, uuidB);
        expect(c.kind, CodeChallengeKind.secondFactor);
        expect(c.methods, [SignInCodeMethod.totp, SignInCodeMethod.backupCode]);
        expect(
          c.canResend,
          isFalse,
          reason: 'an authenticator app sends nothing',
        );
        expect(s.rig.store.current, isNull);
      },
    );

    test(
      'an unverified contact and an unusual sign-in are told apart',
      () async {
        Future<CodeChallenge> challengeFor(String reason) async {
          final s = _Setup(
            (_) async => Reply.ok({
              'data': {
                'status': 'verification_required',
                'reason': reason,
                'verification': verificationBody(),
              },
            }),
          );
          final r = await s.repo.signInWithPassword(
            identifier: 'a',
            password: 'b',
          );
          return (r as LoginNeedsCode).challenge;
        }

        final contact = await challengeFor('unverified_contact');
        expect(contact.kind, CodeChallengeKind.contactVerification);
        expect(contact.destinationMasked, 'a***@example.com');
        expect(contact.resendAvailableAt, DateTime.utc(2026, 10, 9, 12, 1));
        expect(contact.canResend, isTrue);

        final unusual = await challengeFor('unusual_sign_in');
        expect(unusual.kind, CodeChallengeKind.unusualSignIn);
      },
    );

    test(
      'an answer in a shape the app does not know is a failure, not a crash',
      () async {
        final s = _Setup(
          (_) async => Reply.ok({
            'data': {'status': 'teleported'},
          }),
        );
        await expectLater(
          s.repo.signInWithPassword(identifier: 'a', password: 'b'),
          throwsA(isA<UnknownFailure>()),
        );
        final noTokens = _Setup(
          (_) async => Reply.ok({
            'data': {
              'status': 'authenticated',
              'tokens': <String, Object?>{},
              'user': meBody(),
            },
          }),
        );
        await expectLater(
          noTokens.repo.signInWithPassword(identifier: 'a', password: 'b'),
          throwsA(isA<UnknownFailure>()),
        );
        expect(noTokens.rig.store.current, isNull);
      },
    );
  });

  group('creating an account', () {
    final request = RegistrationRequest(
      username: ' asha.k ',
      displayName: ' Asha K ',
      password: 'S3cret!pass',
      dateOfBirth: DateTime(2001, 3, 7),
      email: ' asha@example.com ',
      phone: '  ',
      language: 'hi',
    );

    test(
      'sends trimmed fields, a plain date and only the contacts given',
      () async {
        final s = _Setup(
          (_) async => Reply(202, {
            'data': {'verification': verificationBody()},
          }),
        );

        final challenge = await s.repo.register(request);

        expect(challenge.kind, CodeChallengeKind.contactVerification);
        expect(challenge.id, uuidA);
        expect(s.last.path, '/api/v1/auth/register');
        expect(s.last.body, {
          'username': 'asha.k',
          'displayName': 'Asha K',
          'password': 'S3cret!pass',
          'dateOfBirth': '2001-03-07',
          'email': 'asha@example.com',
          'language': 'hi',
          'device': _device.toJson(),
        });
        expect(s.last.header('authorization'), isNull);
        expect(
          s.rig.store.current,
          isNull,
          reason: 'not signed in until the code is confirmed',
        );
      },
    );

    test(
      'shows the server\'s per-field refusals and a taken username',
      () async {
        final fields = _Setup(
          (_) async => Reply.error(
            400,
            'VALIDATION_FAILED',
            details: [
              {
                'field': 'dateOfBirth',
                'reasons': ['too_young'],
              },
            ],
          ),
        );
        await expectLater(
          fields.repo.register(request),
          throwsA(
            isA<FieldValidationFailure>().having((f) => f.errors, 'errors', {
              'dateOfBirth': 'too_young',
            }),
          ),
        );
        final taken = _Setup((_) async => Reply.error(409, 'USERNAME_TAKEN'));
        await expectLater(
          taken.repo.register(request),
          throwsA(
            isA<ConflictFailure>().having(
              (f) => f.code,
              'code',
              'USERNAME_TAKEN',
            ),
          ),
        );
      },
    );

    test('never prints the password', () {
      expect('$request', isNot(contains('S3cret')));
    });
  });

  group('answering a code', () {
    const contact = CodeChallenge(
      id: uuidA,
      kind: CodeChallengeKind.contactVerification,
    );
    const second = CodeChallenge(
      id: uuidB,
      kind: CodeChallengeKind.secondFactor,
      methods: [SignInCodeMethod.totp, SignInCodeMethod.backupCode],
    );

    test(
      'confirming a new account uses verify-contact and opens the session',
      () async {
        final s = _Setup((_) async => _authenticated());
        final result = await s.repo.submitCode(contact, ' 123456 ');
        expect(result, isA<LoginSucceeded>());
        expect(s.last.path, '/api/v1/auth/verify-contact');
        expect(s.last.body, {
          'challengeId': uuidA,
          'code': '123456',
          'device': _device.toJson(),
        });
        expect(s.rig.store.current?.accessToken, 'access-new');
      },
    );

    test('a second step uses login/verify with the chosen method', () async {
      final s = _Setup((_) async => _authenticated());
      await s.repo.submitCode(second, '654321', method: SignInCodeMethod.totp);
      expect(s.last.path, '/api/v1/auth/login/verify');
      expect((s.last.body! as Map)['method'], 'totp');

      await s.repo.submitCode(
        second,
        'ABCD-EFGH-JK',
        method: SignInCodeMethod.backupCode,
      );
      expect((s.last.body! as Map)['method'], 'backup_code');
    });

    test(
      'a wrong code throws with its code and the tries left, and keeps nothing',
      () async {
        final s = _Setup(
          (_) async => const Reply(400, {
            'error': {
              'code': 'OTP_INVALID',
              'message': 'That code is not correct.',
              'details': {'attemptsLeft': 3},
              'requestId': 'r',
            },
          }),
        );
        await expectLater(
          s.repo.submitCode(contact, '000000'),
          throwsA(
            isA<ValidationFailure>()
                .having((f) => f.code, 'code', 'OTP_INVALID')
                .having((f) => f.details['attemptsLeft'], 'attemptsLeft', 3),
          ),
        );
        expect(s.rig.store.current, isNull);
      },
    );

    test(
      'resending returns the new challenge, keeping its kind and methods',
      () async {
        final s = _Setup(
          (_) async => Reply.ok({'data': verificationBody(id: uuidC)}),
        );
        final fresh = await s.repo.resendCode(contact);
        expect(s.last.path, '/api/v1/auth/resend');
        expect(s.last.body, {'challengeId': uuidA});
        expect(fresh.id, uuidC);
        expect(fresh.kind, CodeChallengeKind.contactVerification);
        expect(fresh.resendAvailableAt, DateTime.utc(2026, 10, 9, 12, 1));
      },
    );
  });

  group('signing out', () {
    final signedIn = AuthTokens(
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: _now.add(const Duration(minutes: 10)),
    );

    test('tells the server, then forgets the tokens', () async {
      final s = _Setup(
        (_) async => const Reply(204),
        tokens: MemoryTokenStore(signedIn),
      );
      await s.repo.signOut();
      expect(s.last.path, '/api/v1/auth/logout');
      expect(s.last.header('authorization'), 'Bearer access-1');
      expect(s.rig.store.current, isNull);
      expect(s.repo.isSignedIn, isFalse);
    });

    test(
      'still signs this device out when the server cannot be reached',
      () async {
        final s = _Setup(
          (r) async => throw connectionLost(r.options),
          tokens: MemoryTokenStore(signedIn),
        );
        await s.repo.signOut();
        expect(s.rig.store.current, isNull);
      },
    );
  });

  group('the app-entry flags', () {
    test(
      'onboarding is remembered locally, and there is no demo session',
      () async {
        final s = _Setup((_) async => const Reply(204));
        expect(s.repo.hasCompletedOnboarding, isFalse);
        await s.repo.completeOnboarding();
        expect(s.repo.hasCompletedOnboarding, isTrue);
        await expectLater(
          s.repo.signInAsDemo(),
          throwsA(isA<ForbiddenFailure>()),
        );
        expect(s.repo.isSignedIn, isFalse);
      },
    );

    test('a stored session means signed in without any request', () {
      final s = _Setup(
        (_) async => const Reply(204),
        tokens: MemoryTokenStore(signedInTokens()),
      );
      expect(s.repo.isSignedIn, isTrue);
      expect(s.rig.fake.requests, isEmpty);
    });
  });
}

AuthTokens signedInTokens() => AuthTokens(
  accessToken: 'a',
  refreshToken: 'r',
  expiresAt: _now.add(const Duration(minutes: 5)),
);
