/// Which slice of a track plays under the reel.
///
/// The slice is never longer than the reel needs, never shorter than
/// [minLength], and always inside the track.
abstract final class MusicClipRules {
  static const minLength = Duration(seconds: 5);

  /// The longest slice that makes sense: as long as the reel, but at least
  /// [minLength], and never more than the track itself.
  static Duration maxLength({required Duration track, required Duration reel}) {
    final wanted = reel < minLength ? minLength : reel;
    return wanted > track ? track : wanted;
  }

  /// Where the slice starts when a track is first chosen: the beginning, as
  /// long as the reel.
  static (Duration, Duration) initial({
    required Duration track,
    required Duration reel,
  }) => (Duration.zero, maxLength(track: track, reel: reel));

  /// Fits a dragged [start]/[end] to the rules. [movedStart] says which handle
  /// the user is dragging, so the *other* one gives way when the slice would
  /// become too long or too short.
  static (Duration, Duration) clamp({
    required Duration start,
    required Duration end,
    required Duration track,
    required Duration maxLen,
    required bool movedStart,
  }) {
    final min = track < minLength ? track : minLength;
    final max = maxLen < min ? min : (maxLen > track ? track : maxLen);

    var s = _within(start, Duration.zero, track);
    var e = _within(end, Duration.zero, track);
    if (e < s) {
      if (movedStart) {
        e = s;
      } else {
        s = e;
      }
    }

    // Fit the length: the handle the user is *not* holding gives way.
    final length = e - s;
    if (length > max) {
      if (movedStart) {
        e = s + max;
      } else {
        s = e - max;
      }
    } else if (length < min) {
      if (movedStart) {
        e = s + min;
      } else {
        s = e - min;
      }
    }

    // Then slide the whole slice back inside the track (its length is
    // already between min and max, so it always fits).
    if (e > track) {
      s -= e - track;
      e = track;
    }
    if (s < Duration.zero) {
      e -= s;
      s = Duration.zero;
    }
    return (s, e);
  }

  static Duration _within(Duration v, Duration lo, Duration hi) =>
      v < lo ? lo : (v > hi ? hi : v);
}
