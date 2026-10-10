import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/features/reach/domain/reach_progress.dart';
import 'package:blocks_app/features/reach/presentation/reach_level_labels.dart';
import 'package:flutter/material.dart';

/// "Rising" callout: a post that is close to its next Reach Level.
/// This is the BLOCKS feed's signature element.
class RisingBanner extends StatelessWidget {
  const RisingBanner({
    required this.progress,
    super.key,
    this.isOwnPost = false,
  });

  final ReachProgress progress;
  final bool isOwnPost;

  /// Only show the banner when a next level exists and it is in sight.
  static bool shouldShow(ReachProgress p) =>
      p.next != null && p.fractionToNext >= 0.5;

  @override
  Widget build(BuildContext context) {
    final next = progress.next;
    if (next == null) return const SizedBox.shrink();

    final l10n = context.l10n;
    final accent = context.blocks.accent;
    final nextColor = context.blocks.reachColor(next);
    final nextName = next.label(l10n);
    final percent = progress.percentToNext;

    return Semantics(
      container: true,
      label: isOwnPost
          ? l10n.risingOwn(percent, nextName)
          : l10n.risingOther(percent, nextName),
      child: ExcludeSemantics(
        child: Container(
          padding: const EdgeInsets.all(BlocksSpacing.md + 2),
          decoration: BoxDecoration(
            color: accent.withValues(alpha: 0.10),
            borderRadius: BorderRadius.circular(BlocksRadius.lg),
            border: Border.all(color: accent.withValues(alpha: 0.35)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    Icons.local_fire_department_rounded,
                    size: 18,
                    color: accent,
                  ),
                  const SizedBox(width: BlocksSpacing.xs + 2),
                  Text(
                    l10n.risingBadge,
                    style: context.text.labelMedium?.copyWith(
                      color: accent,
                      letterSpacing: 1.2,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: BlocksSpacing.sm),
              Text(
                isOwnPost
                    ? l10n.risingOwn(percent, nextName)
                    : l10n.risingOther(percent, nextName),
                style: context.text.titleSmall,
              ),
              const SizedBox(height: BlocksSpacing.md),
              TweenAnimationBuilder<double>(
                tween: Tween(end: progress.fractionToNext),
                duration: context.reduceMotion
                    ? Duration.zero
                    : BlocksDurations.slow * 1.5,
                curve: Curves.easeOutCubic,
                builder: (context, v, _) => ClipRRect(
                  borderRadius: BorderRadius.circular(BlocksRadius.pill),
                  child: LinearProgressIndicator(
                    value: v,
                    minHeight: 10,
                    color: nextColor,
                    backgroundColor: nextColor.withValues(alpha: 0.16),
                  ),
                ),
              ),
              const SizedBox(height: BlocksSpacing.sm),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Flexible(
                    child: Text(
                      '${l10n.risingCurrent}: ${progress.current.label(l10n)}',
                      style: context.text.bodySmall,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Flexible(
                    child: Text(
                      '${l10n.risingNext}: $nextName',
                      style: context.text.bodySmall?.copyWith(
                        color: nextColor,
                        fontWeight: FontWeight.w700,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: BlocksSpacing.xs),
              Text(
                l10n.risingRemaining(progress.remainingToNext),
                style: context.text.bodySmall?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: context.scheme.onSurface,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
