import 'dart:async';

import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/models/media_models.dart';
import 'package:blocks_app/data/models/reel_models.dart';
import 'package:blocks_app/data/repositories/media_repositories.dart';
import 'package:blocks_app/data/repositories/reel_publish_repository.dart';
import 'package:blocks_app/features/reel_studio/domain/reel_validator.dart';

/// Runs a publish from start to finish and reports what to show:
///
/// 1. **Preparing** — check the edit against the limits.
/// 2. **Compressing / Processing** — on this device, one file at a time:
///    inspect, compress, resize, thumbnail, preview.
/// 3. **Uploading** — chunked and resumable, to private storage.
/// 4. **Processing on server / Moderation** — watched, not done, here.
/// 5. **Published** or **Failed**.
///
/// Work that needs the user's phone (compression) happens here; work that
/// needs trust (transcoding, moderation) happens on the server and is only
/// observed. A file appearing twice on the timeline is prepared and uploaded
/// once.
class ReelPublisher {
  const ReelPublisher({
    required this.processing,
    required this.upload,
    required this.publish,
    required this.config,
  });

  final MediaProcessingRepository processing;
  final MediaUploadRepository upload;
  final ReelPublishRepository publish;
  final ReelConfig config;

  Stream<PublishProgress> run(ReelDraft draft, MediaProfile profile) async* {
    try {
      // `await for`, not `yield*`: yield* forwards an inner error to the
      // listener instead of throwing it here, so it would never be caught.
      await for (final p in _run(draft, profile)) {
        yield p;
      }
    } on ValidationFailure catch (e) {
      yield PublishProgress(stage: PublishStage.failed, failureCode: e.message);
    } on NetworkFailure {
      yield const PublishProgress(
        stage: PublishStage.failed,
        failureCode: 'network',
      );
    } on AppFailure {
      yield const PublishProgress(
        stage: PublishStage.failed,
        failureCode: 'unknown',
      );
    }
  }

  Stream<PublishProgress> _run(ReelDraft draft, MediaProfile profile) async* {
    // ---- 1. Preparing ------------------------------------------------------
    yield const PublishProgress(stage: PublishStage.preparing);

    // Catch a broken edit now, not after the user's data has been spent on
    // uploading it. (The server checks the same limits again regardless.)
    final issues = ReelValidator.validate(draft, config);
    if (issues.isNotEmpty) throw ValidationFailure(issues.first.type.name);

    // Each distinct file once, with how much of it the reel actually uses.
    final used = <String, Duration>{};
    final assets = <String, MediaAsset>{};
    for (final c in draft.clips) {
      assets[c.media.id] = c.media;
      used[c.media.id] = (used[c.media.id] ?? Duration.zero) + c.duration;
    }
    final files = assets.values.toList();
    if (files.isEmpty) {
      throw const ValidationFailure('noClips');
    }

    // ---- 2. Compressing / processing --------------------------------------
    final prepared = <MediaAsset>[];
    for (var i = 0; i < files.length; i++) {
      final asset = files[i];
      await for (final e in processing.prepare(
        asset,
        profile,
        usedDuration: asset.isVideo ? used[asset.id] : null,
      )) {
        // One smooth bar across all files; the stage name follows it and only
        // ever moves forward (never "Preparing" again for the second file).
        final overall = (i + e.fraction) / files.length;
        yield PublishProgress(
          stage: localStage(overall),
          fraction: overall,
          fileIndex: i + 1,
          fileCount: files.length,
        );
        if (e.isDone) prepared.add(e.asset!);
      }
    }

    // ---- 3. Uploading -----------------------------------------------------
    final totalBytes = prepared.fold(0, (a, p) => a + p.optimizedSizeBytes);
    var doneBefore = 0;
    final receipts = <UploadReceipt>[];
    final opened = <String>[];

    // A failure keeps its sessions (Retry resumes them). If the person walks
    // away instead, the listener cancels this stream, which is the one way to
    // get here without `finished` being set: abandon what was opened so the
    // server can free the stored parts.
    var finished = false;
    try {
      for (var i = 0; i < prepared.length; i++) {
        final asset = prepared[i];
        final session = await upload.createSession(
          asset,
          bytes: asset.optimizedSizeBytes,
        );
        opened.add(session.id);
        // A resumed session already has bytes on the server.
        var confirmed = session.uploadedBytes;
        yield _uploading(
          doneBefore + confirmed,
          totalBytes,
          i,
          prepared.length,
        );
        await for (final p in upload.upload(session)) {
          confirmed = p.uploadedBytes;
          yield _uploading(
            doneBefore + confirmed,
            totalBytes,
            i,
            prepared.length,
          );
        }
        final after = await upload.getSession(session.id);
        if (!after.isComplete) {
          throw const NetworkFailure('Upload interrupted');
        }
        // The server assembles the file and issues the receipt.
        receipts.add(await upload.completeUpload(after));
        doneBefore += asset.optimizedSizeBytes;
      }
      yield _uploading(
        totalBytes,
        totalBytes,
        prepared.length - 1,
        prepared.length,
      );
      finished = true;
    } catch (_) {
      finished = true;
      rethrow;
    } finally {
      if (!finished) {
        for (final id in opened) {
          unawaited(upload.cancelUpload(id));
        }
      }
    }

    // ---- 4. The server takes over -----------------------------------------
    final job = await publish.submit(draft, receipts);
    await for (final s in publish.watch(job.id)) {
      yield PublishProgress(
        stage: s.stage,
        fraction: s.fraction,
        reelId: s.reelId,
        failureCode: s.failureCode,
        moderation: s.moderation,
        fileCount: files.length,
        fileIndex: files.length,
        bytesDone: totalBytes,
        bytesTotal: totalBytes,
      );
    }
  }

  /// The on-device stage for [overall] progress (0..1) across all files:
  /// reading and checking, then compressing and resizing, then thumbnails
  /// and the preview.
  static PublishStage localStage(double overall) {
    if (overall < 0.10) return PublishStage.preparing;
    if (overall < 0.70) return PublishStage.compressing;
    return PublishStage.processing;
  }

  PublishProgress _uploading(int done, int total, int index, int count) =>
      PublishProgress(
        stage: PublishStage.uploading,
        fraction: total == 0 ? 1 : done / total,
        bytesDone: done,
        bytesTotal: total,
        fileIndex: index + 1,
        fileCount: count,
      );
}
