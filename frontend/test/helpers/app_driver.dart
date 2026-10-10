import 'package:blocks_app/app/app.dart';
import 'package:blocks_app/app/router/app_router.dart';
import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/core/constants/storage_keys.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'fake_playback.dart';
import 'pump_app.dart';

const signedInStorage = {
  StorageKeys.onboardingCompleted: true,
  StorageKeys.demoSessionActive: true,
};

/// Boots the signed-in app with ticker-free reel playback so `pumpAndSettle`
/// can finish.
///
/// The real app lands on Reels after the splash. Most feature tests want a
/// neutral starting point, so this moves to Home unless [stayOnLanding] is
/// true (use that to test the launch experience itself).
Future<PlaybackLog> openSignedInApp(
  WidgetTester tester, {
  Size size = const Size(390, 844),
  bool stayOnLanding = false,
  List<Override> overrides = const [],
}) async {
  final log = PlaybackLog();
  await pumpBlocksApp(
    tester,
    storage: signedInStorage,
    size: size,
    playbackLog: log,
    overrides: overrides,
  );
  await finishSplash(tester);
  if (!stayOnLanding) {
    routerOf(tester).go(Routes.home);
    await tester.pumpAndSettle();
  }
  return log;
}

ProviderContainer containerOf(WidgetTester tester) =>
    ProviderScope.containerOf(tester.element(find.byType(BlocksApp)));

/// Pushes a route the same way in-app navigation does.
Future<void> pushRoute(WidgetTester tester, String location) async {
  final router = containerOf(tester).read(routerProvider);
  // ignore: unawaited_futures
  router.push(location);
  await tester.pumpAndSettle();
}

/// The router's current location (including pushed routes).
String currentLocation(WidgetTester tester) {
  final router = containerOf(tester).read(routerProvider);
  return router.routerDelegate.currentConfiguration.last.matchedLocation;
}

GoRouter routerOf(WidgetTester tester) =>
    containerOf(tester).read(routerProvider);
