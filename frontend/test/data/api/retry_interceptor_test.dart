import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fake_api.dart';

void main() {
  group('reads that fail for a passing reason', () {
    test('are tried again, and the person only sees the result', () async {
      var calls = 0;
      final rig = Rig((r) async {
        calls++;
        if (calls < 3) throw connectionLost(r.options);
        return Reply.ok({'data': 'finally'});
      });

      final answer = await rig.api.get('/feed');

      expect(answer.data, 'finally');
      expect(calls, 3);
      expect(rig.waits, hasLength(2));
      expect(
        rig.waits[1],
        greaterThan(rig.waits[0] - const Duration(milliseconds: 1)),
        reason: 'back-off grows',
      );
    });

    test('stop after two retries and report the failure', () async {
      final rig = Rig((r) async => Reply.error(503, 'UNAVAILABLE'));
      await expectLater(
        rig.api.get('/feed'),
        throwsA(isA<ServiceUnavailableFailure>()),
      );
      expect(rig.fake.requests, hasLength(3));
    });

    test('use the wait the server asks for', () async {
      var calls = 0;
      final rig = Rig((_) async {
        calls++;
        return calls == 1
            ? Reply.error(429, 'RATE_LIMITED', headers: {'Retry-After': '2'})
            : Reply.ok({'data': 1});
      });
      await rig.api.get('/feed');
      expect(rig.waits, [const Duration(seconds: 2)]);
    });

    test(
      'are not held for a very long Retry-After: the failure is shown instead',
      () async {
        final rig = Rig(
          (_) async =>
              Reply.error(429, 'RATE_LIMITED', headers: {'Retry-After': '120'}),
        );
        await expectLater(
          rig.api.get('/feed'),
          throwsA(
            isA<RateLimitedFailure>().having(
              (f) => f.retryAfter,
              'retryAfter',
              const Duration(seconds: 120),
            ),
          ),
        );
        expect(rig.fake.requests, hasLength(1));
        expect(rig.waits, isEmpty);
      },
    );

    test('are not retried when the request itself was refused (4xx)', () async {
      final rig = Rig((_) async => Reply.error(404, 'NOT_FOUND'));
      await expectLater(
        rig.api.get('/posts/x'),
        throwsA(isA<NotFoundFailure>()),
      );
      expect(rig.fake.requests, hasLength(1));
    });
  });

  group('writes', () {
    test(
      'are never repeated on their own: a lost answer must not post twice',
      () async {
        final rig = Rig((r) async => throw connectionLost(r.options));
        await expectLater(
          rig.api.post('/posts/p1/comments', body: {'body': 'hi'}),
          throwsA(isA<NetworkFailure>()),
        );
        expect(rig.fake.requests, hasLength(1));

        final unavailable = Rig((_) async => Reply.error(503, 'UNAVAILABLE'));
        await expectLater(
          unavailable.api.post('/posts/p1/comments', body: {'body': 'hi'}),
          throwsA(isA<ServiceUnavailableFailure>()),
        );
        expect(unavailable.fake.requests, hasLength(1));
      },
    );

    test('with an Idempotency-Key are repeated with the SAME key', () async {
      var calls = 0;
      final rig = Rig((r) async {
        calls++;
        if (calls == 1) throw connectionLost(r.options);
        return Reply.ok({'data': 'created'});
      });

      final answer = await rig.api.post(
        '/posts',
        body: {'caption': 'x'},
        idempotencyKey: 'key-123',
      );

      expect(answer.data, 'created');
      expect(rig.fake.requests, hasLength(2));
      expect(
        rig.fake.requests.map((r) => r.header('idempotency-key')).toSet(),
        {'key-123'},
      );
      expect(rig.fake.requests.last.body, {'caption': 'x'});
    });
  });
}
