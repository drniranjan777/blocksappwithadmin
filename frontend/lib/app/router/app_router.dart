import 'package:blocks_app/app/config/app_config.dart';
import 'package:blocks_app/app/router/main_shell.dart';
import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/session_scope.dart';
import 'package:blocks_app/data/models/auth_models.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/features/auth/application/session_controller.dart';
import 'package:blocks_app/features/auth/presentation/auth_entry_screen.dart';
import 'package:blocks_app/features/auth/presentation/register_screen.dart';
import 'package:blocks_app/features/auth/presentation/sign_in_screen.dart';
import 'package:blocks_app/features/auth/presentation/verify_code_screen.dart';
import 'package:blocks_app/features/business/presentation/business_profile_screen.dart';
import 'package:blocks_app/features/business/presentation/promote_screen.dart';
import 'package:blocks_app/features/create/presentation/create_hub_screen.dart';
import 'package:blocks_app/features/create/presentation/create_post_screen.dart';
import 'package:blocks_app/features/create/presentation/create_story_screen.dart';
import 'package:blocks_app/features/create/presentation/go_live_screen.dart';
import 'package:blocks_app/features/creator/presentation/creator_analytics_screen.dart';
import 'package:blocks_app/features/creator/presentation/creator_content_screens.dart';
import 'package:blocks_app/features/creator/presentation/creator_earnings_screen.dart';
import 'package:blocks_app/features/creator/presentation/creator_music_screen.dart';
import 'package:blocks_app/features/creator/presentation/creator_reach_screen.dart';
import 'package:blocks_app/features/creator/presentation/creator_studio_screen.dart';
import 'package:blocks_app/features/kyc/presentation/kyc_flow_screen.dart';
import 'package:blocks_app/features/payout/presentation/add_bank_screen.dart';
import 'package:blocks_app/features/payout/presentation/payout_center_screen.dart';
import 'package:blocks_app/features/payout/presentation/request_payout_screen.dart';
import 'package:blocks_app/features/payout/presentation/tax_info_screen.dart';
import 'package:blocks_app/features/explore/presentation/explore_screen.dart';
import 'package:blocks_app/features/home/presentation/home_screen.dart';
import 'package:blocks_app/features/messages/presentation/chat_screen.dart';
import 'package:blocks_app/features/messages/presentation/messages_screen.dart';
import 'package:blocks_app/features/notifications/presentation/notifications_screen.dart';
import 'package:blocks_app/features/onboarding/presentation/onboarding_screen.dart';
import 'package:blocks_app/features/post/presentation/post_detail_screen.dart';
import 'package:blocks_app/features/profile/presentation/edit_profile_screen.dart';
import 'package:blocks_app/features/profile/presentation/profile_screen.dart';
import 'package:blocks_app/features/reel_studio/presentation/music_picker_screen.dart';
import 'package:blocks_app/features/reel_studio/presentation/reel_details_screen.dart';
import 'package:blocks_app/features/reel_studio/presentation/reel_publishing_screen.dart';
import 'package:blocks_app/features/reel_studio/presentation/reel_studio_screen.dart';
import 'package:blocks_app/features/reels/presentation/reels_screen.dart';
import 'package:blocks_app/features/safety/presentation/account_list_screen.dart';
import 'package:blocks_app/features/safety/presentation/safety_center_screen.dart';
import 'package:blocks_app/features/security/presentation/change_contact_screen.dart';
import 'package:blocks_app/features/security/presentation/change_password_screen.dart';
import 'package:blocks_app/features/security/presentation/devices_screen.dart';
import 'package:blocks_app/features/security/presentation/forgot_password_screen.dart';
import 'package:blocks_app/features/security/presentation/login_activity_screen.dart';
import 'package:blocks_app/features/security/presentation/security_alert_screen.dart';
import 'package:blocks_app/features/security/presentation/security_demo_screen.dart';
import 'package:blocks_app/features/security/presentation/security_notifications_screen.dart';
import 'package:blocks_app/features/security/presentation/security_screen.dart';
import 'package:blocks_app/features/security/presentation/two_factor_screen.dart';
import 'package:blocks_app/features/settings/presentation/info_page_screen.dart';
import 'package:blocks_app/features/settings/presentation/settings_detail_screen.dart';
import 'package:blocks_app/features/settings/presentation/settings_screen.dart';
import 'package:blocks_app/features/splash/presentation/splash_screen.dart';
import 'package:blocks_app/features/stories/presentation/story_viewer_screen.dart';
import 'package:blocks_app/features/verification/presentation/verification_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Where a launch (or sign-out) should land, given persisted session state.
String initialRouteFor(SessionState s) {
  if (s.isSignedIn) return Routes.landing;
  return s.onboardingCompleted ? Routes.auth : Routes.onboarding;
}

final routerProvider = Provider<GoRouter>((ref) {
  // One key per router, never shared: a key shared across routers would carry the
  // previous router's Navigator (its open routes, snackbars and dialogs) into the
  // next one after a sign-out.
  final rootKey = GlobalKey<NavigatorState>(debugLabel: 'root');
  // Re-run redirects whenever session state changes (sign-in / sign-out).
  final refresh = ValueNotifier<int>(0);
  ref
    ..listen(sessionControllerProvider, (_, _) => refresh.value++)
    ..onDispose(refresh.dispose);

  return GoRouter(
    navigatorKey: rootKey,
    initialLocation: ref.read(initialLocationProvider),
    refreshListenable: refresh,
    redirect: (context, state) {
      final session = ref.read(sessionControllerProvider);
      final loc = state.matchedLocation;

      // Splash owns its own timing and chooses the next route itself.
      if (loc == Routes.splash) return null;

      final isPublic =
          loc == Routes.onboarding ||
          loc == Routes.auth ||
          loc.startsWith('${Routes.auth}/');
      if (!session.isSignedIn && !isPublic) return initialRouteFor(session);
      if (session.isSignedIn && isPublic) return Routes.landing;
      return null;
    },
    routes: [
      GoRoute(path: Routes.splash, builder: (_, _) => const SplashScreen()),
      GoRoute(
        path: Routes.onboarding,
        pageBuilder: (_, state) => _fade(state, const OnboardingScreen()),
      ),
      GoRoute(
        path: Routes.auth,
        pageBuilder: (_, state) => _fade(state, const AuthEntryScreen()),
        routes: [
          // Public: reachable while signed out.
          GoRoute(path: 'sign-in', builder: (_, _) => const SignInScreen()),
          GoRoute(path: 'sign-up', builder: (_, _) => const RegisterScreen()),
          GoRoute(
            path: 'code',
            // The challenge comes with the navigation; without one (an
            // restored route, a deep link) there is nothing to continue.
            redirect: (_, state) =>
                state.extra is CodeChallenge ? null : Routes.auth,
            builder: (_, state) =>
                VerifyCodeScreen(challenge: state.extra! as CodeChallenge),
          ),
          GoRoute(
            path: 'forgot',
            builder: (_, _) => const ForgotPasswordScreen(),
          ),
        ],
      ),
      StatefulShellRoute.indexedStack(
        builder: (_, _, shell) => MainShell(navigationShell: shell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(path: Routes.home, builder: (_, _) => const HomeScreen()),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: Routes.explore,
                builder: (_, _) => const ExploreScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: Routes.reels,
                builder: (_, _) => const ReelsScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: Routes.profile,
                builder: (_, _) => const ProfileScreen(),
                routes: [
                  GoRoute(
                    path: 'edit',
                    parentNavigatorKey: rootKey,
                    builder: (_, _) => const EditProfileScreen(),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),

      // ---- Full-screen routes pushed above the shell (no bottom nav) ----
      GoRoute(
        path: '/post/:id',
        parentNavigatorKey: rootKey,
        builder: (_, state) =>
            PostDetailScreen(postId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/user/:id',
        parentNavigatorKey: rootKey,
        builder: (_, state) =>
            ProfileScreen(userId: state.pathParameters['id']),
      ),
      GoRoute(
        path: Routes.creatorStudio,
        parentNavigatorKey: rootKey,
        builder: (_, _) => const CreatorStudioScreen(),
        routes: [
          GoRoute(
            path: 'reels',
            parentNavigatorKey: rootKey,
            builder: (_, _) => const CreatorReelsScreen(),
          ),
          GoRoute(
            path: 'posts',
            parentNavigatorKey: rootKey,
            builder: (_, _) => const CreatorPostsScreen(),
          ),
          GoRoute(
            path: 'drafts',
            parentNavigatorKey: rootKey,
            builder: (_, _) => const CreatorDraftsScreen(),
          ),
          GoRoute(
            path: 'analytics',
            parentNavigatorKey: rootKey,
            builder: (_, _) => const CreatorAnalyticsScreen(),
            routes: [
              GoRoute(
                path: ':id',
                parentNavigatorKey: rootKey,
                builder: (_, state) =>
                    ReelAnalyticsScreen(reelId: state.pathParameters['id']!),
              ),
            ],
          ),
          GoRoute(
            path: 'reach',
            parentNavigatorKey: rootKey,
            builder: (_, _) => const CreatorReachScreen(),
          ),
          GoRoute(
            path: 'earnings',
            parentNavigatorKey: rootKey,
            builder: (_, _) => const CreatorEarningsScreen(),
          ),
          GoRoute(
            path: 'music',
            parentNavigatorKey: rootKey,
            builder: (_, _) => const CreatorMusicScreen(),
          ),
          GoRoute(
            path: 'payout',
            parentNavigatorKey: rootKey,
            builder: (_, _) => const PayoutCenterScreen(),
            routes: [
              GoRoute(
                path: 'verification',
                parentNavigatorKey: rootKey,
                builder: (_, _) => const PayoutCenterScreen(
                  initialTab: PayoutTab.verification,
                ),
                routes: [
                  GoRoute(
                    path: 'start',
                    parentNavigatorKey: rootKey,
                    builder: (_, _) => const KycFlowScreen(),
                  ),
                ],
              ),
              GoRoute(
                path: 'bank',
                parentNavigatorKey: rootKey,
                builder: (_, _) =>
                    const PayoutCenterScreen(initialTab: PayoutTab.methods),
                routes: [
                  GoRoute(
                    path: 'add',
                    parentNavigatorKey: rootKey,
                    builder: (_, _) => const AddBankScreen(),
                  ),
                ],
              ),
              GoRoute(
                path: 'history',
                parentNavigatorKey: rootKey,
                builder: (_, _) =>
                    const PayoutCenterScreen(initialTab: PayoutTab.history),
              ),
              GoRoute(
                path: 'tax',
                parentNavigatorKey: rootKey,
                builder: (_, _) => const TaxInfoScreen(),
              ),
              GoRoute(
                path: 'request',
                parentNavigatorKey: rootKey,
                builder: (_, _) => const RequestPayoutScreen(),
              ),
            ],
          ),
        ],
      ),
      GoRoute(
        path: '/business/:id',
        parentNavigatorKey: rootKey,
        builder: (_, state) =>
            BusinessProfileScreen(businessId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: Routes.promote,
        parentNavigatorKey: rootKey,
        builder: (_, state) =>
            PromoteScreen(postId: state.uri.queryParameters['postId']),
      ),
      GoRoute(
        path: '/story/:id',
        parentNavigatorKey: rootKey,
        pageBuilder: (_, state) => CustomTransitionPage<void>(
          key: state.pageKey,
          child: StoryViewerScreen(groupId: state.pathParameters['id']!),
          transitionsBuilder: (_, animation, _, child) =>
              FadeTransition(opacity: animation, child: child),
        ),
      ),
      GoRoute(
        path: Routes.create,
        parentNavigatorKey: rootKey,
        pageBuilder: (_, state) => CustomTransitionPage<void>(
          key: state.pageKey,
          fullscreenDialog: true,
          child: const CreateHubScreen(),
          transitionsBuilder: (_, animation, _, child) => SlideTransition(
            position: Tween(
              begin: const Offset(0, 1),
              end: Offset.zero,
            ).chain(CurveTween(curve: Curves.easeOutCubic)).animate(animation),
            child: child,
          ),
        ),
        routes: [
          GoRoute(
            path: 'post',
            parentNavigatorKey: rootKey,
            builder: (_, _) => const CreatePostScreen(),
          ),
          GoRoute(
            path: 'reel',
            parentNavigatorKey: rootKey,
            builder: (_, state) =>
                ReelStudioScreen(draftId: state.uri.queryParameters['draft']),
            routes: [
              GoRoute(
                path: 'music',
                parentNavigatorKey: rootKey,
                builder: (_, _) => const MusicPickerScreen(),
              ),
              GoRoute(
                path: 'details',
                parentNavigatorKey: rootKey,
                builder: (_, _) => const ReelDetailsScreen(),
              ),
              GoRoute(
                path: 'publishing',
                parentNavigatorKey: rootKey,
                builder: (_, _) => const ReelPublishingScreen(),
              ),
            ],
          ),
          GoRoute(
            path: 'story',
            parentNavigatorKey: rootKey,
            builder: (_, _) => const CreateStoryScreen(),
          ),
          GoRoute(
            path: 'live',
            parentNavigatorKey: rootKey,
            builder: (_, _) => const GoLiveScreen(),
          ),
        ],
      ),
      GoRoute(
        path: Routes.notifications,
        parentNavigatorKey: rootKey,
        builder: (_, _) => const NotificationsScreen(),
      ),
      GoRoute(
        path: Routes.messages,
        parentNavigatorKey: rootKey,
        builder: (_, _) => const MessagesScreen(),
        routes: [
          GoRoute(
            path: ':id',
            parentNavigatorKey: rootKey,
            builder: (_, state) =>
                ChatScreen(conversationId: state.pathParameters['id']!),
          ),
        ],
      ),
      GoRoute(
        path: Routes.verification,
        parentNavigatorKey: rootKey,
        builder: (_, _) => const VerificationScreen(),
      ),
      GoRoute(
        path: Routes.safety,
        parentNavigatorKey: rootKey,
        builder: (_, _) => const SafetyCenterScreen(),
      ),
      GoRoute(
        path: Routes.settings,
        parentNavigatorKey: rootKey,
        builder: (_, _) => const SettingsScreen(),
        routes: [
          // Static segments first so ":kind" does not swallow them.
          GoRoute(
            path: 'security',
            parentNavigatorKey: rootKey,
            builder: (_, _) => const SecurityScreen(),
            routes: [
              GoRoute(
                path: 'password',
                parentNavigatorKey: rootKey,
                builder: (_, _) => const ChangePasswordScreen(),
              ),
              GoRoute(
                path: 'reset-password',
                parentNavigatorKey: rootKey,
                builder: (_, _) => const ForgotPasswordScreen(inApp: true),
              ),
              GoRoute(
                path: 'email',
                parentNavigatorKey: rootKey,
                builder: (_, _) =>
                    const ChangeContactScreen(channel: OtpChannel.email),
              ),
              GoRoute(
                path: 'phone',
                parentNavigatorKey: rootKey,
                builder: (_, _) =>
                    const ChangeContactScreen(channel: OtpChannel.phone),
              ),
              GoRoute(
                path: 'demo',
                parentNavigatorKey: rootKey,
                // Demo builds only; a production build has no such screen.
                redirect: (_, _) =>
                    ref.read(appConfigProvider).isDemo ? null : Routes.security,
                builder: (_, _) => const SecurityDemoScreen(),
              ),
              GoRoute(
                path: 'two-factor',
                parentNavigatorKey: rootKey,
                builder: (_, _) => const TwoFactorScreen(),
              ),
              GoRoute(
                path: 'activity',
                parentNavigatorKey: rootKey,
                builder: (_, _) => const LoginActivityScreen(),
              ),
              GoRoute(
                path: 'devices',
                parentNavigatorKey: rootKey,
                builder: (_, _) => const DevicesScreen(),
              ),
              GoRoute(
                path: 'notifications',
                parentNavigatorKey: rootKey,
                builder: (_, _) => const SecurityNotificationsScreen(),
              ),
              GoRoute(
                path: 'alert/:id',
                parentNavigatorKey: rootKey,
                builder: (_, state) =>
                    SecurityAlertScreen(eventId: state.pathParameters['id']!),
              ),
            ],
          ),
          GoRoute(
            path: 'blocked',
            parentNavigatorKey: rootKey,
            builder: (_, _) =>
                const AccountListScreen(kind: AccountListKind.blocked),
          ),
          GoRoute(
            path: 'muted',
            parentNavigatorKey: rootKey,
            builder: (_, _) =>
                const AccountListScreen(kind: AccountListKind.muted),
          ),
          GoRoute(
            path: ':kind',
            parentNavigatorKey: rootKey,
            redirect: (_, state) =>
                SettingsKind.values.any(
                  (k) => k.name == state.pathParameters['kind'],
                )
                ? null
                : Routes.settings,
            builder: (_, state) => SettingsDetailScreen(
              kind: SettingsKind.values.byName(state.pathParameters['kind']!),
            ),
          ),
        ],
      ),
      GoRoute(
        path: '/info/:topic',
        parentNavigatorKey: rootKey,
        builder: (_, state) =>
            InfoPageScreen(topic: state.pathParameters['topic']!),
      ),
    ],
  );
});

CustomTransitionPage<void> _fade(GoRouterState state, Widget child) {
  return CustomTransitionPage<void>(
    key: state.pageKey,
    child: child,
    transitionDuration: const Duration(milliseconds: 350),
    transitionsBuilder: (_, animation, _, child) =>
        FadeTransition(opacity: animation, child: child),
  );
}
