import 'dart:io';

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
    // The person's own files are drawn as themselves. Generated artwork stands in only for the
    // demo's invented media; it must never be shown in place of someone's real photo.
    Widget art = media.origin == MediaOrigin.device
        ? _DeviceArt(media: media)
        : DemoArt(seed: seed);
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

/// A photo from the phone as it is, or (until a frame can be shown) a plain tile for a video.
class _DeviceArt extends StatelessWidget {
  const _DeviceArt({required this.media});

  final MediaAsset media;

  @override
  Widget build(BuildContext context) {
    final still = media.isPhoto ? media.localPath : media.thumbnailPath;
    final tile = _VideoTile(name: media.name);
    if (still == null) return tile;
    return Image.file(
      File(still),
      fit: BoxFit.cover,
      cacheWidth: 720,
      gaplessPlayback: true,
      errorBuilder: (_, _, _) => tile,
    );
  }
}

class _VideoTile extends StatelessWidget {
  const _VideoTile({required this.name});

  final String name;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: const BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xFF1B1D3A), Color(0xFF0B0D1E)],
      ),
    ),
    child: Center(
      child: Icon(
        Icons.videocam_rounded,
        size: 28,
        color: Colors.white.withValues(alpha: 0.75),
      ),
    ),
  );
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
