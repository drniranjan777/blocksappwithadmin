import 'package:blocks_app/data/models/media_models.dart';
import 'package:blocks_app/data/models/reel_models.dart';

/// Where the creator's raw media comes from.
///
/// Demo: a generated gallery that works offline. Production: the device
/// gallery and camera (`image_picker` / `photo_manager` / `camera`).
abstract interface class MediaLibraryRepository {
  /// What the "gallery" currently offers, newest first.
  Future<List<MediaAsset>> getLibrary();

  /// Captures a new clip with the camera.
  Future<MediaAsset> record();
}

/// On-device preparation of media before upload: inspect, validate, compress,
/// resize, thumbnail, preview, upload-ready.
///
/// **This is an optimisation for the user's data and time, never a trust
/// boundary.** The server re-inspects and transcodes every file it receives
/// and must assume a client file can be malformed, oversized or hostile.
///
/// Demo: [MockMediaProcessingRepository] simulates the steps. Production:
/// a native pipeline in an isolate / platform channel (`video_compress`,
/// `flutter_image_compress`, MediaCodec / AVAssetExportSession), never on the
/// UI thread.
abstract interface class MediaProcessingRepository {
  /// Reads the file's real metadata (duration, size, dimensions).
  Future<MediaAsset> inspect(MediaAsset asset);

  /// Prepares [asset] for upload at [profile] and reports each step. The last
  /// event carries the prepared asset (with `optimizedSizeBytes` set).
  ///
  /// [usedDuration] is how much of a video the reel actually uses (after
  /// trimming); only that part is exported, so a trimmed clip uploads less.
  Stream<MediaPipelineEvent> prepare(
    MediaAsset asset,
    MediaProfile profile, {
    Duration? usedDuration,
  });
}

/// Resumable, chunked upload to private object storage.
///
/// Production: the server hands out a session (and pre-signed per-chunk
/// URLs); the client uploads parts, and may resume from the confirmed offset
/// after a network drop. Demo: the mock moves byte counts only.
abstract interface class MediaUploadRepository {
  Future<UploadSession> createSession(MediaAsset asset, {required int bytes});

  /// Uploads from `session.uploadedBytes` to the end, reporting what the
  /// server has confirmed. Throws `NetworkFailure` if the connection drops;
  /// call again with the session from [getSession] to resume.
  Stream<ChunkUploadProgress> upload(UploadSession session);

  Future<UploadSession> getSession(String sessionId);

  /// Tells the server every part has been sent so it can assemble the file.
  /// The server answers with the receipt that a publish refers to; a publish
  /// with a receipt it did not issue is refused. Throws a `ValidationFailure`
  /// while parts are still missing.
  Future<UploadReceipt> completeUpload(UploadSession session);

  /// Abandons a session so the server can discard the parts already stored.
  /// Safe to call more than once or for a session that no longer exists.
  Future<void> cancelUpload(String sessionId);
}
