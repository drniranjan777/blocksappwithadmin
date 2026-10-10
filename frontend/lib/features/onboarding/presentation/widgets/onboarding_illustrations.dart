import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/blocks_mark.dart';
import 'package:blocks_app/features/onboarding/domain/onboarding_step.dart';
import 'package:blocks_app/features/reach/domain/reach_level.dart';
import 'package:blocks_app/features/reach/presentation/reach_level_labels.dart';
import 'package:flutter/material.dart';

/// Illustration for a step. [isActive] starts the entrance animation only
/// once the page is actually in view.
class OnboardingIllustration extends StatelessWidget {
  const OnboardingIllustration({
    required this.step,
    required this.isActive,
    super.key,
  });

  final OnboardingStep step;
  final bool isActive;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(end: isActive ? 1 : 0),
      duration: context.reduceMotion
          ? Duration.zero
          : const Duration(milliseconds: 1300),
      curve: Curves.easeOutCubic,
      builder: (context, t, _) => switch (step) {
        // Fills whatever space it is given (square, centred).
        OnboardingStep.welcome => _WelcomeArt(t: t),
        // Fixed-size art scales DOWN on short/narrow phones, never overflows.
        OnboardingStep.ladder => _fit(_LadderArt(t: t)),
        OnboardingStep.create => _fit(_CreateArt(t: t)),
        OnboardingStep.earn => _fit(_EarnArt(t: t)),
        OnboardingStep.business => _fit(_BusinessArt(t: t)),
      },
    );
  }

  static Widget _fit(Widget art) => FittedBox(
    fit: BoxFit.scaleDown,
    child: SizedBox(width: 320, child: art),
  );
}

class _WelcomeArt extends StatelessWidget {
  const _WelcomeArt({required this.t});
  final double t;

  @override
  Widget build(BuildContext context) {
    Widget ring(double size, double alpha, double turns) => Transform.rotate(
      angle: turns * (1 - t) * 0.6,
      child: Container(
        width: size * (0.8 + 0.2 * t),
        height: size * (0.8 + 0.2 * t),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(size * 0.28),
          border: Border.all(
            color: Colors.white.withValues(alpha: alpha * t),
            width: 1.5,
          ),
        ),
      ),
    );

    return Center(
      child: AspectRatio(
        aspectRatio: 1,
        child: LayoutBuilder(
          builder: (context, c) {
            final s = c.biggest.shortestSide;
            return Stack(
              alignment: Alignment.center,
              children: [
                ring(s, 0.10, 1),
                ring(s * 0.76, 0.18, -1),
                ring(s * 0.54, 0.30, 1),
                BlocksMark(size: s * 0.34, progress: t),
              ],
            );
          },
        ),
      ),
    );
  }
}

/// The hero visual: DISTRICT -> STATE -> NATIONAL -> GLOBAL, each tier wider
/// than the last to show reach widening.
class _LadderArt extends StatelessWidget {
  const _LadderArt({required this.t});
  final double t;

  @override
  Widget build(BuildContext context) {
    const levels = ReachLevel.values;
    final widths = [0.58, 0.70, 0.82, 0.94];

    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 0; i < levels.length; i++) ...[
            _tier(context, levels[i], widths[i], i),
            if (i < levels.length - 1)
              Opacity(
                opacity: _stagger(i + 0.5),
                child: Icon(
                  Icons.south_rounded,
                  size: 20,
                  color: Colors.white.withValues(alpha: 0.5),
                ),
              ),
          ],
        ],
      ),
    );
  }

  double _stagger(num i) =>
      Interval((i * 0.17).clamp(0, 0.7).toDouble(), 1).transform(t);

  Widget _tier(BuildContext context, ReachLevel level, double width, int i) {
    final p = _stagger(i);
    final color = context.blocks.reachColor(level);
    return FractionallySizedBox(
      widthFactor: width * (0.85 + 0.15 * p),
      child: Opacity(
        opacity: p,
        child: Container(
          padding: const EdgeInsets.symmetric(
            horizontal: BlocksSpacing.lg,
            vertical: BlocksSpacing.md,
          ),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.22),
            borderRadius: BorderRadius.circular(BlocksRadius.lg),
            border: Border.all(color: color.withValues(alpha: 0.7)),
          ),
          child: Row(
            children: [
              Container(
                width: 28,
                height: 28,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: color,
                  borderRadius: BorderRadius.circular(BlocksRadius.sm),
                ),
                child: Text(
                  level.code,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w900,
                    fontSize: 12,
                  ),
                ),
              ),
              const SizedBox(width: BlocksSpacing.md),
              Expanded(
                child: Text(
                  level.label(context.l10n).toUpperCase(),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: context.text.labelLarge?.copyWith(
                    color: Colors.white,
                    letterSpacing: 2,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CreateArt extends StatelessWidget {
  const _CreateArt({required this.t});
  final double t;

  @override
  Widget build(BuildContext context) {
    final colors = context.blocks;
    Widget card(IconData icon, Color color, double angle, Offset offset) {
      return Transform.translate(
        offset: offset * t,
        child: Transform.rotate(
          angle: angle * t,
          child: Opacity(
            opacity: t,
            child: Container(
              width: 116,
              height: 150,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(BlocksRadius.xl),
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [color, color.withValues(alpha: 0.55)],
                ),
                boxShadow: BlocksShadows.lifted(Colors.black),
              ),
              child: Icon(icon, color: Colors.white, size: 44),
            ),
          ),
        ),
      );
    }

    return Center(
      child: SizedBox(
        height: 220,
        child: Stack(
          alignment: Alignment.center,
          children: [
            card(
              Icons.image_rounded,
              colors.reachDistrict,
              -0.18,
              const Offset(-84, 8),
            ),
            card(
              Icons.auto_awesome_rounded,
              colors.reachNational,
              0.16,
              const Offset(84, 8),
            ),
            card(
              Icons.play_arrow_rounded,
              colors.reachState,
              0,
              const Offset(0, -10),
            ),
          ],
        ),
      ),
    );
  }
}

class _EarnArt extends StatelessWidget {
  const _EarnArt({required this.t});
  final double t;

  @override
  Widget build(BuildContext context) {
    final colors = context.blocks;
    return Center(
      child: Container(
        width: 250,
        padding: const EdgeInsets.all(BlocksSpacing.xl),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(BlocksRadius.xl),
          border: Border.all(color: Colors.white.withValues(alpha: 0.16)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: colors.accent,
                borderRadius: BorderRadius.circular(BlocksRadius.lg),
              ),
              child: const Icon(
                Icons.currency_rupee_rounded,
                color: Colors.white,
                size: 30,
              ),
            ),
            const SizedBox(height: BlocksSpacing.xl),
            for (final (i, level) in ReachLevel.values.indexed) ...[
              _bar(colors.reachColor(level), [0.9, 0.7, 0.42, 0.2][i] * t),
              if (i < 3) const SizedBox(height: BlocksSpacing.md),
            ],
          ],
        ),
      ),
    );
  }

  Widget _bar(Color color, double value) => ClipRRect(
    borderRadius: BorderRadius.circular(BlocksRadius.pill),
    child: LinearProgressIndicator(
      value: value,
      minHeight: 10,
      color: color,
      backgroundColor: Colors.white.withValues(alpha: 0.12),
    ),
  );
}

class _BusinessArt extends StatelessWidget {
  const _BusinessArt({required this.t});
  final double t;

  @override
  Widget build(BuildContext context) {
    final colors = context.blocks;
    return Center(
      child: Transform.scale(
        scale: 0.9 + 0.1 * t,
        child: Opacity(
          opacity: t,
          child: Container(
            width: 250,
            padding: const EdgeInsets.all(BlocksSpacing.xl),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(BlocksRadius.xl),
              border: Border.all(color: Colors.white.withValues(alpha: 0.16)),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Container(
                      width: 72,
                      height: 72,
                      decoration: BoxDecoration(
                        color: colors.reachState,
                        borderRadius: BorderRadius.circular(BlocksRadius.xl),
                      ),
                      child: const Icon(
                        Icons.storefront_rounded,
                        color: Colors.white,
                        size: 38,
                      ),
                    ),
                    Positioned(
                      right: -8,
                      bottom: -8,
                      child: Container(
                        padding: const EdgeInsets.all(2),
                        decoration: const BoxDecoration(
                          color: Colors.white,
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          Icons.verified_rounded,
                          color: colors.success,
                          size: 24,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: BlocksSpacing.xl),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    _pill(Icons.location_on_rounded, colors.reachDistrict),
                    const SizedBox(width: BlocksSpacing.sm),
                    _pill(Icons.campaign_rounded, colors.accent),
                    const SizedBox(width: BlocksSpacing.sm),
                    _pill(Icons.chat_rounded, colors.success),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _pill(IconData icon, Color color) => Container(
    width: 44,
    height: 44,
    decoration: BoxDecoration(
      color: color.withValues(alpha: 0.22),
      borderRadius: BorderRadius.circular(BlocksRadius.md),
    ),
    child: Icon(icon, color: color, size: 22),
  );
}
