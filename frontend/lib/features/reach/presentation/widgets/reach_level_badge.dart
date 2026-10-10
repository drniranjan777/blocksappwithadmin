import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/features/reach/domain/reach_level.dart';
import 'package:blocks_app/features/reach/presentation/reach_level_labels.dart';
import 'package:flutter/material.dart';

/// Compact pill showing a post's/creator's Reach Level, e.g. "S1 · State".
/// Locked levels render muted so the same widget works in the ladder.
class ReachLevelBadge extends StatelessWidget {
  const ReachLevelBadge({
    required this.level,
    super.key,
    this.showName = true,
    this.isLocked = false,
    this.dense = false,
  });

  final ReachLevel level;
  final bool showName;
  final bool isLocked;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final color = isLocked
        ? context.scheme.onSurfaceVariant
        : context.blocks.reachColor(level);
    final name = level.label(context.l10n);
    final fontSize = dense ? 10.5 : 12.0;

    return Semantics(
      label: context.l10n.levelBadgeSemantics(level.code, name),
      excludeSemantics: true,
      child: Container(
        padding: EdgeInsets.symmetric(
          horizontal: dense ? BlocksSpacing.sm : BlocksSpacing.md - 2,
          vertical: dense ? 3 : 5,
        ),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.14),
          borderRadius: BorderRadius.circular(BlocksRadius.pill),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: dense ? 7 : 9,
              height: dense ? 7 : 9,
              decoration: BoxDecoration(
                color: color,
                borderRadius: BorderRadius.circular(2.5),
              ),
            ),
            SizedBox(width: dense ? 5 : 6),
            Text(
              showName ? '${level.code} · $name' : level.code,
              style: TextStyle(
                color: color,
                fontSize: fontSize,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.3,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
