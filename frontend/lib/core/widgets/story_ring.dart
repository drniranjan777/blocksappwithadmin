import 'package:blocks_app/app/theme/blocks_colors.dart';
import 'package:blocks_app/core/widgets/blocks_avatar.dart';
import 'package:flutter/material.dart';

/// Ring around an avatar: reach-gradient when unviewed, quiet when viewed.
/// With [isAddStory] it shows a "+" badge (the "Your Story" entry).
class StoryRing extends StatelessWidget {
  const StoryRing({
    required this.name,
    super.key,
    this.imageUrl,
    this.size = 64,
    this.isViewed = false,
    this.isAddStory = false,
    this.onTap,
    this.semanticLabel,
  });

  final String name;
  final String? imageUrl;
  final double size;
  final bool isViewed;
  final bool isAddStory;
  final VoidCallback? onTap;

  /// Localised label for screen readers (falls back to the name).
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final palette =
        Theme.of(context).extension<BlocksColors>() ?? BlocksColors.light;
    final ringWidth = size * 0.055;
    final gap = size * 0.05;

    final ring = Container(
      width: size,
      height: size,
      padding: EdgeInsets.all(ringWidth),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(size * 0.36),
        gradient: isViewed || isAddStory
            ? null
            : SweepGradient(
                colors: [
                  palette.reachDistrict,
                  palette.reachState,
                  palette.reachNational,
                  palette.reachGlobal,
                  palette.reachDistrict,
                ],
              ),
        border: isViewed || isAddStory
            ? Border.all(color: scheme.outline, width: ringWidth * 0.7)
            : null,
      ),
      child: Container(
        padding: EdgeInsets.all(gap),
        decoration: BoxDecoration(
          color: scheme.surface,
          borderRadius: BorderRadius.circular(size * 0.31),
        ),
        child: BlocksAvatar(
          name: name,
          imageUrl: imageUrl,
          size: size - (ringWidth + gap) * 2,
        ),
      ),
    );

    return Semantics(
      button: onTap != null,
      label: semanticLabel ?? name,
      excludeSemantics: true,
      child: InkResponse(
        onTap: onTap,
        radius: size * 0.7,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            ring,
            if (isAddStory)
              Positioned(
                right: -2,
                bottom: -2,
                child: Container(
                  width: size * 0.34,
                  height: size * 0.34,
                  decoration: BoxDecoration(
                    color: scheme.primary,
                    shape: BoxShape.circle,
                    border: Border.all(color: scheme.surface, width: 2),
                  ),
                  child: Icon(
                    Icons.add_rounded,
                    size: size * 0.24,
                    color: scheme.onPrimary,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
