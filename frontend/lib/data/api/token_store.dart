import 'dart:convert';

import 'package:equatable/equatable.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// The pair of tokens that make up a signed-in session.
///
/// The access token is short-lived and goes on every request. The refresh token
/// is used once to get the next pair (the server rotates it and treats a second
/// use as theft), so it must never be sent anywhere except the refresh call.
class AuthTokens extends Equatable {
  const AuthTokens({
    required this.accessToken,
    required this.refreshToken,
    required this.expiresAt,
  });

  /// Reads the API's token object (`accessToken`, `refreshToken`, `expiresIn`
  /// seconds and/or `expiresAt`). Returns null when it is not one.
  static AuthTokens? fromJson(Object? json, {required DateTime now}) {
    if (json is! Map) return null;
    final access = json['accessToken'];
    final refresh = json['refreshToken'];
    if (access is! String || access.isEmpty) return null;
    if (refresh is! String || refresh.isEmpty) return null;
    final seconds = json['expiresIn'];
    final stated = json['expiresAt'] is String
        ? DateTime.tryParse(json['expiresAt'] as String)
        : null;
    final expires =
        stated ??
        now.add(Duration(seconds: seconds is num ? seconds.toInt() : 0));
    return AuthTokens(
      accessToken: access,
      refreshToken: refresh,
      expiresAt: expires.toUtc(),
    );
  }

  final String accessToken;
  final String refreshToken;
  final DateTime expiresAt;

  @override
  List<Object?> get props => [accessToken, refreshToken, expiresAt];

  /// Never prints a token: this is what shows up if one is logged by mistake.
  @override
  String toString() => 'AuthTokens(expiresAt: $expiresAt)';
}

/// Where the session's tokens live.
///
/// Reading is synchronous (from memory) so the router can ask "am I signed in?"
/// without waiting; writing also persists. The production implementation uses
/// the platform's secure storage (Keychain / Keystore), never plain preferences.
abstract interface class TokenStore {
  AuthTokens? get current;

  Future<void> save(AuthTokens tokens);

  Future<void> clear();
}

/// For tests and previews: nothing is persisted.
class MemoryTokenStore implements TokenStore {
  MemoryTokenStore([this._tokens]);

  AuthTokens? _tokens;

  @override
  AuthTokens? get current => _tokens;

  @override
  Future<void> save(AuthTokens tokens) async => _tokens = tokens;

  @override
  Future<void> clear() async => _tokens = null;
}

/// Keychain (iOS) / Keystore-backed storage (Android).
class SecureTokenStore implements TokenStore {
  SecureTokenStore._(this._storage, this._tokens);

  static const _key = 'blocks.session.v1';

  /// Loads whatever is stored. Call once at start-up, before the first frame,
  /// so [current] is right from the start.
  static Future<SecureTokenStore> open({
    FlutterSecureStorage storage = const FlutterSecureStorage(),
    DateTime Function()? now,
  }) async {
    AuthTokens? tokens;
    try {
      final raw = await storage.read(key: _key);
      if (raw != null) {
        tokens = AuthTokens.fromJson(
          jsonDecode(raw),
          now: (now ?? DateTime.now)(),
        );
      }
    } on Object {
      // Unreadable (a restored backup, a changed key): start signed out.
      tokens = null;
      await storage.delete(key: _key).catchError((_) {});
    }
    return SecureTokenStore._(storage, tokens);
  }

  final FlutterSecureStorage _storage;
  AuthTokens? _tokens;

  @override
  AuthTokens? get current => _tokens;

  @override
  Future<void> save(AuthTokens tokens) async {
    _tokens = tokens;
    await _storage.write(
      key: _key,
      value: jsonEncode({
        'accessToken': tokens.accessToken,
        'refreshToken': tokens.refreshToken,
        'expiresAt': tokens.expiresAt.toIso8601String(),
      }),
    );
  }

  @override
  Future<void> clear() async {
    _tokens = null;
    await _storage.delete(key: _key);
  }
}
