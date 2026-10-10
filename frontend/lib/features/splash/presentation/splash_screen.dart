import 'package:blocks_app/app/router/app_router.dart';
import 'package:blocks_app/app/theme/blocks_colors.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/blocks_mark.dart';
import 'package:blocks_app/core/widgets/hero_background.dart';
import 'package:blocks_app/features/auth/application/session_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Timeline (2.6 s):
///   0.00-0.55  logo blocks rise
///   0.30-0.62  wordmark fades/slides in
///   0.55-0.80  "Made in India" + heart appear (heart then pulses)
///   0.20-1.00  thin loading bar fills
/// then a short hold and a fade into onboarding / sign-in / home.
class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen>
    with TickerProviderStateMixin {
  static const _total = Duration(milliseconds: 2600);
  static const _hold = Duration(milliseconds: 350);

  late final AnimationController _timeline = AnimationController(
    vsync: this,
    duration: _total,
  );
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  );

  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    _run(reduceMotion: context.reduceMotion);
  }

  Future<void> _run({required bool reduceMotion}) async {
    if (reduceMotion) {
      _timeline.value = 1;
      await Future<void>.delayed(const Duration(milliseconds: 900));
    } else {
      _pulse.repeat(reverse: true);
      await _timeline.forward();
      await Future<void>.delayed(_hold);
    }
    if (!mounted) return;
    context.go(initialRouteFor(ref.read(sessionControllerProvider)));
  }

  @override
  void dispose() {
    _timeline.dispose();
    _pulse.dispose();
    super.dispose();
  }

  double _interval(double begin, double end, [Curve curve = Curves.easeOut]) =>
      Interval(begin, end, curve: curve).transform(_timeline.value);

  @override
  Widget build(BuildContext context) {
    final colors = context.blocks;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: colors.heroBottom,
        body: HeroBackground(
          child: Semantics(
            label: context.l10n.splashLoadingSemantics,
            excludeSemantics: true,
            child: SafeArea(
              child: AnimatedBuilder(
                animation: Listenable.merge([_timeline, _pulse]),
                builder: (context, _) => _content(context, colors),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _content(BuildContext context, BlocksColors colors) {
    final markProgress = _interval(0, 0.55, Curves.linear);
    final wordmark = _interval(0.30, 0.62);
    final tagline = _interval(0.55, 0.80);
    final loader = _interval(0.20, 1, Curves.easeInOut);
    final heartScale = 1 + 0.16 * Curves.easeInOut.transform(_pulse.value);

    return Column(
      children: [
        const Spacer(flex: 5),
        BlocksMark(size: 92, progress: markProgress),
        const SizedBox(height: BlocksSpacing.xl),
        Opacity(
          opacity: wordmark,
          child: Transform.translate(
            offset: Offset(0, 14 * (1 - wordmark)),
            child: FittedBox(
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: BlocksSpacing.xl,
                ),
                child: Text(
                  context.l10n.appName,
                  style: context.text.displaySmall?.copyWith(
                    color: colors.onHero,
                    fontSize: 44,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 9,
                  ),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: BlocksSpacing.md),
        Opacity(
          opacity: tagline,
          // Scales down together instead of overflowing on a small phone
          // with a large system font.
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: BlocksSpacing.xl),
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    context.l10n.madeInIndia,
                    style: context.text.titleMedium?.copyWith(
                      color: colors.onHeroMuted,
                      letterSpacing: 0.6,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(width: BlocksSpacing.sm),
                  Transform.scale(
                    scale: heartScale,
                    child: ShaderMask(
                      blendMode: BlendMode.srcIn,
                      shaderCallback: (rect) => LinearGradient(
                        colors: [colors.accent, colors.reachGlobal],
                      ).createShader(rect),
                      child: const Icon(Icons.favorite_rounded, size: 20),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        const Spacer(flex: 4),
        SizedBox(
          width: 120,
          height: 3,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(BlocksRadius.pill),
            child: LinearProgressIndicator(
              value: loader,
              backgroundColor: Colors.white.withValues(alpha: 0.14),
              valueColor: AlwaysStoppedAnimation(colors.accent),
            ),
          ),
        ),
        const SizedBox(height: BlocksSpacing.huge),
      ],
    );
  }
}
