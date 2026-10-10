import 'dart:io';

import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/core/services/local_store.dart';
import 'package:blocks_app/core/services/media_picker.dart';
import 'package:blocks_app/core/services/video_frame.dart';
import 'package:blocks_app/data/api/api_reel_repositories.dart';
import 'package:blocks_app/data/api/device_media_library_repository.dart';
import 'package:blocks_app/data/api/media_uploader.dart';
import 'package:blocks_app/data/models/media_models.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/data/models/reel_models.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/mp4.dart';
import 'fake_api.dart';
import 'fixtures.dart';

class _FakePicker implements DeviceMediaPicker {
  _FakePicker({this.files = const [], this.recorded, this.fails = false});

  List<PickedMediaFile> files;
  PickedMediaFile? recorded;
  bool fails;
  int? lastLimit;

  @override
  Future<List<PickedMediaFile>> pickMedia({required int limit}) async {
    lastLimit = limit;
    if (fails) throw const MediaPickFailure('denied');
    return files;
  }

  @override
  Future<PickedMediaFile?> recordVideo({Duration? maxDuration}) async {
    if (fails) throw const MediaPickFailure('no camera');
    return recorded;
  }
}

PickedMediaFile _picked(String path, {bool video = true}) => PickedMediaFile(
  path: path,
  name: path.split(RegExp(r'[\\/]')).last,
  sizeBytes: File(path).lengthSync(),
  isVideo: video,
);

MediaAsset _videoAsset(String id, String path, {int ms = 4000}) => MediaAsset(
  id: id,
  type: MediaType.video,
  origin: MediaOrigin.device,
  localPath: path,
  originalSizeBytes: 2000,
  durationMs: ms,
  width: 1080,
  height: 1920,
  name: 'clip.mp4',
);

MediaAsset _photoAsset(String id, String path) => MediaAsset(
  id: id,
  type: MediaType.photo,
  origin: MediaOrigin.device,
  localPath: path,
  originalSizeBytes: 500,
  durationMs: 0,
  width: 800,
  height: 600,
  name: 'pic.jpg',
);

ReelDraft _draft(List<ReelClip> clips, {ReelSettings? settings}) => ReelDraft(
  id: 'draft~abc',
  clips: clips,
  overlays: const [],
  settings: settings ?? const ReelSettings(caption: 'Hello #blocks'),
  updatedAt: DateTime.utc(2026, 10, 10),
  createdAt: DateTime.utc(2026, 10, 10),
);

void main() {
  late Directory dir;

  setUp(() => dir = Directory.systemTemp.createTempSync('reel_pipeline_'));
  tearDown(() => dir.deleteSync(recursive: true));

  // ----------------------------------------------------------- the library --
  group('the phone as a media library', () {
    test('describes a chosen video from its own file', () async {
      final path = writeTestMp4(dir, 'a.mp4', durationMs: 7300);
      final lib = DeviceMediaLibraryRepository(
        _FakePicker(files: [_picked(path)]),
      );
      final got = await lib.pickFromDevice(limit: 5);
      expect(got, hasLength(1));
      final a = got.single;
      expect(a.isVideo, isTrue);
      expect(a.origin, MediaOrigin.device);
      expect(a.localPath, path);
      expect(a.durationMs, 7300);
      expect(a.width, 1080);
      expect(a.height, 1920);
      expect(a.originalSizeBytes, File(path).lengthSync());
    });

    test('shows a frame of the footage when the phone can make one', () async {
      final path = writeTestMp4(dir, 'a.mp4');
      final lib = DeviceMediaLibraryRepository(
        _FakePicker(files: [_picked(path)]),
        frame: (_) async => '/frames/first.jpg',
      );
      expect(
        (await lib.pickFromDevice(limit: 3)).single.thumbnailPath,
        '/frames/first.jpg',
      );
    });

    test('keeps the clip even when no frame can be made', () async {
      final path = writeTestMp4(dir, 'a.mp4');
      for (final frame in <VideoFrameReader>[
        (_) async => null,
        (_) async => throw StateError('no decoder'),
      ]) {
        final lib = DeviceMediaLibraryRepository(
          _FakePicker(files: [_picked(path)]),
          frame: frame,
        );
        final a = (await lib.pickFromDevice(limit: 3)).single;
        expect(a.thumbnailPath, isNull);
        expect(a.durationMs, 4000);
      }
    });

    test('measures a photo and uses the file itself as its picture', () async {
      final path = '${dir.path}/p.jpg';
      File(path).writeAsBytesSync([1, 2, 3]);
      final lib = DeviceMediaLibraryRepository(
        _FakePicker(files: [_picked(path, video: false)]),
        photoSize: (_) async => (width: 800, height: 600),
      );
      final a = (await lib.pickFromDevice(limit: 3)).single;
      expect(a.isPhoto, isTrue);
      expect(a.width, 800);
      expect(a.thumbnailPath, path);
      expect(a.durationMs, 0);
    });

    test('does not offer a file it cannot read, and says so', () async {
      final bad = '${dir.path}/odd.mp4';
      File(bad).writeAsBytesSync(List.filled(64, 9));
      final lib = DeviceMediaLibraryRepository(
        _FakePicker(files: [_picked(bad)]),
      );
      await expectLater(
        lib.pickFromDevice(limit: 3),
        throwsA(isA<ValidationFailure>()),
      );
      expect(await lib.getLibrary(), isEmpty);
    });

    test('keeps the good files when one in the batch is unreadable', () async {
      final good = writeTestMp4(dir, 'ok.mp4');
      final bad = '${dir.path}/odd.mp4';
      File(bad).writeAsBytesSync(List.filled(64, 9));
      final lib = DeviceMediaLibraryRepository(
        _FakePicker(files: [_picked(bad), _picked(good)]),
      );
      final got = await lib.pickFromDevice(limit: 5);
      expect(got.map((a) => a.localPath), [good]);
    });

    test('lists what was chosen, newest first, each file once', () async {
      final a = writeTestMp4(dir, 'a.mp4');
      final b = writeTestMp4(dir, 'b.mp4');
      final picker = _FakePicker(files: [_picked(a)]);
      final lib = DeviceMediaLibraryRepository(picker);
      await lib.pickFromDevice(limit: 5);
      picker.files = [_picked(b), _picked(a)];
      await lib.pickFromDevice(limit: 5);
      final library = await lib.getLibrary();
      expect(library.map((m) => m.localPath), [b, a]);
    });

    test('passes the room left to the system picker', () async {
      final picker = _FakePicker();
      final lib = DeviceMediaLibraryRepository(picker);
      expect(await lib.pickFromDevice(limit: 7), isEmpty);
      expect(picker.lastLimit, 7);
      expect(lib.picksFromDevice, isTrue);
    });

    test('records with the camera', () async {
      final path = writeTestMp4(dir, 'rec.mp4', durationMs: 3000);
      final lib = DeviceMediaLibraryRepository(
        _FakePicker(recorded: _picked(path)),
      );
      final clip = await lib.record();
      expect(clip.durationMs, 3000);
      expect((await lib.getLibrary()).single.id, clip.id);
    });

    test('reports a camera or gallery that will not open', () async {
      final lib = DeviceMediaLibraryRepository(_FakePicker(fails: true));
      await expectLater(
        lib.pickFromDevice(limit: 3),
        throwsA(isA<UnknownFailure>()),
      );
      await expectLater(lib.record(), throwsA(isA<UnknownFailure>()));
    });
  });

  // ------------------------------------------------------------ preparing --
  group('preparing a file', () {
    const processing = DeviceMediaProcessingRepository();

    test('says how many bytes will go up, and that it is ready', () async {
      final path = writeTestMp4(dir, 'a.mp4');
      final events = await processing
          .prepare(_videoAsset('v1', path), MediaProfile.balanced)
          .toList();
      expect(events.last.isDone, isTrue);
      final done = events.last.asset!;
      expect(done.optimizedSizeBytes, File(path).lengthSync());
      expect(done.status, MediaProcessingStatus.ready);
    });

    test('notices a file that has gone', () async {
      await expectLater(
        processing
            .prepare(
              _videoAsset('v1', '${dir.path}/gone.mp4'),
              MediaProfile.balanced,
            )
            .toList(),
        throwsA(isA<ValidationFailure>()),
      );
    });
  });

  // --------------------------------------------------------------- upload --
  group('uploading', () {
    const signed = 'https://storage.example.test/orig/clip.mp4?sig=1';

    ({ApiMediaUploadRepository repo, Rig rig, FakeApi storage}) build({
      Future<Reply> Function(SeenRequest)? storage,
    }) {
      final rig = Rig((r) async {
        if (r.path.endsWith('/media/uploads')) {
          return Reply.ok({
            'data': {
              'assetId': uuidA,
              'sessionId': uuidB,
              'expiresAt': '2026-10-10T12:15:00.000Z',
              'mode': 'single',
              'upload': {
                'method': 'PUT',
                'url': signed,
                'headers': {'Content-Type': 'video/mp4'},
                'expiresAt': '2026-10-10T12:15:00.000Z',
              },
            },
          });
        }
        if (r.path.endsWith('/complete')) {
          return Reply.ok({
            'data': {'id': uuidA, 'status': 'UPLOADED', 'ready': false},
          });
        }
        return Reply.ok({
          'data': {
            'id': uuidA,
            'kind': 'VIDEO',
            'status': 'READY',
            'ready': true,
            'width': 1080,
            'height': 1920,
            'durationMs': 4000,
            'moderation': 'APPROVED',
          },
        });
      });
      final fake = FakeApi(
        storage ?? (_) async => const Reply(200, null, {'ETag': '"e1"'}),
      );
      final uploader = MediaUploader(
        rig.api,
        storage: Dio()..httpClientAdapter = fake,
        wait: (_) async {},
        pollEvery: const Duration(seconds: 1),
      );
      return (
        repo: ApiMediaUploadRepository(uploader),
        rig: rig,
        storage: fake,
      );
    }

    test(
      'sends the real file as a reel clip and hands back the server id',
      () async {
        final path = writeTestMp4(dir, 'a.mp4');
        final size = File(path).lengthSync();
        final t = build();
        final asset = _videoAsset('local-1', path);

        final session = await t.repo.createSession(asset, bytes: size);
        final progress = await t.repo.upload(session).toList();
        expect(progress.last.uploadedBytes, size);
        final done = await t.repo.getSession(session.id);
        expect(done.isComplete, isTrue);
        final receipt = await t.repo.completeUpload(done);

        expect(receipt.assetId, 'local-1');
        expect(receipt.sessionId, uuidA); // the server's id for the file
        expect(receipt.bytes, size);

        final announce = t.rig.fake.requests.first;
        expect(announce.body, {
          'purpose': 'REEL_CLIP',
          'kind': 'VIDEO',
          'contentType': 'video/mp4',
          'sizeBytes': size,
          'filename': 'clip.mp4',
        });
        // The bytes went to storage, never through the API.
        expect(t.storage.requests.single.method, 'PUT');
        expect(
          t.storage.requests.single.options.uri.host,
          'storage.example.test',
        );
      },
    );

    test('sends a file that already arrived only once', () async {
      final path = writeTestMp4(dir, 'a.mp4');
      final t = build();
      final asset = _videoAsset('local-1', path);
      final size = File(path).lengthSync();
      for (var i = 0; i < 2; i++) {
        final s = await t.repo.createSession(asset, bytes: size);
        await t.repo.upload(s).toList();
        await t.repo.completeUpload(await t.repo.getSession(s.id));
      }
      expect(t.storage.requests, hasLength(1));
    });

    test('refuses to complete a file that did not arrive', () async {
      final t = build();
      final s = await t.repo.createSession(
        _videoAsset('x', '${dir.path}/a.mp4'),
        bytes: 10,
      );
      await expectLater(
        t.repo.completeUpload(s),
        throwsA(isA<ValidationFailure>()),
      );
    });

    test('refuses a kind of file the server does not take', () async {
      final path = '${dir.path}/film.mkv';
      File(path).writeAsBytesSync([1, 2, 3]);
      final t = build();
      final asset = MediaAsset(
        id: 'mkv',
        type: MediaType.video,
        origin: MediaOrigin.device,
        localPath: path,
        originalSizeBytes: 3,
        durationMs: 1000,
        width: 1,
        height: 1,
        name: 'film.mkv',
      );
      final s = await t.repo.createSession(asset, bytes: 3);
      await expectLater(
        t.repo.upload(s).toList(),
        throwsA(isA<ValidationFailure>()),
      );
      expect(t.rig.fake.requests, isEmpty);
    });

    test('names only the types the server accepts', () {
      expect(uploadContentType('a.MP4'), 'video/mp4');
      expect(uploadContentType('a.mov'), 'video/quicktime');
      expect(uploadContentType('a.3gp'), 'video/3gpp');
      expect(uploadContentType('a.jpg'), 'image/jpeg');
      expect(uploadContentType('a.heic'), isNull);
      expect(uploadContentType('a.mkv'), isNull);
      expect(uploadContentType('noext'), isNull);
    });
  });

  // -------------------------------------------------------------- publish --
  group('making the reel', () {
    final video = ReelClip(
      id: 'c1',
      media: _videoAsset('local-v', 'v.mp4'),
      start: const Duration(milliseconds: 500),
      end: const Duration(milliseconds: 3500),
      volume: 0.8,
      filterId: 'warm',
      filterIntensity: 0.6,
      transitionId: 'fade',
      adjustments: const ReelAdjustments(brightness: 0.2, vignette: 0.1),
    );
    final photo = ReelClip(
      id: 'c2',
      media: _photoAsset('local-p', 'p.jpg'),
      start: Duration.zero,
      end: const Duration(seconds: 2),
    );

    test('describes the edit and nothing else', () {
      final body = ApiReelPublishRepository.bodyFor(
        _draft(
          [video, photo],
          settings: const ReelSettings(
            caption: 'Evening #blocks',
            audience: PostAudience.followers,
            allowComments: false,
            allowReuse: false,
            allowSharing: true,
            district: 'Hyderabad',
            state: 'Telangana',
            taggedUserIds: ['someone'],
          ),
        ),
        {'local-v': 'server-v', 'local-p': 'server-p'},
      );
      expect(body['caption'], 'Evening #blocks');
      expect(body['visibility'], 'FOLLOWERS');
      expect(body['allowComments'], false);
      expect(body['allowRemix'], false);
      expect(body['allowSharing'], true);
      final clips = (body['clips']! as List).cast<Map<String, Object?>>();
      expect(clips[0], {
        'mediaId': 'server-v',
        'startMs': 500,
        'endMs': 3500,
        'volume': 0.8,
        'filterId': 'warm',
        'filterIntensity': 0.6,
        'transitionId': 'fade',
        'adjustments': {
          'brightness': 0.2,
          'contrast': 0.0,
          'saturation': 0.0,
          'temperature': 0.0,
          'highlights': 0.0,
          'shadows': 0.0,
          'sharpness': 0.0,
          'fade': 0.0,
          'vignette': 0.1,
        },
      });
      // A photo says how long it is shown.
      expect(clips[1], {'mediaId': 'server-p', 'endMs': 2000, 'volume': 1.0});
      // The server decides place, reach and moderation: none of it is sent.
      expect(body.keys, isNot(contains('district')));
      expect(body.keys, isNot(contains('state')));
      expect(body.keys, isNot(contains('reachLevel')));
      expect(body.keys, isNot(contains('taggedUserIds')));
    });

    test(
      'sends one request, keyed by the draft so a retry is the same reel',
      () async {
        final rig = Rig(
          (_) async => const Reply(201, {
            'data': {
              'id': uuidA,
              'status': {'publish': 'PROCESSING'},
            },
          }),
        );
        final repo = ApiReelPublishRepository(rig.api, wait: (_) async {});
        final job = await repo.submit(_draft([video]), const [
          UploadReceipt(assetId: 'local-v', sessionId: 'server-v', bytes: 10),
        ]);
        expect(job.id, uuidA);
        final sent = rig.fake.requests.single;
        expect(sent.method, 'POST');
        expect(sent.path, '/api/v1/reels');
        expect(
          sent.header('idempotency-key'),
          'reel-draft~abc'.replaceAll('~', '-'),
        );
      },
    );

    test('will not send an edit whose file never arrived', () async {
      final rig = Rig((_) async => Reply.ok({'data': {}}));
      final repo = ApiReelPublishRepository(rig.api, wait: (_) async {});
      await expectLater(
        repo.submit(_draft([video]), const []),
        throwsA(isA<ValidationFailure>()),
      );
      expect(rig.fake.requests, isEmpty);
    });

    test(
      'turns the server\'s length refusal into the app\'s own code',
      () async {
        final rig = Rig(
          (_) async => Reply.error(
            400,
            'VALIDATION_FAILED',
            details: [
              {
                'field': 'clips',
                'reasons': ['too_long'],
              },
            ],
          ),
        );
        final repo = ApiReelPublishRepository(rig.api, wait: (_) async {});
        await expectLater(
          repo.submit(_draft([video]), const [
            UploadReceipt(assetId: 'local-v', sessionId: 'server-v', bytes: 10),
          ]),
          throwsA(
            isA<ValidationFailure>().having(
              (e) => e.message,
              'code',
              'tooLong',
            ),
          ),
        );
      },
    );
  });

  group('watching it', () {
    ApiReelPublishRepository repo(
      Rig rig, {
      required List<String> script,
      DateTime Function()? now,
      Duration holdAfter = const Duration(seconds: 20),
      Duration giveUpAfter = const Duration(minutes: 10),
      void Function(Duration)? onWait,
    }) {
      return ApiReelPublishRepository(
        rig.api,
        holdAfter: holdAfter,
        giveUpAfter: giveUpAfter,
        wait: (d) async => onWait?.call(d),
        now: now,
      );
    }

    Rig serving(List<Map<String, Object?>> statuses) {
      var i = 0;
      return Rig((_) async {
        final s = statuses[i < statuses.length ? i : statuses.length - 1];
        i++;
        return Reply.ok({
          'data': {'id': uuidA, 'status': s},
        });
      });
    }

    test('follows processing and the safety check to published', () async {
      final rig = serving([
        {'publish': 'PROCESSING'},
        {'publish': 'MODERATION', 'moderation': 'PENDING'},
        {'publish': 'PUBLISHED', 'moderation': 'APPROVED'},
      ]);
      final stages = await repo(
        rig,
        script: const [],
      ).watch(uuidA).map((s) => s.stage).toList();
      expect(stages, [
        PublishStage.serverProcessing,
        PublishStage.moderation,
        PublishStage.published,
      ]);
    });

    test('reports a refusal with its reason', () async {
      final rig = serving([
        {'publish': 'FAILED', 'moderation': 'REJECTED', 'failureCode': null},
      ]);
      final last = await repo(rig, script: const []).watch(uuidA).last;
      expect(last.stage, PublishStage.failed);
      expect(last.failureCode, 'moderation');
      expect(last.moderation?.verdict, ModerationVerdict.rejected);
    });

    test('says "in review" when a person has to decide, instead of claiming it is live', () async {
      var t = DateTime.utc(2026, 10, 10, 12);
      final rig = serving([
        {'publish': 'MODERATION', 'moderation': 'PENDING'},
      ]);
      final stages = await repo(
        rig,
        script: const [],
        now: () => t,
        onWait: (d) => t = t.add(d),
      ).watch(uuidA).map((s) => s.stage).toList();
      expect(stages.last, PublishStage.inReview);
      expect(stages, isNot(contains(PublishStage.published)));
    });

    test(
      'gives up after a long time so the person can retry the same reel',
      () async {
        var t = DateTime.utc(2026, 10, 10, 12);
        final rig = serving([
          {'publish': 'PROCESSING'},
        ]);
        await expectLater(
          repo(
            rig,
            script: const [],
            now: () => t,
            giveUpAfter: const Duration(seconds: 30),
            onWait: (d) => t = t.add(d),
          ).watch(uuidA).toList(),
          throwsA(isA<NetworkFailure>()),
        );
      },
    );

    test('asks only for the one reel, with no side effects', () async {
      final rig = serving([
        {'publish': 'PUBLISHED'},
      ]);
      await repo(rig, script: const []).watch(uuidA).toList();
      expect(rig.fake.requests.every((r) => r.method == 'GET'), isTrue);
      expect(rig.fake.requests.single.path, '/api/v1/reels/$uuidA');
    });
  });

  // --------------------------------------------------------------- config --
  group('the limits', () {
    test(
      'are the server\'s, and identity and payout settings say not yet',
      () async {
        final rig = Rig(
          (_) async => Reply.ok({
            'data': {
              'maxDurationSeconds': 180,
              'durationOptionsSeconds': [15, 30, 60, 90, 180],
              'defaultLimitSeconds': 30,
              'maxClips': 20,
              'minClipDurationMs': 300,
              'defaultPhotoDurationMs': 3000,
              'minPhotoDurationMs': 500,
              'maxPhotoDurationMs': 15000,
              'maxVideoSizeMb': 250,
            },
          }),
        );
        final repo = ApiCreatorConfigRepository(rig.api);
        final c = await repo.getReelConfig();
        expect(rig.fake.requests.single.path, '/api/v1/creator/reel-config');
        expect(c.maxVideoSizeMb, 250);
        expect(c.maxClips, 20);
        expect(c.maxPhotos, 20);
        expect(c.selectableDurations, [15, 30, 60, 90, 180]);
        expect(c.minClipDurationMs, 300);
        await expectLater(
          repo.getKycConfig(),
          throwsA(
            isA<AppFailure>().having((f) => f.code, 'code', 'NOT_AVAILABLE'),
          ),
        );
      },
    );
  });

  // --------------------------------------------------------------- drafts --
  group('drafts on this phone', () {
    test('are kept per person, so another sign-in cannot see them', () async {
      final store = InMemoryLocalStore();
      final alice = LocalReelDraftRepository(store, () async => 'alice');
      final bob = LocalReelDraftRepository(store, () async => 'bob');
      await alice.save(_draft([_clip('a')]));
      expect(await alice.list(), hasLength(1));
      expect(await bob.list(), isEmpty);
      await bob.save(
        _draft([_clip('b')])
            .copyWith(settings: const ReelSettings(caption: 'bob')),
      );
      expect((await alice.list()).single.settings.caption, 'Hello #blocks');
    });

    test('save, read, duplicate and delete', () async {
      final repo = LocalReelDraftRepository(
        InMemoryLocalStore(),
        () async => 'u',
        now: () => DateTime.utc(2026, 10, 10, 9),
      );
      await repo.save(_draft([_clip('a')]));
      expect((await repo.get('draft~abc'))?.clips, hasLength(1));
      final copy = await repo.duplicate('draft~abc');
      expect(copy.id, isNot('draft~abc'));
      expect(await repo.list(), hasLength(2));
      await repo.delete('draft~abc');
      expect((await repo.list()).single.id, copy.id);
      await expectLater(
        repo.duplicate('missing'),
        throwsA(isA<NotFoundFailure>()),
      );
    });

    test('drop an unreadable store instead of crashing', () async {
      final store = InMemoryLocalStore();
      await store.setString('reel_drafts_v2_u', '{not json');
      final repo = LocalReelDraftRepository(store, () async => 'u');
      expect(await repo.list(), isEmpty);
    });
  });
}

ReelClip _clip(String id) => ReelClip(
  id: id,
  media: _videoAsset('m-$id', '$id.mp4'),
  start: Duration.zero,
  end: const Duration(seconds: 2),
);
