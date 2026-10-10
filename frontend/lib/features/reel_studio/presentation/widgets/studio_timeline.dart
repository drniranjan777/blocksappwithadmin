import 'dart:math' as math;

import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/data/models/reel_models.dart';
import 'package:blocks_app/features/reel_studio/presentation/studio_labels.dart';
import 'package:blocks_app/features/reel_studio/presentation/widgets/clip_visual.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';

/// The reel as a row of clips: [Video 4s][Photo 3s][Video 6s]...
///
/// Long-press a clip and drag to reorder. For anyone who can't drag, each
/// clip also exposes "move earlier / later" as a screen-reader action and as
/// buttons in the Clips panel; all three call the same controller method.
class StudioTimeline extends StatelessWidget {
  const StudioTimeline({
    required this.clips,
    required this.selectedId,
    required this.limit,
    required this.onSelect,
    required this.onReorder,
    required this.onAdd,
    super.key,
  });

  final List<ReelClip> clips;
  final String? selectedId;
  final Duration limit;
  final ValueChanged<int> onSelect;
  final void Function(int oldIndex, int newIndex) onReorder;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final total = clips.fold(Duration.zero, (a, c) => a + c.duration);
    final over = total > limit;
    final fraction = limit.inMilliseconds == 0
        ? 0.0
        : (total.inMilliseconds / limit.inMilliseconds).clamp(0.0, 1.0);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Semantics(
                header: true,
                child: Text(l10n.rsTimeline, style: context.text.titleSmall),
              ),
            ),
            Semantics(
              liveRegion: over,
              child: Text(
                l10n.rsTotalOfLimit(formatMinSec(total), formatMinSec(limit)),
                style: context.text.labelLarge?.copyWith(
                  color: over ? context.scheme.error : null,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: BlocksSpacing.xs),
        ClipRRect(
          borderRadius: BorderRadius.circular(BlocksRadius.pill),
          child: LinearProgressIndicator(
            value: fraction,
            minHeight: 4,
            color: over ? context.scheme.error : context.scheme.primary,
            backgroundColor: context.scheme.outlineVariant,
          ),
        ),
        const SizedBox(height: BlocksSpacing.sm),
        SizedBox(
          height: 88,
          child: Row(
            children: [
              Expanded(
                child: clips.isEmpty
                    ? Align(
                        alignment: AlignmentDirectional.centerStart,
                        child: Text(
                          l10n.rsTimelineEmpty,
                          style: context.text.bodySmall,
                        ),
                      )
                    : ReorderableListView.builder(
                        scrollDirection: Axis.horizontal,
                        buildDefaultDragHandles: false,
                        itemCount: clips.length,
                        // Flutter reports the index *after* the item is lifted
                        // out; the domain uses the classic "before" index.
                        onReorderItem: (from, to) =>
                            onReorder(from, to > from ? to + 1 : to),
                        proxyDecorator: (child, _, _) => Material(
                          color: Colors.transparent,
                          elevation: 6,
                          child: child,
                        ),
                        itemBuilder: (context, i) {
                          final clip = clips[i];
                          return ReorderableDelayedDragStartListener(
                            key: ValueKey(clip.id),
                            index: i,
                            child: _ClipTile(
                              clip: clip,
                              index: i,
                              count: clips.length,
                              selected: clip.id == selectedId,
                              onTap: () => onSelect(i),
                              onMoveEarlier: i == 0
                                  ? null
                                  : () => onReorder(i, i - 1),
                              onMoveLater: i == clips.length - 1
                                  ? null
                                  : () => onReorder(i, i + 2),
                            ),
                          );
                        },
                      ),
              ),
              const SizedBox(width: BlocksSpacing.sm),
              Semantics(
                button: true,
                label: l10n.rsAddMedia,
                excludeSemantics: true,
                child: Material(
                  color: context.scheme.primaryContainer,
                  borderRadius: BlocksRadius.mdAll,
                  child: InkWell(
                    borderRadius: BlocksRadius.mdAll,
                    onTap: onAdd,
                    child: SizedBox(
                      width: 56,
                      height: 72,
                      child: Icon(
                        Icons.add_rounded,
                        color: context.scheme.onPrimaryContainer,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ClipTile extends StatelessWidget {
  const _ClipTile({
    required this.clip,
    required this.index,
    required this.count,
    required this.selected,
    required this.onTap,
    required this.onMoveEarlier,
    required this.onMoveLater,
  });

  final ReelClip clip;
  final int index;
  final int count;
  final bool selected;
  final VoidCallback onTap;
  final VoidCallback? onMoveEarlier;
  final VoidCallback? onMoveLater;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final seconds = clip.duration.inMilliseconds / 1000;
    final width = math.min(168.0, math.max(76.0, 56 + seconds * 9));
    final typeLabel = clip.isPhoto ? l10n.rsPhoto : l10n.rsVideo;
    final primary = context.scheme.primary;

    return Padding(
      padding: const EdgeInsetsDirectional.only(end: BlocksSpacing.sm),
      child: Semantics(
        button: true,
        selected: selected,
        label: l10n.rsClipLabel(
          index + 1,
          count,
          typeLabel,
          formatShort(clip.duration),
        ),
        customSemanticsActions: {
          CustomSemanticsAction(label: l10n.rsMoveEarlier): ?onMoveEarlier,
          CustomSemanticsAction(label: l10n.rsMoveLater): ?onMoveLater,
        },
        excludeSemantics: true,
        child: GestureDetector(
          onTap: onTap,
          child: AnimatedContainer(
            duration: BlocksDurations.fast,
            width: width,
            height: 72,
            margin: const EdgeInsets.only(top: 4),
            decoration: BoxDecoration(
              borderRadius: BlocksRadius.mdAll,
              border: Border.all(
                color: selected ? primary : Colors.transparent,
                width: 2.5,
              ),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(BlocksRadius.md - 2),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  MediaVisual(media: clip.media),
                  const DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [Colors.transparent, Color(0x99000000)],
                        stops: [0.45, 1],
                      ),
                    ),
                  ),
                  PositionedDirectional(
                    start: 4,
                    top: 4,
                    child: Icon(
                      clip.isPhoto
                          ? Icons.photo_rounded
                          : Icons.videocam_rounded,
                      size: 14,
                      color: Colors.white,
                      semanticLabel: typeLabel,
                    ),
                  ),
                  if (clip.filterId != null)
                    PositionedDirectional(
                      end: 4,
                      top: 4,
                      child: Icon(
                        Icons.auto_awesome_rounded,
                        size: 14,
                        color: Colors.amber.shade300,
                      ),
                    ),
                  PositionedDirectional(
                    end: 4,
                    bottom: 3,
                    child: Text(
                      formatShort(clip.duration),
                      style: context.text.labelSmall?.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  if (clip.transitionId != null)
                    const PositionedDirectional(
                      start: 4,
                      bottom: 2,
                      child: Icon(
                        Icons.swap_horiz_rounded,
                        size: 14,
                        color: Colors.white,
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
