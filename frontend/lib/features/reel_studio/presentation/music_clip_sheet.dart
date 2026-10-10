import 'dart:math' as math;

import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/data/models/music_models.dart';
import 'package:blocks_app/features/reel_studio/application/studio_sound.dart';
import 'package:blocks_app/features/reel_studio/domain/music_clip.dart';
import 'package:blocks_app/features/reel_studio/presentation/studio_labels.dart';
import 'package:blocks_app/features/reels/audio/reel_sound_engine.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Choose which part of [track] plays under the reel, and hear it.
Future<MusicSelection?> showMusicClipSheet(
  BuildContext context, {
  required MusicTrack track,
  required Duration reel,
  MusicSelection? current,
}) {
  return showModalBottomSheet<MusicSelection>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (_) => MusicClipSheet(track: track, reel: reel, current: current),
  );
}

class MusicClipSheet extends ConsumerStatefulWidget {
  const MusicClipSheet({
    required this.track,
    required this.reel,
    super.key,
    this.current,
  });

  final MusicTrack track;

  /// How long the reel is: the slice is never longer than this.
  final Duration reel;
  final MusicSelection? current;

  @override
  ConsumerState<MusicClipSheet> createState() => _MusicClipSheetState();
}

class _MusicClipSheetState extends ConsumerState<MusicClipSheet> {
  late Duration _start;
  late Duration _end;
  late final Duration _maxLen;
  ReelSoundChannel? _channel;
  bool _playing = false;

  @override
  void initState() {
    super.initState();
    final t = widget.track.duration;
    _maxLen = MusicClipRules.maxLength(track: t, reel: widget.reel);
    final cur = widget.current;
    if (cur != null && cur.track.id == widget.track.id) {
      _start = cur.start;
      _end = cur.end;
    } else {
      final (s, e) = MusicClipRules.initial(track: t, reel: widget.reel);
      _start = s;
      _end = e;
    }
  }

  @override
  void dispose() {
    _channel?.dispose();
    super.dispose();
  }

  void _togglePreview() {
    final engine = ref.read(studioSoundEngineProvider);
    if (_playing) {
      _channel?.pause();
      setState(() => _playing = false);
      return;
    }
    final ch = _channel ??= engine.channelFor(widget.track.previewSeed);
    ch
      ..muted = false
      ..play();
    setState(() => _playing = true);
  }

  void _onRange(RangeValues v) {
    final movedStart =
        (v.start - _start.inMilliseconds).abs() >
        (v.end - _end.inMilliseconds).abs();
    final (s, e) = MusicClipRules.clamp(
      start: Duration(milliseconds: v.start.round()),
      end: Duration(milliseconds: v.end.round()),
      track: widget.track.duration,
      maxLen: _maxLen,
      movedStart: movedStart,
    );
    setState(() {
      _start = s;
      _end = e;
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final track = widget.track;
    final total = track.duration.inMilliseconds.toDouble();

    return Padding(
      padding: EdgeInsets.fromLTRB(
        BlocksSpacing.lg,
        0,
        BlocksSpacing.lg,
        MediaQuery.viewInsetsOf(context).bottom + BlocksSpacing.lg,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Semantics(
              header: true,
              child: Text(l10n.rsClipTitle, style: context.text.titleLarge),
            ),
            const SizedBox(height: 2),
            Text(
              '${track.title} · ${track.artist}',
              style: context.text.bodyMedium,
            ),
            const SizedBox(height: BlocksSpacing.lg),
            SizedBox(
              height: 64,
              child: CustomPaint(
                painter: _WavePainter(
                  seed: track.previewSeed,
                  start: _start.inMilliseconds / total,
                  end: _end.inMilliseconds / total,
                  active: context.scheme.primary,
                  idle: context.scheme.outlineVariant,
                ),
                size: Size.infinite,
              ),
            ),
            Semantics(
              container: true,
              label: l10n.rsClipRange,
              child: RangeSlider(
                values: RangeValues(
                  _start.inMilliseconds.toDouble(),
                  _end.inMilliseconds.toDouble(),
                ),
                max: total,
                labels: RangeLabels(formatMinSec(_start), formatMinSec(_end)),
                semanticFormatterCallback: (v) =>
                    formatMinSec(Duration(milliseconds: v.round())),
                onChanged: _onRange,
              ),
            ),
            Wrap(
              alignment: WrapAlignment.spaceBetween,
              spacing: 12,
              runSpacing: 4,
              children: [
                Text(
                  l10n.rsTrimStart(formatMinSec(_start)),
                  style: context.text.labelMedium,
                ),
                Text(
                  l10n.rsTrimLength(formatShort(_end - _start)),
                  style: context.text.labelLarge,
                ),
                Text(
                  l10n.rsTrimEnd(formatMinSec(_end)),
                  style: context.text.labelMedium,
                ),
              ],
            ),
            const SizedBox(height: BlocksSpacing.xs),
            Text(
              l10n.rsClipNote(formatShort(_maxLen)),
              style: context.text.bodySmall,
            ),
            const SizedBox(height: BlocksSpacing.lg),
            Row(
              children: [
                Expanded(
                  child: BlocksButton(
                    label: _playing ? l10n.rsStopPreview : l10n.rsPreviewClip,
                    icon: _playing
                        ? Icons.stop_rounded
                        : Icons.play_arrow_rounded,
                    variant: BlocksButtonVariant.tonal,
                    onPressed: _togglePreview,
                  ),
                ),
                const SizedBox(width: BlocksSpacing.md),
                Expanded(
                  child: BlocksButton(
                    label: l10n.rsUseClip,
                    icon: Icons.check_rounded,
                    onPressed: () => Navigator.of(context).pop(
                      MusicSelection(track: track, start: _start, end: _end),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// A deterministic bar "waveform" for a track, with the chosen slice lit.
class _WavePainter extends CustomPainter {
  _WavePainter({
    required this.seed,
    required this.start,
    required this.end,
    required this.active,
    required this.idle,
  });

  final int seed;
  final double start;
  final double end;
  final Color active;
  final Color idle;

  @override
  void paint(Canvas canvas, Size size) {
    const bars = 56;
    final r = math.Random(seed);
    final gap = size.width / bars;
    final paint = Paint()
      ..strokeCap = StrokeCap.round
      ..strokeWidth = math.max(2, gap * 0.55);
    for (var i = 0; i < bars; i++) {
      final f = (i + 0.5) / bars;
      final env = 0.35 + 0.65 * math.sin(f * math.pi).abs();
      final h = size.height * (0.18 + 0.82 * r.nextDouble() * env);
      paint.color = f >= start && f <= end ? active : idle;
      final x = gap * (i + 0.5);
      canvas.drawLine(
        Offset(x, (size.height - h) / 2),
        Offset(x, (size.height + h) / 2),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(_WavePainter old) =>
      old.start != start || old.end != end || old.seed != seed;
}
