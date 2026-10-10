// Drives the whole app, with its real screens and real repositories, against a
// RUNNING backend. It proves what the unit tests cannot: that the screens, the
// session, the router and the API client work together on a real account.
//
//   (start the backend as described in live_api_test.dart)
//   cd frontend
//   BLOCKS_LIVE_API=http://127.0.0.1:4000 flutter test test/live/live_ui_test.dart
//
// It creates a throwaway account (qa.ui<random>@example.test) in whichever
// database the server uses: never point it at a real one.
@TestOn('vm')
library;

import 'dart:io';
import 'dart:math';

import 'package:blocks_app/app/app.dart';
import 'package:blocks_app/app/config/app_config.dart';
import 'package:blocks_app/app/router/app_router.dart';
import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/session_scope.dart';
import 'package:blocks_app/core/constants/storage_keys.dart';
import 'package:blocks_app/core/services/local_store.dart';
import 'package:blocks_app/data/api/api_providers.dart';
import 'package:blocks_app/features/auth/application/session_controller.dart';
import 'package:blocks_app/features/reels/application/reels_controller.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../helpers/fake_playback.dart';

final String? _server = Platform.environment['BLOCKS_LIVE_API'];

const _password = 'Tr0ub4dor&3xample';

ProviderContainer _container(WidgetTester tester) =>
    ProviderScope.containerOf(tester.element(find.byType(BlocksApp)));

/// Lets real network traffic happen, then lets the app react to it.
Future<void> _settle(WidgetTester tester, {int ms = 150}) async {
  await tester.runAsync(() => Future<void>.delayed(Duration(milliseconds: ms)));
  await tester.pump(const Duration(milliseconds: 50));
}

/// Waits (in real time) until [done] is true.
///
/// Never calls `pumpAndSettle` while a request may be in flight: a screen with
/// a spinner never settles, so it would run the fake clock forward by minutes and
/// fire the client's send and receive time-outs, aborting the very request being
/// waited for.
Future<void> _until(
  WidgetTester tester,
  bool Function() done, {
  String what = 'the condition',
  Duration timeout = const Duration(seconds: 25),
}) async {
  final end = DateTime.now().add(timeout);
  while (!done()) {
    if (DateTime.now().isAfter(end)) {
      fail('Never happened: $what\nOn screen: ${_texts(tester)}');
    }
    await _settle(tester);
  }
  await tester.pump(const Duration(milliseconds: 100));
  await tester.pump(const Duration(milliseconds: 100));
}

Future<void> _waitFor(WidgetTester tester, Finder finder) =>
    _until(tester, () => finder.evaluate().isNotEmpty, what: '$finder');

Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder.first);
  await tester.pump();
  await tester.tap(finder.first);
  await _settle(tester, ms: 100);
}

Future<void> _scrollTo(WidgetTester tester, Finder finder) async {
  await tester.scrollUntilVisible(
    finder,
    200,
    scrollable: find.byType(Scrollable).first,
  );
}

Future<String> _codeSentTo(WidgetTester tester, String address) async {
  final code = await tester.runAsync(() async {
    final res = await Dio(BaseOptions(baseUrl: _server!))
        .get<Map<String, dynamic>>(
          '/api/v1/dev/outbox',
          queryParameters: {'to': address},
        );
    final rows = (res.data!['data'] as List).cast<Map<String, dynamic>>();
    final body = rows.first['body'] as String;
    return RegExp(r'\b(\d{6})\b').firstMatch(body)!.group(1)!;
  });
  return code!;
}

void main() {
  final origin = _server;
  final run = origin != null && origin.isNotEmpty;

  testWidgets(
    'sign up, confirm, post, like, look at the profile, sign out and sign back in',
    // Skipped unless BLOCKS_LIVE_API points at a running development server.
    skip: !run,
    (tester) async {
      // flutter_test blocks real HTTP by default; this test needs it.
      HttpOverrides.global = null;
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(
            SystemChannels.platform,
            (call) async => null,
          );
      tester.view
        ..physicalSize = const Size(780, 2400)
        ..devicePixelRatio = 2;
      addTearDown(tester.view.reset);

      final suffix = Random().nextInt(900000) + 100000;
      final username = 'qa.ui$suffix';
      final email = '$username@example.test';
      final store = InMemoryLocalStore({StorageKeys.onboardingCompleted: true});

      await tester.pumpWidget(
        SessionScope(
          overrides: [
            localStoreProvider.overrideWithValue(store),
            appConfigProvider.overrideWithValue(
              AppConfig(
                environment: AppEnvironment.staging,
                useMockData: false,
                apiBaseUrl: origin!,
                enableLogging: false,
              ),
            ),
            reelPlaybackBuilderProvider.overrideWithValue(
              (reel, vsync) => FakePlayback(reel, PlaybackLog()),
            ),
          ],
          child: const BlocksApp(),
        ),
      );
      // The splash, then the sign-in entry (onboarding was done before).
      await tester.pump(const Duration(milliseconds: 2700));
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pumpAndSettle();

      // ---- the entry offers real accounts, not the demo -------------------
      expect(find.text('Create an account'), findsOneWidget);
      expect(find.text('Continue as Demo User'), findsNothing);
      expect(find.textContaining('demo'), findsNothing);

      // ---- sign up ---------------------------------------------------------
      await _tap(tester, find.text('Create an account'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextField, 'Full name'),
        'UI Tester',
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'Username'),
        username,
      );
      await tester.enterText(find.widgetWithText(TextField, 'E-mail'), email);
      await tester.enterText(
        find.widgetWithText(TextField, 'Password'),
        _password,
      );
      await tester.pumpAndSettle();
      await _scrollTo(tester, find.text('Choose your date of birth'));
      await tester.tap(find.text('Choose your date of birth'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
      await _tap(tester, find.text('Create account'));

      // ---- confirm the e-mail with the code the server "sent" -------------
      await _waitFor(tester, find.text('Enter your code'));
      expect(find.textContaining('qa.ui'.substring(0, 1)), findsWidgets);
      final code = await _codeSentTo(tester, email);
      await tester.enterText(find.byType(TextField), code);
      await tester.pump();
      await _tap(tester, find.text('Continue'));

      // ---- signed in: the landing is Reels, which is empty, not broken ----
      await _until(
        tester,
        () => currentPath(tester) == Routes.reels,
        what: 'landing on Reels after the code',
      );
      expect(find.text('Something went wrong'), findsNothing);
      expect(
        _container(tester).read(sessionControllerProvider).isSignedIn,
        isTrue,
      );

      // ---- write a post and see it in the feed ----------------------------
      _container(tester).read(routerProvider).go(Routes.home);
      await _settle(tester, ms: 300);
      // ignore: unawaited_futures
      _container(tester).read(routerProvider).push(Routes.createPost);
      await tester.pumpAndSettle();
      await _tap(tester, find.text('Text'));
      await tester.enterText(
        find.byType(TextField).first,
        'Hello from the live UI test #blockslive',
      );
      await tester.pump();
      final post = find.widgetWithText(FilledButton, 'Post').last;
      await tester.ensureVisible(post);
      await tester.tap(post);
      await _waitFor(tester, find.text('Your post is live'));
      await _waitFor(
        tester,
        find.text('Hello from the live UI test #blockslive'),
      );
      // ---- like it: the count goes up and the server agrees ---------------
      await _tap(tester, find.bySemanticsLabel(RegExp(r', 0 likes')));
      await _waitFor(tester, find.bySemanticsLabel(RegExp(r', 1 likes')));

      // ---- the profile shows who I am and one post ------------------------
      _container(tester).read(routerProvider).go(Routes.profile);
      await _waitFor(tester, find.text('@$username'));
      expect(find.text('UI Tester'), findsWidgets);

      // ---- sign out: back to the entry, nothing of this person stays ------
      // ignore: unawaited_futures
      _container(tester).read(routerProvider).push(Routes.settings);
      await tester.pumpAndSettle();
      await _scrollTo(tester, find.text('Log out'));
      expect(find.textContaining('demo'), findsNothing);
      await tester.tap(find.text('Log out'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(TextButton, 'Log out'));
      await _waitFor(tester, find.text('Create an account'));
      // The server is told, the tokens are dropped and every cache is replaced.
      await _until(
        tester,
        () => _container(tester).read(tokenStoreProvider).current == null,
        what: 'the tokens to be forgotten',
      );
      expect(
        _container(tester).read(sessionControllerProvider).isSignedIn,
        isFalse,
      );

      // ---- sign back in with the password --------------------------------
      // Nothing is in flight now, so the entry screen's fade can finish.
      await tester.pumpAndSettle();
      await tester.pumpAndSettle();
      await _tap(tester, find.text('Sign in with password'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextField, 'Email, phone or username'),
        username,
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'Password'),
        _password,
      );
      await tester.pump();
      await _tap(tester, find.text('Sign In'));
      await _until(
        tester,
        () => currentPath(tester) == Routes.reels,
        what: 'landing on Reels after signing in',
      );

      // The post is still there, and it is this person's.
      _container(tester).read(routerProvider).go(Routes.home);
      await _waitFor(
        tester,
        find.text('Hello from the live UI test #blockslive'),
      );

      // Let background loads finish, then take the app away and run the fake
      // clock past any request time-out still waiting (the test binding fails a
      // test that ends with timers pending).
      await _settle(tester, ms: 600);
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(seconds: 30));
    },
    timeout: const Timeout(Duration(minutes: 3)),
  );
}

String currentPath(WidgetTester tester) =>
    _container(tester)
        .read(routerProvider)
        .routerDelegate
        .currentConfiguration
        .last
        .matchedLocation;

String _texts(WidgetTester tester) => find
    .byType(Text)
    .evaluate()
    .map((e) => (e.widget as Text).data ?? '')
    .where((t) => t.isNotEmpty)
    .join(' | ');
