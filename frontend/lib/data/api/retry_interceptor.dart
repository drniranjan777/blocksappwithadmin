import 'dart:math';

import 'package:dio/dio.dart';

/// Tries a read again when the network or the server blinks.
///
/// Only requests that are safe to repeat are retried: reads (GET, HEAD), and
/// anything that carries an `Idempotency-Key` (the server then makes a repeat
/// do nothing new). Never a plain POST/PUT/DELETE: sending a payment or a
/// comment twice because a response was lost is worse than showing an error.
///
/// Waits grow (0.4 s, 0.8 s ... capped) with random jitter so a recovering
/// server is not hit by every phone at the same instant, and a server's own
/// `Retry-After` is respected (and not waited for if it asks for long).
class RetryInterceptor extends Interceptor {
  RetryInterceptor({
    this.maxRetries = 2,
    this.baseDelay = const Duration(milliseconds: 400),
    this.maxDelay = const Duration(seconds: 4),
    this.longestRetryAfter = const Duration(seconds: 10),
    Future<void> Function(Duration)? wait,
    Random? random,
  }) : _wait = wait ?? Future<void>.delayed,
       _random = random ?? Random();

  static const _attemptKey = 'retryAttempt';

  final int maxRetries;
  final Duration baseDelay;
  final Duration maxDelay;
  final Duration longestRetryAfter;

  /// The client whose requests are retried (set by the factory).
  late Dio dio;

  final Future<void> Function(Duration) _wait;
  final Random _random;

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    final request = err.requestOptions;
    final attempt = (request.extra[_attemptKey] as int?) ?? 0;
    if (attempt >= maxRetries ||
        !_safeToRepeat(request) ||
        !_worthRepeating(err)) {
      return handler.next(err);
    }

    final asked = _retryAfter(err.response);
    if (asked != null && asked > longestRetryAfter) return handler.next(err);

    await _wait(asked ?? _backoff(attempt));
    try {
      handler.resolve(
        await dio.fetch<Object?>(
          request.copyWith(extra: {...request.extra, _attemptKey: attempt + 1}),
        ),
      );
    } on DioException catch (e) {
      handler.reject(e);
    }
  }

  bool _safeToRepeat(RequestOptions request) {
    final method = request.method.toUpperCase();
    return method == 'GET' ||
        method == 'HEAD' ||
        request.headers.keys.any((k) => k.toLowerCase() == 'idempotency-key');
  }

  bool _worthRepeating(DioException err) {
    switch (err.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.connectionError:
        return true;
      case DioExceptionType.badResponse:
        return const {
          408,
          429,
          502,
          503,
          504,
        }.contains(err.response?.statusCode);
      case DioExceptionType.cancel:
      case DioExceptionType.badCertificate:
      case DioExceptionType.transformTimeout:
      case DioExceptionType.unknown:
        return false;
    }
  }

  Duration _backoff(int attempt) {
    final grown = baseDelay * pow(2, attempt).toInt();
    final capped = grown > maxDelay ? maxDelay : grown;
    // Up to a quarter more, at random.
    final jitter = (capped.inMilliseconds * 0.25 * _random.nextDouble())
        .round();
    return capped + Duration(milliseconds: jitter);
  }

  Duration? _retryAfter(Response<Object?>? response) {
    final seconds = int.tryParse(response?.headers.value('retry-after') ?? '');
    return seconds == null || seconds < 0 ? null : Duration(seconds: seconds);
  }
}
