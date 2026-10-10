import 'package:blocks_app/app/router/app_router.dart';
import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/core/constants/storage_keys.dart';
import 'package:blocks_app/core/services/local_store.dart';
import 'package:blocks_app/features/auth/application/session_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

ProviderContainer _container(InMemoryLocalStore store) {
  final c = ProviderContainer(
    overrides: [localStoreProvider.overrideWithValue(store)],
  );
  addTearDown(c.dispose);
  return c;
}

void main() {
  test('fresh install: not onboarded, not signed in', () {
    final s = _container(InMemoryLocalStore()).read(sessionControllerProvider);
    expect(s.onboardingCompleted, isFalse);
    expect(s.isSignedIn, isFalse);
  });

  test('completeOnboarding persists the flag', () async {
    final store = InMemoryLocalStore();
    final c = _container(store);
    await c.read(sessionControllerProvider.notifier).completeOnboarding();

    expect(c.read(sessionControllerProvider).onboardingCompleted, isTrue);
    expect(store.getBool(StorageKeys.onboardingCompleted), isTrue);
  });

  test('startDemoSession signs in and marks onboarding done', () async {
    final store = InMemoryLocalStore();
    final c = _container(store);
    await c.read(sessionControllerProvider.notifier).startDemoSession();

    final s = c.read(sessionControllerProvider);
    expect(s.isSignedIn, isTrue);
    expect(s.onboardingCompleted, isTrue);
    expect(store.getBool(StorageKeys.demoSessionActive), isTrue);
  });

  test('signOut keeps onboarding completed', () async {
    final c = _container(InMemoryLocalStore());
    final n = c.read(sessionControllerProvider.notifier);
    await n.startDemoSession();
    await n.signOut();

    final s = c.read(sessionControllerProvider);
    expect(s.isSignedIn, isFalse);
    expect(s.onboardingCompleted, isTrue);
  });

  test('session is restored from storage on next launch', () {
    final c = _container(
      InMemoryLocalStore({
        StorageKeys.onboardingCompleted: true,
        StorageKeys.demoSessionActive: true,
      }),
    );
    expect(c.read(sessionControllerProvider).isSignedIn, isTrue);
  });

  group('initialRouteFor', () {
    test('new user -> onboarding', () {
      const s = SessionState(onboardingCompleted: false, isSignedIn: false);
      expect(initialRouteFor(s), Routes.onboarding);
    });

    test('onboarded but signed out -> auth', () {
      const s = SessionState(onboardingCompleted: true, isSignedIn: false);
      expect(initialRouteFor(s), Routes.auth);
    });

    test('signed in -> Reels (the landing tab, not Home)', () {
      const s = SessionState(onboardingCompleted: true, isSignedIn: true);
      expect(initialRouteFor(s), Routes.reels);
      expect(initialRouteFor(s), Routes.landing);
      expect(initialRouteFor(s), isNot(Routes.home));
    });
  });
}
