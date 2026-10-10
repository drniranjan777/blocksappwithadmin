import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:flutter/material.dart';

class PageDots extends StatelessWidget {
  const PageDots({required this.count, required this.index, super.key});

  final int count;
  final int index;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: context.l10n.pageIndicatorSemantics(index + 1, count),
      excludeSemantics: true,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 0; i < count; i++)
            AnimatedContainer(
              duration: BlocksDurations.medium,
              curve: Curves.easeOut,
              margin: const EdgeInsets.symmetric(horizontal: 3),
              width: i == index ? 26 : 8,
              height: 8,
              decoration: BoxDecoration(
                color: i == index
                    ? context.blocks.accent
                    : Colors.white.withValues(alpha: 0.3),
                borderRadius: BorderRadius.circular(BlocksRadius.pill),
              ),
            ),
        ],
      ),
    );
  }
}
