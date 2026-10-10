import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/data/models/reel_models.dart';
import 'package:blocks_app/features/reel_studio/application/reel_studio_controller.dart';
import 'package:blocks_app/features/reel_studio/domain/reel_timeline.dart';
import 'package:blocks_app/features/reel_studio/presentation/studio_labels.dart';
import 'package:blocks_app/features/reel_studio/presentation/widgets/clip_visual.dart';
import 'package:blocks_app/features/reel_studio/presentation/widgets/panel_parts.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Photo lengths offered as quick choices (clamped to the server's range).
const _photoSeconds = [1, 2, 3, 4, 5, 7, 10];

Duration _ms(double v) => Duration(milliseconds: v.round());

/// Edit the selected clip: add, replace, duplicate, split, reorder, delete,
/// duration (photos) and volume (videos).
class ClipsPanel extends ConsumerWidget {
  const ClipsPanel({
    required this.playhead,
    required this.onAddMedia,
    required this.onReplace,
    super.key,
  });

  final ValueNotifier<Duration> playhead;
  final VoidCallback onAddMedia;
  final ValueChanged<String> onReplace;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final s = ref.watch(reelStudioProvider);
    final c = ref.read(reelStudioProvider.notifier);
    final clip = s.selectedClip;
    final clips = s.draft.clips;

    final add = PanelAction(
      icon: Icons.add_photo_alternate_rounded,
      label: l10n.rsAddMedia,
      onPressed: onAddMedia,
    );

    if (clip == null) {
      return PanelScaffold(
        children: [
          PanelHint(clips.isEmpty ? l10n.rsClipsEmpty : l10n.rsSelectClip),
          add,
        ],
      );
    }

    final i = clips.indexWhere((x) => x.id == clip.id);
    void split() {
      // Cut where the playhead is, if that is a place a cut can go; otherwise
      // (playhead elsewhere, or right at an end) cut in the middle.
      final middle = Duration(milliseconds: clip.duration.inMilliseconds ~/ 2);
      final min = Duration(milliseconds: s.config.minClipDurationMs);
      final at = ReelTimeline.locate(clips, playhead.value);
      var local = at != null && at.index == i ? at.local : middle;
      if (local < min || local > clip.duration - min) local = middle;
      c.splitAt(clip.id, local);
    }

    return PanelScaffold(
      children: [
        Wrap(
          spacing: BlocksSpacing.sm,
          runSpacing: BlocksSpacing.sm,
          children: [
            add,
            PanelAction(
              icon: Icons.find_replace_rounded,
              label: l10n.rsReplace,
              onPressed: () => onReplace(clip.id),
            ),
            PanelAction(
              icon: Icons.copy_rounded,
              label: l10n.rsDuplicate,
              onPressed: () => c.duplicateClip(clip.id),
            ),
            if (!clip.isPhoto)
              PanelAction(
                icon: Icons.content_cut_rounded,
                label: l10n.rsSplit,
                onPressed: split,
              ),
            PanelAction(
              icon: Icons.arrow_back_rounded,
              label: l10n.rsMoveEarlier,
              onPressed: i > 0 ? () => c.reorder(i, i - 1) : null,
            ),
            PanelAction(
              icon: Icons.arrow_forward_rounded,
              label: l10n.rsMoveLater,
              onPressed: i < clips.length - 1
                  ? () => c.reorder(i, i + 2)
                  : null,
            ),
            PanelAction(
              icon: Icons.delete_outline_rounded,
              label: l10n.rsDelete,
              destructive: true,
              onPressed: () => c.removeClip(clip.id),
            ),
          ],
        ),
        const SizedBox(height: BlocksSpacing.sm),
        if (clip.isPhoto)
          PhotoDurationChips(clip: clip)
        else
          PanelSlider(
            label: l10n.rsVolume,
            value: clip.volume,
            onChanged: (v) => c.setClipVolume(clip.id, v),
          ),
      ],
    );
  }
}

/// How long a photo stays on screen.
class PhotoDurationChips extends ConsumerWidget {
  const PhotoDurationChips({required this.clip, super.key});

  final ReelClip clip;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final config = ref.watch(reelStudioProvider.select((s) => s.config));
    final c = ref.read(reelStudioProvider.notifier);
    final choices = [
      for (final sec in _photoSeconds)
        if (sec * 1000 >= config.minPhotoDurationMs &&
            sec * 1000 <= config.maxPhotoDurationMs)
          sec,
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        PanelTitle(l10n.rsPhotoDuration),
        Wrap(
          spacing: BlocksSpacing.sm,
          children: [
            for (final sec in choices)
              PanelChip(
                label: l10n.rsSecondsShort(sec),
                selected: clip.duration.inMilliseconds == sec * 1000,
                onTap: () =>
                    c.setPhotoDuration(clip.id, Duration(seconds: sec)),
              ),
          ],
        ),
      ],
    );
  }
}

/// Cut a video clip's start and end.
class TrimPanel extends ConsumerWidget {
  const TrimPanel({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final s = ref.watch(reelStudioProvider);
    final c = ref.read(reelStudioProvider.notifier);
    final clip = s.selectedClip;
    if (clip == null) {
      return PanelScaffold(children: [PanelHint(l10n.rsSelectClip)]);
    }
    if (clip.isPhoto) {
      return PanelScaffold(
        children: [
          PanelHint(l10n.rsTrimPhoto),
          PhotoDurationChips(clip: clip),
        ],
      );
    }
    final total = clip.media.durationMs.toDouble();
    if (total <= 0) {
      return PanelScaffold(children: [PanelHint(l10n.rsTrimUnavailable)]);
    }

    final start = clip.start.inMilliseconds.toDouble().clamp(0.0, total);
    final end = clip.end.inMilliseconds.toDouble().clamp(start, total);

    return PanelScaffold(
      children: [
        // A strip of frames gives the handles something to be read against.
        SizedBox(
          height: 52,
          child: ClipRRect(
            borderRadius: BlocksRadius.smAll,
            child: Row(
              children: [
                for (var f = 0; f < 8; f++)
                  Expanded(
                    child: MediaVisual(media: clip.media, seedOffset: f * 7),
                  ),
              ],
            ),
          ),
        ),
        Semantics(
          container: true,
          label: l10n.rsTrimRange,
          child: RangeSlider(
            values: RangeValues(start, end),
            max: total,
            labels: RangeLabels(formatShort(_ms(start)), formatShort(_ms(end))),
            semanticFormatterCallback: (v) => formatShort(_ms(v)),
            onChanged: (v) =>
                c.trim(clip.id, start: _ms(v.start), end: _ms(v.end)),
          ),
        ),
        Wrap(
          alignment: WrapAlignment.spaceBetween,
          spacing: 12,
          runSpacing: 4,
          children: [
            Text(
              l10n.rsTrimStart(formatShort(clip.start)),
              style: context.text.labelMedium,
            ),
            Text(
              l10n.rsTrimLength(formatShort(clip.duration)),
              style: context.text.labelLarge,
            ),
            Text(
              l10n.rsTrimEnd(formatShort(clip.end)),
              style: context.text.labelMedium,
            ),
          ],
        ),
        const SizedBox(height: BlocksSpacing.sm),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: PanelAction(
            icon: Icons.restart_alt_rounded,
            label: l10n.rsResetTrim,
            onPressed:
                clip.start == Duration.zero &&
                    clip.duration.inMilliseconds == clip.media.durationMs
                ? null
                : () => c.trim(
                    clip.id,
                    start: Duration.zero,
                    end: clip.media.duration,
                  ),
          ),
        ),
      ],
    );
  }
}

/// The transition from the selected clip into the next one.
class TransitionsPanel extends ConsumerWidget {
  const TransitionsPanel({super.key});

  static IconData _icon(String id) => switch (id) {
    'fade' => Icons.blur_on_rounded,
    'slide' => Icons.arrow_forward_rounded,
    'zoom' => Icons.zoom_in_rounded,
    'wipe' => Icons.vertical_split_rounded,
    _ => Icons.block_rounded,
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final s = ref.watch(reelStudioProvider);
    final c = ref.read(reelStudioProvider.notifier);
    final clip = s.selectedClip;
    final clips = s.draft.clips;
    if (clip == null) {
      return PanelScaffold(children: [PanelHint(l10n.rsSelectClip)]);
    }
    final isLast = clips.isNotEmpty && clips.last.id == clip.id;
    if (isLast) {
      return PanelScaffold(children: [PanelHint(l10n.rsTransitionLast)]);
    }
    final current = clip.transitionId ?? 'none';
    return PanelScaffold(
      children: [
        PanelHint(l10n.rsTransitionBody, icon: Icons.swap_horiz_rounded),
        Wrap(
          spacing: BlocksSpacing.sm,
          runSpacing: BlocksSpacing.sm,
          children: [
            for (final id in kTransitionIds)
              PanelChip(
                label: transitionLabel(l10n, id),
                icon: _icon(id),
                selected: current == id,
                onTap: () => c.setTransition(clip.id, id),
              ),
          ],
        ),
        const SizedBox(height: BlocksSpacing.sm),
        PanelAction(
          icon: Icons.done_all_rounded,
          label: l10n.rsApplyToAll,
          onPressed: () {
            for (final x in clips) {
              if (x.id != clips.last.id) c.setTransition(x.id, current);
            }
          },
        ),
      ],
    );
  }
}
