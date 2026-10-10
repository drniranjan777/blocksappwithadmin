import 'dart:math';

import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/api/api_client.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fake_api.dart';

void main() {
  group('the envelope', () {
    test('gives the data and the cursor of a page', () async {
      final rig = Rig(
        (_) async => Reply.ok({
          'data': [
            {'id': 'a'},
            {'id': 'b'},
          ],
          'meta': {'nextCursor': 'abc', 'hasMore': true},
        }),
      );
      final page = await rig.api.get('/feed');
      expect(page.objects().map((o) => o.string('id')), ['a', 'b']);
      expect(page.nextCursor, 'abc');
      expect(page.hasMore, isTrue);
    });

    test('says there is no more when the cursor is missing, whatever hasMore claims', () async {
      final rig = Rig(
        (_) async => Reply.ok({
          'data': <Object?>[],
          'meta': {'hasMore': true},
        }),
      );
      final page = await rig.api.get('/feed');
      expect(page.hasMore, isFalse);
      expect(page.nextCursor, isNull);
    });

    test('treats an empty answer (204) as no data', () async {
      final rig = Rig((_) async => const Reply(204));
      final answer = await rig.api.delete('/posts/p1/like');
      expect(answer.data, isNull);
    });

    test(
      'turns an answer of the wrong shape into a failure, not a crash',
      () async {
        final rig = Rig((_) async => Reply.ok({'data': 'oops'}));
        final answer = await rig.api.get('/me');
        expect(answer.object, throwsA(isA<UnknownFailure>()));
        expect(answer.objects, throwsA(isA<UnknownFailure>()));

        final list = Rig(
          (_) async => Reply.ok({
            'data': [1, 2],
          }),
        );
        final items = await list.api.get('/feed');
        expect(items.objects, throwsA(isA<UnknownFailure>()));
      },
    );
  });

  group('requests', () {
    test('leave out empty query values and keep the rest', () async {
      final rig = Rig((_) async => Reply.ok({'data': <Object?>[]}));
      await rig.api.get(
        '/feed',
        query: {'cursor': null, 'scope': '', 'limit': 20, 'q': 'a b'},
      );
      expect(rig.fake.requests.single.query, {'limit': '20', 'q': 'a b'});
    });

    test('send a JSON body and the Idempotency-Key only when given', () async {
      final rig = Rig((_) async => Reply.ok({'data': 1}));
      await rig.api.post(
        '/posts',
        body: {'caption': 'hi'},
        idempotencyKey: 'k1',
      );
      await rig.api.post('/posts/p/like');
      expect(rig.fake.requests[0].body, {'caption': 'hi'});
      expect(rig.fake.requests[0].header('idempotency-key'), 'k1');
      expect(
        rig.fake.requests[0].header('content-type'),
        contains('application/json'),
      );
      expect(rig.fake.requests[1].header('idempotency-key'), isNull);
    });

    test('always go below /api/v1', () async {
      final rig = Rig((_) async => Reply.ok({'data': 1}));
      await rig.api.get('/feed');
      expect(
        rig.fake.requests.single.options.uri.toString(),
        'https://api.example.test/api/v1/feed',
      );
    });
  });

  group('idempotency keys', () {
    test('are long, hex and different every time', () {
      final keys = {for (var i = 0; i < 200; i++) newIdempotencyKey()};
      expect(keys, hasLength(200));
      for (final k in keys) {
        expect(k, matches(RegExp(r'^[0-9a-f]{32}$')));
      }
    });

    test('come from the given generator (for tests), and from a secure one otherwise', () {
      expect(newIdempotencyKey(Random(1)), newIdempotencyKey(Random(1)));
      expect(newIdempotencyKey(), isNot(newIdempotencyKey()));
    });
  });
}
