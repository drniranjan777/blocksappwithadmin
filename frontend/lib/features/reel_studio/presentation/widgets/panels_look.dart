import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/data/models/reel_models.dart';
import 'package:blocks_app/features/reel_studio/application/reel_studio_controller.dart';
import 'package:blocks_app/features/reel_studio/domain/reel_look.dart';
import 'package:blocks_app/features/reel_studio/presentation/studio_labels.dart';
import 'package:blocks_app/features/reel_studio/presentation/widgets/clip_visual.dart';
import 'package:blocks_app/features/reel_studio/presentation/widgets/panel_parts.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// The clip the look tools act on: the selected one, else the first.
ReelClip? _target(ReelStudioState s) =>
    s.selectedClip ?? (s.draft.clips.isEmpty ? null : s.draft.clips.first);

/// The 14 BLOCKS filters, each previewed on the current clip.
class FiltersPanel extends ConsumerWidget {
  const FiltersPanel({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final s = ref.watch(reelStudioProvider);
    final c = ref.read(reelStudioProvider.notifier);
    final clip = _target(s);
    if (clip == null) {
      return PanelScaffold(children: [PanelHint(l10n.rsClipsEmpty)]);
    }
    final current = clip.filterId ?? ReelFilters.originalId;

    return PanelScaffold(
      children: [
        SizedBox(
          height: 128,
          // Fourteen fixed filters: a plain scrolling row, so every filter
          // exists for screen readers even when scrolled off screen.
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final f in ReelFilters.catalog)
                  Padding(
                    padding: const EdgeInsetsDirectional.only(
                      end: BlocksSpacing.sm,
                    ),
                    child: _FilterTile(
                      filter: f,
                      clip: clip,
                      selected: f.id == current,
                      onTap: () => c.setFilter(clip.id, f.id),
                    ),
                  ),
              ],
            ),
          ),
        ),
        PanelSlider(
          label: l10n.rsIntensity,
          value: clip.filterIntensity,
          onChanged: clip.filterId == null
              ? null
              : (v) => c.setFilterIntensity(clip.id, v),
        ),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: PanelAction(
            icon: Icons.done_all_rounded,
            label: l10n.rsApplyToAll,
            onPressed: s.draft.clips.length < 2
                ? null
                : () => c.applyLookToAll(clip.id),
          ),
        ),
      ],
    );
  }
}

/// Manual colour and look controls.
class AdjustPanel extends ConsumerWidget {
  const AdjustPanel({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final s = ref.watch(reelStudioProvider);
    final c = ref.read(reelStudioProvider.notifier);
    final clip = _target(s);
    if (clip == null) {
      return PanelScaffold(children: [PanelHint(l10n.rsClipsEmpty)]);
    }
    final a = clip.adjustments;
    void set(ReelAdjustments next) => c.setAdjustments(clip.id, next);

    // (label, value, onChanged, min). -1..1 sliders read as +/- numbers.
    final rows = <(String, double, ValueChanged<double>, double)>[
      (
        l10n.adjBrightness,
        a.brightness,
        (v) => set(a.copyWith(brightness: v)),
        -1,
      ),
      (l10n.adjContrast, a.contrast, (v) => set(a.copyWith(contrast: v)), -1),
      (
        l10n.adjSaturation,
        a.saturation,
        (v) => set(a.copyWith(saturation: v)),
        -1,
      ),
      (
        l10n.adjWarmth,
        a.temperature,
        (v) => set(a.copyWith(temperature: v)),
        -1,
      ),
      (
        l10n.adjHighlights,
        a.highlights,
        (v) => set(a.copyWith(highlights: v)),
        -1,
      ),
      (l10n.adjShadows, a.shadows, (v) => set(a.copyWith(shadows: v)), -1),
      (l10n.adjSharpness, a.sharpness, (v) => set(a.copyWith(sharpness: v)), 0),
      (l10n.adjFade, a.fade, (v) => set(a.copyWith(fade: v)), 0),
      (l10n.adjVignette, a.vignette, (v) => set(a.copyWith(vignette: v)), 0),
    ];

    String shown(double v, double min) {
      final n = (v * 100).round();
      return min < 0 && n > 0 ? '+$n' : '$n';
    }

    return PanelScaffold(
      children: [
        for (final (label, value, onChanged, min) in rows)
          PanelSlider(
            label: label,
            value: value,
            min: min,
            onChanged: onChanged,
            valueLabel: shown(value, min),
          ),
        const SizedBox(height: BlocksSpacing.sm),
        Wrap(
          spacing: BlocksSpacing.sm,
          runSpacing: BlocksSpacing.sm,
          children: [
            PanelAction(
              icon: Icons.restart_alt_rounded,
              label: l10n.rsResetAdjust,
              onPressed: a.isNeutral
                  ? null
                  : () => set(ReelAdjustments.neutral),
            ),
            PanelAction(
              icon: Icons.done_all_rounded,
              label: l10n.rsApplyToAll,
              onPressed: s.draft.clips.length < 2
                  ? null
                  : () => c.applyLookToAll(clip.id),
            ),
          ],
        ),
      ],
    );
  }
}

class _FilterTile extends StatelessWidget {
  const _FilterTile({
    required this.filter,
    required this.clip,
    required this.selected,
    required this.onTap,
  });

  final ReelFilter filter;
  final ReelClip clip;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final name = filterLabel(context.l10n, filter.id);
    return Semantics(
      button: true,
      selected: selected,
      label: name,
      excludeSemantics: true,
      child: GestureDetector(
        onTap: onTap,
        child: SizedBox(
          width: 72,
          child: Column(
            children: [
              AnimatedContainer(
                duration: BlocksDurations.fast,
                height: 92,
                decoration: BoxDecoration(
                  borderRadius: BlocksRadius.mdAll,
                  border: Border.all(
                    color: selected
                        ? context.scheme.primary
                        : Colors.transparent,
                    width: 3,
                  ),
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(BlocksRadius.md - 3),
                  child: SizedBox.expand(
                    child: MediaVisual(
                      media: clip.media,
                      matrix: filter.isOriginal ? null : filter.matrix,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 4),
              Text(
                name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: context.text.labelMedium?.copyWith(
                  fontWeight: selected ? FontWeight.w800 : null,
                  color: selected ? context.scheme.primary : null,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
