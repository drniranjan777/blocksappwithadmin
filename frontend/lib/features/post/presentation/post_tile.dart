import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/blocks_image.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/features/reach/application/reach_providers.dart';
import 'package:blocks_app/features/reach/presentation/widgets/reach_level_badge.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Grid thumbnail for a post: art (thumbnail rendition), video marker and the
/// Reach Level. Used by Explore, search and profile grids.
class PostTile extends ConsumerWidget {
  const PostTile({required this.post, super.key, this.onTap});

  final Post post;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final level = ref
        .watch(reachCalculatorProvider)
        .evaluate(post.qualifiedReach)
        .current;
    final radius = BorderRadius.circular(BlocksRadius.md);

    return Semantics(
      button: true,
      label: post.caption,
      excludeSemantics: true,
      child: ClipRRect(
        borderRadius: radius,
        child: Material(
          color: context.scheme.primaryContainer,
          child: InkWell(
            onTap: onTap ?? () => context.push(Routes.post(post.id)),
            child: Stack(
              fit: StackFit.expand,
              children: [
                if (post.type == PostType.text)
                  Padding(
                    padding: const EdgeInsets.all(BlocksSpacing.sm + 2),
                    child: Text(
                      post.caption,
                      maxLines: 6,
                      overflow: TextOverflow.ellipsis,
                      style: context.text.bodySmall?.copyWith(
                        color: context.scheme.onPrimaryContainer,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  )
                else
                  BlocksImage(
                    url: post.mediaUrl ?? '',
                    variant: ImageVariant.thumbnail,
                  ),
                if (post.type == PostType.video)
                  const Positioned(
                    top: 6,
                    right: 6,
                    child: Icon(
                      Icons.play_circle_fill_rounded,
                      color: Colors.white,
                      size: 20,
                      shadows: [Shadow(blurRadius: 6, color: Colors.black54)],
                    ),
                  ),
                Positioned(
                  left: 6,
                  bottom: 6,
                  child: ReachLevelBadge(
                    level: level,
                    showName: false,
                    dense: true,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
