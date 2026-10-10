import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/api/api_client.dart';
import 'package:blocks_app/data/api/token_store.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fake_api.dart';

final _base = Uri.parse('https://api.example.test/api/v1');
final _t0 = DateTime.utc(2026, 10, 9, 12);

AuthTokens _tokens(String n, {Duration valid = const Duration(minutes: 15)}) =>
    AuthTokens(
      accessToken: 'access-$n',
      refreshToken: 'refresh-$n',
      expiresAt: _t0.add(valid),
    );

/// What `POST /auth/refresh` answers.
Reply _renewed(String n) => Reply.ok({
  'data': {
    'tokens': {
      'accessToken': 'access-$n',
      'refreshToken': 'refresh-$n',
      'tokenType': 'Bearer',
      'expiresIn': 900,
      'expiresAt': _t0.add(const Duration(minutes: 15)).toIso8601String(),
    },
  },
});

class _Harness {
  _Harness(
    this.store,
    Future<Reply> Function(SeenRequest) handler, {
    DateTime? now,
  }) : fake = FakeApi(handler) {
    api = ApiClient(
      createApiDio(
        baseUri: _base,
        tokens: store,
        onSessionEnded: () => ended++,
        adapter: fake,
        now: () => now ?? _t0,
        wait: (_) async {},
      ),
    );
  }

  final MemoryTokenStore store;
  final FakeApi fake;
  late final ApiClient api;
  int ended = 0;
}

void main() {
  group('sending the token', () {
    test(
      'puts the access token on a request, and nothing when signed out',
      () async {
        final signedIn = _Harness(
          MemoryTokenStore(_tokens('1')),
          (_) async => Reply.ok({'data': 1}),
        );
        await signedIn.api.get('/feed');
        expect(
          signedIn.fake.requests.single.header('authorization'),
          'Bearer access-1',
        );

        final signedOut = _Harness(
          MemoryTokenStore(),
          (_) async => Reply.ok({'data': 1}),
        );
        await signedOut.api.get('/feed');
        expect(signedOut.fake.requests.single.header('authorization'), isNull);
      },
    );

    test(
      'keeps a token off a request that must not carry one (signing in)',
      () async {
        final h = _Harness(
          MemoryTokenStore(_tokens('1')),
          (_) async => Reply.ok({'data': 1}),
        );
        await h.api.post(
          '/auth/login',
          body: {'identifier': 'a'},
          authenticated: false,
        );
        expect(h.fake.requests.single.header('authorization'), isNull);
      },
    );
  });

  group('an expired token', () {
    test(
      'is renewed once and the request tried again with the new one',
      () async {
        final h = _Harness(MemoryTokenStore(_tokens('old')), (r) async {
          if (r.path.endsWith('/auth/refresh')) return _renewed('new');
          return r.header('authorization') == 'Bearer access-new'
              ? Reply.ok({'data': 'fine'})
              : Reply.error(401, 'TOKEN_EXPIRED');
        });

        final answer = await h.api.get('/feed');

        expect(answer.data, 'fine');
        expect(h.fake.requests.map((r) => r.path), [
          '/api/v1/feed',
          '/api/v1/auth/refresh',
          '/api/v1/feed',
        ]);
        final refresh = h.fake.to('/api/v1/auth/refresh').single;
        expect(refresh.body, {'refreshToken': 'refresh-old'});
        expect(
          refresh.header('authorization'),
          isNull,
          reason: 'the refresh call must not carry the old access token',
        );
        expect(h.store.current?.accessToken, 'access-new');
        expect(h.store.current?.refreshToken, 'refresh-new');
        expect(h.ended, 0);
      },
    );

    test('is renewed only once however many requests notice together (a refresh token works once)', () async {
      var renewals = 0;
      final h = _Harness(MemoryTokenStore(_tokens('old')), (r) async {
        if (r.path.endsWith('/auth/refresh')) {
          renewals++;
          // The real server ends the session on a second use of the same token.
          if (r.body is Map &&
              (r.body! as Map)['refreshToken'] != 'refresh-old') {
            return Reply.error(401, 'SESSION_REVOKED');
          }
          if (renewals > 1) return Reply.error(401, 'SESSION_REVOKED');
          return _renewed('new');
        }
        await Future<void>.delayed(const Duration(milliseconds: 5));
        return r.header('authorization') == 'Bearer access-new'
            ? Reply.ok({'data': r.path})
            : Reply.error(401, 'TOKEN_EXPIRED');
      });

      final answers = await Future.wait([
        for (var i = 0; i < 6; i++) h.api.get('/feed', query: {'n': i}),
      ]);

      expect(answers.length, 6);
      expect(renewals, 1);
      expect(h.ended, 0);
      expect(h.store.current?.accessToken, 'access-new');
    });

    test('renews a token that is about to expire before sending, so the request does not fail first', () async {
      final h = _Harness(
        MemoryTokenStore(_tokens('old', valid: const Duration(seconds: 5))),
        (r) async => r.path.endsWith('/auth/refresh')
            ? _renewed('new')
            : Reply.ok({'data': 1}),
      );
      await h.api.get('/feed');
      expect(h.fake.requests.map((r) => r.path), [
        '/api/v1/auth/refresh',
        '/api/v1/feed',
      ]);
      expect(h.fake.requests.last.header('authorization'), 'Bearer access-new');
    });

    test('is tried again only once: a second refusal after the retry is shown, not looped on', () async {
      final h = _Harness(MemoryTokenStore(_tokens('old')), (r) async {
        if (r.path.endsWith('/auth/refresh')) return _renewed('new');
        return Reply.error(401, 'TOKEN_EXPIRED');
      });
      await expectLater(
        h.api.get('/feed'),
        throwsA(isA<UnauthorizedFailure>()),
      );
      expect(h.fake.to('/api/v1/feed').length, 2);
      expect(h.fake.to('/api/v1/auth/refresh').length, 1);
    });
  });

  group('a 401 that is not about the token', () {
    test('is shown as it is: not renewed, not repeated (a wrong password would be sent twice)', () async {
      final h = _Harness(
        MemoryTokenStore(_tokens('1')),
        (r) async => const Reply(401, {
          'error': {
            'code': 'INVALID_CREDENTIALS',
            'message': 'The details you entered are not correct.',
            'details': {'attemptsRemaining': 3},
            'requestId': 'r',
          },
        }),
      );
      await expectLater(
        h.api.post('/auth/password/change', body: {'currentPassword': 'x'}),
        throwsA(
          isA<UnauthorizedFailure>()
              .having((f) => f.code, 'code', 'INVALID_CREDENTIALS')
              .having((f) => f.details['attemptsRemaining'], 'left', 3),
        ),
      );
      expect(h.fake.requests, hasLength(1));
      expect(h.store.current?.refreshToken, 'refresh-1');
      expect(h.ended, 0);
    });

    test('a refusal with no recognisable code is not renewed either', () async {
      final h = _Harness(
        MemoryTokenStore(_tokens('1')),
        (_) async => const Reply(401, '<html>nope</html>'),
      );
      await expectLater(
        h.api.get('/feed'),
        throwsA(isA<UnauthorizedFailure>()),
      );
      expect(h.fake.to('/api/v1/auth/refresh'), isEmpty);
    });

    test(
      'UNAUTHENTICATED (a token the server cannot read) is renewed once',
      () async {
        final h = _Harness(MemoryTokenStore(_tokens('old')), (r) async {
          if (r.path.endsWith('/auth/refresh')) return _renewed('new');
          return r.header('authorization') == 'Bearer access-new'
              ? Reply.ok({'data': 'fine'})
              : Reply.error(401, 'UNAUTHENTICATED');
        });
        expect((await h.api.get('/feed')).data, 'fine');
      },
    );
  });

  group('a session that is over', () {
    test(
      'clears the tokens and tells the app when the refresh token is refused',
      () async {
        final h = _Harness(MemoryTokenStore(_tokens('old')), (r) async {
          if (r.path.endsWith('/auth/refresh')) {
            return Reply.error(401, 'SESSION_REVOKED');
          }
          return Reply.error(401, 'TOKEN_EXPIRED');
        });

        await expectLater(
          h.api.get('/feed'),
          throwsA(isA<UnauthorizedFailure>()),
        );

        expect(h.store.current, isNull);
        expect(h.ended, 1);
      },
    );

    test('ends at once when the API says this session was revoked, without trying to renew', () async {
      final h = _Harness(
        MemoryTokenStore(_tokens('1')),
        (_) async => Reply.error(401, 'SESSION_REVOKED'),
      );
      await expectLater(
        h.api.get('/feed'),
        throwsA(isA<UnauthorizedFailure>()),
      );
      expect(h.fake.to('/api/v1/auth/refresh'), isEmpty);
      expect(h.store.current, isNull);
      expect(h.ended, 1);
    });

    test('a refusal while renewing early ends the session and never spends that refresh token twice', () async {
      final h = _Harness(
        MemoryTokenStore(_tokens('old', valid: const Duration(seconds: 5))),
        (r) async => r.path.endsWith('/auth/refresh')
            ? Reply.error(401, 'SESSION_REVOKED')
            : Reply.error(401, 'UNAUTHENTICATED'),
      );

      await expectLater(
        h.api.get('/feed'),
        throwsA(isA<UnauthorizedFailure>()),
      );

      expect(h.fake.to('/api/v1/auth/refresh').length, 1);
      expect(h.fake.to('/api/v1/feed').single.header('authorization'), isNull);
      expect(h.store.current, isNull);
      expect(h.ended, 1);
    });

    test(
      'is announced once, however many calls were in flight when it died',
      () async {
        final h = _Harness(
          MemoryTokenStore(_tokens('1')),
          (_) async => Reply.error(401, 'SESSION_REVOKED'),
        );
        final results = await Future.wait([
          for (var i = 0; i < 5; i++)
            h.api
                .get('/feed', query: {'n': i})
                .then<Object?>((_) => null)
                .catchError((Object e) => e),
        ]);
        expect(results, everyElement(isA<UnauthorizedFailure>()));
        expect(h.ended, 1);
        expect(h.store.current, isNull);
      },
    );

    test('does not try to renew when nobody is signed in', () async {
      final h = _Harness(
        MemoryTokenStore(),
        (_) async => Reply.error(401, 'UNAUTHENTICATED'),
      );
      await expectLater(h.api.get('/me'), throwsA(isA<UnauthorizedFailure>()));
      expect(h.fake.requests.length, 1);
      expect(h.ended, 0);
    });
  });

  group('a bad connection is not the end of the session', () {
    test('keeps the tokens and reports a network failure when renewing cannot reach the server', () async {
      final h = _Harness(MemoryTokenStore(_tokens('old')), (r) async {
        if (r.path.endsWith('/auth/refresh')) throw connectionLost(r.options);
        return Reply.error(401, 'TOKEN_EXPIRED');
      });

      await expectLater(h.api.get('/feed'), throwsA(isA<NetworkFailure>()));

      expect(h.store.current?.refreshToken, 'refresh-old');
      expect(h.ended, 0);
    });
  });
}
