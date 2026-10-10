import 'package:blocks_app/core/widgets/demo_art.dart';
import 'package:blocks_app/data/models/reel_models.dart';
import 'package:blocks_app/features/reel_studio/domain/reel_look.dart';
import 'package:flutter/material.dart';

/// What a piece of media looks like on screen.
///
/// The demo draws generated artwork; a real build puts the decoded video
/// frame / photo here (an `Image`, or a `VideoPlayer` for the clip being
/// previewed). Nothing else in the editor knows the difference.
class MediaVisual extends StatelessWidget {
  const MediaVisual({
    required this.media,
    super.key,
    this.matrix,
    this.vignette = 0,
    this.seedOffset = 0,
  });

  final MediaAsset media;

  /// Colour matrix from [ReelLook.matrixFor], or null for "no effect".
  final List<double>? matrix;

  /// 0..1 darkening towards the corners.
  final double vignette;

  /// Shifts the artwork so frames of one clip differ.
  final int seedOffset;

  @override
  Widget build(BuildContext context) {
    final seed =
        (demoSeedOf(media.thumbnailPath ?? media.localPath) ??
            media.id.hashCode) +
        seedOffset;
    Widget art = DemoArt(seed: seed);
    final m = matrix;
    if (m != null) {
      art = ColorFiltered(colorFilter: ColorFilter.matrix(m), child: art);
    }
    if (vignette > 0) {
      art = Stack(
        fit: StackFit.expand,
        children: [
          art,
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                colors: [
                  Colors.transparent,
                  Colors.black.withValues(alpha: 0.75 * vignette),
                ],
                stops: const [0.5, 1],
              ),
            ),
          ),
        ],
      );
    }
    return art;
  }
}

/// A clip with its filter and adjustments applied.
class ClipVisual extends StatelessWidget {
  const ClipVisual({required this.clip, super.key, this.seedOffset = 0});

  final ReelClip clip;
  final int seedOffset;

  @override
  Widget build(BuildContext context) => MediaVisual(
    media: clip.media,
    matrix: ReelLook.matrixFor(clip),
    vignette: clip.adjustments.vignette,
    seedOffset: seedOffset,
  );
}
