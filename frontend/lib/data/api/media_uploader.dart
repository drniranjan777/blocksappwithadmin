import 'dart:async';
import 'dart:typed_data';

import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/api/api_client.dart';
import 'package:blocks_app/data/api/api_error.dart';
import 'package:blocks_app/data/api/json_reader.dart';
import 'package:dio/dio.dart';

/// What an upload is for. The server accepts only these, each with its own
/// allowed types and sizes; it checks the real file, not what we claim.
enum MediaPurpose {
  avatar('AVATAR'),
  postImage('POST_IMAGE'),
  reelCover('REEL_COVER'),
  reelClip('REEL_CLIP'),
  story('STORY'),
  businessImage('BUSINESS_IMAGE'),
  adCreative('AD_CREATIVE');

  const MediaPurpose(this.wire);

  final String wire;
}

enum MediaKind {
  image('IMAGE'),
  video('VIDEO');

  const MediaKind(this.wire);

  final String wire;
}

/// The bytes of a file, readable in ranges, so a long video is sent part by part
/// and never held in memory whole.
class UploadSource {
  const UploadSource({required this.length, required this.open});

  /// A file that is already in memory (a photo from the picker).
  factory UploadSource.bytes(Uint8List bytes) => UploadSource(
    length: bytes.length,
    open: (start, end) => Stream.value(bytes.sublist(start, end)),
  );

  final int length;

  /// The bytes from [start] up to (not including) [end]. Called again for each
  /// attempt, so it must produce a fresh stream every time.
  final Stream<List<int>> Function(int start, int end) open;
}

sealed class MediaUploadEvent {
  const MediaUploadEvent();
}

/// Bytes are going to storage. [fraction] is 0..1 of the whole file.
class MediaSending extends MediaUploadEvent {
  const MediaSending(this.fraction);

  final double fraction;
}

/// Everything arrived; the server is checking and preparing it.
class MediaProcessing extends MediaUploadEvent {
  const MediaProcessing();
}

/// The server accepted the file and it is ready to use.
class MediaReady extends MediaUploadEvent {
  const MediaReady(this.media);

  final UploadedMedia media;
}

class UploadedMedia {
  const UploadedMedia({
    required this.id,
    this.width,
    this.height,
    this.durationMs,
  });

  final String id;
  final int? width;
  final int? height;
  final int? durationMs;
}

/// Uploads a photo or video the way the server expects: announce it, send the
/// bytes straight to storage with the signed address it gives (never through the
/// API, and never with the person's token), tell it they are there, then wait
/// until it has checked and prepared the file.
///
/// A large file goes in parts, one signed address each, so a dropped connection
/// repeats one part rather than the whole file. Every part is retried a few times
/// on a passing failure before the upload gives up.
class MediaUploader {
  MediaUploader(
    this._api, {
    Dio? storage,
    this.pollEvery = const Duration(seconds: 1),
    this.maxProcessing = const Duration(minutes: 5),
    this.attempts = 3,
    Future<void> Function(Duration)? wait,
  }) : _storage = storage ?? _plainClient(),
       _wait = wait ?? Future<void>.delayed;

  /// A client with no interceptors: signed storage addresses must be called
  /// exactly as given, without the API's Authorization header.
  static Dio _plainClient() => Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 15),
      sendTimeout: const Duration(minutes: 5),
      receiveTimeout: const Duration(seconds: 60),
      responseType: ResponseType.plain,
    ),
  );

  final ApiClient _api;
  final Dio _storage;
  final Duration pollEvery;
  final Duration maxProcessing;
  final int attempts;
  final Future<void> Function(Duration) _wait;

  /// Progress while it runs, then [MediaReady]; or an [AppFailure] error.
  /// Cancelling the subscription abandons the upload on the server.
  Stream<MediaUploadEvent> upload({
    required MediaPurpose purpose,
    required MediaKind kind,
    required String contentType,
    required UploadSource source,
    String? filename,
  }) {
    final controller = StreamController<MediaUploadEvent>();
    final cancel = CancelToken();
    controller.onCancel = () {
      if (!cancel.isCancelled) cancel.cancel('abandoned');
    };
    unawaited(() async {
      try {
        final media = await _run(
          purpose: purpose,
          kind: kind,
          contentType: contentType,
          source: source,
          filename: filename,
          emit: (e) {
            if (!controller.isClosed) controller.add(e);
          },
          cancel: cancel,
        );
        if (!controller.isClosed) controller.add(MediaReady(media));
      } on AppFailure catch (e) {
        if (!controller.isClosed) controller.addError(e);
      } on DioException catch (e) {
        if (!controller.isClosed) controller.addError(failureFromDio(e));
      } on Object catch (e, st) {
        if (!controller.isClosed) controller.addError(e, st);
      } finally {
        if (!controller.isClosed) await controller.close();
      }
    }());
    return controller.stream;
  }

  /// Convenience: the finished media, ignoring progress.
  Future<UploadedMedia> uploadAndWait({
    required MediaPurpose purpose,
    required MediaKind kind,
    required String contentType,
    required UploadSource source,
    String? filename,
  }) async {
    UploadedMedia? done;
    await for (final e in upload(
      purpose: purpose,
      kind: kind,
      contentType: contentType,
      source: source,
      filename: filename,
    )) {
      if (e is MediaReady) done = e.media;
    }
    return done ?? (throw const UnknownFailure('The upload did not finish'));
  }

  Future<UploadedMedia> _run({
    required MediaPurpose purpose,
    required MediaKind kind,
    required String contentType,
    required UploadSource source,
    required void Function(MediaUploadEvent) emit,
    required CancelToken cancel,
    String? filename,
  }) async {
    final started = (await _api.post(
      '/media/uploads',
      body: {
        'purpose': purpose.wire,
        'kind': kind.wire,
        'contentType': contentType,
        'sizeBytes': source.length,
        'filename': ?filename,
      },
    )).object();
    final sessionId = started.string('sessionId');
    final assetId = started.string('assetId');
    emit(const MediaSending(0));

    try {
      List<Map<String, Object?>>? parts;
      if (started.string('mode') == 'single') {
        await _sendRange(
          started.object('upload'),
          source,
          0,
          source.length,
          cancel,
          (sent) => emit(MediaSending(_fraction(sent, source.length))),
        );
      } else {
        parts = await _sendParts(
          sessionId,
          started.object('multipart'),
          source,
          cancel,
          emit,
        );
      }
      await _api.post(
        '/media/uploads/${seg(sessionId)}/complete',
        body: {'parts': ?parts},
      );
    } on Object {
      // Leave nothing half-finished behind. Best effort: an upload that is never
      // completed expires on the server anyway.
      try {
        await _api.delete('/media/uploads/${seg(sessionId)}');
      } on Object {
        // Nothing more to do about it.
      }
      rethrow;
    }

    emit(const MediaProcessing());
    return _awaitReady(assetId, cancel);
  }

  static double _fraction(int sent, int total) =>
      total == 0 ? 1 : (sent / total).clamp(0.0, 1.0);

  Future<List<Map<String, Object?>>> _sendParts(
    String sessionId,
    JsonObject multipart,
    UploadSource source,
    CancelToken cancel,
    void Function(MediaUploadEvent) emit,
  ) async {
    final partSize = multipart.integer('partSizeBytes');
    final count = multipart.integer('partCount');
    if (partSize < 1 || count < 1) {
      throw const UnknownFailure('The server sent something unexpected');
    }
    final done = <Map<String, Object?>>[];
    var sentBefore = 0;
    // Addresses come in batches of up to 50 parts.
    for (var first = 1; first <= count; first += maxPageSize) {
      final batch = [
        for (var n = first; n < first + maxPageSize && n <= count; n++) n,
      ];
      final answer = await _api.post(
        '/media/uploads/${seg(sessionId)}/parts',
        body: {'partNumbers': batch},
      );
      final addresses = {
        for (final p in answer.object().objects('parts'))
          p.integer('partNumber'): p,
      };
      for (final n in batch) {
        final address = addresses[n];
        if (address == null) {
          throw const UnknownFailure('The server sent something unexpected');
        }
        final start = (n - 1) * partSize;
        final end = (start + partSize).clamp(0, source.length);
        final etag = await _sendRange(
          address,
          source,
          start,
          end,
          cancel,
          (sent) =>
              emit(MediaSending(_fraction(sentBefore + sent, source.length))),
        );
        if (etag == null || etag.isEmpty) {
          throw const UnknownFailure(
            'The storage service did not confirm a part',
          );
        }
        done.add({'partNumber': n, 'etag': etag});
        sentBefore += end - start;
      }
    }
    return done;
  }

  /// PUTs bytes `[start, end)` to a signed address, repeating a few times on a
  /// passing failure. Returns the `ETag` storage answered with.
  Future<String?> _sendRange(
    JsonObject address,
    UploadSource source,
    int start,
    int end,
    CancelToken cancel,
    void Function(int sentInThisRange) progress,
  ) async {
    final url = address.string('url');
    final headers = {
      for (final e
          in (address.objectOrNull('headers')?.raw ?? const {}).entries)
        if (e.value is String) e.key: e.value as String,
    };
    final length = end - start;
    for (var attempt = 1; ; attempt++) {
      try {
        final response = await _storage.put<Object?>(
          url,
          data: source.open(start, end),
          options: Options(
            method: 'PUT',
            headers: {...headers, Headers.contentLengthHeader: '$length'},
          ),
          cancelToken: cancel,
          onSendProgress: (sent, total) => progress(sent),
        );
        return response.headers.value('etag')?.replaceAll('"', '');
      } on DioException catch (e) {
        if (e.type == DioExceptionType.cancel) rethrow;
        final failure = failureFromDio(e);
        final passing =
            failure is NetworkFailure ||
            failure is ServiceUnavailableFailure ||
            (failure is UnknownFailure && (e.response?.statusCode ?? 0) >= 500);
        if (!passing || attempt >= attempts) throw failure;
        await _wait(Duration(milliseconds: 300 * attempt));
      }
    }
  }

  Future<UploadedMedia> _awaitReady(String assetId, CancelToken cancel) async {
    var waited = Duration.zero;
    var step = pollEvery;
    while (true) {
      final s = (await _api.get('/media/${seg(assetId)}')).object();
      final failure = s.stringOrNull('failureCode');
      final status = s.stringOr('status', '');
      if (s.boolean('ready')) {
        return UploadedMedia(
          id: assetId,
          width: s.has('width') ? s.integer('width') : null,
          height: s.has('height') ? s.integer('height') : null,
          durationMs: s.has('durationMs') ? s.integer('durationMs') : null,
        );
      }
      if (failure != null ||
          status == 'REJECTED' ||
          status == 'FAILED' ||
          status == 'DELETED') {
        // The server looked at the file and will not use it.
        throw ValidationFailure('mediaRejected', failure ?? status, {
          'status': status,
        });
      }
      if (cancel.isCancelled) {
        throw const UnknownFailure('The upload was cancelled');
      }
      if (waited >= maxProcessing) {
        throw const ServiceUnavailableFailure(
          message: 'The file is still being prepared. Try again shortly.',
          code: 'STILL_PROCESSING',
        );
      }
      await _wait(step);
      waited += step;
      // Look less often the longer it takes (1 s, 1.5 s, ... up to 5 s).
      if (step < const Duration(seconds: 5)) {
        step += const Duration(milliseconds: 500);
      }
    }
  }
}
