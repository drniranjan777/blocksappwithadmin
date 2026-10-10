import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/utils/number_format.dart';
import 'package:blocks_app/core/widgets/blocks_image.dart';
import 'package:blocks_app/data/models/content_models.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Grid thumbnail for a reel (profile Reels tab).
class ReelTile extends StatelessWidget {
  const ReelTile({required this.reel, super.key});

  final Reel reel;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: reel.caption,
      excludeSemantics: true,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(BlocksRadius.md),
        child: InkWell(
          onTap: () => context.go(Routes.reels),
          child: Stack(
            fit: StackFit.expand,
            children: [
              BlocksImage(url: reel.videoUrl, variant: ImageVariant.thumbnail),
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
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.favorite_rounded,
                      size: 13,
                      color: Colors.white,
                    ),
                    const SizedBox(width: 3),
                    Text(
                      compactCount(reel.stats.likes),
                      style: context.text.labelSmall?.copyWith(
                        color: Colors.white,
                        shadows: const [
                          Shadow(blurRadius: 6, color: Colors.black87),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
