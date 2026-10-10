import 'package:blocks_app/data/models/media_models.dart';
import 'package:blocks_app/data/models/reel_models.dart';

/// Editing operations on a list of clips. Pure functions: each returns a new
/// list and never mutates its input, so the editor can keep an undo history
/// and tests need no widgets. Every rule (minimum lengths, trim bounds,
/// config limits) lives here, not in the UI.
abstract final class ReelTimeline {
  /// A new clip for [media]: a video plays in full, a photo for the
  /// configured default duration.
  static ReelClip clipFromMedia(
    MediaAsset media, {
    required String id,
    required ReelConfig config,
  }) {
    final length = media.isPhoto
        ? Duration(milliseconds: config.defaultPhotoDurationMs)
        : media.duration;
    return ReelClip(id: id, media: media, start: Duration.zero, end: length);
  }

  /// Moves the clip at [oldIndex] so it ends up at [newIndex]. [newIndex] uses
  /// the `ReorderableListView` convention (the index *before* removal), so the
  /// widget's callback can pass its values straight through.
  static List<ReelClip> reorder(
    List<ReelClip> clips,
    int oldIndex,
    int newIndex,
  ) {
    if (oldIndex < 0 || oldIndex >= clips.length) return clips;
    var target = newIndex;
    if (target > oldIndex) target -= 1;
    target = target.clamp(0, clips.length - 1);
    if (target == oldIndex) return clips;
    final list = [...clips];
    final moved = list.removeAt(oldIndex);
    list.insert(target, moved);
    return list;
  }

  static List<ReelClip> remove(List<ReelClip> clips, String id) => [
    for (final c in clips)
      if (c.id != id) c,
  ];

  /// Inserts a copy right after the original.
  static List<ReelClip> duplicate(
    List<ReelClip> clips,
    String id, {
    required String newId,
  }) {
    final i = clips.indexWhere((c) => c.id == id);
    if (i < 0) return clips;
    return [...clips]..insert(i + 1, clips[i].copyWith(id: newId));
  }

  /// Changes where a video clip starts / ends inside its media. The result
  /// always stays inside the media and at least `minClipDurationMs` long.
  static List<ReelClip> trim(
    List<ReelClip> clips,
    String id, {
    required ReelConfig config,
    Duration? start,
    Duration? end,
  }) {
    final min = Duration(milliseconds: config.minClipDurationMs);
    return [
      for (final c in clips)
        if (c.id != id || c.isPhoto) c else _trimmed(c, start, end, min),
    ];
  }

  static ReelClip _trimmed(
    ReelClip c,
    Duration? start,
    Duration? end,
    Duration min,
  ) {
    final media = c.media.duration;
    var s = (start ?? c.start);
    var e = (end ?? c.end);
    if (s < Duration.zero) s = Duration.zero;
    if (e > media) e = media;
    if (e - s < min) {
      // Whichever edge the user is dragging gives way to the minimum.
      if (start != null) {
        s = e - min;
        if (s < Duration.zero) {
          s = Duration.zero;
          e = min < media ? min : media;
        }
      } else {
        e = s + min;
        if (e > media) {
          e = media;
          s = (e - min) < Duration.zero ? Duration.zero : e - min;
        }
      }
    }
    return c.copyWith(start: s, end: e);
  }

  /// How long a photo is shown, clamped to the configured range.
  static List<ReelClip> setPhotoDuration(
    List<ReelClip> clips,
    String id,
    Duration duration, {
    required ReelConfig config,
  }) {
    final lo = config.minPhotoDurationMs;
    final hi = config.maxPhotoDurationMs;
    final ms = duration.inMilliseconds.clamp(lo, hi);
    return [
      for (final c in clips)
        if (c.id == id && c.isPhoto)
          c.copyWith(end: Duration(milliseconds: ms))
        else
          c,
    ];
  }

  /// Splits a clip at [atLocal] (time from the clip's own start). Both halves
  /// must be at least the minimum length, otherwise nothing changes. The first
  /// half keeps the original id; the second gets [newId] and inherits the
  /// transition to the next clip.
  static List<ReelClip> split(
    List<ReelClip> clips,
    String id,
    Duration atLocal, {
    required String newId,
    required ReelConfig config,
  }) {
    final i = clips.indexWhere((c) => c.id == id);
    if (i < 0) return clips;
    final c = clips[i];
    final min = Duration(
      milliseconds: c.isPhoto
          ? config.minPhotoDurationMs
          : config.minClipDurationMs,
    );
    if (atLocal < min || c.duration - atLocal < min) return clips;

    final first = c.copyWith(end: c.start + atLocal, clearTransition: true);
    final second = c.copyWith(id: newId, start: c.start + atLocal);
    return [...clips]
      ..removeAt(i)
      ..insertAll(i, [first, second]);
  }

  /// Swaps the media of a clip, keeping its look (filter, adjustments).
  static List<ReelClip> replace(
    List<ReelClip> clips,
    String id,
    MediaAsset media, {
    required ReelConfig config,
  }) {
    return [
      for (final c in clips)
        if (c.id != id)
          c
        else
          c.copyWith(
            media: media,
            start: Duration.zero,
            end: media.isPhoto
                ? Duration(milliseconds: config.defaultPhotoDurationMs)
                : media.duration,
          ),
    ];
  }

  /// Where each clip begins on the reel's timeline.
  static List<Duration> startOffsets(List<ReelClip> clips) {
    final out = <Duration>[];
    var t = Duration.zero;
    for (final c in clips) {
      out.add(t);
      t += c.duration;
    }
    return out;
  }

  static Duration total(List<ReelClip> clips) =>
      clips.fold(Duration.zero, (s, c) => s + c.duration);

  /// The clip playing at [t] and how far into it that is. Returns the last
  /// clip's end for a time past the end, and null for an empty reel.
  static ({int index, Duration local})? locate(
    List<ReelClip> clips,
    Duration t,
  ) {
    if (clips.isEmpty) return null;
    var elapsed = Duration.zero;
    for (var i = 0; i < clips.length; i++) {
      final end = elapsed + clips[i].duration;
      if (t < end) {
        final local = t - elapsed;
        return (index: i, local: local < Duration.zero ? Duration.zero : local);
      }
      elapsed = end;
    }
    final last = clips.length - 1;
    return (index: last, local: clips[last].duration);
  }

  /// Keeps overlays inside the reel after it got shorter: an overlay that no
  /// longer starts within the reel is dropped, one that overruns is shortened.
  static List<ReelOverlay> fitOverlays(
    List<ReelOverlay> overlays,
    Duration total,
  ) {
    return [
      for (final o in overlays)
        if (o.start < total) o.end > total ? o.copyWith(end: total) : o,
    ];
  }
}
