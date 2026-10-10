import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/story_ring.dart';
import 'package:blocks_app/data/models/content_models.dart';
import 'package:blocks_app/features/stories/application/story_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Horizontal story tray at the top of Home. "Your story" first, then
/// unviewed rings, then viewed (quiet) rings.
class StoryStrip extends ConsumerWidget {
  const StoryStrip({super.key});

  /// Height at the default text scale: 8 + ring 64 + gap 6 + label + 8.
  static const double height = 104;

  /// The label under each ring grows with the user's text size, so the tray
  /// grows with it instead of clipping.
  static double heightFor(BuildContext context) =>
      height + MediaQuery.textScalerOf(context).scale(13) - 13;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(storyControllerProvider);
    final groups = async.value;

    return SizedBox(
      height: heightFor(context),
      child: groups == null
          ? (async.hasError ? const SizedBox.shrink() : const _StorySkeleton())
          : ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(
                horizontal: BlocksSpacing.lg,
                vertical: BlocksSpacing.sm,
              ),
              itemCount: groups.length,
              separatorBuilder: (_, _) =>
                  const SizedBox(width: BlocksSpacing.md),
              itemBuilder: (context, i) => _StoryTile(group: groups[i]),
            ),
    );
  }
}

class _StoryTile extends StatelessWidget {
  const _StoryTile({required this.group});

  final StoryGroup group;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final addOnly = group.isOwn && group.items.isEmpty;
    final label = group.isOwn
        ? l10n.yourStory
        : group.user.name.split(' ').first;

    return SizedBox(
      width: 68,
      child: Column(
        children: [
          StoryRing(
            name: group.user.name,
            imageUrl: group.user.avatarUrl,
            size: 64,
            isViewed: group.isViewed,
            isAddStory: addOnly,
            semanticLabel: addOnly
                ? l10n.addToStorySemantics
                : l10n.storyOfSemantics(group.user.name),
            onTap: () => addOnly
                ? context.push(Routes.createStory)
                : context.push(Routes.story(group.id)),
          ),
          const SizedBox(height: BlocksSpacing.xs + 2),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: context.text.labelSmall?.copyWith(
              color: group.isViewed
                  ? context.scheme.onSurfaceVariant
                  : context.scheme.onSurface,
            ),
          ),
        ],
      ),
    );
  }
}

class _StorySkeleton extends StatelessWidget {
  const _StorySkeleton();

  @override
  Widget build(BuildContext context) {
    return ExcludeSemantics(
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.symmetric(
          horizontal: BlocksSpacing.lg,
          vertical: BlocksSpacing.sm,
        ),
        itemCount: 6,
        separatorBuilder: (_, _) => const SizedBox(width: BlocksSpacing.md),
        itemBuilder: (context, _) => Container(
          width: 64,
          height: 64,
          decoration: BoxDecoration(
            color: context.blocks.surfaceMuted,
            borderRadius: BorderRadius.circular(23),
          ),
        ),
      ),
    );
  }
}
