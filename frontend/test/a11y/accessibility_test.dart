import 'package:blocks_app/app/router/app_router.dart';
import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/core/constants/storage_keys.dart';
import 'package:flutter_test/flutter_test.dart';

import '../helpers/app_driver.dart';
import '../helpers/pump_app.dart';

/// Flutter's built-in accessibility guidelines, run against real screens:
///  * every tappable target is at least 48 x 48 (Android) / 44 x 44 (iOS)
///  * every tappable target has a semantic label
///  * text has enough contrast against its background
Future<void> _meetsGuidelines(WidgetTester tester) async {
  await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
  await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
  await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
  await expectLater(tester, meetsGuideline(textContrastGuideline));
}

void main() {
  // Screens reached by pushing above the shell.
  final pushed = <String, String>{
    'Create hub': Routes.create,
    'Go Live': Routes.createLive,
    'Settings': Routes.settings,
    'Safety Center': Routes.safety,
    'Verification': Routes.verification,
    'Notifications': Routes.notifications,
    'Messages': Routes.messages,
    'Creator Studio': Routes.creatorStudio,
    'Business profile': Routes.business('biz_me'),
    'Promote': Routes.promote,
    'Post detail': Routes.post('p~user~me~1'),
    'Another profile': Routes.user('u3'),
    // Account security
    'Security hub': Routes.security,
    'Change password': Routes.changePassword,
    'Change email': Routes.changeEmail,
    'Change phone': Routes.changePhone,
    'Reset password (in app)': Routes.resetPassword,
    'Two-factor authentication': Routes.twoFactor,
    'Login activity': Routes.loginActivity,
    'Devices': Routes.devices,
    'Security notifications': Routes.securityNotifications,
    'Security alert': Routes.securityAlert('sec~2'),
    'Security demo lab': Routes.securityDemo,
    // Profile
    'Edit profile': Routes.editProfile,
    // Reel studio
    'Reel editor': Routes.createReel,
    'Music picker': Routes.reelMusic,
    'Reel details': Routes.reelDetails,
    // Creator Studio sections
    'Creator reels': Routes.creatorReels,
    'Creator posts': Routes.creatorPosts,
    'Creator drafts': Routes.creatorDrafts,
    'Creator analytics': Routes.creatorAnalytics,
    'Creator reach': Routes.creatorReach,
    'Creator earnings': Routes.creatorEarnings,
    'Creator music and copyright': Routes.creatorMusic,
    // Payout, identity and bank
    'Payout center': Routes.payoutCenter,
    'Payout verification': Routes.payoutVerification,
    'Payout bank accounts': Routes.payoutBank,
    'Payout history': Routes.payoutHistory,
    'Tax information': Routes.payoutTax,
    'Identity verification': Routes.kycFlow,
    'Add bank account': Routes.addBank,
    'Request payout': Routes.requestPayout,
  };

  // Bottom-nav tabs.
  final tabs = <String, String>{
    'Reels': Routes.reels,
    'Explore': Routes.explore,
    'Profile': Routes.profile,
  };

  testWidgets('Home', (tester) async {
    final handle = tester.ensureSemantics();
    await openSignedInApp(tester);
    await _meetsGuidelines(tester);
    handle.dispose();
  });

  for (final entry in pushed.entries) {
    testWidgets(entry.key, (tester) async {
      final handle = tester.ensureSemantics();
      await openSignedInApp(tester);
      await pushRoute(tester, entry.value);
      await _meetsGuidelines(tester);
      handle.dispose();
    });
  }

  for (final entry in tabs.entries) {
    testWidgets(entry.key, (tester) async {
      final handle = tester.ensureSemantics();
      await openSignedInApp(tester);
      containerOf(tester).read(routerProvider).go(entry.value);
      await tester.pumpAndSettle();
      await _meetsGuidelines(tester);
      handle.dispose();
    });
  }

  // Signed-out screens.
  group('signed out', () {
    Future<void> openAuth(WidgetTester tester) async {
      await pumpBlocksApp(
        tester,
        storage: const {StorageKeys.onboardingCompleted: true},
      );
      await finishSplash(tester);
    }

    testWidgets('Auth entry', (tester) async {
      final handle = tester.ensureSemantics();
      await openAuth(tester);
      await _meetsGuidelines(tester);
      handle.dispose();
    });

    for (final (name, route) in [
      ('Sign in', Routes.signIn),
      ('Forgot password', Routes.forgotPassword),
    ]) {
      testWidgets(name, (tester) async {
        final handle = tester.ensureSemantics();
        await openAuth(tester);
        await pushRoute(tester, route);
        await _meetsGuidelines(tester);
        handle.dispose();
      });
    }
  });
}
