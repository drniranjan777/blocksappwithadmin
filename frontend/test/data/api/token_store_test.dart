import 'package:blocks_app/data/api/token_store.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

final _now = DateTime.utc(2026, 10, 9, 12);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('AuthTokens.fromJson', () {
    test('reads the API token object, using expiresAt when given and expiresIn otherwise', () {
      final stated = AuthTokens.fromJson({
        'accessToken': 'a',
        'refreshToken': 'r',
        'expiresIn': 900,
        'expiresAt': '2026-10-09T12:20:00.000Z',
      }, now: _now);
      expect(stated?.expiresAt, DateTime.utc(2026, 10, 9, 12, 20));

      final relative = AuthTokens.fromJson({
        'accessToken': 'a',
        'refreshToken': 'r',
        'expiresIn': 900,
      }, now: _now);
      expect(relative?.expiresAt, DateTime.utc(2026, 10, 9, 12, 15));
    });

    test('is null for anything that is not a complete pair', () {
      for (final bad in <Object?>[
        null,
        'x',
        <String, Object?>{},
        {'accessToken': 'a'},
        {'accessToken': '', 'refreshToken': 'r'},
        {'accessToken': 'a', 'refreshToken': 3},
      ]) {
        expect(AuthTokens.fromJson(bad, now: _now), isNull);
      }
    });

    test('never prints a token', () {
      final t = AuthTokens(
        accessToken: 'ACCESS-SECRET',
        refreshToken: 'REFRESH-SECRET',
        expiresAt: _now,
      );
      expect('$t', isNot(contains('SECRET')));
    });
  });

  group('SecureTokenStore', () {
    setUp(() => FlutterSecureStorage.setMockInitialValues({}));

    final tokens = AuthTokens(
      accessToken: 'a1',
      refreshToken: 'r1',
      expiresAt: DateTime.utc(2026, 10, 9, 12, 15),
    );

    test('keeps the session across a restart', () async {
      final first = await SecureTokenStore.open(now: () => _now);
      expect(first.current, isNull);
      await first.save(tokens);
      expect(first.current, tokens);

      final afterRestart = await SecureTokenStore.open(now: () => _now);
      expect(afterRestart.current, tokens);
    });

    test('forgets everything on clear, including after a restart', () async {
      final store = await SecureTokenStore.open(now: () => _now);
      await store.save(tokens);
      await store.clear();
      expect(store.current, isNull);
      expect((await SecureTokenStore.open(now: () => _now)).current, isNull);
    });

    test('starts signed out, and clears the entry, when what is stored is unreadable', () async {
      FlutterSecureStorage.setMockInitialValues({
        'blocks.session.v1': 'not json at all',
      });
      final store = await SecureTokenStore.open(now: () => _now);
      expect(store.current, isNull);
      const storage = FlutterSecureStorage();
      expect(await storage.read(key: 'blocks.session.v1'), isNull);
    });
  });
}
