import 'dart:math' as math;

import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/data/models/reel_models.dart';
import 'package:blocks_app/features/reel_studio/application/reel_studio_controller.dart';
import 'package:blocks_app/features/reel_studio/domain/sticker_catalog.dart';
import 'package:blocks_app/features/reel_studio/presentation/studio_labels.dart';
import 'package:blocks_app/features/reel_studio/presentation/widgets/panel_parts.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// All text and stickers on the reel, so a layer that is not on screen at the
/// playhead can still be picked.
class OverlayLayers extends ConsumerWidget {
  const OverlayLayers({required this.onSeek, super.key});

  final ValueChanged<Duration> onSeek;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final s = ref.watch(reelStudioProvider);
    final c = ref.read(reelStudioProvider.notifier);
    if (s.draft.overlays.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        PanelTitle(l10n.rsLayers),
        Wrap(
          spacing: BlocksSpacing.sm,
          children: [
            for (final o in s.draft.overlays)
              PanelChip(
                icon: o.isText
                    ? Icons.title_rounded
                    : Icons.emoji_emotions_rounded,
                label: o.isText
                    ? (o.content.characters.length > 14
                          ? '${o.content.characters.take(14)}…'
                          : o.content)
                    : o.content,
                selected: o.id == s.selectedOverlayId,
                onTap: () {
                  c.selectOverlay(o.id);
                  onSeek(o.start);
                },
              ),
          ],
        ),
      ],
    );
  }
}

/// When the selected layer is on screen, as a range over the whole reel.
class OverlayTimingEditor extends ConsumerWidget {
  const OverlayTimingEditor({required this.overlay, super.key});

  final ReelOverlay overlay;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final c = ref.read(reelStudioProvider.notifier);
    final total = ref.watch(
      reelStudioProvider.select((s) => s.draft.totalDuration),
    );
    if (total <= Duration.zero) return const SizedBox.shrink();
    final max = total.inMilliseconds.toDouble();
    final start = overlay.start.inMilliseconds.toDouble().clamp(0.0, max);
    final end = overlay.end.inMilliseconds.toDouble().clamp(start, max);
    Duration ms(double v) => Duration(milliseconds: v.round());
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        PanelTitle(l10n.rsVisibleBetween),
        Semantics(
          container: true,
          label: l10n.rsVisibleBetween,
          child: RangeSlider(
            values: RangeValues(start, end),
            max: max,
            labels: RangeLabels(formatShort(ms(start)), formatShort(ms(end))),
            semanticFormatterCallback: (v) => formatShort(ms(v)),
            onChanged: (v) => c.setOverlayTiming(
              overlay.id,
              start: ms(v.start),
              end: ms(v.end),
            ),
          ),
        ),
        Text(
          l10n.rsVisibleFor(
            formatShort(overlay.duration),
            formatShort(overlay.start),
          ),
          style: context.text.labelMedium,
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------- text --

class TextPanel extends ConsumerStatefulWidget {
  const TextPanel({required this.playhead, required this.onSeek, super.key});

  final ValueNotifier<Duration> playhead;
  final ValueChanged<Duration> onSeek;

  @override
  ConsumerState<TextPanel> createState() => _TextPanelState();
}

class _TextPanelState extends ConsumerState<TextPanel> {
  final _newText = TextEditingController();
  final _editText = TextEditingController();
  String? _editingId;

  @override
  void dispose() {
    _newText.dispose();
    _editText.dispose();
    super.dispose();
  }

  void _add() {
    final text = _newText.text.trim();
    if (text.isEmpty) return;
    ref
        .read(reelStudioProvider.notifier)
        .addText(text, at: widget.playhead.value);
    _newText.clear();
    FocusScope.of(context).unfocus();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final s = ref.watch(reelStudioProvider);
    final c = ref.read(reelStudioProvider.notifier);
    final o = s.selectedOverlay;
    final text = o != null && o.isText ? o : null;

    // Keep the edit box in step with whichever layer is selected.
    if (text?.id != _editingId) {
      _editingId = text?.id;
      _editText.text = text?.content ?? '';
    }

    return PanelScaffold(
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: TextField(
                controller: _newText,
                textCapitalization: TextCapitalization.sentences,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _add(),
                decoration: InputDecoration(
                  labelText: l10n.rsTextNew,
                  hintText: l10n.rsTextHint,
                ),
              ),
            ),
            const SizedBox(width: BlocksSpacing.sm),
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: PanelAction(
                icon: Icons.add_rounded,
                label: l10n.rsTextAdd,
                onPressed: _add,
              ),
            ),
          ],
        ),
        OverlayLayers(onSeek: widget.onSeek),
        if (text != null) ..._editor(context, c, text),
      ],
    );
  }

  List<Widget> _editor(
    BuildContext context,
    ReelStudioController c,
    ReelOverlay o,
  ) {
    final l10n = context.l10n;
    final style = o.textStyle;
    void restyle(OverlayTextStyle next) => c.setOverlayStyle(o.id, next);

    return [
      const SizedBox(height: BlocksSpacing.sm),
      TextField(
        controller: _editText,
        minLines: 1,
        maxLines: 3,
        onChanged: (v) => c.setOverlayText(o.id, v),
        decoration: InputDecoration(labelText: l10n.rsTextEdit),
      ),
      PanelTitle(l10n.rsFont),
      Wrap(
        spacing: BlocksSpacing.sm,
        children: [
          for (final id in kFontIds)
            PanelChip(
              label: fontLabel(l10n, id),
              selected: style.fontId == id,
              onTap: () => restyle(style.copyWith(fontId: id)),
            ),
        ],
      ),
      PanelTitle(l10n.rsColor),
      Wrap(
        children: [
          for (final argb in kTextColors)
            ColorSwatchButton(
              color: Color(argb),
              selected: style.colorValue == argb,
              label: l10n.rsColorSwatch(argb.toRadixString(16).toUpperCase()),
              onTap: () => restyle(style.copyWith(colorValue: argb)),
            ),
        ],
      ),
      PanelTitle(l10n.rsAlignment),
      Wrap(
        spacing: BlocksSpacing.sm,
        children: [
          PanelChip(
            icon: Icons.format_align_left_rounded,
            label: l10n.rsAlignStart,
            selected: style.align == OverlayAlign.start,
            onTap: () => restyle(style.copyWith(align: OverlayAlign.start)),
          ),
          PanelChip(
            icon: Icons.format_align_center_rounded,
            label: l10n.rsAlignCenter,
            selected: style.align == OverlayAlign.center,
            onTap: () => restyle(style.copyWith(align: OverlayAlign.center)),
          ),
          PanelChip(
            icon: Icons.format_align_right_rounded,
            label: l10n.rsAlignEnd,
            selected: style.align == OverlayAlign.end,
            onTap: () => restyle(style.copyWith(align: OverlayAlign.end)),
          ),
        ],
      ),
      PanelTitle(l10n.rsBackground),
      Wrap(
        spacing: BlocksSpacing.sm,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          PanelChip(
            label: l10n.rsNoBackground,
            selected: style.backgroundValue == null,
            onTap: () => restyle(style.copyWith(clearBackground: true)),
          ),
          for (final argb in const [
            0xFF000000,
            0xFFFFFFFF,
            0xFF3A3DD8,
            0xFFE91E63,
          ])
            ColorSwatchButton(
              color: Color(argb),
              selected: style.backgroundValue == argb,
              label: l10n.rsBackgroundSwatch(
                argb.toRadixString(16).toUpperCase(),
              ),
              onTap: () => restyle(style.copyWith(backgroundValue: argb)),
            ),
        ],
      ),
      if (style.backgroundValue != null)
        PanelSlider(
          label: l10n.rsOpacity,
          value: style.backgroundOpacity,
          min: 0.1,
          onChanged: (v) => restyle(style.copyWith(backgroundOpacity: v)),
        ),
      PanelTitle(l10n.rsAnimation),
      Wrap(
        spacing: BlocksSpacing.sm,
        children: [
          for (final a in TextAnimation.values)
            PanelChip(
              label: animationLabel(l10n, a),
              selected: style.animation == a,
              onTap: () => restyle(style.copyWith(animation: a)),
            ),
        ],
      ),
      const SizedBox(height: BlocksSpacing.sm),
      PanelSlider(
        label: l10n.rsSize,
        value: o.scale,
        min: 0.4,
        max: 4,
        valueLabel: '${(o.scale * 100).round()}%',
        onChanged: (v) => c.transformOverlay(o.id, scale: v),
      ),
      OverlayTimingEditor(overlay: o),
      const SizedBox(height: BlocksSpacing.sm),
      Align(
        alignment: AlignmentDirectional.centerStart,
        child: PanelAction(
          icon: Icons.delete_outline_rounded,
          label: l10n.rsDelete,
          destructive: true,
          onPressed: () => c.removeOverlay(o.id),
        ),
      ),
    ];
  }
}

// ------------------------------------------------------------------ stickers --

class StickersPanel extends ConsumerStatefulWidget {
  const StickersPanel({
    required this.playhead,
    required this.onSeek,
    super.key,
  });

  final ValueNotifier<Duration> playhead;
  final ValueChanged<Duration> onSeek;

  @override
  ConsumerState<StickersPanel> createState() => _StickersPanelState();
}

class _StickersPanelState extends ConsumerState<StickersPanel> {
  String _category = StickerCatalog.categories.first.id;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final s = ref.watch(reelStudioProvider);
    final c = ref.read(reelStudioProvider.notifier);
    final selected = s.selectedOverlay;
    final sticker = selected != null && !selected.isText ? selected : null;
    final stickers =
        StickerCatalog.byId(_category)?.stickers ?? const <String>[];

    return PanelScaffold(
      children: [
        SizedBox(
          height: BlocksSpacing.touchTarget,
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final cat in StickerCatalog.categories)
                  Padding(
                    padding: const EdgeInsetsDirectional.only(
                      end: BlocksSpacing.sm,
                    ),
                    child: PanelChip(
                      label: stickerCategoryLabel(l10n, cat.id),
                      selected: cat.id == _category,
                      onTap: () => setState(() => _category = cat.id),
                    ),
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: BlocksSpacing.sm),
        Wrap(
          children: [
            for (final e in stickers)
              Semantics(
                button: true,
                label: l10n.rsAddSticker(e),
                excludeSemantics: true,
                child: InkWell(
                  borderRadius: BlocksRadius.mdAll,
                  onTap: () => c.addSticker(e, at: widget.playhead.value),
                  child: SizedBox(
                    width: BlocksSpacing.touchTarget,
                    height: BlocksSpacing.touchTarget,
                    child: Center(
                      child: Text(e, style: const TextStyle(fontSize: 28)),
                    ),
                  ),
                ),
              ),
          ],
        ),
        OverlayLayers(onSeek: widget.onSeek),
        if (sticker != null) ...[
          const SizedBox(height: BlocksSpacing.sm),
          PanelSlider(
            label: l10n.rsSize,
            value: sticker.scale,
            min: 0.4,
            max: 4,
            valueLabel: '${(sticker.scale * 100).round()}%',
            onChanged: (v) => c.transformOverlay(sticker.id, scale: v),
          ),
          PanelSlider(
            label: l10n.rsRotation,
            value: sticker.rotation,
            min: -math.pi,
            max: math.pi,
            valueLabel: '${(sticker.rotation * 180 / math.pi).round()}°',
            onChanged: (v) => c.transformOverlay(sticker.id, rotation: v),
          ),
          OverlayTimingEditor(overlay: sticker),
          const SizedBox(height: BlocksSpacing.sm),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: PanelAction(
              icon: Icons.delete_outline_rounded,
              label: l10n.rsDelete,
              destructive: true,
              onPressed: () => c.removeOverlay(sticker.id),
            ),
          ),
        ] else
          PanelHint(l10n.rsStickerHint, icon: Icons.touch_app_rounded),
      ],
    );
  }
}
