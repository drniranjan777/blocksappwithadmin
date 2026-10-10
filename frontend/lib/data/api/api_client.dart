import 'dart:math';

import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/api/api_error.dart';
import 'package:blocks_app/data/api/auth_interceptor.dart';
import 'package:blocks_app/data/api/json_reader.dart';
import 'package:blocks_app/data/api/redacting_log_interceptor.dart';
import 'package:blocks_app/data/api/retry_interceptor.dart';
import 'package:blocks_app/data/api/token_store.dart';
import 'package:dio/dio.dart';

/// One successful answer: `{ "data": ..., "meta": { "nextCursor", "hasMore" } }`.
class ApiEnvelope {
  const ApiEnvelope({this.data, this.nextCursor, this.hasMore = false});

  /// Reads the API's envelope. An empty body (204) is a null [data].
  factory ApiEnvelope.of(Response<Object?> response) {
    final body = response.data;
    if (body is! Map) return const ApiEnvelope();
    final meta = body['meta'];
    final cursor = meta is Map && meta['nextCursor'] is String
        ? meta['nextCursor'] as String
        : null;
    return ApiEnvelope(
      data: body['data'],
      nextCursor: cursor,
      hasMore: meta is Map && meta['hasMore'] == true && cursor != null,
    );
  }

  final Object? data;
  final String? nextCursor;
  final bool hasMore;

  /// The answer as an object. A different shape is the server's mistake, not
  /// ours to crash on: it becomes a failure the UI already knows how to show.
  JsonObject object() => JsonObject.of(data);

  /// The answer as a list of objects (a page).
  List<JsonObject> objects() {
    final d = data;
    if (d is List) return [for (final item in d) JsonObject.of(item)];
    throw const UnknownFailure('The server sent something unexpected');
  }
}

/// The most the API returns in one page; asking for more is a 400.
const maxPageSize = 50;

/// A page size the API will accept.
int clampPage(int limit) => limit.clamp(1, maxPageSize);

/// One value placed in the middle of a path. Ids and usernames come from other
/// people's data, so anything that is not plain text is escaped: a `/` or `..`
/// in one can never reach a different route.
String seg(String value) => Uri.encodeComponent(value);

/// A fresh key for one attempt at something that must not happen twice. Sent as
/// `Idempotency-Key`: if the answer is lost and the call is repeated, the
/// server returns the first result instead of doing it again.
String newIdempotencyKey([Random? random]) {
  final r = random ?? Random.secure();
  return List.generate(32, (_) => r.nextInt(16).toRadixString(16)).join();
}

/// The only thing repositories use to talk to the API. It sends JSON, unwraps
/// the envelope, and turns every transport error into an [AppFailure].
class ApiClient {
  const ApiClient(this.dio);

  final Dio dio;

  Future<ApiEnvelope> get(String path, {Map<String, Object?>? query}) =>
      _run(() => dio.get<Object?>(path, queryParameters: _clean(query)));

  Future<ApiEnvelope> post(
    String path, {
    Object? body,
    String? idempotencyKey,
    bool authenticated = true,
  }) => _run(
    () => dio.post<Object?>(
      path,
      data: body ?? const <String, Object?>{},
      options: Options(
        headers: {'Idempotency-Key': ?idempotencyKey},
        extra: {if (!authenticated) AuthInterceptor.skipAuthKey: true},
      ),
    ),
  );

  Future<ApiEnvelope> put(String path, {Object? body}) => _run(
    () => dio.put<Object?>(path, data: body ?? const <String, Object?>{}),
  );

  Future<ApiEnvelope> patch(String path, {Object? body}) => _run(
    () => dio.patch<Object?>(path, data: body ?? const <String, Object?>{}),
  );

  Future<ApiEnvelope> delete(String path) =>
      _run(() => dio.delete<Object?>(path));

  Future<ApiEnvelope> _run(Future<Response<Object?>> Function() call) async {
    try {
      return ApiEnvelope.of(await call());
    } on DioException catch (e) {
      throw failureFromDio(e);
    }
  }

  /// Leaves out empty values, and turns everything else into text.
  static Map<String, Object?>? _clean(Map<String, Object?>? query) {
    if (query == null) return null;
    return {
      for (final e in query.entries)
        if (e.value != null && e.value != '') e.key: e.value,
    };
  }
}

/// Builds the HTTP client for the real API.
///
/// Request flow, outermost first: renew an expiring token and attach it
/// ([AuthInterceptor]); retry a read that failed for a passing reason
/// ([RetryInterceptor]); log one redacted line ([RedactingLogInterceptor]).
Dio createApiDio({
  required Uri baseUri,
  required TokenStore tokens,
  required void Function() onSessionEnded,
  void Function(String line)? log,
  HttpClientAdapter? adapter,
  DateTime Function()? now,
  Future<void> Function(Duration)? wait,
}) {
  final options = BaseOptions(
    baseUrl: baseUri.toString().replaceAll(RegExp(r'/+$'), ''),
    connectTimeout: const Duration(seconds: 10),
    sendTimeout: const Duration(seconds: 20),
    receiveTimeout: const Duration(seconds: 20),
    responseType: ResponseType.json,
    headers: const {'Accept': 'application/json'},
  );
  Dio client() {
    final d = Dio(options);
    if (adapter != null) d.httpClientAdapter = adapter;
    return d;
  }

  // A retry and its log line, shared by the main client and the replay client.
  void addRetryAndLog(Dio d) => d.interceptors.addAll([
    RetryInterceptor(wait: wait)..dio = d,
    if (log != null) RedactingLogInterceptor(log),
  ]);

  // Renews tokens only: no interceptors, so it can never loop on itself.
  final refresh = client();

  // Sends the request again after a renewal. It must NOT pass through the auth
  // interceptor: that interceptor is still busy handling the first failure, and
  // a second 401 would queue behind it and wait on it forever.
  final replay = client();
  addRetryAndLog(replay);

  final dio = client();
  dio.interceptors.add(
    AuthInterceptor(
      tokens: tokens,
      refreshClient: refresh,
      replayClient: replay,
      onSessionEnded: onSessionEnded,
      now: now,
    ),
  );
  addRetryAndLog(dio);
  return dio;
}
