import 'package:blocks_app/app/app.dart';
import 'package:blocks_app/app/theme/app_theme.dart';
import 'package:blocks_app/core/services/local_store.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/reels/application/reels_controller.dart';
import 'package:blocks_app/l10n/gen/app_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';

import 'fake_playback.dart';

/// Answers platform-channel calls (clipboard, haptics, system chrome) that
/// the test binding does not handle, so awaiting them cannot hang a test.
void mockPlatformChannels() {
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(SystemChannels.platform, (call) async => null);
}

/// Boots the full app with an in-memory store (no platform channels).
///
/// Reels is the landing screen, and the real demo playback animates forever,
/// which would stop `pumpAndSettle` from finishing. So reels use a ticker-free
/// fake; pass a [playbackLog] to observe which players are created, playing
/// and disposed.
Future<void> pumpBlocksApp(
  WidgetTester tester, {
  Map<String, Object>? storage,
  Size size = const Size(390, 844),
  List<Override> overrides = const [],
  PlaybackLog? playbackLog,
}) async {
  mockPlatformChannels();
  tester.view
    ..physicalSize = size * 2
    ..devicePixelRatio = 2;
  addTearDown(tester.view.reset);

  final log = playbackLog ?? PlaybackLog();
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        localStoreProvider.overrideWithValue(InMemoryLocalStore(storage)),
        mockLatencyProvider.overrideWithValue(Duration.zero),
        reelPlaybackBuilderProvider.overrideWithValue(
          (reel, vsync) => FakePlayback(reel, log),
        ),
        ...overrides,
      ],
      child: const BlocksApp(),
    ),
  );
}

/// Wraps a single widget with theme + localisation for component tests.
Widget themed(
  Widget child, {
  Locale locale = const Locale('en'),
  List<Override> overrides = const [],
}) {
  return ProviderScope(
    overrides: [
      mockLatencyProvider.overrideWithValue(Duration.zero),
      ...overrides,
    ],
    child: MaterialApp(
      theme: AppTheme.light(),
      locale: locale,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: Scaffold(body: Center(child: child)),
    ),
  );
}

/// Lets the splash timeline (2.6 s) + hold + page transition finish.
Future<void> finishSplash(WidgetTester tester) async {
  await tester.pump(const Duration(milliseconds: 2700));
  await tester.pump(const Duration(milliseconds: 500));
  await tester.pumpAndSettle();
}
