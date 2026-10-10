import 'dart:math';

import 'package:blocks_app/data/models/media_models.dart';
import 'package:blocks_app/data/models/reel_models.dart';

/// Estimates what the optimisation pipeline will produce, so the app can show
/// "82 MB -> 18 MB, 78% smaller" *before* anything is encoded.
///
/// This is an estimate from the chosen profile (target bitrate x duration for
/// video, resolution x quality for photos). The authoritative transcode happens
/// on the server; the client file is never trusted as the final version.
abstract final class MediaOptimizer {
  /// Bytes per pixel of a typical JPEG at quality 100; scaled by quality.
  static const _jpegBytesPerPixelAtMax = 0.55;

  /// Optimised size of [asset] under [profile], never larger than the source.
  /// For a video, [usedDuration] limits the estimate to the part actually used
  /// (a trimmed clip uploads less).
  static int estimateAssetBytes(
    MediaAsset asset,
    MediaProfile profile, {
    Duration? usedDuration,
  }) {
    final original = asset.originalSizeBytes;
    if (original <= 0) return 0;

    if (asset.isPhoto) {
      if (profile.isOriginal) return original;
      final shortSide = min(asset.width, asset.height);
      final longSide = max(asset.width, asset.height);
      final scale = longSide <= profile.photoMaxEdge || longSide == 0
          ? 1.0
          : profile.photoMaxEdge / longSide;
      final pixels = (asset.width * scale) * (asset.height * scale);
      final bytes =
          pixels * _jpegBytesPerPixelAtMax * (profile.photoQuality / 100) * 0.5;
      // Keep tiny images from "growing" and silly estimates sane.
      return min(original, max(bytes.round(), shortSide > 0 ? 20 * 1024 : 0));
    }

    // Video.
    final fullMs = asset.durationMs;
    final usedMs = usedDuration == null || fullMs == 0
        ? fullMs
        : min(usedDuration.inMilliseconds, fullMs);
    final share = fullMs == 0 ? 1.0 : usedMs / fullMs;

    if (profile.isOriginal) return (original * share).round();

    final target = profile.resolution!;
    final shortSide = min(asset.width, asset.height);
    // Bitrate scales down when the source is smaller than the target frame.
    final resolutionFactor = shortSide >= target.shortSide
        ? 1.0
        : pow(shortSide / target.shortSide, 2).toDouble();
    final kbps = profile.videoKbps * resolutionFactor + profile.audioKbps;
    final seconds = usedMs / 1000;
    final bytes = kbps * 1000 / 8 * seconds;
    return min((original * share).round(), bytes.round());
  }

  /// Estimate for a whole reel: every clip's used part under [profile].
  /// Clips that share one source asset are counted per use, as each is cut and
  /// uploaded separately.
  static OptimizationEstimate estimateDraft(
    ReelDraft draft,
    MediaProfile profile,
  ) {
    var original = 0;
    var optimized = 0;
    for (final c in draft.clips) {
      final m = c.media;
      if (m.isPhoto) {
        original += m.originalSizeBytes;
        optimized += estimateAssetBytes(m, profile);
      } else {
        final full = m.durationMs;
        final share = full == 0
            ? 1.0
            : min(c.duration.inMilliseconds, full) / full;
        original += (m.originalSizeBytes * share).round();
        optimized += estimateAssetBytes(m, profile, usedDuration: c.duration);
      }
    }
    return OptimizationEstimate(
      originalBytes: original,
      optimizedBytes: optimized,
    );
  }

  /// The profile to start with. Data Saver mode always starts conservative.
  static MediaProfile defaultProfile({required bool dataSaver}) =>
      dataSaver ? MediaProfile.dataSaver : MediaProfile.balanced;

  /// "82 MB", "640 KB" — one decimal under 10, none above.
  static String formatBytes(int bytes) {
    const kb = 1024;
    const mb = kb * 1024;
    const gb = mb * 1024;
    if (bytes >= gb) return '${(bytes / gb).toStringAsFixed(1)} GB';
    if (bytes >= mb) {
      final v = bytes / mb;
      return '${v >= 10 ? v.round() : double.parse(v.toStringAsFixed(1))} MB';
    }
    if (bytes >= kb) return '${(bytes / kb).round()} KB';
    return '$bytes B';
  }
}
