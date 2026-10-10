import 'package:blocks_app/data/models/media_models.dart';
import 'package:blocks_app/data/models/reel_models.dart';

enum ReelIssueType {
  noClips,
  tooLong,
  tooManyClips,
  tooManyPhotos,
  videoTooLarge,
  clipTooShort,
}

/// One problem with a draft. [clipId] points at the clip it concerns.
class ReelIssue {
  const ReelIssue(this.type, {this.clipId});

  final ReelIssueType type;
  final String? clipId;

  @override
  bool operator ==(Object other) =>
      other is ReelIssue && other.type == type && other.clipId == clipId;

  @override
  int get hashCode => Object.hash(type, clipId);

  @override
  String toString() => 'ReelIssue($type, $clipId)';
}

/// Checks a draft against the server-supplied [ReelConfig] and the length
/// limit the creator picked. The client check is for instant feedback; the
/// server enforces the same limits again on upload.
abstract final class ReelValidator {
  /// The limit that actually applies: what the creator chose, never above the
  /// platform maximum.
  static Duration effectiveLimit(ReelDraft draft, ReelConfig config) {
    final chosen = draft.settings.durationLimitSeconds;
    final seconds = chosen > config.maxDurationSeconds
        ? config.maxDurationSeconds
        : chosen;
    return Duration(seconds: seconds);
  }

  static List<ReelIssue> validate(ReelDraft draft, ReelConfig config) {
    final issues = <ReelIssue>[];
    if (draft.clips.isEmpty) return const [ReelIssue(ReelIssueType.noClips)];

    if (draft.clips.length > config.maxClips) {
      issues.add(const ReelIssue(ReelIssueType.tooManyClips));
    }
    if (draft.photoCount > config.maxPhotos) {
      issues.add(const ReelIssue(ReelIssueType.tooManyPhotos));
    }
    if (draft.totalDuration > effectiveLimit(draft, config)) {
      issues.add(const ReelIssue(ReelIssueType.tooLong));
    }
    for (final c in draft.clips) {
      if (c.media.isVideo &&
          c.media.originalSizeBytes > config.maxVideoSizeBytes) {
        issues.add(ReelIssue(ReelIssueType.videoTooLarge, clipId: c.id));
      }
      final min = c.isPhoto
          ? config.minPhotoDurationMs
          : config.minClipDurationMs;
      if (c.duration.inMilliseconds < min) {
        issues.add(ReelIssue(ReelIssueType.clipTooShort, clipId: c.id));
      }
    }
    return issues;
  }

  /// Whether a video of [bytes] may be added at all (checked at pick time so
  /// the user hears about it before it is on the timeline).
  static bool isVideoSizeAllowed(int bytes, ReelConfig config) =>
      bytes <= config.maxVideoSizeBytes;

  /// Whether [asset] could be added to [draft] without breaking a hard limit.
  static ReelIssueType? canAdd(
    ReelDraft draft,
    MediaAsset asset,
    ReelConfig config,
  ) {
    if (draft.clips.length + 1 > config.maxClips) {
      return ReelIssueType.tooManyClips;
    }
    if (asset.isPhoto && draft.photoCount + 1 > config.maxPhotos) {
      return ReelIssueType.tooManyPhotos;
    }
    if (asset.isVideo && !isVideoSizeAllowed(asset.originalSizeBytes, config)) {
      return ReelIssueType.videoTooLarge;
    }
    return null;
  }
}
