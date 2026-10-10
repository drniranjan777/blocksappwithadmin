import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/core/widgets/blocks_mark.dart';
import 'package:blocks_app/core/widgets/hero_background.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/features/auth/application/session_controller.dart';
import 'package:blocks_app/features/onboarding/domain/onboarding_step.dart';
import 'package:blocks_app/features/onboarding/presentation/widgets/onboarding_illustrations.dart';
import 'package:blocks_app/features/onboarding/presentation/widgets/page_dots.dart';
import 'package:flutter/foundation.dart' show ValueListenable;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  static const _steps = OnboardingStep.values;

  final PageController _controller = PageController();

  // Only the dots / buttons depend on the page index, so use a notifier
  // instead of setState and keep the PageView subtree from rebuilding.
  final ValueNotifier<int> _index = ValueNotifier(0);

  @override
  void dispose() {
    _controller.dispose();
    _index.dispose();
    super.dispose();
  }

  void _next() {
    _controller.nextPage(
      duration: BlocksDurations.medium,
      curve: Curves.easeOutCubic,
    );
  }

  Future<void> _getStarted() async {
    await ref.read(sessionControllerProvider.notifier).completeOnboarding();
    if (mounted) context.go(Routes.auth);
  }

  Future<void> _exploreDemo() async {
    await ref.read(sessionControllerProvider.notifier).startDemoSession();
    if (mounted) context.go(Routes.landing);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.blocks;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: colors.heroBottom,
        body: HeroBackground(
          child: SafeArea(
            child: ResponsiveCenter(
              child: Column(
                children: [
                  _TopBar(index: _index, onSkip: _getStarted),
                  Expanded(
                    child: PageView.builder(
                      controller: _controller,
                      itemCount: _steps.length,
                      onPageChanged: (i) => _index.value = i,
                      itemBuilder: (context, i) => _StepPage(
                        step: _steps[i],
                        index: _index,
                        position: i,
                      ),
                    ),
                  ),
                  _BottomBar(
                    index: _index,
                    onNext: _next,
                    onGetStarted: _getStarted,
                    onExploreDemo: _exploreDemo,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar({required this.index, required this.onSkip});

  final ValueListenable<int> index;
  final VoidCallback onSkip;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        BlocksSpacing.xl,
        BlocksSpacing.sm,
        BlocksSpacing.sm,
        0,
      ),
      child: SizedBox(
        height: BlocksSpacing.touchTarget,
        child: Row(
          children: [
            const BlocksMark(size: 26),
            const Spacer(),
            ValueListenableBuilder<int>(
              valueListenable: index,
              builder: (context, i, _) => AnimatedOpacity(
                duration: BlocksDurations.fast,
                opacity: i == OnboardingStep.values.length - 1 ? 0 : 1,
                child: IgnorePointer(
                  ignoring: i == OnboardingStep.values.length - 1,
                  child: TextButton(
                    onPressed: onSkip,
                    style: TextButton.styleFrom(foregroundColor: Colors.white),
                    child: Text(context.l10n.skip),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StepPage extends StatelessWidget {
  const _StepPage({
    required this.step,
    required this.index,
    required this.position,
  });

  final OnboardingStep step;
  final ValueListenable<int> index;
  final int position;

  @override
  Widget build(BuildContext context) {
    final colors = context.blocks;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: BlocksSpacing.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 5,
            child: ValueListenableBuilder<int>(
              valueListenable: index,
              builder: (context, i, _) =>
                  OnboardingIllustration(step: step, isActive: i == position),
            ),
          ),
          const SizedBox(height: BlocksSpacing.lg),
          Semantics(
            header: true,
            child: Text(
              step.title(context.l10n),
              style: context.text.headlineMedium?.copyWith(
                color: colors.onHero,
              ),
            ),
          ),
          const SizedBox(height: BlocksSpacing.md),
          Text(
            step.body(context.l10n),
            style: context.text.bodyLarge?.copyWith(color: colors.onHeroMuted),
          ),
          const SizedBox(height: BlocksSpacing.lg),
        ],
      ),
    );
  }
}

class _BottomBar extends StatelessWidget {
  const _BottomBar({
    required this.index,
    required this.onNext,
    required this.onGetStarted,
    required this.onExploreDemo,
  });

  final ValueListenable<int> index;
  final VoidCallback onNext;
  final VoidCallback onGetStarted;
  final VoidCallback onExploreDemo;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        BlocksSpacing.xl,
        BlocksSpacing.sm,
        BlocksSpacing.xl,
        BlocksSpacing.xl,
      ),
      child: ValueListenableBuilder<int>(
        valueListenable: index,
        builder: (context, i, _) {
          final isLast = OnboardingStep.values[i].isLast;
          return Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              PageDots(count: OnboardingStep.values.length, index: i),
              const SizedBox(height: BlocksSpacing.xl),
              if (isLast) ...[
                BlocksButton(
                  label: context.l10n.getStarted,
                  variant: BlocksButtonVariant.onDark,
                  onPressed: onGetStarted,
                ),
                const SizedBox(height: BlocksSpacing.md),
                BlocksButton(
                  label: context.l10n.exploreDemo,
                  variant: BlocksButtonVariant.onDarkOutline,
                  onPressed: onExploreDemo,
                ),
              ] else
                BlocksButton(
                  label: context.l10n.next,
                  variant: BlocksButtonVariant.onDark,
                  onPressed: onNext,
                ),
            ],
          );
        },
      ),
    );
  }
}
