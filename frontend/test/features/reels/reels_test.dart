import 'package:blocks_app/app/router/main_shell.dart';
import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/core/constants/storage_keys.dart';
import 'package:blocks_app/core/services/local_store.dart';
import 'package:blocks_app/data/mock/mock_content_repositories.dart';
import 'package:blocks_app/data/mock/mock_world.dart';
import 'package:blocks_app/data/models/content_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/data/repositories/reel_repository.dart';
import 'package:blocks_app/features/home/presentation/home_screen.dart';
import 'package:blocks_app/features/reels/application/reels_controller.dart';
import 'package:blocks_app/features/reels/domain/reel_playback.dart';
import 'package:blocks_app/features/settings/application/app_settings.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/app_driver.dart';
import '../../helpers/fake_playback.dart';
import '../../helpers/pump_app.dart';

Future<List<Reel>> _reels(int count) async {
  final repo = MockReelRepository(
    MockWorld(clock: () => DateTime(2026, 10, 8)),
  );
  final out = <Reel>[];
  String? cursor;
  while (out.length < count) {
    final page = await repo.getReels(cursor: cursor, limit: 50);
    out.addAll(page.items);
    cursor = page.nextCursor;
    if (cursor == null) break;
  }
  return out.take(count).toList();
}

void main() {
  group('ReelPlayerPool', () {
    test('creates current + neighbours only, plays only the current', () async {
      final reels = await _reels(20);
      final log = PlaybackLog();
      final pool = ReelPlayerPool(factory: (r) => FakePlayback(r, log));

      pool.focus(reels, 0);
      expect(log.aliveCount, 2); // no previous at the start
      expect(log.playingIds, [reels[0].id]);

      pool.focus(reels, 1);
      expect(log.aliveCount, 3);
      expect(log.playingIds, [reels[1].id]);
    });

    test('never exceeds three players across a long scroll', () async {
      final reels = await _reels(60);
      final log = PlaybackLog();
      final pool = ReelPlayerPool(factory: (r) => FakePlayback(r, log));

      for (var i = 0; i < reels.length; i++) {
        pool.focus(reels, i);
        expect(log.aliveCount, lessThanOrEqualTo(3), reason: 'at index $i');
      }
      expect(log.maxAlive, 3);
      // Everything that scrolled away was disposed — nothing leaked.
      expect(log.created.length - log.disposed.length, log.aliveCount);
      expect(log.disposed.length, greaterThan(50));
    });

    test(
      'reuses a neighbour already warmed up instead of recreating it',
      () async {
        final reels = await _reels(10);
        final log = PlaybackLog();
        final pool = ReelPlayerPool(factory: (r) => FakePlayback(r, log));

        pool.focus(reels, 0);
        pool.focus(reels, 1);
        pool.focus(reels, 2);
        // Each reel is created exactly once while moving forward.
        expect(log.created.toSet().length, log.created.length);
      },
    );

    test('mute applies to existing and future players', () async {
      final reels = await _reels(10);
      final log = PlaybackLog();
      final pool = ReelPlayerPool(factory: (r) => FakePlayback(r, log));

      pool.focus(reels, 0);
      pool.muted = false;
      expect(log.alive.values.every((p) => !p.isMuted), isTrue);
      pool.focus(reels, 3);
      expect(log.alive.values.every((p) => !p.isMuted), isTrue);
    });

    test('pauseAll stops everything and dispose frees every player', () async {
      final reels = await _reels(10);
      final log = PlaybackLog();
      final pool = ReelPlayerPool(factory: (r) => FakePlayback(r, log));

      pool.focus(reels, 4);
      pool.pauseAll();
      expect(log.playingIds, isEmpty);

      pool.dispose();
      expect(log.aliveCount, 0);
    });

    test('empty list and out-of-range index are handled', () async {
      final log = PlaybackLog();
      final pool = ReelPlayerPool(factory: (r) => FakePlayback(r, log));
      pool.focus(const [], 0);
      expect(log.aliveCount, 0);

      final reels = await _reels(3);
      pool.focus(reels, 99);
      expect(log.aliveCount, lessThanOrEqualTo(3));
    });
  });

  group('ReelsScreen', () {
    const signedIn = {
      StorageKeys.onboardingCompleted: true,
      StorageKeys.demoSessionActive: true,
    };

    testWidgets('keeps at most 3 players alive while swiping, pauses off-tab', (
      tester,
    ) async {
      final log = PlaybackLog();
      await pumpBlocksApp(tester, storage: signedIn, playbackLog: log);
      await finishSplash(tester);

      Finder nav(String label) => find.descendant(
        of: find.byType(BlocksBottomNav),
        matching: find.text(label),
      );

      await tester.tap(nav('Reels'));
      await tester.pumpAndSettle();
      expect(find.byType(PageView), findsOneWidget);
      expect(log.aliveCount, 2);
      expect(log.playingIds, hasLength(1));

      for (var i = 0; i < 6; i++) {
        await tester.fling(find.byType(PageView), const Offset(0, -600), 2000);
        await tester.pumpAndSettle();
        expect(log.aliveCount, lessThanOrEqualTo(3));
        expect(log.playingIds, hasLength(1));
      }
      expect(log.disposed, isNotEmpty);

      // Leaving the tab pauses playback; coming back resumes the current reel.
      await tester.tap(nav('Home'));
      await tester.pumpAndSettle();
      expect(log.playingIds, isEmpty);

      await tester.tap(nav('Reels'));
      await tester.pumpAndSettle();
      expect(log.playingIds, hasLength(1));
    });

    testWidgets('mute toggle and like work on a reel', (tester) async {
      final log = await openSignedInApp(tester, stayOnLanding: true);

      expect(find.byIcon(Icons.volume_off_rounded), findsOneWidget);
      await tester.tap(find.byIcon(Icons.volume_off_rounded));
      await tester.pump();
      expect(find.byIcon(Icons.volume_up_rounded), findsOneWidget);
      expect(log.alive.values.every((p) => !p.isMuted), isTrue);

      await tester.tap(find.byIcon(Icons.favorite_border_rounded));
      await tester.pump();
      expect(find.byIcon(Icons.favorite_rounded), findsOneWidget);
    });
  });

  group('Reels-first launch', () {
    testWidgets('after the splash a signed-in user lands on Reels, not Home', (
      tester,
    ) async {
      final log = await openSignedInApp(tester, stayOnLanding: true);

      expect(currentLocation(tester), Routes.reels);
      expect(find.byType(PageView), findsOneWidget);
      expect(find.byType(HomeScreen), findsNothing);
      // The first reel plays straight away.
      expect(log.playingIds, hasLength(1));
    });

    testWidgets('the first reel is muted and the sound icon says so', (
      tester,
    ) async {
      final log = await openSignedInApp(tester, stayOnLanding: true);

      expect(containerOf(tester).read(reelsMutedProvider), isTrue);
      expect(log.alive.values.every((p) => p.isMuted), isTrue);
      expect(find.byIcon(Icons.volume_off_rounded), findsOneWidget);
      expect(find.byIcon(Icons.volume_up_rounded), findsNothing);
    });

    testWidgets('a stored sound preference never un-mutes a new session', (
      tester,
    ) async {
      final log = PlaybackLog();
      await pumpBlocksApp(
        tester,
        storage: {
          ...signedInStorage,
          StorageKeys.flag(AppFlag.reelsSoundEnabled.name): true,
        },
        playbackLog: log,
      );
      await finishSplash(tester);

      expect(containerOf(tester).read(reelsMutedProvider), isTrue);
      expect(log.alive.values.every((p) => p.isMuted), isTrue);
    });

    testWidgets('sound is session-only: the choice is never written to disk', (
      tester,
    ) async {
      await openSignedInApp(tester, stayOnLanding: true);
      final key = StorageKeys.flag(AppFlag.reelsSoundEnabled.name);
      final store = containerOf(tester).read(localStoreProvider);

      await tester.tap(find.byIcon(Icons.volume_off_rounded));
      await tester.pump();

      expect(containerOf(tester).read(reelsMutedProvider), isFalse);
      expect(store.getBool(key), isNull);
    });

    testWidgets('unmuting applies to the next reel too, never surprising', (
      tester,
    ) async {
      final log = await openSignedInApp(tester, stayOnLanding: true);

      await tester.tap(find.byIcon(Icons.volume_off_rounded));
      await tester.pump();
      expect(find.byIcon(Icons.volume_up_rounded), findsOneWidget);
      expect(log.alive.values.every((p) => !p.isMuted), isTrue);

      final createdBefore = log.created.length;
      await tester.fling(find.byType(PageView), const Offset(0, -600), 2000);
      await tester.pumpAndSettle();
      // The swipe really moved to another reel (a new neighbour was created)...
      expect(log.created.length, greaterThan(createdBefore));
      // ...and the next reel keeps the user's choice, including new players.
      expect(find.byIcon(Icons.volume_up_rounded), findsOneWidget);
      expect(log.alive.values.every((p) => !p.isMuted), isTrue);

      // Muting again sticks as well.
      await tester.tap(find.byIcon(Icons.volume_up_rounded));
      await tester.pump();
      final created = log.created.length;
      await tester.fling(find.byType(PageView), const Offset(0, -600), 2000);
      await tester.pumpAndSettle();
      expect(log.created.length, greaterThan(created));
      expect(log.alive.values.every((p) => p.isMuted), isTrue);
    });

    testWidgets('background / inactive pause playback; resuming keeps sound '
        'exactly as it was', (tester) async {
      final log = await openSignedInApp(tester, stayOnLanding: true);
      expect(log.playingIds, hasLength(1));

      // Locked screen / incoming call / app switcher.
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      await tester.pump();
      expect(log.playingIds, isEmpty);

      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pump();
      expect(log.playingIds, hasLength(1));
      expect(log.alive.values.every((p) => p.isMuted), isTrue); // still muted

      // Unmuted users stay unmuted; muted users are never un-muted.
      await tester.tap(find.byIcon(Icons.volume_off_rounded));
      await tester.pump();
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      await tester.pump();
      expect(log.playingIds, isEmpty);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pump();
      expect(log.playingIds, hasLength(1));
      expect(containerOf(tester).read(reelsMutedProvider), isFalse);
    });

    testWidgets('leaving the screen pauses, coming back resumes', (
      tester,
    ) async {
      final log = await openSignedInApp(tester, stayOnLanding: true);
      expect(log.playingIds, hasLength(1));

      await pushRoute(tester, Routes.settings);
      expect(log.playingIds, isEmpty);

      routerOf(tester).pop();
      await tester.pumpAndSettle();
      expect(log.playingIds, hasLength(1));
    });

    testWidgets('top bar offers For You and Following', (tester) async {
      await openSignedInApp(tester, stayOnLanding: true);
      expect(find.text('For You'), findsOneWidget);
      expect(find.text('Following'), findsOneWidget);
      expect(find.text('BLOCKS'), findsWidgets);
    });

    testWidgets('switching to Following shows only people you follow and '
        'keeps the sound choice', (tester) async {
      final log = await openSignedInApp(tester, stayOnLanding: true);
      await tester.tap(find.byIcon(Icons.volume_off_rounded));
      await tester.pump();

      await tester.tap(find.text('Following'));
      await tester.pumpAndSettle();

      final c = containerOf(tester);
      expect(c.read(reelsFeedProvider), ReelFeed.following);
      final items = c.read(reelsControllerProvider).value!.items;
      final following = await c.read(userRepositoryProvider).getFollowingIds();
      expect(items, isNotEmpty);
      expect(items.every((r) => following.contains(r.author.id)), isTrue);
      expect(c.read(reelsMutedProvider), isFalse);
      expect(log.aliveCount, lessThanOrEqualTo(3));

      await tester.tap(find.text('For You'));
      await tester.pumpAndSettle();
      expect(c.read(reelsFeedProvider), ReelFeed.forYou);
      expect(log.playingIds, hasLength(1));
    });
  });

  group('ReelRepository feeds', () {
    test('following feed only contains followed creators', () async {
      final world = MockWorld(clock: () => DateTime(2026, 10, 8));
      final repo = MockReelRepository(world);

      final page = await repo.getReels(feed: ReelFeed.following, limit: 50);
      expect(page.items, isNotEmpty);
      expect(
        page.items.every((r) => world.following.contains(r.author.id)),
        isTrue,
      );
    });

    test('unfollowing removes a creator from the following feed', () async {
      final world = MockWorld(clock: () => DateTime(2026, 10, 8));
      final repo = MockReelRepository(world);
      final first = (await repo.getReels(
        feed: ReelFeed.following,
        limit: 50,
      )).items.first.author.id;

      world.following.remove(first);
      final after = await repo.getReels(feed: ReelFeed.following, limit: 50);
      expect(after.items.any((r) => r.author.id == first), isFalse);
    });
  });
}
