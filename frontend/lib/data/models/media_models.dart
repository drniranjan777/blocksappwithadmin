import 'package:blocks_app/data/models/reel_models.dart';
import 'package:equatable/equatable.dart';

/// Limits for making a reel. **Server-controlled**: the backend returns these
/// and may change them at any time; nothing in the UI hard-codes a number.
class ReelConfig extends Equatable {
  const ReelConfig({
    this.maxDurationSeconds = 180,
    this.maxClips = 20,
    this.maxPhotos = 10,
    this.maxVideoSizeMb = 500,
    this.durationOptionsSeconds = const [15, 30, 60, 90, 180],
    this.defaultLimitSeconds = 30,
    this.defaultPhotoDurationMs = 3000,
    this.minClipDurationMs = 500,
    this.minPhotoDurationMs = 1000,
    this.maxPhotoDurationMs = 10000,
  });

  const ReelConfig.demo() : this();

  /// The longest reel the platform accepts.
  final int maxDurationSeconds;
  final int maxClips;
  final int maxPhotos;

  /// Largest single source video, in megabytes (before optimisation).
  final int maxVideoSizeMb;

  /// Length limits a creator can pick from. Options above [maxDurationSeconds]
  /// are not offered.
  final List<int> durationOptionsSeconds;

  /// The length limit a new reel starts with.
  final int defaultLimitSeconds;
  final int defaultPhotoDurationMs;
  final int minClipDurationMs;
  final int minPhotoDurationMs;
  final int maxPhotoDurationMs;

  int get maxVideoSizeBytes => maxVideoSizeMb * 1024 * 1024;

  /// The selectable limits, never beyond the platform maximum.
  List<int> get selectableDurations => [
    for (final s in durationOptionsSeconds)
      if (s <= maxDurationSeconds) s,
  ];

  @override
  List<Object?> get props => [
    maxDurationSeconds,
    maxClips,
    maxPhotos,
    maxVideoSizeMb,
    durationOptionsSeconds,
    defaultLimitSeconds,
    defaultPhotoDurationMs,
    minClipDurationMs,
    minPhotoDurationMs,
    maxPhotoDurationMs,
  ];
}

// ------------------------------------------------------- quality profiles --

/// Frame heights the pipeline can target. Only [p720] and [p1080] are used in
/// phase 1; the rest are here so the architecture can grow without changes.
/// Measured on the *shorter* side, so a portrait 1080x1920 reel is "1080p".
enum MediaResolution {
  p720(720),
  p1080(1080),
  p1440(1440),
  p2160(2160);

  const MediaResolution(this.shortSide);

  final int shortSide;
}

enum MediaQuality { dataSaver, balanced, high, original }

/// How a reel is prepared for upload. Configurable profile, not code.
class MediaProfile extends Equatable {
  const MediaProfile({
    required this.quality,
    required this.resolution,
    required this.videoKbps,
    required this.audioKbps,
    required this.photoMaxEdge,
    required this.photoQuality,
    required this.thumbnailEdge,
    required this.uploadChunkBytes,
  });

  /// Keeps the source as it is.
  const MediaProfile.passthrough()
    : quality = MediaQuality.original,
      resolution = null,
      videoKbps = 0,
      audioKbps = 0,
      photoMaxEdge = 0,
      photoQuality = 100,
      thumbnailEdge = 480,
      uploadChunkBytes = 1024 * 1024;

  static const dataSaver = MediaProfile(
    quality: MediaQuality.dataSaver,
    resolution: MediaResolution.p720,
    videoKbps: 1500,
    audioKbps: 96,
    photoMaxEdge: 1280,
    photoQuality: 70,
    thumbnailEdge: 240,
    uploadChunkBytes: 256 * 1024,
  );

  static const balanced = MediaProfile(
    quality: MediaQuality.balanced,
    resolution: MediaResolution.p1080,
    videoKbps: 4000,
    audioKbps: 128,
    photoMaxEdge: 1920,
    photoQuality: 82,
    thumbnailEdge: 360,
    uploadChunkBytes: 512 * 1024,
  );

  static const high = MediaProfile(
    quality: MediaQuality.high,
    resolution: MediaResolution.p1080,
    videoKbps: 8000,
    audioKbps: 192,
    photoMaxEdge: 2560,
    photoQuality: 92,
    thumbnailEdge: 480,
    uploadChunkBytes: 1024 * 1024,
  );

  static const original = MediaProfile.passthrough();

  static const all = [dataSaver, balanced, high, original];

  static MediaProfile of(MediaQuality q) => switch (q) {
    MediaQuality.dataSaver => dataSaver,
    MediaQuality.balanced => balanced,
    MediaQuality.high => high,
    MediaQuality.original => original,
  };

  final MediaQuality quality;

  /// Null for [MediaQuality.original] (no resize).
  final MediaResolution? resolution;
  final int videoKbps;
  final int audioKbps;
  final int photoMaxEdge;
  final int photoQuality;
  final int thumbnailEdge;
  final int uploadChunkBytes;

  bool get isOriginal => quality == MediaQuality.original;

  @override
  List<Object?> get props => [
    quality,
    resolution,
    videoKbps,
    audioKbps,
    photoMaxEdge,
    photoQuality,
    thumbnailEdge,
    uploadChunkBytes,
  ];
}

/// What optimising a reel's media would (or did) save.
class OptimizationEstimate extends Equatable {
  const OptimizationEstimate({
    required this.originalBytes,
    required this.optimizedBytes,
  });

  final int originalBytes;
  final int optimizedBytes;

  /// 0..1, e.g. 0.78 = "78% smaller".
  double get reduction => originalBytes == 0
      ? 0
      : ((originalBytes - optimizedBytes) / originalBytes).clamp(0.0, 1.0);

  int get reductionPercent => (reduction * 100).round();

  @override
  List<Object?> get props => [originalBytes, optimizedBytes];
}

// ----------------------------------------------------------------- upload --

/// The stages every publish goes through, in order. [failed] can happen at any
/// of them; the draft is always kept so the creator can retry.
enum PublishStage {
  preparing,
  compressing,
  processing,
  uploading,
  serverProcessing,
  moderation,

  /// The reel exists and is being held for a person to approve it. It is not live yet, and
  /// nothing more will happen on this phone until that decision is made.
  inReview,
  published,
  failed,
}

/// A resumable upload the server opened for one file.
class UploadSession extends Equatable {
  const UploadSession({
    required this.id,
    required this.assetId,
    required this.totalBytes,
    required this.chunkBytes,
    this.uploadedBytes = 0,
  });

  final String id;
  final String assetId;
  final int totalBytes;
  final int chunkBytes;

  /// Bytes the server has confirmed: where to resume after an interruption.
  final int uploadedBytes;

  int get chunkCount => totalBytes == 0 ? 0 : (totalBytes / chunkBytes).ceil();
  bool get isComplete => uploadedBytes >= totalBytes;

  UploadSession copyWith({int? uploadedBytes}) => UploadSession(
    id: id,
    assetId: assetId,
    totalBytes: totalBytes,
    chunkBytes: chunkBytes,
    uploadedBytes: uploadedBytes ?? this.uploadedBytes,
  );

  @override
  List<Object?> get props => [
    id,
    assetId,
    totalBytes,
    chunkBytes,
    uploadedBytes,
  ];
}

/// One part of a file. The demo moves only its size; production sends bytes.
class UploadChunk extends Equatable {
  const UploadChunk({
    required this.index,
    required this.offset,
    required this.length,
  });

  final int index;
  final int offset;
  final int length;

  @override
  List<Object?> get props => [index, offset, length];
}

/// Server-confirmed progress of one upload.
class ChunkUploadProgress extends Equatable {
  const ChunkUploadProgress({
    required this.sessionId,
    required this.uploadedBytes,
    required this.totalBytes,
  });

  final String sessionId;
  final int uploadedBytes;
  final int totalBytes;

  double get fraction =>
      totalBytes == 0 ? 1 : (uploadedBytes / totalBytes).clamp(0.0, 1.0);
  bool get isComplete => uploadedBytes >= totalBytes;

  @override
  List<Object?> get props => [sessionId, uploadedBytes, totalBytes];
}

/// The on-device steps every file goes through before it is upload-ready.
enum MediaPipelineStep {
  inspect,
  validate,
  compress,
  resize,
  thumbnail,
  preview,
  uploadReady,
}

/// Progress of preparing one file. [asset] is set on the final event.
class MediaPipelineEvent extends Equatable {
  const MediaPipelineEvent({
    required this.assetId,
    required this.step,
    required this.fraction,
    this.asset,
  });

  final String assetId;
  final MediaPipelineStep step;

  /// 0..1 across the whole pipeline for this file.
  final double fraction;

  /// The prepared file, on the last event only.
  final MediaAsset? asset;

  bool get isDone => step == MediaPipelineStep.uploadReady && asset != null;

  @override
  List<Object?> get props => [assetId, step, fraction, asset];
}

/// Proof that one file arrived on the server.
class UploadReceipt extends Equatable {
  const UploadReceipt({
    required this.assetId,
    required this.sessionId,
    required this.bytes,
  });

  final String assetId;
  final String sessionId;
  final int bytes;

  @override
  List<Object?> get props => [assetId, sessionId, bytes];
}

/// A publish the server accepted and is now working on.
class PublishJob extends Equatable {
  const PublishJob({required this.id});

  final String id;

  @override
  List<Object?> get props => [id];
}

/// The server's view of a publish: it moves through
/// [PublishStage.serverProcessing] and [PublishStage.moderation] to
/// [PublishStage.published] or [PublishStage.failed].
class PublishJobStatus extends Equatable {
  const PublishJobStatus({
    required this.stage,
    this.fraction = 0,
    this.reelId,
    this.moderation,
    this.failureCode,
  });

  final PublishStage stage;

  /// 0..1 within [stage].
  final double fraction;
  final String? reelId;
  final ModerationResult? moderation;
  final String? failureCode;

  bool get isTerminal =>
      stage == PublishStage.published ||
      stage == PublishStage.inReview ||
      stage == PublishStage.failed;

  @override
  List<Object?> get props => [stage, fraction, reelId, moderation, failureCode];
}

/// What the publish screen shows. Built by the client-side orchestrator from
/// on-device work (compress, upload) and the server's [PublishJobStatus].
class PublishProgress extends Equatable {
  const PublishProgress({
    required this.stage,
    this.fraction = 0,
    this.bytesDone = 0,
    this.bytesTotal = 0,
    this.fileIndex = 0,
    this.fileCount = 0,
    this.reelId,
    this.failureCode,
    this.moderation,
  });

  final PublishStage stage;

  /// 0..1 within [stage].
  final double fraction;
  final int bytesDone;
  final int bytesTotal;
  final int fileIndex;
  final int fileCount;
  final String? reelId;
  final String? failureCode;
  final ModerationResult? moderation;

  bool get isTerminal =>
      stage == PublishStage.published ||
      stage == PublishStage.inReview ||
      stage == PublishStage.failed;

  @override
  List<Object?> get props => [
    stage,
    fraction,
    bytesDone,
    bytesTotal,
    fileIndex,
    fileCount,
    reelId,
    failureCode,
    moderation,
  ];
}

/// Verdict of the (mock) safety / copyright / policy checks.
enum ModerationVerdict { approved, needsReview, rejected }

class ModerationResult extends Equatable {
  const ModerationResult({required this.verdict, this.reason});

  final ModerationVerdict verdict;

  /// Reason code for a refusal (`copyright`, `policy`, ...).
  final String? reason;

  @override
  List<Object?> get props => [verdict, reason];
}
