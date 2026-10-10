import 'dart:typed_data';

import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/api/media_uploader.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fake_api.dart';
import 'fixtures.dart';

const _signed =
    'https://storage.example.test/bucket/orig/2026/10/abc.png?sig=1';

Map<String, Object?> _single() => {
  'assetId': uuidA,
  'sessionId': uuidB,
  'expiresAt': '2026-10-09T12:15:00.000Z',
  'mode': 'single',
  'upload': {
    'method': 'PUT',
    'url': _signed,
    'headers': {'Content-Type': 'image/png'},
    'expiresAt': '2026-10-09T12:15:00.000Z',
  },
};

Map<String, Object?> _status({
  String status = 'READY',
  bool ready = true,
  String? failure,
  int? width = 640,
}) => {
  'id': uuidA,
  'kind': 'IMAGE',
  'purpose': 'AVATAR',
  'status': status,
  'ready': ready,
  'moderation': 'APPROVED',
  'failureCode': failure,
  'width': width,
  'height': 480,
  'durationMs': null,
  'createdAt': '2026-10-09T12:00:00.000Z',
};

Uint8List _bytes(int n) => Uint8List.fromList(List.generate(n, (i) => i % 251));

class _Uploads {
  _Uploads({
    required Future<Reply> Function(SeenRequest) api,
    Future<Reply> Function(SeenRequest)? storage,
  }) : rig = Rig(api),
       storageFake = FakeApi(
         storage ?? (_) async => const Reply(200, null, {'ETag': '"etag-1"'}),
       ) {
    uploader = MediaUploader(
      rig.api,
      storage: Dio()..httpClientAdapter = storageFake,
      wait: (d) async => waits.add(d),
      pollEvery: const Duration(seconds: 1),
      maxProcessing: const Duration(seconds: 20),
    );
  }

  final Rig rig;
  final FakeApi storageFake;
  final List<Duration> waits = [];
  late final MediaUploader uploader;
}

void main() {
  group('a small file', () {
    test('is announced, sent to the signed address with exactly its headers, completed, and awaited', () async {
      final u = _Uploads(
        api: (r) async {
          if (r.path.endsWith('/media/uploads')) {
            return Reply.ok({'data': _single()});
          }
          if (r.path.endsWith('/complete')) {
            return Reply.ok({
              'data': _status(ready: false, status: 'UPLOADED'),
            });
          }
          return Reply.ok({'data': _status()});
        },
      );
      final data = _bytes(1000);

      final events = await u.uploader
          .upload(
            purpose: MediaPurpose.avatar,
            kind: MediaKind.image,
            contentType: 'image/png',
            source: UploadSource.bytes(data),
            filename: 'me.png',
          )
          .toList();

      // The announcement says what and how big, and nothing else.
      final start = u.rig.fake.requests.first;
      expect(start.path, '/api/v1/media/uploads');
      expect(start.body, {
        'purpose': 'AVATAR',
        'kind': 'IMAGE',
        'contentType': 'image/png',
        'sizeBytes': 1000,
        'filename': 'me.png',
      });

      // The bytes went to storage, not through the API, and without the token.
      final put = u.storageFake.requests.single;
      expect(put.method, 'PUT');
      expect(put.options.uri.toString(), _signed);
      expect(put.header('content-type'), 'image/png');
      expect(put.header('content-length'), '1000');
      expect(put.header('authorization'), isNull);
      expect(put.body, data);

      expect(u.rig.fake.requests.map((r) => '${r.method} ${r.path}'), [
        'POST /api/v1/media/uploads',
        'POST /api/v1/media/uploads/$uuidB/complete',
        'GET /api/v1/media/$uuidA',
      ]);
      expect(events.first, isA<MediaSending>());
      expect(events.whereType<MediaProcessing>(), hasLength(1));
      final ready = events.last as MediaReady;
      expect(ready.media.id, uuidA);
      expect(ready.media.width, 640);
      expect(ready.media.height, 480);
    });

    test('leaves the filename out when none is given', () async {
      final u = _Uploads(
        api: (r) async => r.path.endsWith('/media/uploads')
            ? Reply.ok({'data': _single()})
            : Reply.ok({'data': _status()}),
      );
      await u.uploader.uploadAndWait(
        purpose: MediaPurpose.postImage,
        kind: MediaKind.image,
        contentType: 'image/jpeg',
        source: UploadSource.bytes(_bytes(10)),
      );
      expect(
        (u.rig.fake.requests.first.body! as Map).containsKey('filename'),
        isFalse,
      );
    });

    test(
      'waits for processing, looking less often as it takes longer',
      () async {
        var polls = 0;
        final u = _Uploads(
          api: (r) async {
            if (r.path.endsWith('/media/uploads')) {
              return Reply.ok({'data': _single()});
            }
            if (r.path.endsWith('/complete')) return Reply.ok({'data': {}});
            polls++;
            return polls < 4
                ? Reply.ok({
                    'data': _status(
                      ready: false,
                      status: 'PROCESSING',
                      width: null,
                    ),
                  })
                : Reply.ok({'data': _status()});
          },
        );
        await u.uploader.uploadAndWait(
          purpose: MediaPurpose.avatar,
          kind: MediaKind.image,
          contentType: 'image/png',
          source: UploadSource.bytes(_bytes(10)),
        );
        expect(polls, 4);
        expect(u.waits, [
          const Duration(seconds: 1),
          const Duration(milliseconds: 1500),
          const Duration(seconds: 2),
        ]);
      },
    );

    test('a file the server rejects after looking at it is a failure with the reason', () async {
      final u = _Uploads(
        api: (r) async {
          if (r.path.endsWith('/media/uploads')) {
            return Reply.ok({'data': _single()});
          }
          if (r.path.endsWith('/complete')) return Reply.ok({'data': {}});
          return Reply.ok({
            'data': _status(
              ready: false,
              status: 'REJECTED',
              failure: 'UNSUPPORTED_MEDIA',
              width: null,
            ),
          });
        },
      );
      await expectLater(
        u.uploader.uploadAndWait(
          purpose: MediaPurpose.avatar,
          kind: MediaKind.image,
          contentType: 'image/png',
          source: UploadSource.bytes(_bytes(10)),
        ),
        throwsA(
          isA<ValidationFailure>()
              .having((f) => f.message, 'message', 'mediaRejected')
              .having((f) => f.code, 'code', 'UNSUPPORTED_MEDIA'),
        ),
      );
    });

    test('processing that never finishes is a "still working" failure, not an endless wait', () async {
      final u = _Uploads(
        api: (r) async {
          if (r.path.endsWith('/media/uploads')) {
            return Reply.ok({'data': _single()});
          }
          if (r.path.endsWith('/complete')) return Reply.ok({'data': {}});
          return Reply.ok({
            'data': _status(ready: false, status: 'PROCESSING', width: null),
          });
        },
      );
      await expectLater(
        u.uploader.uploadAndWait(
          purpose: MediaPurpose.avatar,
          kind: MediaKind.image,
          contentType: 'image/png',
          source: UploadSource.bytes(_bytes(10)),
        ),
        throwsA(
          isA<ServiceUnavailableFailure>().having(
            (f) => f.code,
            'code',
            'STILL_PROCESSING',
          ),
        ),
      );
      expect(
        u.waits.fold<Duration>(Duration.zero, (a, b) => a + b),
        greaterThanOrEqualTo(const Duration(seconds: 20)),
      );
    });
  });

  group('refusals before any byte is sent', () {
    test(
      'too large and unsupported keep their codes, and nothing reaches storage',
      () async {
        for (final (status, code) in [
          (413, 'PAYLOAD_TOO_LARGE'),
          (415, 'UNSUPPORTED_MEDIA'),
        ]) {
          final u = _Uploads(api: (_) async => Reply.error(status, code));
          await expectLater(
            u.uploader.uploadAndWait(
              purpose: MediaPurpose.avatar,
              kind: MediaKind.image,
              contentType: 'image/gif',
              source: UploadSource.bytes(_bytes(10)),
            ),
            throwsA(
              isA<ValidationFailure>().having((f) => f.code, 'code', code),
            ),
          );
          expect(u.storageFake.requests, isEmpty);
        }
      },
    );
  });

  group('when storage fails', () {
    test(
      'a dropped connection is tried again, then the upload carries on',
      () async {
        var puts = 0;
        final u = _Uploads(
          api: (r) async {
            if (r.path.endsWith('/media/uploads')) {
              return Reply.ok({'data': _single()});
            }
            if (r.path.endsWith('/complete')) return Reply.ok({'data': {}});
            return Reply.ok({'data': _status()});
          },
          storage: (r) async {
            puts++;
            if (puts < 3) throw connectionLost(r.options);
            return const Reply(200, null, {'ETag': '"e"'});
          },
        );
        final data = _bytes(300);
        await u.uploader.uploadAndWait(
          purpose: MediaPurpose.avatar,
          kind: MediaKind.image,
          contentType: 'image/png',
          source: UploadSource.bytes(data),
        );
        expect(puts, 3);
        expect(
          u.storageFake.requests.last.body,
          data,
          reason: 'a fresh copy of the bytes each time',
        );
      },
    );

    test('gives up after a few tries, tells the server to drop the upload, and reports a network failure', () async {
      final u = _Uploads(
        api: (r) async => r.path.endsWith('/media/uploads')
            ? Reply.ok({'data': _single()})
            : const Reply(204),
        storage: (r) async => throw connectionLost(r.options),
      );
      await expectLater(
        u.uploader.uploadAndWait(
          purpose: MediaPurpose.avatar,
          kind: MediaKind.image,
          contentType: 'image/png',
          source: UploadSource.bytes(_bytes(10)),
        ),
        throwsA(isA<NetworkFailure>()),
      );
      expect(u.storageFake.requests, hasLength(3));
      expect(
        u.rig.fake.requests.map((r) => '${r.method} ${r.path}'),
        contains('DELETE /api/v1/media/uploads/$uuidB'),
      );
      expect(u.rig.fake.to('/api/v1/media/uploads/$uuidB/complete'), isEmpty);
    });

    test(
      'an address storage refuses (expired or wrong size) is not retried',
      () async {
        final u = _Uploads(
          api: (r) async => r.path.endsWith('/media/uploads')
              ? Reply.ok({'data': _single()})
              : const Reply(204),
          storage: (_) async => const Reply(403),
        );
        await expectLater(
          u.uploader.uploadAndWait(
            purpose: MediaPurpose.avatar,
            kind: MediaKind.image,
            contentType: 'image/png',
            source: UploadSource.bytes(_bytes(10)),
          ),
          throwsA(isA<ForbiddenFailure>()),
        );
        expect(u.storageFake.requests, hasLength(1));
      },
    );
  });

  group('a large file', () {
    test(
      'goes in parts, each to its own address, with every ETag handed back',
      () async {
        const partSize = 100;
        final data = _bytes(250);
        final u = _Uploads(
          api: (r) async {
            if (r.path.endsWith('/media/uploads')) {
              return Reply.ok({
                'data': {
                  'assetId': uuidA,
                  'sessionId': uuidB,
                  'expiresAt': '2026-10-09T12:15:00.000Z',
                  'mode': 'multipart',
                  'multipart': {'partSizeBytes': partSize, 'partCount': 3},
                },
              });
            }
            if (r.path.endsWith('/parts')) {
              final numbers = ((r.body! as Map)['partNumbers'] as List)
                  .cast<int>();
              return Reply.ok({
                'data': {
                  'parts': [
                    for (final n in numbers)
                      {
                        'partNumber': n,
                        'sizeBytes': n == 3 ? 50 : 100,
                        'method': 'PUT',
                        'url': 'https://storage.example.test/part/$n',
                        'headers': <String, Object?>{},
                        'expiresAt': '2026-10-09T12:15:00.000Z',
                      },
                  ],
                },
              });
            }
            if (r.path.endsWith('/complete')) return Reply.ok({'data': {}});
            return Reply.ok({'data': _status()});
          },
          storage: (r) async {
            final n = r.path.split('/').last;
            return Reply(200, null, {'ETag': '"etag-$n"'});
          },
        );

        final events = await u.uploader
            .upload(
              purpose: MediaPurpose.reelClip,
              kind: MediaKind.video,
              contentType: 'video/mp4',
              source: UploadSource.bytes(data),
            )
            .toList();

        expect(u.storageFake.requests.map((r) => r.path), [
          '/part/1',
          '/part/2',
          '/part/3',
        ]);
        expect(u.storageFake.requests.map((r) => (r.body! as List).length), [
          100,
          100,
          50,
        ]);
        // Each part is exactly its slice of the file.
        expect(u.storageFake.requests[1].body, data.sublist(100, 200));
        final complete = u.rig.fake.requests.firstWhere(
          (r) => r.path.endsWith('/complete'),
        );
        expect(complete.body, {
          'parts': [
            {'partNumber': 1, 'etag': 'etag-1'},
            {'partNumber': 2, 'etag': 'etag-2'},
            {'partNumber': 3, 'etag': 'etag-3'},
          ],
        });
        // Progress only goes forward, and ends at the whole file.
        final fractions = events
            .whereType<MediaSending>()
            .map((e) => e.fraction)
            .toList();
        expect(fractions, orderedEquals([...fractions]..sort()));
        expect(fractions.last, closeTo(1, 0.0001));
        expect(events.last, isA<MediaReady>());
      },
    );

    test(
      'a part with no ETag from storage cannot be joined, so the upload fails',
      () async {
        final u = _Uploads(
          api: (r) async {
            if (r.path.endsWith('/media/uploads')) {
              return Reply.ok({
                'data': {
                  'assetId': uuidA,
                  'sessionId': uuidB,
                  'expiresAt': 'x',
                  'mode': 'multipart',
                  'multipart': {'partSizeBytes': 100, 'partCount': 1},
                },
              });
            }
            if (r.path.endsWith('/parts')) {
              return Reply.ok({
                'data': {
                  'parts': [
                    {
                      'partNumber': 1,
                      'sizeBytes': 10,
                      'url': 'https://storage.example.test/p/1',
                      'headers': <String, Object?>{},
                    },
                  ],
                },
              });
            }
            return const Reply(204);
          },
          storage: (_) async => const Reply(200),
        );
        await expectLater(
          u.uploader.uploadAndWait(
            purpose: MediaPurpose.reelClip,
            kind: MediaKind.video,
            contentType: 'video/mp4',
            source: UploadSource.bytes(_bytes(10)),
          ),
          throwsA(isA<UnknownFailure>()),
        );
      },
    );
  });

  test('abandoning the stream abandons the upload on the server', () async {
    final u = _Uploads(
      api: (r) async {
        if (r.path.endsWith('/media/uploads') && r.method == 'POST') {
          return Reply.ok({'data': _single()});
        }
        if (r.path.endsWith('/complete')) return Reply.ok({'data': {}});
        if (r.method == 'DELETE') return const Reply(204);
        return Reply.ok({
          'data': _status(ready: false, status: 'PROCESSING', width: null),
        });
      },
    );
    final sub = u.uploader
        .upload(
          purpose: MediaPurpose.avatar,
          kind: MediaKind.image,
          contentType: 'image/png',
          source: UploadSource.bytes(_bytes(10)),
        )
        .listen((_) {}, onError: (Object _) {});
    await Future<void>.delayed(const Duration(milliseconds: 50));
    await sub.cancel();
    await Future<void>.delayed(const Duration(milliseconds: 50));
    // It stopped asking about the file once nobody was waiting for it.
    final polls = u.rig.fake.requests.where((r) => r.method == 'GET').length;
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(u.rig.fake.requests.where((r) => r.method == 'GET').length, polls);
  });
}
