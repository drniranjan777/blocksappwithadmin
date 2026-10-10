import 'dart:math' as math;

import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/data/models/reel_models.dart';
import 'package:blocks_app/features/reel_studio/domain/reel_timeline.dart';
import 'package:blocks_app/features/reel_studio/presentation/studio_labels.dart';
import 'package:blocks_app/features/reel_studio/presentation/widgets/clip_visual.dart';
import 'package:flutter/material.dart';

/// How long a transition between two clips takes.
const kTransitionLength = Duration(milliseconds: 400);

/// The live preview of the reel at [playhead]: the current clip with its look,
/// the transition into it, and every caption and sticker visible right now.
///
/// It only *draws* the edit; every change goes back through callbacks.
class ReelPreview extends StatelessWidget {
  const ReelPreview({
    required this.draft,
    required this.playhead,
    required this.isPlaying,
    required this.onTogglePlay,
    required this.onSeek,
    required this.selectedOverlayId,
    required this.onSelectOverlay,
    required this.onMoveOverlay,
    required this.onTransformOverlay,
    super.key,
  });

  final ReelDraft draft;
  final ValueNotifier<Duration> playhead;
  final bool isPlaying;
  final VoidCallback onTogglePlay;
  final ValueChanged<Duration> onSeek;
  final String? selectedOverlayId;
  final ValueChanged<String?> onSelectOverlay;
  final void Function(String id, double x, double y) onMoveOverlay;
  final void Function(String id, {double? scale, double? rotation})
  onTransformOverlay;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BlocksRadius.lgAll,
      child: ColoredBox(
        color: Colors.black,
        child: ValueListenableBuilder<Duration>(
          valueListenable: playhead,
          builder: (context, t, _) => _Frame(
            draft: draft,
            time: t,
            isPlaying: isPlaying,
            onTogglePlay: onTogglePlay,
            onSeek: onSeek,
            selectedOverlayId: selectedOverlayId,
            onSelectOverlay: onSelectOverlay,
            onMoveOverlay: onMoveOverlay,
            onTransformOverlay: onTransformOverlay,
          ),
        ),
      ),
    );
  }
}

class _Frame extends StatelessWidget {
  const _Frame({
    required this.draft,
    required this.time,
    required this.isPlaying,
    required this.onTogglePlay,
    required this.onSeek,
    required this.selectedOverlayId,
    required this.onSelectOverlay,
    required this.onMoveOverlay,
    required this.onTransformOverlay,
  });

  final ReelDraft draft;
  final Duration time;
  final bool isPlaying;
  final VoidCallback onTogglePlay;
  final ValueChanged<Duration> onSeek;
  final String? selectedOverlayId;
  final ValueChanged<String?> onSelectOverlay;
  final void Function(String id, double x, double y) onMoveOverlay;
  final void Function(String id, {double? scale, double? rotation})
  onTransformOverlay;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final total = draft.totalDuration;
    final loc = ReelTimeline.locate(draft.clips, time);

    return LayoutBuilder(
      builder: (context, box) {
        final w = box.maxWidth;
        final h = box.maxHeight;
        if (loc == null) {
          return _EmptyFrame(hint: l10n.rsPreviewEmpty);
        }
        final clip = draft.clips[loc.index];
        final prev = loc.index > 0 ? draft.clips[loc.index - 1] : null;
        final transition = prev?.transitionId;
        final p = transition == null
            ? 1.0
            : (loc.local.inMilliseconds / kTransitionLength.inMilliseconds)
                  .clamp(0.0, 1.0);
        final progress = clip.duration.inMilliseconds == 0
            ? 0.0
            : loc.local.inMilliseconds / clip.duration.inMilliseconds;
        final zoom = context.reduceMotion ? 1.0 : 1 + 0.06 * progress;

        final current = Transform.scale(
          scale: zoom,
          child: ClipVisual(clip: clip, seedOffset: (progress * 3).floor()),
        );
        Widget base = current;
        if (prev != null && transition != null && p < 1) {
          base = Stack(
            fit: StackFit.expand,
            children: [
              ClipVisual(clip: prev, seedOffset: 3),
              _applyTransition(transition, p, w, current),
            ],
          );
        }

        final visible = [
          for (final o in draft.overlays)
            if (o.isVisibleAt(time)) o,
        ];

        return Semantics(
          container: true,
          label: l10n.rsPreviewLabel(formatMinSec(time), formatMinSec(total)),
          child: Stack(
            fit: StackFit.expand,
            children: [
              // Tap the picture to play / pause; tap empty space to deselect.
              GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () {
                  if (selectedOverlayId != null) {
                    onSelectOverlay(null);
                  } else {
                    onTogglePlay();
                  }
                },
                child: base,
              ),
              for (final o in visible)
                _OverlayView(
                  key: ValueKey(o.id),
                  overlay: o,
                  time: time,
                  frame: Size(w, h),
                  selected: o.id == selectedOverlayId,
                  interactive: !isPlaying,
                  onSelect: () => onSelectOverlay(o.id),
                  onMove: (x, y) => onMoveOverlay(o.id, x, y),
                  onTransform: (s, r) =>
                      onTransformOverlay(o.id, scale: s, rotation: r),
                ),
              if (!isPlaying)
                Center(
                  child: Semantics(
                    button: true,
                    label: l10n.rsPlay,
                    excludeSemantics: true,
                    child: Material(
                      color: Colors.black.withValues(alpha: 0.45),
                      shape: const CircleBorder(),
                      child: InkWell(
                        customBorder: const CircleBorder(),
                        onTap: onTogglePlay,
                        child: const Padding(
                          padding: EdgeInsets.all(14),
                          child: Icon(
                            Icons.play_arrow_rounded,
                            color: Colors.white,
                            size: 38,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              Positioned(
                left: BlocksSpacing.sm,
                right: BlocksSpacing.sm,
                bottom: 0,
                child: _SeekBar(
                  total: total,
                  time: time,
                  isPlaying: isPlaying,
                  onTogglePlay: onTogglePlay,
                  onSeek: onSeek,
                ),
              ),
              Positioned(
                left: BlocksSpacing.sm,
                top: BlocksSpacing.sm,
                child: _TimeChip(
                  label: '${formatMinSec(time)} / ${formatMinSec(total)}',
                ),
              ),
              if (draft.music != null)
                Positioned(
                  left: BlocksSpacing.sm,
                  top: BlocksSpacing.sm + 30,
                  right: BlocksSpacing.sm,
                  child: Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: _MusicChip(title: draft.music!.track.title),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

/// Draws [child] as it arrives with transition [id] at progress [p] (0..1).
Widget _applyTransition(String id, double p, double width, Widget child) {
  final e = Curves.easeOutCubic.transform(p);
  return switch (id) {
    'fade' => Opacity(opacity: e, child: child),
    'slide' => Transform.translate(
      offset: Offset((1 - e) * width, 0),
      child: child,
    ),
    'zoom' => Opacity(
      opacity: e,
      child: Transform.scale(scale: 0.6 + 0.4 * e, child: child),
    ),
    'wipe' => ClipRect(clipper: _WipeClipper(e), child: child),
    _ => child,
  };
}

class _WipeClipper extends CustomClipper<Rect> {
  _WipeClipper(this.fraction);

  final double fraction;

  @override
  Rect getClip(Size size) =>
      Rect.fromLTWH(0, 0, size.width * fraction, size.height);

  @override
  bool shouldReclip(_WipeClipper old) => old.fraction != fraction;
}

class _EmptyFrame extends StatelessWidget {
  const _EmptyFrame({required this.hint});

  final String hint;

  @override
  Widget build(BuildContext context) {
    // Scrollable so it can never overflow, however small the frame or large
    // the text.
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(BlocksSpacing.md),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.movie_creation_outlined,
              color: Colors.white70,
              size: 40,
            ),
            const SizedBox(height: BlocksSpacing.sm),
            Text(
              hint,
              textAlign: TextAlign.center,
              style: context.text.bodyMedium?.copyWith(color: Colors.white70),
            ),
          ],
        ),
      ),
    );
  }
}

class _TimeChip extends StatelessWidget {
  const _TimeChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      color: Colors.black.withValues(alpha: 0.5),
      borderRadius: BorderRadius.circular(BlocksRadius.pill),
    ),
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      child: Text(
        label,
        style: context.text.labelMedium?.copyWith(color: Colors.white),
      ),
    ),
  );
}

class _MusicChip extends StatelessWidget {
  const _MusicChip({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      color: Colors.black.withValues(alpha: 0.5),
      borderRadius: BorderRadius.circular(BlocksRadius.pill),
    ),
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.music_note_rounded, size: 14, color: Colors.white),
          const SizedBox(width: 4),
          Flexible(
            child: Text(
              title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: context.text.labelMedium?.copyWith(color: Colors.white),
            ),
          ),
        ],
      ),
    ),
  );
}

class _SeekBar extends StatelessWidget {
  const _SeekBar({
    required this.total,
    required this.time,
    required this.isPlaying,
    required this.onTogglePlay,
    required this.onSeek,
  });

  final Duration total;
  final Duration time;
  final bool isPlaying;
  final VoidCallback onTogglePlay;
  final ValueChanged<Duration> onSeek;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final max = math.max(1, total.inMilliseconds).toDouble();
    return Row(
      children: [
        if (isPlaying)
          IconButton(
            tooltip: l10n.rsPause,
            visualDensity: VisualDensity.compact,
            onPressed: onTogglePlay,
            icon: const Icon(Icons.pause_rounded, color: Colors.white),
          ),
        Expanded(
          child: SliderTheme(
            data: SliderTheme.of(context).copyWith(
              trackHeight: 3,
              thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
              overlayShape: SliderComponentShape.noOverlay,
              activeTrackColor: Colors.white,
              inactiveTrackColor: Colors.white30,
              thumbColor: Colors.white,
            ),
            child: Slider(
              semanticFormatterCallback: (v) => l10n.rsSeekValue(
                formatMinSec(Duration(milliseconds: v.round())),
              ),
              value: time.inMilliseconds.clamp(0, max.toInt()).toDouble(),
              max: max,
              onChanged: (v) => onSeek(Duration(milliseconds: v.round())),
            ),
          ),
        ),
      ],
    );
  }
}

// ----------------------------------------------------------------- overlays --

class _OverlayView extends StatefulWidget {
  const _OverlayView({
    required this.overlay,
    required this.time,
    required this.frame,
    required this.selected,
    required this.interactive,
    required this.onSelect,
    required this.onMove,
    required this.onTransform,
    super.key,
  });

  final ReelOverlay overlay;
  final Duration time;
  final Size frame;
  final bool selected;
  final bool interactive;
  final VoidCallback onSelect;
  final void Function(double x, double y) onMove;
  final void Function(double scale, double rotation) onTransform;

  @override
  State<_OverlayView> createState() => _OverlayViewState();
}

class _OverlayViewState extends State<_OverlayView> {
  double _baseScale = 1;
  double _baseRotation = 0;

  @override
  Widget build(BuildContext context) {
    final o = widget.overlay;
    final t = widget.time - o.start;
    final intro = (t.inMilliseconds / 500).clamp(0.0, 1.0);
    final animation = context.reduceMotion
        ? TextAnimation.none
        : o.textStyle.animation;

    Widget content = o.isText
        ? _TextBox(
            overlay: o,
            intro: animation == TextAnimation.typewriter ? intro : 1,
          )
        : Text(o.content, style: const TextStyle(fontSize: 56, height: 1.1));

    if (o.isText) {
      content = switch (animation) {
        TextAnimation.fade => Opacity(opacity: intro, child: content),
        TextAnimation.pop => Transform.scale(
          scale: Curves.easeOutBack.transform(intro),
          child: content,
        ),
        TextAnimation.slideUp => Opacity(
          opacity: intro,
          child: Transform.translate(
            offset: Offset(0, (1 - intro) * 28),
            child: content,
          ),
        ),
        _ => content,
      };
    }

    final framed = DecoratedBox(
      position: DecorationPosition.foreground,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(6),
        border: widget.selected
            ? Border.all(color: Colors.white, width: 1.5)
            : null,
      ),
      child: Padding(padding: const EdgeInsets.all(2), child: content),
    );

    return Positioned(
      left: o.x * widget.frame.width,
      top: o.y * widget.frame.height,
      child: FractionalTranslation(
        translation: const Offset(-0.5, -0.5),
        child: Transform.rotate(
          angle: o.rotation,
          child: Transform.scale(
            scale: o.scale,
            child: Semantics(
              button: true,
              selected: widget.selected,
              label: o.isText
                  ? context.l10n.rsTextLayer(o.content)
                  : context.l10n.rsStickerLayer(o.content),
              excludeSemantics: true,
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: widget.interactive ? widget.onSelect : null,
                onScaleStart: widget.interactive
                    ? (_) {
                        _baseScale = o.scale;
                        _baseRotation = o.rotation;
                        widget.onSelect();
                      }
                    : null,
                onScaleUpdate: widget.interactive
                    ? (d) {
                        if (d.pointerCount > 1) {
                          widget.onTransform(
                            _baseScale * d.scale,
                            _baseRotation + d.rotation,
                          );
                        }
                        final dx = d.focalPointDelta.dx / widget.frame.width;
                        final dy = d.focalPointDelta.dy / widget.frame.height;
                        if (dx != 0 || dy != 0) {
                          widget.onMove(o.x + dx, o.y + dy);
                        }
                      }
                    : null,
                child: framed,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _TextBox extends StatelessWidget {
  const _TextBox({required this.overlay, required this.intro});

  final ReelOverlay overlay;

  /// 1 = fully shown; below 1 only the first part is typed (typewriter).
  final double intro;

  @override
  Widget build(BuildContext context) {
    final s = overlay.textStyle;
    final chars = overlay.content.characters;
    final shown = intro >= 1
        ? overlay.content
        : chars.take((chars.length * intro).ceil()).toString();
    final base = TextStyle(
      fontSize: 26,
      height: 1.15,
      color: Color(s.colorValue),
      fontWeight: s.bold ? FontWeight.w800 : FontWeight.w500,
    );
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 260),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: s.backgroundValue == null
              ? null
              : Color(s.backgroundValue!)
                    .withValues(alpha: s.backgroundOpacity),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Padding(
          padding: EdgeInsets.symmetric(
            horizontal: s.backgroundValue == null ? 2 : 10,
            vertical: s.backgroundValue == null ? 0 : 4,
          ),
          child: Text(
            shown,
            textAlign: switch (s.align) {
              OverlayAlign.start => TextAlign.start,
              OverlayAlign.center => TextAlign.center,
              OverlayAlign.end => TextAlign.end,
            },
            style: fontStyleOf(s.fontId, base).copyWith(
              shadows: s.backgroundValue == null
                  ? const [Shadow(blurRadius: 6, color: Colors.black54)]
                  : null,
            ),
          ),
        ),
      ),
    );
  }
}
