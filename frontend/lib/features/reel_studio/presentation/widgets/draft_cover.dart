import 'package:blocks_app/core/widgets/demo_art.dart';
import 'package:blocks_app/data/models/reel_models.dart';
import 'package:blocks_app/features/reel_studio/domain/reel_timeline.dart';
import 'package:blocks_app/features/reel_studio/presentation/widgets/clip_visual.dart';
import 'package:flutter/material.dart';

/// The picture shown for a reel: its chosen cover, or the first frame.
class DraftCover extends StatelessWidget {
  const DraftCover({required this.draft, super.key});

  final ReelDraft draft;

  @override
  Widget build(BuildContext context) {
    final s = draft.settings;
    if (draft.clips.isEmpty) {
      return ColoredBox(color: Theme.of(context).colorScheme.primaryContainer);
    }
    if (s.coverMode == CoverMode.image && s.coverImageSeed != null) {
      return DemoArt(seed: s.coverImageSeed!);
    }
    final at = s.coverMode == CoverMode.frame
        ? Duration(milliseconds: s.coverFrameMs)
        : Duration.zero;
    final loc = ReelTimeline.locate(draft.clips, at);
    final clip = draft.clips[loc?.index ?? 0];
    final offset = loc == null || clip.duration.inMilliseconds == 0
        ? 0
        : (loc.local.inMilliseconds * 3 / clip.duration.inMilliseconds).floor();
    return ClipVisual(clip: clip, seedOffset: offset);
  }
}
