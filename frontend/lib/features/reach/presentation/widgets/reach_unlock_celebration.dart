import 'dart:math';

import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/features/reach/domain/reach_level.dart';
import 'package:blocks_app/features/reach/presentation/reach_level_labels.dart';
import 'package:blocks_app/features/reach/presentation/widgets/reach_level_badge.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Full-screen "level unlocked" moment: confetti + badge + message.
Future<void> showReachUnlockCelebration(
  BuildContext context,
  ReachLevel level,
) {
  HapticFeedback.mediumImpact();
  return showGeneralDialog<void>(
    context: context,
    barrierDismissible: true,
    barrierLabel: MaterialLocalizations.of(context).modalBarrierDismissLabel,
    barrierColor: Colors.black.withValues(alpha: 0.6),
    transitionDuration: BlocksDurations.medium,
    pageBuilder: (_, _, _) => _CelebrationPage(level: level),
    transitionBuilder: (_, animation, _, child) => FadeTransition(
      opacity: animation,
      child: ScaleTransition(
        scale: Tween(begin: 0.9, end: 1.0).animate(
          CurvedAnimation(parent: animation, curve: Curves.easeOutBack),
        ),
        child: child,
      ),
    ),
  );
}

class _CelebrationPage extends StatefulWidget {
  const _CelebrationPage({required this.level});

  final ReachLevel level;

  @override
  State<_CelebrationPage> createState() => _CelebrationPageState();
}

class _CelebrationPageState extends State<_CelebrationPage>
    with SingleTickerProviderStateMixin {
  late final AnimationController _confetti = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2600),
  );

  @override
  void initState() {
    super.initState();
    _confetti.forward();
  }

  @override
  void dispose() {
    _confetti.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final levelName = widget.level.label(l10n);
    final color = context.blocks.reachColor(widget.level);

    return Stack(
      fit: StackFit.expand,
      children: [
        if (!context.reduceMotion)
          IgnorePointer(
            child: AnimatedBuilder(
              animation: _confetti,
              builder: (_, _) => CustomPaint(
                painter: _ConfettiPainter(
                  t: _confetti.value,
                  colors: [
                    context.blocks.reachDistrict,
                    context.blocks.reachState,
                    context.blocks.reachNational,
                    context.blocks.reachGlobal,
                    Colors.white,
                  ],
                ),
              ),
            ),
          ),
        Center(
          child: Padding(
            padding: const EdgeInsets.all(BlocksSpacing.xl),
            child: Material(
              color: context.scheme.surface,
              borderRadius: BorderRadius.circular(BlocksRadius.xl + 4),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 360),
                child: Padding(
                  padding: const EdgeInsets.all(BlocksSpacing.xl),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 84,
                        height: 84,
                        decoration: BoxDecoration(
                          color: color,
                          borderRadius: BorderRadius.circular(28),
                          boxShadow: BlocksShadows.lifted(color),
                        ),
                        child: const Icon(
                          Icons.workspace_premium_rounded,
                          color: Colors.white,
                          size: 46,
                        ),
                      ),
                      const SizedBox(height: BlocksSpacing.lg),
                      ReachLevelBadge(level: widget.level),
                      const SizedBox(height: BlocksSpacing.md),
                      Semantics(
                        liveRegion: true,
                        child: Text(
                          l10n.levelUnlockedTitle(levelName.toUpperCase()),
                          style: context.text.headlineSmall,
                          textAlign: TextAlign.center,
                        ),
                      ),
                      const SizedBox(height: BlocksSpacing.sm),
                      Text(
                        l10n.levelUnlockedBody(levelName),
                        style: context.text.bodyMedium?.copyWith(
                          color: context.scheme.onSurfaceVariant,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: BlocksSpacing.xl),
                      BlocksButton(
                        label: l10n.celebrationContinue,
                        onPressed: () => Navigator.of(context).pop(),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _ConfettiPainter extends CustomPainter {
  _ConfettiPainter({required this.t, required this.colors});

  final double t;
  final List<Color> colors;

  static const _count = 46;

  @override
  void paint(Canvas canvas, Size size) {
    final r = Random(7);
    for (var i = 0; i < _count; i++) {
      final x0 = r.nextDouble();
      final drift = (r.nextDouble() - 0.5) * 0.25;
      final speed = 0.55 + r.nextDouble() * 0.6;
      final spin = (r.nextDouble() - 0.5) * 12;
      final w = 6.0 + r.nextDouble() * 6;
      final color = colors[i % colors.length];

      final progress = (t * speed + r.nextDouble() * 0.15).clamp(0.0, 1.0);
      final dx = (x0 + drift * progress) * size.width;
      final dy = -20 + progress * (size.height + 40);
      final fade = progress > 0.8 ? (1 - progress) / 0.2 : 1.0;

      canvas
        ..save()
        ..translate(dx, dy)
        ..rotate(spin * progress);
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromCenter(center: Offset.zero, width: w, height: w * 1.6),
          const Radius.circular(2),
        ),
        Paint()..color = color.withValues(alpha: fade.clamp(0.0, 1.0)),
      );
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(_ConfettiPainter old) => old.t != t;
}
