import 'package:blocks_app/app/config/app_config.dart';
import 'package:blocks_app/app/session_scope.dart';
import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/core/services/local_store.dart';
import 'package:blocks_app/data/api/api_providers.dart';
import 'package:blocks_app/data/models/auth_models.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/auth/application/session_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/fake_auth_repository.dart';

const _live = AppConfig(
  environment: AppEnvironment.staging,
  useMockData: false,
  apiBaseUrl: 'https://api.example.test',
  enableLogging: false,
);

const _demo = AppConfig(
  environment: AppEnvironment.demo,
  useMockData: true,
  apiBaseUrl: '',
  enableLogging: false,
);

class _Rig {
  _Rig({AppConfig config = _live, FakeAuthRepository? auth})
    : auth = auth ?? FakeAuthRepository() {
    container = ProviderContainer(
      overrides: [
        localStoreProvider.overrideWithValue(InMemoryLocalStore()),
        appConfigProvider.overrideWithValue(config),
        authRepositoryProvider.overrideWithValue(this.auth),
        sessionScopeResetProvider.overrideWithValue(() => resets++),
      ],
    );
    addTearDown(container.dispose);
  }

  final FakeAuthRepository auth;
  late final ProviderContainer container;
  int resets = 0;

  SessionController get session =>
      container.read(sessionControllerProvider.notifier);
  SessionState get state => container.read(sessionControllerProvider);
}

const _challenge = CodeChallenge(
  id: 'c1',
  kind: CodeChallengeKind.contactVerification,
);

void main() {
  group('opening a session', () {
    test('a right password opens it', () async {
      final r = _Rig();
      expect(r.state.isSignedIn, isFalse);
      final result = await r.session.signInWithPassword(
        identifier: 'a',
        password: 'b',
      );
      expect(result, isA<LoginSucceeded>());
      expect(r.state.isSignedIn, isTrue);
      expect(r.state.onboardingCompleted, isTrue);
    });

    test('a wrong password, protection or a pending code do not', () async {
      for (final outcome in <LoginResult>[
        const LoginRejected(attemptsRemaining: 3),
        LoginProtected(retryAt: DateTime.utc(2030)),
        const LoginNeedsCode(_challenge),
      ]) {
        final r = _Rig(auth: FakeAuthRepository()..signInResult = outcome);
        await r.session.signInWithPassword(identifier: 'a', password: 'b');
        expect(r.state.isSignedIn, isFalse, reason: '$outcome');
      }
    });

    test(
      'a code the server accepts opens it; one it refuses does not',
      () async {
        final ok = _Rig();
        await ok.session.submitCode(_challenge, '123456');
        expect(ok.state.isSignedIn, isTrue);
        expect(ok.auth.codes.single.code, '123456');

        final refused = _Rig(
          auth: FakeAuthRepository()
            ..submitError = const ValidationFailure('no', 'OTP_INVALID'),
        );
        await expectLater(
          refused.session.submitCode(_challenge, '000000'),
          throwsA(isA<ValidationFailure>()),
        );
        expect(refused.state.isSignedIn, isFalse);
      },
    );

    test('registering does not sign in until the code is confirmed', () async {
      final r = _Rig();
      final challenge = await r.session.register(
        RegistrationRequest(
          username: 'asha.k',
          displayName: 'Asha',
          password: 'x',
          dateOfBirth: DateTime(2000),
          email: 'a@example.com',
        ),
      );
      expect(challenge.id, 'challenge-1');
      expect(r.state.isSignedIn, isFalse);
    });
  });

  group('a stored session', () {
    test('is signed in on the next launch', () {
      final r = _Rig(auth: FakeAuthRepository(signedIn: true));
      expect(r.state.isSignedIn, isTrue);
    });
  });

  group('when the session ends', () {
    test('signing out forgets everything in the live app', () async {
      final r = _Rig(auth: FakeAuthRepository(signedIn: true));
      expect(r.state.isSignedIn, isTrue);
      await r.session.signOut();
      expect(r.state.isSignedIn, isFalse);
      expect(r.state.onboardingCompleted, isTrue);
      expect(r.auth.signOuts, 1);
      expect(r.resets, 1);
    });

    test('the server ending it signs out and forgets everything', () async {
      final r = _Rig(auth: FakeAuthRepository(signedIn: true));
      expect(r.state.isSignedIn, isTrue);
      r.container.read(sessionEventsProvider).sessionEnded();
      await pumpEventQueue();
      expect(r.state.isSignedIn, isFalse);
      expect(r.resets, 1);
    });

    test(
      'the demo build keeps its data (nothing to protect, nothing reset)',
      () async {
        final r = _Rig(config: _demo, auth: FakeAuthRepository(signedIn: true));
        await r.session.signOut();
        expect(r.state.isSignedIn, isFalse);
        expect(r.resets, 0);
      },
    );
  });
}
