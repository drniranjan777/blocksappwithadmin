import 'package:blocks_app/app/config/app_config.dart';
import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/blocks_avatar.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/core/widgets/blocks_mark.dart';
import 'package:blocks_app/core/widgets/hero_background.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/data/mock/demo_identity.dart';
import 'package:blocks_app/features/auth/application/session_controller.dart';
import 'package:blocks_app/features/reach/presentation/widgets/reach_level_badge.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Entry point for returning visitors. In the demo there is no real sign-in:
/// the only action is "Continue as Demo User". When the real auth feature
/// lands, this screen gains phone/email sign-in and the demo card moves to a
/// debug-only entry.
class AuthEntryScreen extends ConsumerWidget {
  const AuthEntryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.blocks;
    final demo = ref.watch(demoIdentityProvider);
    final demoAvailable = ref.watch(appConfigProvider).useMockData;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: colors.heroBottom,
        body: HeroBackground(
          child: SafeArea(
            child: ResponsiveCenter(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(BlocksSpacing.xl),
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    minHeight:
                        MediaQuery.sizeOf(context).height -
                        MediaQuery.paddingOf(context).vertical -
                        BlocksSpacing.xl * 2,
                  ),
                  child: IntrinsicHeight(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SizedBox(height: BlocksSpacing.xl),
                        const BlocksMark(size: 44),
                        const SizedBox(height: BlocksSpacing.xl),
                        Semantics(
                          header: true,
                          child: Text(
                            context.l10n.authTitle,
                            style: context.text.headlineMedium?.copyWith(
                              color: colors.onHero,
                            ),
                          ),
                        ),
                        const SizedBox(height: BlocksSpacing.md),
                        Text(
                          demoAvailable
                              ? context.l10n.authSubtitle
                              : context.l10n.authSubtitleLive,
                          style: context.text.bodyLarge?.copyWith(
                            color: colors.onHeroMuted,
                          ),
                        ),
                        const Spacer(),
                        // The built-in demo account exists only in the mock
                        // build; with the real service there is no such user.
                        if (demoAvailable) ...[
                          _DemoUserCard(demo: demo),
                          const SizedBox(height: BlocksSpacing.xl),
                          BlocksButton(
                            label: context.l10n.continueAsDemoUser,
                            variant: BlocksButtonVariant.onDark,
                            icon: Icons.arrow_forward_rounded,
                            onPressed: () async {
                              await ref
                                  .read(sessionControllerProvider.notifier)
                                  .startDemoSession();
                              if (context.mounted) context.go(Routes.landing);
                            },
                          ),
                          const SizedBox(height: BlocksSpacing.sm),
                        ] else ...[
                          BlocksButton(
                            label: context.l10n.authCreateAccount,
                            variant: BlocksButtonVariant.onDark,
                            icon: Icons.person_add_alt_1_rounded,
                            onPressed: () => context.push(Routes.signUp),
                          ),
                          const SizedBox(height: BlocksSpacing.sm),
                        ],
                        BlocksButton(
                          label: context.l10n.authSignInPassword,
                          variant: BlocksButtonVariant.onDarkOutline,
                          icon: Icons.password_rounded,
                          onPressed: () => context.push(Routes.signIn),
                        ),
                        // "Demo data is generated on your device" is true of
                        // the demo build only.
                        if (demoAvailable) ...[
                          const SizedBox(height: BlocksSpacing.lg),
                          Center(
                            child: Text(
                              context.l10n.authFootnote,
                              style: context.text.bodySmall?.copyWith(
                                color: colors.onHeroMuted,
                              ),
                              textAlign: TextAlign.center,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _DemoUserCard extends StatelessWidget {
  const _DemoUserCard({required this.demo});

  final DemoIdentity demo;

  @override
  Widget build(BuildContext context) {
    final colors = context.blocks;
    return Container(
      padding: const EdgeInsets.all(BlocksSpacing.lg),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(BlocksRadius.xl),
        border: Border.all(color: Colors.white.withValues(alpha: 0.16)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            context.l10n.authDemoCardCaption.toUpperCase(),
            style: context.text.labelSmall?.copyWith(
              color: colors.onHeroMuted,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: BlocksSpacing.md),
          Row(
            children: [
              BlocksAvatar(
                name: demo.name,
                size: 56,
                isVerified: demo.isVerified,
              ),
              const SizedBox(width: BlocksSpacing.lg),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      demo.name,
                      style: context.text.titleMedium?.copyWith(
                        color: colors.onHero,
                      ),
                    ),
                    Text(
                      '${demo.username} · ${demo.location}',
                      style: context.text.bodySmall?.copyWith(
                        color: colors.onHeroMuted,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: BlocksSpacing.sm),
                    // Scales down instead of overflowing with long level
                    // names (Telugu) or large system text.
                    Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        child: ReachLevelBadge(
                          level: demo.reachLevel,
                          dense: true,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
