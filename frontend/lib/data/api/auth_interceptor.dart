import 'package:blocks_app/data/api/api_error.dart';
import 'package:blocks_app/data/api/token_store.dart';
import 'package:dio/dio.dart';

/// Puts the signed-in person's access token on every request and keeps the
/// session alive.
///
/// **Renewal.** Refresh tokens work once: the API treats a second use as theft
/// and ends the session. This interceptor is a [QueuedInterceptor], so requests
/// and failures are handled one at a time. When a call comes back "token
/// expired" the first one renews; the ones queued behind it find the new token
/// already in the store and simply try again with it. Nothing ever sends the
/// same refresh token twice.
///
/// **Ending.** If the API says the session is over (revoked, expired for good,
/// or the refresh token was refused), the tokens are cleared and
/// [onSessionEnded] is called, so the app can return to sign-in. A failed
/// renewal caused only by a bad connection keeps the tokens: the person is not
/// signed out because the train went into a tunnel.
class AuthInterceptor extends QueuedInterceptor {
  AuthInterceptor({
    required this.tokens,
    required this.refreshClient,
    required this.replayClient,
    required this.onSessionEnded,
    DateTime Function()? now,
    this.refreshPath = '/auth/refresh',
    this.renewEarly = const Duration(seconds: 20),
  }) : _now = now ?? DateTime.now;

  /// Set on a request that must not carry or need a token (sign-in itself).
  static const skipAuthKey = 'skipAuth';
  static const _retriedKey = 'authRetried';

  final TokenStore tokens;

  /// A plain client (no interceptors) used only to renew tokens.
  final Dio refreshClient;

  /// Sends a request again with the new token. It must not have this
  /// interceptor on it: this one is still handling the first failure, so a
  /// second failure of the repeated request would queue behind it and wait
  /// for it forever.
  final Dio replayClient;

  final void Function() onSessionEnded;
  final String refreshPath;
  final Duration renewEarly;
  final DateTime Function() _now;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    if (options.extra[skipAuthKey] == true) return handler.next(options);
    var current = tokens.current;
    // Renew a little early so the request does not have to fail first.
    if (current != null &&
        !_now().isBefore(current.expiresAt.subtract(renewEarly))) {
      switch (await _renew(current)) {
        case _Renewed(:final tokens):
          current = tokens;
        case _Ended():
          // Refused: the session is over. Go on without a token rather than
          // spend the same (now dead) refresh token a second time.
          await _end();
          current = null;
        case _Unreachable():
          // Try with what we have; the server will say if it is no longer valid.
          break;
      }
    }
    if (current != null) {
      options.headers['Authorization'] = 'Bearer ${current.accessToken}';
    }
    handler.next(options);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    final request = err.requestOptions;
    if (err.response?.statusCode != 401 ||
        request.extra[skipAuthKey] == true ||
        request.extra[_retriedKey] == true) {
      return handler.next(err);
    }

    final code = apiErrorCode(err.response);
    if (code == 'SESSION_REVOKED' || code == 'SESSION_EXPIRED') {
      await _end();
      return handler.next(err);
    }

    // Only a token problem is cured by renewing. A 401 for any other reason (a
    // wrong password typed to confirm something, say) must not be repeated: that
    // would send the password twice and count two wrong tries against the account.
    if (code != 'TOKEN_EXPIRED' && code != 'UNAUTHENTICATED') {
      return handler.next(err);
    }

    final current = tokens.current;
    if (current == null) return handler.next(err);

    // Another request already renewed the tokens while this one was in flight.
    final sent = request.headers['Authorization'];
    if (sent != 'Bearer ${current.accessToken}') {
      return _retry(request, current.accessToken, err, handler);
    }

    final outcome = await _renew(current);
    switch (outcome) {
      case _Renewed(:final tokens):
        return _retry(request, tokens.accessToken, err, handler);
      case _Ended():
        await _end();
        return handler.next(err);
      case _Unreachable(:final error):
        // Not signed out: the connection failed, not the session.
        return handler.reject(error);
    }
  }

  Future<void> _retry(
    RequestOptions request,
    String accessToken,
    DioException original,
    ErrorInterceptorHandler handler,
  ) async {
    final again = request.copyWith(
      headers: {...request.headers, 'Authorization': 'Bearer $accessToken'},
      extra: {...request.extra, _retriedKey: true},
    );
    try {
      handler.resolve(await replayClient.fetch<Object?>(again));
    } on DioException catch (e) {
      handler.reject(e);
    }
  }

  Future<_Renewal> _renew(AuthTokens current) async {
    try {
      final response = await refreshClient.post<Object?>(
        refreshPath,
        data: {'refreshToken': current.refreshToken},
        options: Options(extra: {skipAuthKey: true}),
      );
      // The API answers `{ data: { tokens: { accessToken, refreshToken, ... } } }`.
      final body = response.data;
      final inner = body is Map ? body['data'] : null;
      final renewed = AuthTokens.fromJson(
        inner is Map && inner['tokens'] is Map ? inner['tokens'] : inner,
        now: _now(),
      );
      if (renewed == null) return _Ended();
      await tokens.save(renewed);
      return _Renewed(renewed);
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      if (status == 401 || status == 403 || status == 400) return _Ended();
      return _Unreachable(e);
    }
  }

  /// Several calls in flight when a session dies all learn of it. The first one
  /// ends it; the rest find it already ended and say nothing more.
  Future<void> _end() async {
    if (tokens.current == null) return;
    await tokens.clear();
    onSessionEnded();
  }
}

sealed class _Renewal {}

class _Renewed extends _Renewal {
  _Renewed(this.tokens);
  final AuthTokens tokens;
}

class _Ended extends _Renewal {}

class _Unreachable extends _Renewal {
  _Unreachable(this.error);
  final DioException error;
}
