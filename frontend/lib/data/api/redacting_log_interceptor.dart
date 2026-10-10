import 'package:blocks_app/data/api/api_error.dart';
import 'package:dio/dio.dart';

/// One line per request: `GET /posts/:id -> 200 (84 ms)`.
///
/// **What it never writes:** headers (so no tokens), request or response bodies
/// (so no passwords, codes, names, messages or money), query strings, the host,
/// or anything that identifies a person: ids and usernames in the path are
/// replaced by placeholders. What is left is enough to see that something is
/// slow or failing, and, for a failure, the server's request id so the
/// matching line in the server's logs can be found.
class RedactingLogInterceptor extends Interceptor {
  RedactingLogInterceptor(this.sink, {Stopwatch Function()? stopwatch})
    : _stopwatch = stopwatch ?? Stopwatch.new;

  static const _startKey = 'logStopwatch';

  final void Function(String line) sink;
  final Stopwatch Function() _stopwatch;

  /// `/profiles/asha.k/posts/01990000-...` -> `/profiles/:username/posts/:id`.
  static String routeOf(String path) {
    final parts = path.split('/');
    final out = <String>[];
    for (var i = 0; i < parts.length; i++) {
      final part = parts[i];
      final before = i > 0 ? parts[i - 1] : '';
      if (part.isEmpty) {
        out.add(part);
      } else if (_uuid.hasMatch(part) || RegExp(r'^\d+$').hasMatch(part)) {
        out.add(':id');
      } else if (before == 'profiles' ||
          (before == 'users' && part.startsWith('@'))) {
        out.add(':username');
      } else if (before == 'hashtags') {
        out.add(':tag');
      } else {
        out.add(part);
      }
    }
    return out.join('/');
  }

  static final _uuid = RegExp(
    r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
  );

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    options.extra[_startKey] = _stopwatch()..start();
    handler.next(options);
  }

  @override
  void onResponse(
    Response<Object?> response,
    ResponseInterceptorHandler handler,
  ) {
    _log(response.requestOptions, response.statusCode, null);
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final body = ApiErrorBody.from(err.response?.data);
    _log(
      err.requestOptions,
      err.response?.statusCode,
      body.requestId,
      kind: err.response == null ? err.type.name : null,
      code: body.code.isEmpty ? null : body.code,
    );
    handler.next(err);
  }

  void _log(
    RequestOptions options,
    int? status,
    String? requestId, {
    String? kind,
    String? code,
  }) {
    final watch = options.extra[_startKey];
    final ms = watch is Stopwatch ? watch.elapsedMilliseconds : null;
    final outcome = status?.toString() ?? kind ?? 'failed';
    sink(
      '${options.method} ${routeOf(options.uri.path)} -> $outcome'
      '${code == null ? '' : ' $code'}'
      '${ms == null ? '' : ' ($ms ms)'}'
      '${requestId == null ? '' : ' [req $requestId]'}',
    );
  }
}
