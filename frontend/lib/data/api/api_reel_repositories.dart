import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/core/services/local_store.dart';
import 'package:blocks_app/data/api/api_client.dart';
import 'package:blocks_app/data/api/json_reader.dart';
import 'package:blocks_app/data/api/media_uploader.dart';
import 'package:blocks_app/data/api/unavailable_repositories.dart';
import 'package:blocks_app/data/models/kyc_models.dart';
import 'package:blocks_app/data/models/media_models.dart';
import 'package:blocks_app/data/models/payout_models.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/data/models/reel_models.dart';
import 'package:blocks_app/data/repositories/creator_repositories.dart';
import 'package:blocks_app/data/repositories/media_repositories.dart';
import 'package:blocks_app/data/repositories/reel_draft_repository.dart';
import 'package:blocks_app/data/repositories/reel_publish_repository.dart';

// The live reel pipeline: the person's own files, the server's upload and the server's renderer.
//
//   pick a file  ->  prepare (check it)  ->  upload to storage  ->  POST /reels  ->  watch it
//
// The phone only *describes* the edit (which clip, which part, what look); the server renders it.

// ------------------------------------------------------------ preparation --

/// Gets a device file ready to send. The server transcodes everything it receives, so nothing is
/// re-encoded on the phone: this checks the file is still there and says how many bytes go up.
class DeviceMediaProcessingRepository implements MediaProcessingRepository {
  const DeviceMediaProcessingRepository();

  @override
  Future<MediaAsset> inspect(MediaAsset asset) async => asset;

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

    yield at(MediaPipelineStep.inspect, 0.2);
    final file = File(asset.localPath);
    // The person may have deleted or moved the file since they picked it.
    if (!file.existsSync()) throw const ValidationFailure('fileMissing');
    final size = await file.length();
    if (size <= 0) throw const ValidationFailure('fileMissing');
    yield at(MediaPipelineStep.validate, 0.6);
    yield at(
      MediaPipelineStep.uploadReady,
      1,
      done: asset.copyWith(
        optimizedSizeBytes: size,
        status: MediaProcessingStatus.ready,
      ),
    );
  }
}

// ----------------------------------------------------------------- upload --

/// The type to announce for a file, from its name. Only what the server accepts.
String? uploadContentType(String name) {
  final dot = name.lastIndexOf('.');
  final ext = dot < 0 ? '' : name.substring(dot + 1).toLowerCase();
  return switch (ext) {
    'mp4' || 'm4v' => 'video/mp4',
    'mov' => 'video/quicktime',
    '3gp' || '3gpp' => 'video/3gpp',
    'webm' => 'video/webm',
    'jpg' || 'jpeg' => 'image/jpeg',
    'png' => 'image/png',
    'webp' => 'image/webp',
    _ => null,
  };
}

class _Pending {
  _Pending(this.asset, this.total);

  final MediaAsset asset;
  final int total;
  int sent = 0;
  UploadedMedia? media;
}

/// Sends each file to storage with the signed address the server gives (see [MediaUploader]) and
/// keeps what the server answered so the publish can name the file.
///
/// The "receipt" a publish refers to carries the app's own asset id and, in `sessionId`, the
/// server's id for the uploaded file.
class ApiMediaUploadRepository implements MediaUploadRepository {
  ApiMediaUploadRepository(this._uploader);

  final MediaUploader _uploader;
  final Map<String, _Pending> _sessions = {};

  static String _sessionOf(MediaAsset a) => 'up~${a.id}';

  @override
  Future<UploadSession> createSession(
    MediaAsset asset, {
    required int bytes,
  }) async {
    final id = _sessionOf(asset);
    final known = _sessions[id];
    // A retry of a publish reuses a file that has already arrived.
    final pending = known != null && known.media != null
        ? known
        : (_sessions[id] = _Pending(asset, bytes));
    return _session(id, pending);
  }

  UploadSession _session(String id, _Pending p) => UploadSession(
    id: id,
    assetId: p.asset.id,
    totalBytes: p.total,
    chunkBytes: p.total,
    uploadedBytes: p.media != null ? p.total : p.sent,
  );

  @override
  Stream<ChunkUploadProgress> upload(UploadSession session) async* {
    final p = _sessions[session.id];
    if (p == null) throw const NotFoundFailure('Upload not found');
    if (p.media != null) {
      yield ChunkUploadProgress(
        sessionId: session.id,
        uploadedBytes: p.total,
        totalBytes: p.total,
      );
      return;
    }
    final type =
        uploadContentType(
          p.asset.name.isEmpty ? p.asset.localPath : p.asset.name,
        ) ??
        uploadContentType(p.asset.localPath);
    if (type == null) throw const ValidationFailure('unsupportedFile');

    final file = File(p.asset.localPath);
    final events = _uploader.upload(
      purpose: MediaPurpose.reelClip,
      kind: p.asset.isVideo ? MediaKind.video : MediaKind.image,
      contentType: type,
      filename: p.asset.name.isEmpty ? null : p.asset.name,
      source: UploadSource(
        length: p.total,
        open: (start, end) => file.openRead(start, end),
      ),
    );
    await for (final e in events) {
      switch (e) {
        case MediaSending(:final fraction):
          p.sent = (fraction.clamp(0.0, 1.0) * p.total).floor();
          yield ChunkUploadProgress(
            sessionId: session.id,
            uploadedBytes: p.sent,
            totalBytes: p.total,
          );
        case MediaProcessing():
          p.sent = p.total;
        case MediaReady(:final media):
          p.media = media;
          p.sent = p.total;
          yield ChunkUploadProgress(
            sessionId: session.id,
            uploadedBytes: p.total,
            totalBytes: p.total,
          );
      }
    }
  }

  @override
  Future<UploadSession> getSession(String sessionId) async {
    final p = _sessions[sessionId];
    if (p == null) throw const NotFoundFailure('Upload not found');
    return _session(sessionId, p);
  }

  @override
  Future<UploadReceipt> completeUpload(UploadSession session) async {
    final p = _sessions[session.id];
    final media = p?.media;
    if (p == null || media == null) {
      throw const ValidationFailure('uploadIncomplete');
    }
    return UploadReceipt(
      assetId: p.asset.id,
      sessionId: media.id,
      bytes: p.total,
    );
  }

  @override
  Future<void> cancelUpload(String sessionId) async {
    // The upload stream's own cancellation abandons it on the server; a file that had already
    // arrived stays, so a retry does not send it again.
    final p = _sessions[sessionId];
    if (p != null && p.media == null) _sessions.remove(sessionId);
  }
}

// ---------------------------------------------------------------- publish --

/// Makes the reel from the uploaded files and watches the server render and check it.
class ApiReelPublishRepository implements ReelPublishRepository {
  ApiReelPublishRepository(
    this._api, {
    this.pollEvery = const Duration(seconds: 2),
    this.holdAfter = const Duration(seconds: 20),
    this.giveUpAfter = const Duration(minutes: 10),
    Future<void> Function(Duration)? wait,
    DateTime Function()? now,
  }) : _wait = wait ?? Future<void>.delayed,
       _now = now ?? DateTime.now;

  final ApiClient _api;
  final Duration pollEvery;

  /// How long a reel may sit in the safety check before it is reported as "in review" (a person
  /// has to look at it; nothing more will happen on this phone).
  final Duration holdAfter;
  final Duration giveUpAfter;
  final Future<void> Function(Duration) _wait;
  final DateTime Function() _now;

  static String _visibility(PostAudience a) => switch (a) {
    PostAudience.everyone => 'PUBLIC',
    PostAudience.followers => 'FOLLOWERS',
    PostAudience.closeFriends => 'CLOSE_FRIENDS',
    PostAudience.private => 'PRIVATE',
  };

  /// The request the server expects: the edit, described.
  static Map<String, Object?> bodyFor(
    ReelDraft draft,
    Map<String, String> serverIdOf,
  ) {
    final settings = draft.settings;
    final music = draft.music;
    return {
      'clips': [
        for (final c in draft.clips)
          {
            'mediaId': serverIdOf[c.media.id],
            if (c.isPhoto) ...{
              'endMs': c.duration.inMilliseconds,
            } else ...{
              'startMs': c.start.inMilliseconds,
              'endMs': c.end.inMilliseconds,
            },
            'volume': c.volume,
            if (c.filterId != null) ...{
              'filterId': c.filterId,
              'filterIntensity': c.filterIntensity,
            },
            if (c.transitionId != null) 'transitionId': c.transitionId,
            if (!c.adjustments.isNeutral) ...{
              'adjustments': {
                'brightness': c.adjustments.brightness,
                'contrast': c.adjustments.contrast,
                'saturation': c.adjustments.saturation,
                'temperature': c.adjustments.temperature,
                'highlights': c.adjustments.highlights,
                'shadows': c.adjustments.shadows,
                'sharpness': c.adjustments.sharpness,
                'fade': c.adjustments.fade,
                'vignette': c.adjustments.vignette,
              },
            },
          },
      ],
      'caption': settings.caption,
      'visibility': _visibility(settings.audience),
      'allowComments': settings.allowComments,
      'allowRemix': settings.allowReuse,
      'allowSharing': settings.allowSharing,
      if (music != null) ...{
        'musicTrackId': music.track.id,
        'musicStartMs': music.start.inMilliseconds,
        'musicEndMs': music.end.inMilliseconds,
      },
      if (draft.overlays.isNotEmpty)
        'overlays': [
          for (final o in draft.overlays)
            {
              'type': o.type.name,
              'content': o.content,
              'startMs': o.start.inMilliseconds,
              'endMs': o.end.inMilliseconds,
              'x': o.x,
              'y': o.y,
              'scale': o.scale,
              'rotation': o.rotation,
              'style': {
                'fontId': o.textStyle.fontId,
                'colorValue': o.textStyle.colorValue,
                'backgroundValue': ?o.textStyle.backgroundValue,
                'backgroundOpacity': o.textStyle.backgroundOpacity,
                'align': o.textStyle.align.name,
                'animation': o.textStyle.animation.name,
                'bold': o.textStyle.bold,
              },
            },
        ],
    };
  }

  /// The same draft gets the same key, so a retry after a lost answer is the same reel.
  static String keyFor(ReelDraft draft) {
    final safe = draft.id.replaceAll(RegExp('[^A-Za-z0-9_-]'), '-');
    final key = 'reel-$safe';
    return key.length > 100 ? key.substring(0, 100) : key;
  }

  @override
  Future<PublishJob> submit(
    ReelDraft draft,
    List<UploadReceipt> uploads,
  ) async {
    // The server's name for each file the edit uses (the receipts hold it in `sessionId`).
    final serverIdOf = {for (final u in uploads) u.assetId: u.sessionId};
    for (final c in draft.clips) {
      if (!serverIdOf.containsKey(c.media.id)) {
        throw const ValidationFailure('uploadIncomplete');
      }
    }
    try {
      final answer = await _api.post(
        '/reels',
        body: bodyFor(draft, serverIdOf),
        idempotencyKey: keyFor(draft),
      );
      return PublishJob(id: JsonObject.of(answer.data).string('id'));
    } on FieldValidationFailure catch (e) {
      throw ValidationFailure(_limitCode(e.errors));
    }
  }

  /// One of the app's own limit codes for what the server refused.
  static String _limitCode(Map<String, String> errors) {
    final text = errors.entries.map((e) => '${e.key}:${e.value}').join(' ');
    if (text.contains('too_long')) return 'tooLong';
    if (text.contains('too_short')) return 'clipTooShort';
    if (text.contains('mediaId') || text.contains('not_available')) {
      return 'uploadIncomplete';
    }
    return 'invalid';
  }

  @override
  Stream<PublishJobStatus> watch(String jobId) async* {
    final started = _now();
    DateTime? heldSince;
    while (true) {
      final reel = JsonObject.of((await _api.get('/reels/$jobId')).data);
      final status = reel.objectOrNull('status');
      // The owner always sees `status`; a reel without one is simply live.
      final publish = status?.stringOr('publish', 'PUBLISHED') ?? 'PUBLISHED';
      final waited = _now().difference(started);

      switch (publish) {
        case 'PUBLISHED':
          yield PublishJobStatus(
            stage: PublishStage.published,
            fraction: 1,
            reelId: jobId,
          );
          return;
        case 'FAILED':
        case 'REMOVED':
          final rejected = status?.stringOr('moderation', '') == 'REJECTED';
          yield PublishJobStatus(
            stage: PublishStage.failed,
            failureCode: rejected
                ? 'moderation'
                : (status?.stringOrNull('failureCode') ?? 'unknown'),
            moderation: rejected
                ? const ModerationResult(
                    verdict: ModerationVerdict.rejected,
                    reason: 'policy',
                  )
                : null,
          );
          return;
        case 'MODERATION':
          heldSince ??= _now();
          if (_now().difference(heldSince) >= holdAfter) {
            yield PublishJobStatus(
              stage: PublishStage.inReview,
              fraction: 1,
              reelId: jobId,
            );
            return;
          }
          yield const PublishJobStatus(
            stage: PublishStage.moderation,
            fraction: 0.5,
          );
        default: // PROCESSING
          final f = (waited.inMilliseconds / 30000).clamp(0.05, 0.95);
          yield PublishJobStatus(
            stage: PublishStage.serverProcessing,
            fraction: f,
          );
      }
      if (waited >= giveUpAfter) {
        // Still working after all this time: let the person retry, which finds this same reel.
        throw const NetworkFailure('The server is taking too long');
      }
      await _wait(pollEvery);
    }
  }
}

// ----------------------------------------------------------------- config --

/// The limits the server enforces, so the editor never offers more than will be accepted.
/// Identity and payout settings are not on the server yet and say so.
class ApiCreatorConfigRepository implements CreatorConfigRepository {
  ApiCreatorConfigRepository(this._api);

  final ApiClient _api;

  @override
  Future<ReelConfig> getReelConfig() async {
    final j = JsonObject.of((await _api.get('/creator/reel-config')).data);
    final options = j.raw['durationOptionsSeconds'];
    final clips = j.integer('maxClips', fallback: 20);
    return ReelConfig(
      maxDurationSeconds: j.integer('maxDurationSeconds', fallback: 180),
      maxClips: clips,
      // The server has one limit for pieces on the timeline, photos included.
      maxPhotos: clips,
      maxVideoSizeMb: j.integer('maxVideoSizeMb', fallback: 250),
      durationOptionsSeconds: options is List
          ? [
              for (final s in options)
                if (s is num) s.toInt(),
            ]
          : const [15, 30, 60, 90, 180],
      defaultLimitSeconds: j.integer('defaultLimitSeconds', fallback: 30),
      defaultPhotoDurationMs: j.integer(
        'defaultPhotoDurationMs',
        fallback: 3000,
      ),
      minClipDurationMs: j.integer('minClipDurationMs', fallback: 300),
      minPhotoDurationMs: j.integer('minPhotoDurationMs', fallback: 500),
      maxPhotoDurationMs: j.integer('maxPhotoDurationMs', fallback: 15000),
    );
  }

  @override
  Future<KycConfig> getKycConfig() => Future.error(featureUnavailable);

  @override
  Future<PayoutConfig> getPayoutConfig() => Future.error(featureUnavailable);
}

// ----------------------------------------------------------------- drafts --

/// Reel drafts, kept on this phone and **kept per person**: a draft is private work, and two
/// people who use one phone must not see each other's.
class LocalReelDraftRepository implements ReelDraftRepository {
  LocalReelDraftRepository(
    this._store,
    this._userId, {
    DateTime Function()? now,
  }) : _now = now ?? DateTime.now;

  final LocalStore _store;
  final Future<String> Function() _userId;
  final DateTime Function() _now;

  Future<String> _key() async => 'reel_drafts_v2_${await _userId()}';

  Future<List<ReelDraft>> _read() async {
    final raw = _store.getString(await _key());
    if (raw == null || raw.isEmpty) return [];
    try {
      return [
        for (final j in jsonDecode(raw) as List<Object?>)
          ReelDraft.fromJson((j! as Map).cast<String, Object?>()),
      ];
    } on Object {
      // A draft that cannot be read is dropped rather than crashing the app.
      return [];
    }
  }

  Future<void> _write(List<ReelDraft> drafts) async => _store.setString(
    await _key(),
    jsonEncode([for (final d in drafts) d.toJson()]),
  );

  @override
  Future<List<ReelDraft>> list() async =>
      (await _read())..sort((a, b) => b.updatedAt.compareTo(a.updatedAt));

  @override
  Future<ReelDraft?> get(String id) async {
    for (final d in await _read()) {
      if (d.id == id) return d;
    }
    return null;
  }

  @override
  Future<void> save(ReelDraft draft) async {
    final all = await _read();
    final i = all.indexWhere((d) => d.id == draft.id);
    final stamped = draft.copyWith(updatedAt: _now());
    if (i < 0) {
      all.add(stamped);
    } else {
      all[i] = stamped;
    }
    await _write(all);
  }

  @override
  Future<void> delete(String id) async {
    final all = (await _read())..removeWhere((d) => d.id == id);
    await _write(all);
  }

  @override
  Future<ReelDraft> duplicate(String id) async {
    final all = await _read();
    final source = all.where((d) => d.id == id).firstOrNull;
    if (source == null) throw const NotFoundFailure('Draft not found');
    final now = _now();
    final copy = ReelDraft(
      id: 'draft~${now.microsecondsSinceEpoch.toRadixString(36)}',
      clips: source.clips,
      overlays: source.overlays,
      settings: source.settings,
      music: source.music,
      updatedAt: now,
      createdAt: now,
    );
    all.add(copy);
    await _write(all);
    return copy;
  }
}
