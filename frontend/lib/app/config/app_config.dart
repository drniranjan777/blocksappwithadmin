import 'package:flutter_riverpod/flutter_riverpod.dart';

enum AppEnvironment { demo, staging, production }

/// Build-time, NON-SECRET configuration.
///
/// Values come from `--dart-define` so nothing sensitive is ever bundled in
/// source control. See `.env.example`.
class AppConfig {
  const AppConfig({
    required this.environment,
    required this.useMockData,
    required this.apiBaseUrl,
    required this.enableLogging,
  });

  factory AppConfig.fromEnvironment() {
    const env = String.fromEnvironment('APP_ENV', defaultValue: 'demo');
    return AppConfig(
      environment: AppEnvironment.values.firstWhere(
        (e) => e.name == env,
        orElse: () => AppEnvironment.demo,
      ),
      useMockData: const bool.fromEnvironment('DEMO_MODE', defaultValue: true),
      apiBaseUrl: const String.fromEnvironment('API_BASE_URL'),
      enableLogging: const bool.fromEnvironment(
        'ENABLE_LOGGING',
        defaultValue: true,
      ),
    );
  }

  /// Every call goes below this path on the server.
  static const apiVersionPath = '/api/v1';

  /// Hosts that mean "the machine I am developing on" (the Android emulator's
  /// name for its host is 10.0.2.2). Plain HTTP is accepted for these, and only
  /// outside production.
  static const _developmentHosts = {'localhost', '127.0.0.1', '10.0.2.2'};

  final AppEnvironment environment;

  /// When true, repository providers resolve to `Mock*Repository`.
  /// Flip to false (with an API base URL) to use the `Api*Repository` classes.
  final bool useMockData;

  /// The server's address, without a path: `https://api.example.com`.
  final String apiBaseUrl;
  final bool enableLogging;

  bool get isDemo => environment == AppEnvironment.demo;

  /// The address every API call is made below, checked.
  ///
  /// Throws [StateError] with the reason when the configuration cannot be
  /// used, so a wrong build fails at start-up with a clear message instead of
  /// sending people's data somewhere unintended or unencrypted.
  Uri get apiBaseUri {
    if (apiBaseUrl.trim().isEmpty) {
      throw StateError('API_BASE_URL is required when DEMO_MODE=false');
    }
    final uri = Uri.tryParse(apiBaseUrl.trim());
    if (uri == null || uri.host.isEmpty || !uri.hasScheme) {
      throw StateError(
        'API_BASE_URL must be a full address such as https://api.example.com',
      );
    }
    if (uri.userInfo.isNotEmpty || uri.hasQuery || uri.hasFragment) {
      throw StateError(
        'API_BASE_URL must not contain a login, query or fragment',
      );
    }
    if (uri.hasEmptyPath == false && uri.path != '/') {
      throw StateError(
        'API_BASE_URL is the server address only: the app adds $apiVersionPath',
      );
    }
    final local = _developmentHosts.contains(uri.host);
    final secure = uri.scheme == 'https';
    if (!secure &&
        !(uri.scheme == 'http' &&
            local &&
            environment != AppEnvironment.production)) {
      throw StateError(
        'API_BASE_URL must use https (plain http is accepted only for a local '
        'development server, and never in production)',
      );
    }
    return uri.replace(path: apiVersionPath);
  }
}

final appConfigProvider = Provider<AppConfig>(
  (ref) => AppConfig.fromEnvironment(),
);
