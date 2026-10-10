import 'package:blocks_app/data/api/redacting_log_interceptor.dart';
import 'package:blocks_app/data/api/token_store.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fake_api.dart';

void main() {
  group('route templates', () {
    test('replace ids, numbers, usernames and tags', () {
      const uuid = '01990000-aaaa-7bbb-8ccc-0123456789ab';
      expect(
        RedactingLogInterceptor.routeOf('/api/v1/posts/$uuid/comments'),
        '/api/v1/posts/:id/comments',
      );
      expect(
        RedactingLogInterceptor.routeOf('/api/v1/profiles/asha.k/posts'),
        '/api/v1/profiles/:username/posts',
      );
      expect(
        RedactingLogInterceptor.routeOf('/api/v1/hashtags/diwali'),
        '/api/v1/hashtags/:tag',
      );
      expect(
        RedactingLogInterceptor.routeOf('/api/v1/feed/page/12'),
        '/api/v1/feed/page/:id',
      );
      expect(RedactingLogInterceptor.routeOf('/api/v1/feed'), '/api/v1/feed');
    });
  });

  group('the log line', () {
    test('has the method, route, status and time, and nothing a person could be identified by', () async {
      final lines = <String>[];
      final rig = Rig(
        (_) async => Reply.ok({
          'data': {'phone': '+919800000000', 'otp': '123456'},
        }),
        tokens: MemoryTokenStore(
          AuthTokens(
            accessToken: 'SECRET-ACCESS',
            refreshToken: 'SECRET-REFRESH',
            expiresAt: DateTime.utc(2026, 10, 9, 13),
          ),
        ),
        logged: lines,
      );

      await rig.api.post(
        '/profiles/asha.k/posts/01990000-aaaa-7bbb-8ccc-0123456789ab',
        body: {'password': 'hunter2', 'otp': '654321'},
      );
      await rig.api.get('/search', query: {'q': 'private query'});

      expect(lines, hasLength(2));
      expect(
        lines[0],
        matches(
          RegExp(
            r'^POST /api/v1/profiles/:username/posts/:id -> 200 \(\d+ ms\)$',
          ),
        ),
      );
      expect(lines[1], matches(RegExp(r'^GET /api/v1/search -> 200 ')));
      final all = lines.join('\n');
      for (final secret in [
        'SECRET-ACCESS',
        'SECRET-REFRESH',
        'hunter2',
        '654321',
        '123456',
        '+9198',
        'private query',
        'asha.k',
        'api.example.test',
        'Bearer',
      ]) {
        expect(all, isNot(contains(secret)), reason: 'logged "$secret"');
      }
    });

    test('for a failure adds the code and the server request id, so the server log can be found', () async {
      final lines = <String>[];
      final rig = Rig(
        (_) async => Reply.error(
          403,
          'ACCOUNT_RESTRICTED',
          message: 'Not for you, asha@example.com',
        ),
        logged: lines,
      );
      await expectLater(
        rig.api.post('/posts', body: {'caption': 'x'}),
        throwsA(anything),
      );
      expect(lines.single, contains('-> 403 ACCOUNT_RESTRICTED'));
      expect(lines.single, contains('[req req-1]'));
      expect(lines.single, isNot(contains('asha@example.com')));
    });
  });
}
