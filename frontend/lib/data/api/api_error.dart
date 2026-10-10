import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:dio/dio.dart';

/// What the API said went wrong, from its error envelope:
/// `{ "error": { "code", "message", "details"?, "requestId" } }`.
class ApiErrorBody {
  const ApiErrorBody({
    required this.code,
    required this.message,
    this.fields = const {},
    this.extra = const {},
    this.requestId,
  });

  /// Reads the envelope; anything else (an HTML error page from a proxy) gives
  /// an empty body, never an exception.
  factory ApiErrorBody.from(Object? json) {
    final error = json is Map ? json['error'] : null;
    if (error is! Map) return const ApiErrorBody(code: '', message: '');
    final fields = <String, String>{};
    final details = error['details'];
    final extra = details is Map
        ? details.cast<String, Object?>()
        : const <String, Object?>{};
    if (details is List) {
      for (final d in details) {
        if (d is Map && d['field'] is String) {
          final reasons = d['reasons'];
          final first = reasons is List && reasons.isNotEmpty
              ? reasons.first
              : null;
          fields[d['field'] as String] = first is String ? first : 'invalid';
        }
      }
    }
    return ApiErrorBody(
      code: error['code'] is String ? error['code'] as String : '',
      message: error['message'] is String ? error['message'] as String : '',
      fields: fields,
      extra: extra,
      requestId: error['requestId'] is String
          ? error['requestId'] as String
          : null,
    );
  }

  final String code;
  final String message;

  /// Field name -> the first reason the API gave, for refused form fields.
  final Map<String, String> fields;

  /// Numbers and times that go with a refusal (`attemptsRemaining`, `until`),
  /// when the API sent `details` as an object.
  final Map<String, Object?> extra;
  final String? requestId;
}

/// The error code in a failed response, or '' when there is none.
String apiErrorCode(Response<Object?>? response) =>
    ApiErrorBody.from(response?.data).code;

Duration? _retryAfter(Response<Object?>? response) {
  final raw = response?.headers.value('retry-after');
  final seconds = raw == null ? null : int.tryParse(raw.trim());
  return seconds == null || seconds < 0 ? null : Duration(seconds: seconds);
}

/// Translates a transport error into the app's own failure types, so no screen
/// ever depends on Dio and none shows a stack trace or a server's internals.
AppFailure failureFromDio(DioException e) {
  switch (e.type) {
    case DioExceptionType.connectionTimeout:
    case DioExceptionType.sendTimeout:
    case DioExceptionType.receiveTimeout:
    case DioExceptionType.connectionError:
      return const NetworkFailure();
    case DioExceptionType.cancel:
      return const UnknownFailure('The request was cancelled');
    case DioExceptionType.badCertificate:
      // Never offer a way around this: it is how a man-in-the-middle looks.
      return const NetworkFailure('The connection is not secure');
    case DioExceptionType.transformTimeout:
      return const UnknownFailure('The response took too long to read');
    case DioExceptionType.badResponse:
    case DioExceptionType.unknown:
      break;
  }

  final response = e.response;
  final status = response?.statusCode;
  if (status == null) {
    return e.error is AppFailure
        ? e.error! as AppFailure
        : const NetworkFailure();
  }
  final body = ApiErrorBody.from(response?.data);
  final said = body.message.isEmpty ? null : body.message;
  final code = body.code.isEmpty ? null : body.code;
  final extra = body.extra;

  return switch (status) {
    400 =>
      body.fields.isNotEmpty
          ? FieldValidationFailure(body.fields)
          : ValidationFailure(said ?? 'That was not accepted', code, extra),
    401 => UnauthorizedFailure(said ?? 'Please sign in again', code, extra),
    // 423 (sign-in paused after too many wrong passwords) is a refusal too.
    403 || 423 => ForbiddenFailure(
      said ?? 'You do not have permission to do that',
      code,
      extra,
    ),
    404 => NotFoundFailure(said ?? 'Not found', code, extra),
    409 || 412 => ConflictFailure(
      said ?? 'That has changed. Please try again',
      code,
      extra,
    ),
    413 ||
    415 => ValidationFailure(said ?? 'That file is not accepted', code, extra),
    429 => RateLimitedFailure(
      retryAfter: _retryAfter(response),
      message: said ?? 'Too many attempts',
      code: code,
      details: extra,
    ),
    502 || 503 || 504 => ServiceUnavailableFailure(
      retryAfter: _retryAfter(response),
      code: code,
    ),
    // A 5xx never repeats what the server said: it may name internals.
    _ => UnknownFailure(
      status >= 500 ? 'Something went wrong on our side' : 'Unexpected error',
      code,
    ),
  };
}
