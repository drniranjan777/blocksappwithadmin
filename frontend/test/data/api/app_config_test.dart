import 'package:blocks_app/app/config/app_config.dart';
import 'package:flutter_test/flutter_test.dart';

AppConfig _config(
  String url, {
  AppEnvironment environment = AppEnvironment.staging,
}) => AppConfig(
  environment: environment,
  useMockData: false,
  apiBaseUrl: url,
  enableLogging: false,
);

void main() {
  group('API_BASE_URL', () {
    test('becomes the server origin plus /api/v1', () {
      expect(
        _config('https://api.example.com').apiBaseUri.toString(),
        'https://api.example.com/api/v1',
      );
      expect(
        _config('https://api.example.com/').apiBaseUri.toString(),
        'https://api.example.com/api/v1',
      );
      expect(
        _config('  https://api.example.com:8443  ').apiBaseUri.toString(),
        'https://api.example.com:8443/api/v1',
      );
    });

    test('is required', () {
      expect(() => _config('').apiBaseUri, throwsStateError);
      expect(() => _config('   ').apiBaseUri, throwsStateError);
    });

    test('must be a full address', () {
      for (final bad in [
        'api.example.com',
        'https://',
        '/api',
        'ftp://x.com',
      ]) {
        expect(() => _config(bad).apiBaseUri, throwsStateError, reason: bad);
      }
    });

    test('must not hide credentials, a query, a fragment or a path', () {
      for (final bad in [
        'https://user:pass@api.example.com',
        'https://api.example.com?x=1',
        'https://api.example.com#top',
        'https://api.example.com/api/v1',
        'https://api.example.com/v2',
      ]) {
        expect(() => _config(bad).apiBaseUri, throwsStateError, reason: bad);
      }
    });

    test('must be https, except plain http to the developer\'s own machine outside production', () {
      expect(
        () => _config('http://api.example.com').apiBaseUri,
        throwsStateError,
      );
      expect(
        _config('http://10.0.2.2:4000').apiBaseUri.toString(),
        'http://10.0.2.2:4000/api/v1',
      );
      expect(
        _config('http://localhost:4000').apiBaseUri.toString(),
        'http://localhost:4000/api/v1',
      );
      expect(
        () => _config(
          'http://localhost:4000',
          environment: AppEnvironment.production,
        ).apiBaseUri,
        throwsStateError,
      );
      expect(
        () => _config('http://192.168.1.20:4000').apiBaseUri,
        throwsStateError,
        reason: 'an address on someone else\'s network is not "this machine"',
      );
    });
  });
}
