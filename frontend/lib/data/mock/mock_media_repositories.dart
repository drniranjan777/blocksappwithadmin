import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/mock/mock_creator_state.dart';
import 'package:blocks_app/data/mock/mock_world.dart';
import 'package:blocks_app/data/models/media_models.dart';
import 'package:blocks_app/data/models/reel_models.dart';
import 'package:blocks_app/data/repositories/media_repositories.dart';
import 'package:blocks_app/features/reel_studio/domain/media_optimizer.dart';
import 'package:blocks_app/features/reel_studio/domain/reel_validator.dart';

/// The demo gallery. Production: the device gallery and camera.
class MockMediaLibraryRepository implements MediaLibraryRepository {
  MockMediaLibraryRepository(this._w);

  final MockWorld _w;
  MockCreatorState get _c => _w.creator;
  late final List<MediaAsset> _gallery = buildDemoGallery();

  @override
  Future<List<MediaAsset>> getLibrary() async {
    await _w.pause();
    return [..._c.recorded.reversed, ..._gallery];
  }

  @override
  Future<MediaAsset> record() async {
    await _w.pause();
    final n = _c.recorded.length + 1;
    // A fresh "camera" clip: portrait 1080p, a few seconds long.
    final seed = 4000 + n * 17;
    final clip = MediaAsset(
      id: _c.nextId('rec'),
      type: MediaType.video,
      origin: MediaOrigin.demo,
      localPath: 'demo://clip/$seed',
      thumbnailPath: 'demo://art/$seed',
      originalSizeBytes: (20 + n * 3) * 1024 * 1024,
      durationMs: (5 + n % 4) * 1000,
      width: 1080,
      height: 1920,
      name: 'REC_${n.toString().padLeft(3, '0')}.mp4',
    );
    _c.recorded.add(clip);
    return clip;
  }
}

/// Simulates the on-device pipeline. Production does this in a native
/// isolate / platform channel, never on the UI thread.
class MockMediaProcessingRepository implements MediaProcessingRepository {
  MockMediaProcessingRepository(this._w);

  final MockWorld _w;

  @override
  Future<MediaAsset> inspect(MediaAsset asset) async {
    await _w.pauseBrief();
    return asset;
  }

  @override
  Stream<MediaPipelineEvent> prepare(
    MediaAsset asset,
    MediaProfile profile, {
    Duration? usedDuration,
  }) async* {
    MediaPipelineEvent at(MediaPipelineStep s, double f, {MediaAsset? done}) =>
        MediaPipelineEvent(
          assetId: asset.id,
          step: s,
          fraction: f,
          asset: done,
        );

    yield at(MediaPipelineStep.inspect, 0.05);
    await _w.pauseBrief();

    // The same limit the server enforces: refuse a file that is too large
    // before spending the user's battery on it.
    if (asset.isVideo &&
        !ReelValidator.isVideoSizeAllowed(
          asset.originalSizeBytes,
          _w.creator.reelConfig,
        )) {
      throw const ValidationFailure('videoTooLarge');
    }
    yield at(MediaPipelineStep.validate, 0.12);
    await _w.pauseBrief();

    // Compression is the slow step: report it in small increments.
    const compressSteps = 4;
    for (var i = 1; i <= compressSteps; i++) {
      yield at(MediaPipelineStep.compress, 0.12 + 0.5 * i / compressSteps);
      await _w.pauseBrief(12);
    }
    yield at(MediaPipelineStep.resize, 0.7);
    await _w.pauseBrief(12);
    yield at(MediaPipelineStep.thumbnail, 0.8);
    await _w.pauseBrief(12);
    yield at(MediaPipelineStep.preview, 0.9);
    await _w.pauseBrief(12);

    final optimized = MediaOptimizer.estimateAssetBytes(
      asset,
      profile,
      usedDuration: usedDuration,
    );
    yield at(
      MediaPipelineStep.uploadReady,
      1,
      done: asset.copyWith(
        optimizedSizeBytes: optimized,
        status: MediaProcessingStatus.ready,
        thumbnailPath: asset.thumbnailPath,
      ),
    );
  }
}

/// Simulates resumable, chunked uploads to private storage.
class MockMediaUploadRepository implements MediaUploadRepository {
  MockMediaUploadRepository(this._w);

  final MockWorld _w;
  MockCreatorState get _c => _w.creator;

  static const _chunk = 1024 * 1024;

  @override
  Future<UploadSession> createSession(
    MediaAsset asset, {
    required int bytes,
  }) async {
    await _w.pauseBrief();
    // Opening a session for the same file again resumes the earlier one.
    for (final s in _c.uploadSessions.values) {
      if (s.assetId == asset.id && s.totalBytes == bytes && !s.isComplete) {
        return s;
      }
    }
    final session = UploadSession(
      id: _c.nextId('up'),
      assetId: asset.id,
      totalBytes: bytes,
      chunkBytes: _chunk,
    );
    _c.uploadSessions[session.id] = session;
    return session;
  }

  @override
  Future<UploadSession> getSession(String sessionId) async {
    final s = _c.uploadSessions[sessionId];
    if (s == null) throw const NotFoundFailure('Upload session not found');
    return s;
  }

  @override
  Future<UploadReceipt> completeUpload(UploadSession session) async {
    await _w.pauseBrief();
    // The server goes by what it stored, not by what the client claims.
    final stored = _c.uploadSessions[session.id];
    if (stored == null) throw const NotFoundFailure('Upload session not found');
    if (!stored.isComplete) throw const ValidationFailure('uploadIncomplete');
    _c.completedUploads.add(stored.id);
    return UploadReceipt(
      assetId: stored.assetId,
      sessionId: stored.id,
      bytes: stored.totalBytes,
    );
  }

  @override
  Future<void> cancelUpload(String sessionId) async {
    // Idempotent: nothing to do for an unknown or already cancelled session.
    _c.uploadSessions.remove(sessionId);
    _c.completedUploads.remove(sessionId);
  }

  @override
  Stream<ChunkUploadProgress> upload(UploadSession session) async* {
    if (!_c.uploadSessions.containsKey(session.id)) {
      throw const NotFoundFailure('Upload session not found');
    }
    var done = _c.uploadSessions[session.id]!.uploadedBytes;
    final total = session.totalBytes;
    final failAt = (total * 0.6).round();

    while (done < total) {
      await _w.pauseBrief(20);
      // Cancelled while a chunk was in flight: the parts are gone.
      if (!_c.uploadSessions.containsKey(session.id)) {
        throw const NotFoundFailure('Upload cancelled');
      }
      done = (done + session.chunkBytes).clamp(0, total);
      _c.uploadSessions[session.id] = session.copyWith(uploadedBytes: done);

      // Demo lab: the connection drops once, part-way through a file. What the
      // server already confirmed is kept, so a retry resumes from there.
      if (done >= failAt && _c.shouldFailUpload(session.assetId)) {
        throw const NetworkFailure('Connection lost');
      }
      yield ChunkUploadProgress(
        sessionId: session.id,
        uploadedBytes: done,
        totalBytes: total,
      );
    }
    if (total == 0) {
      yield ChunkUploadProgress(
        sessionId: session.id,
        uploadedBytes: 0,
        totalBytes: 0,
      );
    }
  }
}

/// Used by the mock publish repository to turn an edit into a [Reel].
String reelVideoUrl(ReelDraft draft) {
  final first = draft.clips.isEmpty ? null : draft.clips.first.media.localPath;
  return first == null
      ? 'demo://reel/${draft.id.hashCode.abs()}'
      : first
            .replaceFirst('demo://clip/', 'demo://reel/')
            .replaceFirst('demo://photo/', 'demo://reel/');
}
