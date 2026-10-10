import 'package:blocks_app/app/router/app_router.dart';
import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/core/constants/storage_keys.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../helpers/app_driver.dart';
import '../helpers/fake_playback.dart';
import '../helpers/pump_app.dart';

/// Every screen, in every language, on small and large phones with big text:
/// none may throw (layout overflow, missing string, bad constraint).
///
/// NOTE: flutter_test renders with the "Ahem" font whose glyphs are one full
/// em wide, roughly 1.7x wider than real UI fonts, so this is a deliberately
/// harsh layout stress test.
void main() {
  const languages = ['en', 'hi', 'te'];

  // The security / profile screens added with account security.
  final securityRoutes = <String, String>{
    'editProfile': Routes.editProfile,
    'security': Routes.security,
    'changePassword': Routes.changePassword,
    'changeEmail': Routes.changeEmail,
    'changePhone': Routes.changePhone,
    'resetPassword': Routes.resetPassword,
    'twoFactor': Routes.twoFactor,
    'loginActivity': Routes.loginActivity,
    'devices': Routes.devices,
    'securityNotifications': Routes.securityNotifications,
    'securityAlert': Routes.securityAlert('sec~2'),
    'securityDemo': Routes.securityDemo,
  };

  // Reel studio, Creator Studio and the money screens (payout, identity, bank).
  final creatorRoutes = <String, String>{
    'creatorStudio': Routes.creatorStudio,
    'creatorReels': Routes.creatorReels,
    'creatorPosts': Routes.creatorPosts,
    'creatorDrafts': Routes.creatorDrafts,
    'creatorAnalytics': Routes.creatorAnalytics,
    'creatorReach': Routes.creatorReach,
    'creatorEarnings': Routes.creatorEarnings,
    'creatorMusic': Routes.creatorMusic,
    'payoutCenter': Routes.payoutCenter,
    'payoutVerification': Routes.payoutVerification,
    'payoutBank': Routes.payoutBank,
    'payoutHistory': Routes.payoutHistory,
    'payoutTax': Routes.payoutTax,
    'kycFlow': Routes.kycFlow,
    'addBank': Routes.addBank,
    'requestPayout': Routes.requestPayout,
    'reelMusic': Routes.reelMusic,
    'reelDetails': Routes.reelDetails,
  };

  final routes = <String, String>{
    ...securityRoutes,
    'create': Routes.create,
    'createPost': Routes.createPost,
    'createReel': Routes.createReel,
    'createStory': Routes.createStory,
    'live': Routes.createLive,
    'notifications': Routes.notifications,
    'messages': Routes.messages,
    'chat': '/messages/cv~u1',
    ...creatorRoutes,
    'business': '/business/biz_me',
    'promote': Routes.promote,
    'verification': Routes.verification,
    'safety': Routes.safety,
    'settings': Routes.settings,
    'settingsLanguage': '/settings/language',
    'info': '/info/guidelines',
    'post': '/post/p~user~me~1',
    'otherProfile': '/user/u3',
  };

  const tabs = <String>[
    Routes.home,
    Routes.explore,
    Routes.reels,
    Routes.profile,
  ];

  for (final lang in languages) {
    testWidgets('$lang: every screen renders without errors (390x844)', (
      tester,
    ) async {
      final log = PlaybackLog();
      await pumpBlocksApp(
        tester,
        storage: {...signedInStorage, StorageKeys.languageCode: lang},
        playbackLog: log,
      );
      await finishSplash(tester);
      final router = containerOf(tester).read(routerProvider);

      for (final tab in tabs) {
        router.go(tab);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull, reason: '$lang tab $tab');
      }
      for (final e in routes.entries) {
        router.go(Routes.home);
        await tester.pumpAndSettle();
        // ignore: unawaited_futures
        router.push(e.value);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull, reason: '$lang ${e.key}');
      }
    });
  }

  testWidgets('en: key screens survive a small phone with 1.6x text', (
    tester,
  ) async {
    tester.platformDispatcher.textScaleFactorTestValue = 1.6;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

    final log = PlaybackLog();
    await pumpBlocksApp(
      tester,
      storage: signedInStorage,
      size: const Size(360, 740),
      playbackLog: log,
    );
    await finishSplash(tester);
    final router = containerOf(tester).read(routerProvider);

    for (final tab in tabs) {
      router.go(tab);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: 'tab $tab');
    }
    for (final path in [
      Routes.settings,
      Routes.safety,
      Routes.verification,
      ...creatorRoutes.values,
      '/business/biz_me',
      Routes.promote,
      Routes.createLive,
      ...securityRoutes.values,
    ]) {
      router.go(Routes.home);
      await tester.pumpAndSettle();
      // ignore: unawaited_futures
      router.push(path);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: path);
    }
  });

  // Signed-out screens, in every language, normal and large text.
  for (final lang in languages) {
    for (final scale in [1.0, 1.6]) {
      testWidgets('$lang x$scale: sign-in and recovery screens render', (
        tester,
      ) async {
        tester.platformDispatcher.textScaleFactorTestValue = scale;
        addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

        await pumpBlocksApp(
          tester,
          storage: {
            StorageKeys.onboardingCompleted: true,
            StorageKeys.languageCode: lang,
          },
          size: const Size(360, 740),
        );
        await finishSplash(tester);
        expect(tester.takeException(), isNull, reason: '$lang auth entry');

        final router = containerOf(tester).read(routerProvider);
        for (final path in [Routes.signIn, Routes.forgotPassword]) {
          // ignore: unawaited_futures
          router.push(path);
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull, reason: '$lang $path');
        }
      });
    }
  }
}
