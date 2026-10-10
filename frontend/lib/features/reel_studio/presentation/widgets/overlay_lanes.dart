import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/data/models/reel_models.dart';
import 'package:blocks_app/features/reel_studio/presentation/studio_labels.dart';
import 'package:flutter/material.dart';

/// When each caption and sticker is on screen, drawn against the whole reel:
///
/// ```
/// 0s ───────────────── 30s
/// Text A   ████████
/// Sticker        ████████
/// Text B                 ███████
/// ```
///
/// One lane per overlay. Tapping a bar selects it (and the caller opens its
/// tool, where the timing sliders are). The thin line is the playhead.
class OverlayLanes extends StatelessWidget {
  const OverlayLanes({
    required this.overlays,
    required this.total,
    required this.selectedId,
    required this.playhead,
    required this.onSelect,
    super.key,
  });

  final List<ReelOverlay> overlays;

  /// The whole reel; the bars are drawn as fractions of it.
  final Duration total;
  final String? selectedId;
  final ValueNotifier<Duration> playhead;
  final ValueChanged<ReelOverlay> onSelect;

  /// Keeps every lane a comfortable touch target.
  static const laneHeight = 48.0;

  @override
  Widget build(BuildContext context) {
    if (overlays.isEmpty) return const SizedBox.shrink();
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Semantics(
          header: true,
          child: Text(l10n.rsLanesTitle, style: context.text.titleSmall),
        ),
        Text(l10n.rsLanesHint, style: context.text.bodySmall),
        const SizedBox(height: BlocksSpacing.xs),
        for (final o in overlays)
          _Lane(
            overlay: o,
            total: total,
            selected: o.id == selectedId,
            playhead: playhead,
            onTap: () => onSelect(o),
          ),
      ],
    );
  }
}

class _Lane extends StatelessWidget {
  const _Lane({
    required this.overlay,
    required this.total,
    required this.selected,
    required this.playhead,
    required this.onTap,
  });

  final ReelOverlay overlay;
  final Duration total;
  final bool selected;
  final ValueNotifier<Duration> playhead;
  final VoidCallback onTap;

  double _fraction(Duration d) => total.inMilliseconds == 0
      ? 0
      : (d.inMilliseconds / total.inMilliseconds).clamp(0.0, 1.0);

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final scheme = context.scheme;
    final from = formatMinSec(overlay.start);
    final to = formatMinSec(overlay.end);
    final label = overlay.isText
        ? l10n.rsLaneText(overlay.content, from, to)
        : l10n.rsLaneSticker(overlay.content, from, to);

    final bg = selected
        ? scheme.primary
        : (overlay.isText
              ? scheme.primaryContainer
              : scheme.secondaryContainer);
    final fg = selected
        ? scheme.onPrimary
        : (overlay.isText
              ? scheme.onPrimaryContainer
              : scheme.onSecondaryContainer);

    return Semantics(
      button: true,
      selected: selected,
      label: label,
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BlocksRadius.mdAll,
        child: SizedBox(
          height: OverlayLanes.laneHeight,
          child: Row(
            children: [
              Icon(
                overlay.isText
                    ? Icons.title_rounded
                    : Icons.emoji_emotions_outlined,
                size: 20,
                color: scheme.onSurfaceVariant,
              ),
              const SizedBox(width: BlocksSpacing.sm),
              Expanded(
                child: LayoutBuilder(
                  builder: (context, box) {
                    final width = box.maxWidth;
                    final left = _fraction(overlay.start) * width;
                    // Never thinner than a fingertip-friendly sliver.
                    final barWidth = (_fraction(overlay.end) * width - left)
                        .clamp(10.0, width);
                    return Stack(
                      clipBehavior: Clip.none,
                      children: [
                        // The reel's whole length.
                        PositionedDirectional(
                          start: 0,
                          end: 0,
                          top: 14,
                          height: 20,
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              color: scheme.outlineVariant.withValues(
                                alpha: 0.35,
                              ),
                              borderRadius: BorderRadius.circular(
                                BlocksRadius.pill,
                              ),
                            ),
                          ),
                        ),
                        PositionedDirectional(
                          start: left.clamp(0.0, width - barWidth),
                          width: barWidth,
                          top: 10,
                          height: 28,
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              color: bg,
                              borderRadius: BorderRadius.circular(
                                BlocksRadius.pill,
                              ),
                              border: selected
                                  ? null
                                  : Border.all(color: scheme.outlineVariant),
                            ),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: BlocksSpacing.sm,
                              ),
                              child: Align(
                                alignment: AlignmentDirectional.centerStart,
                                child: Text(
                                  overlay.content,
                                  maxLines: 1,
                                  overflow: TextOverflow.clip,
                                  softWrap: false,
                                  style: context.text.labelMedium?.copyWith(
                                    color: fg,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                        // Where the preview is now.
                        ValueListenableBuilder<Duration>(
                          valueListenable: playhead,
                          builder: (context, t, _) => PositionedDirectional(
                            start: (_fraction(t) * width - 1).clamp(
                              0.0,
                              width - 2,
                            ),
                            top: 6,
                            width: 2,
                            height: 36,
                            child: ExcludeSemantics(
                              child: ColoredBox(color: scheme.error),
                            ),
                          ),
                        ),
                      ],
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
