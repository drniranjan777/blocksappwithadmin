import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/features/reach/domain/reach_level.dart';
import 'package:blocks_app/features/reach/domain/reach_progress.dart';
import 'package:blocks_app/features/reach/presentation/reach_level_labels.dart';
import 'package:flutter/material.dart';

/// The signature BLOCKS component: District -> State -> National -> Global.
///
///  * levels already reached show a tick,
///  * the next level shows live progress (ring + percent),
///  * higher levels stay locked.
///
/// Progress animates from its previous value whenever [progress] changes.
class ReachLadder extends StatelessWidget {
  const ReachLadder({required this.progress, super.key, this.compact = false});

  final ReachProgress progress;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    const levels = ReachLevel.values;
    final baseNode = compact ? 36.0 : 48.0;
    final baseLabel = baseNode + (compact ? 16.0 : 20.0);

    final summary = levels
        .map((l) {
          final name = l.label(l10n);
          if (l.index <= progress.current.index) {
            return l10n.ladderReachedSemantics(name);
          }
          if (l == progress.next) {
            return l10n.ladderProgressSemantics(name, progress.percentToNext);
          }
          return l10n.ladderLockedSemantics(name);
        })
        .join(', ');

    return Semantics(
      label: l10n.ladderSemantics(summary),
      excludeSemantics: true,
      child: TweenAnimationBuilder<double>(
        tween: Tween(end: progress.fractionToNext),
        duration: context.reduceMotion
            ? Duration.zero
            : BlocksDurations.slow * 1.6,
        curve: Curves.easeOutCubic,
        builder: (context, fraction, _) => LayoutBuilder(
          builder: (context, constraints) {
            // Shrink nodes on very narrow layouts; keep >= 8px connectors.
            final fit = constraints.maxWidth.isFinite
                ? (constraints.maxWidth / (baseLabel * 4 + 24)).clamp(0.55, 1.0)
                : 1.0;
            final node = baseNode * fit;
            final labelWidth = baseLabel * fit;
            return Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (var i = 0; i < levels.length; i++) ...[
                  _LadderNode(
                    level: levels[i],
                    progress: progress,
                    fraction: fraction,
                    size: node,
                    width: labelWidth,
                    compact: compact,
                  ),
                  if (i < levels.length - 1)
                    Expanded(
                      child: Padding(
                        padding: EdgeInsets.only(top: node / 2 - 2),
                        child: _Connector(
                          from: levels[i],
                          to: levels[i + 1],
                          fill: i < progress.current.index
                              ? 1
                              : i == progress.current.index
                              ? fraction
                              : 0,
                        ),
                      ),
                    ),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}

class _Connector extends StatelessWidget {
  const _Connector({required this.from, required this.to, required this.fill});

  final ReachLevel from;
  final ReachLevel to;
  final double fill;

  @override
  Widget build(BuildContext context) {
    final colors = context.blocks;
    return ClipRRect(
      borderRadius: BorderRadius.circular(BlocksRadius.pill),
      child: SizedBox(
        height: 4,
        child: Stack(
          fit: StackFit.expand,
          children: [
            ColoredBox(color: context.scheme.outlineVariant),
            FractionallySizedBox(
              alignment: Alignment.centerLeft,
              widthFactor: fill.clamp(0.0, 1.0),
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [colors.reachColor(from), colors.reachColor(to)],
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

class _LadderNode extends StatelessWidget {
  const _LadderNode({
    required this.level,
    required this.progress,
    required this.fraction,
    required this.size,
    required this.width,
    required this.compact,
  });

  final ReachLevel level;
  final ReachProgress progress;
  final double fraction;
  final double size;
  final double width;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final colors = context.blocks;
    final color = colors.reachColor(level);
    final isReached = level.index <= progress.current.index;
    final isNext = level == progress.next;
    final radius = BorderRadius.circular(size * 0.32);

    Widget body;
    if (isReached) {
      body = DecoratedBox(
        decoration: BoxDecoration(
          color: color,
          borderRadius: radius,
          boxShadow: BlocksShadows.soft(color),
        ),
        child: Icon(
          level.isTop ? Icons.workspace_premium_rounded : Icons.check_rounded,
          color: Colors.white,
          size: size * 0.52,
        ),
      );
    } else if (isNext) {
      body = DecoratedBox(
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: radius,
          border: Border.all(color: color, width: 1.6),
        ),
        child: Stack(
          alignment: Alignment.center,
          children: [
            SizedBox.square(
              dimension: size * 0.72,
              child: CircularProgressIndicator(
                value: fraction,
                strokeWidth: compact ? 2.4 : 3,
                color: color,
                backgroundColor: color.withValues(alpha: 0.18),
              ),
            ),
            Text(
              '${(fraction * 100).floor()}%',
              style: TextStyle(
                color: color,
                fontWeight: FontWeight.w900,
                fontSize: compact ? 9 : 11,
              ),
            ),
          ],
        ),
      );
    } else {
      body = DecoratedBox(
        decoration: BoxDecoration(
          color: colors.surfaceMuted,
          borderRadius: radius,
        ),
        child: Icon(
          Icons.lock_outline_rounded,
          color: context.scheme.onSurfaceVariant,
          size: size * 0.42,
        ),
      );
    }

    return SizedBox(
      width: width,
      child: Column(
        children: [
          SizedBox.square(dimension: size, child: body),
          const SizedBox(height: BlocksSpacing.xs + 2),
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              level.label(context.l10n).toUpperCase(),
              maxLines: 1,
              style: TextStyle(
                fontSize: compact ? 8.5 : 10,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.6,
                color: isReached || isNext
                    ? color
                    : context.scheme.onSurfaceVariant,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
