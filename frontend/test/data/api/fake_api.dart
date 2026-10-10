import 'dart:convert';
import 'dart:typed_data';

import 'package:blocks_app/data/api/api_client.dart';
import 'package:blocks_app/data/api/token_store.dart';
import 'package:dio/dio.dart';

/// One request as the server would have seen it.
class SeenRequest {
  SeenRequest(this.options, this.body);

  final RequestOptions options;
  final Object? body;

  String get method => options.method;
  String get path => options.uri.path;
  Map<String, Object?> get query => options.uri.queryParameters;
  String? header(String name) {
    for (final e in options.headers.entries) {
      if (e.key.toLowerCase() == name.toLowerCase()) return '${e.value}';
    }
    return null;
  }

  @override
  String toString() => '$method $path';
}

/// What the fake server answers.
class Reply {
  const Reply(this.status, [this.body, this.headers = const {}]);

  Reply.ok(Object? body) : this(200, body);

  /// The API's error envelope.
  Reply.error(
    int status,
    String code, {
    String message = 'x',
    List<Map<String, Object?>>? details,
    Map<String, String> headers = const {},
  }) : this(status, {
         'error': {
           'code': code,
           'message': message,
           'requestId': 'req-1',
           'details': ?details,
         },
       }, headers);

  final int status;
  final Object? body;
  final Map<String, String> headers;
}

/// A stand-in for the network: records every request and answers from [handler].
/// Throw a [DioException] from the handler to simulate a dropped connection.
class FakeApi implements HttpClientAdapter {
  FakeApi(this.handler);

  final Future<Reply> Function(SeenRequest request) handler;
  final List<SeenRequest> requests = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    var body = options.data;
    if (requestStream != null) {
      final bytes = <int>[];
      await for (final chunk in requestStream) {
        bytes.addAll(chunk);
      }
      final type = '${options.headers['content-type'] ?? options.contentType}'
          .toLowerCase();
      // JSON stays a decoded object; anything else (an upload) stays raw bytes.
      body = bytes.isEmpty
          ? null
          : (type.contains('json')
                ? jsonDecode(utf8.decode(bytes))
                : Uint8List.fromList(bytes));
    }
    final seen = SeenRequest(options, body);
    requests.add(seen);
    final reply = await handler(seen);
    return ResponseBody.fromString(
      reply.body == null ? '' : jsonEncode(reply.body),
      reply.status,
      headers: {
        'content-type': ['application/json'],
        for (final e in reply.headers.entries) e.key.toLowerCase(): [e.value],
      },
    );
  }

  @override
  void close({bool force = false}) {}

  Iterable<SeenRequest> to(String path) =>
      requests.where((r) => r.path == path);
}

/// A client wired like the app's, talking to a [FakeApi]. Waits (retry back-off)
/// are recorded instead of slept.
class Rig {
  Rig(
    Future<Reply> Function(SeenRequest request) handler, {
    TokenStore? tokens,
    this.logged,
  }) : fake = FakeApi(handler),
       store = tokens ?? MemoryTokenStore() {
    api = ApiClient(
      createApiDio(
        baseUri: Uri.parse('https://api.example.test/api/v1'),
        tokens: store,
        onSessionEnded: () => ended++,
        log: logged?.add,
        adapter: fake,
        now: () => DateTime.utc(2026, 10, 9, 12),
        wait: (d) async => waits.add(d),
      ),
    );
  }

  final FakeApi fake;
  final TokenStore store;
  final List<String>? logged;
  final List<Duration> waits = [];
  late final ApiClient api;
  int ended = 0;
}

/// A dropped connection, as the adapter would raise it.
DioException connectionLost(RequestOptions options) => DioException(
  requestOptions: options,
  type: DioExceptionType.connectionError,
  error: 'connection lost',
);
