import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/mock/mock_media_repositories.dart';
import 'package:blocks_app/data/mock/mock_world.dart';
import 'package:blocks_app/data/models/content_models.dart';
import 'package:blocks_app/data/models/media_models.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/data/models/reel_models.dart';
import 'package:blocks_app/data/repositories/reel_publish_repository.dart';
import 'package:blocks_app/features/create/domain/post_draft_validator.dart';
import 'package:blocks_app/features/reel_studio/domain/reel_validator.dart';

/// The mock publish back-end: re-validates the edit, then "transcodes",
/// "moderates" and finally creates the reel.
class MockReelPublishRepository implements ReelPublishRepository {
  MockReelPublishRepository(this._w);

  final MockWorld _w;

  @override
  Future<PublishJob> submit(
    ReelDraft draft,
    List<UploadReceipt> uploads,
  ) async {
    await _w.pause();

    // The server never trusts the client's own check.
    final issues = ReelValidator.validate(draft, _w.creator.reelConfig);
    if (issues.isNotEmpty) {
      throw ValidationFailure(issues.first.type.name);
    }
    final caption = draft.settings.caption;
    if (caption.length > PostDraftValidator.maxCaptionLength) {
      throw const ValidationFailure('captionTooLong');
    }

    // Every distinct file in the edit must have fully arrived.
    final needed = {for (final c in draft.clips) c.media.id};
    for (final id in needed) {
      final receipt = uploads.where((u) => u.assetId == id).firstOrNull;
      final session = receipt == null
          ? null
          : _w.creator.uploadSessions[receipt.sessionId];
      // Only a receipt the server issued itself (completeUpload) counts.
      if (session == null ||
          !session.isComplete ||
          !_w.creator.completedUploads.contains(session.id)) {
        throw const ValidationFailure('uploadIncomplete');
      }
    }

    final id = _w.creator.nextId('job');
    _w.creator.jobDrafts[id] = draft;
    return PublishJob(id: id);
  }

  @override
  Stream<PublishJobStatus> watch(String jobId) async* {
    final draft = _w.creator.jobDrafts[jobId];
    if (draft == null) throw const NotFoundFailure('Publish job not found');

    // Transcode to the delivery ladder, thumbnails and the HLS playlist.
    for (var i = 1; i <= 4; i++) {
      await _w.pauseBrief(4);
      yield PublishJobStatus(
        stage: PublishStage.serverProcessing,
        fraction: i / 4,
      );
    }

    // Safety, copyright and policy checks.
    final verdict = _w.creator.takeModerationVerdict();
    for (var i = 1; i <= 3; i++) {
      await _w.pauseBrief(4);
      yield PublishJobStatus(stage: PublishStage.moderation, fraction: i / 3);
    }
    if (verdict.verdict == ModerationVerdict.rejected) {
      yield PublishJobStatus(
        stage: PublishStage.failed,
        moderation: verdict,
        failureCode: 'moderation',
      );
      return;
    }

    final reel = _createReel(draft);
    _w.creator.jobDrafts.remove(jobId);
    yield PublishJobStatus(
      stage: PublishStage.published,
      fraction: 1,
      reelId: reel.id,
      moderation: verdict,
    );
  }

  Reel _createReel(ReelDraft draft) {
    final s = draft.settings;
    final reel = Reel(
      id: _w.nextId('r~mine'),
      author: _w.me.summary,
      videoUrl: reelVideoUrl(draft),
      caption: s.caption.trim(),
      hashtags: extractHashtags(s.caption),
      musicTitle: draft.music?.track.title ?? 'Original audio',
      duration: draft.totalDuration,
      district: s.district.isEmpty ? _w.me.district : s.district,
      state: s.state.isEmpty ? _w.me.state : s.state,
      stats: const PostStats(),
      qualifiedReach: 0,
    );
    _w.createdReels.add(reel);
    return reel;
  }
}
