import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/api/api_error.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

DioException _failed(
  int status, {
  Object? body,
  Map<String, List<String>> headers = const {},
}) {
  final request = RequestOptions(path: '/x');
  return DioException(
    requestOptions: request,
    type: DioExceptionType.badResponse,
    response: Response<Object?>(
      requestOptions: request,
      statusCode: status,
      data: body,
      headers: Headers.fromMap(headers),
    ),
  );
}

Map<String, Object?> _envelope(
  String code, {
  String message = 'Said so',
  List<Object?>? details,
}) => {
  'error': {
    'code': code,
    'message': message,
    'requestId': 'req-9',
    'details': ?details,
  },
};

DioException _transport(DioExceptionType type) => DioException(
  requestOptions: RequestOptions(path: '/x'),
  type: type,
);

void main() {
  group('the API error envelope', () {
    test(
      'is read: code, message, request id and the first reason per field',
      () {
        final body = ApiErrorBody.from(
          _envelope(
            'VALIDATION_FAILED',
            details: [
              {
                'field': 'username',
                'reasons': ['already_taken', 'too_short'],
              },
              {'field': 'bio', 'reasons': []},
              'junk',
            ],
          ),
        );
        expect(body.code, 'VALIDATION_FAILED');
        expect(body.message, 'Said so');
        expect(body.requestId, 'req-9');
        expect(body.fields, {'username': 'already_taken', 'bio': 'invalid'});
      },
    );

    test('never throws on something else, such as a proxy error page', () {
      for (final junk in <Object?>[
        null,
        '<html>Bad gateway</html>',
        42,
        <Object?>[],
        {'error': 'x'},
      ]) {
        final body = ApiErrorBody.from(junk);
        expect(body.code, isEmpty);
        expect(body.message, isEmpty);
      }
    });
  });

  group('failures', () {
    test('400 with field details names the fields', () {
      final f = failureFromDio(
        _failed(
          400,
          body: _envelope(
            'VALIDATION_FAILED',
            details: [
              {
                'field': 'displayName',
                'reasons': ['required'],
              },
            ],
          ),
        ),
      );
      expect(f, isA<FieldValidationFailure>());
      expect((f as FieldValidationFailure).errors, {'displayName': 'required'});
    });

    test('400 without details is a plain validation failure with the server message', () {
      final f = failureFromDio(_failed(400, body: _envelope('BAD_REQUEST')));
      expect(f, const ValidationFailure('Said so', 'BAD_REQUEST'));
    });

    test('carries the server code and the numbers that go with it', () {
      final f = failureFromDio(
        _failed(
          400,
          body: {
            'error': {
              'code': 'OTP_INVALID',
              'message': 'That code is not correct.',
              'details': {'attemptsLeft': 3},
            },
          },
        ),
      );
      expect(f.code, 'OTP_INVALID');
      expect(f.details, {'attemptsLeft': 3});
    });

    test('a paused sign-in (423) is a refusal that keeps its time', () {
      final f = failureFromDio(
        _failed(
          423,
          body: {
            'error': {
              'code': 'ACCOUNT_LOCKED',
              'message': 'Paused',
              'details': {'until': '2026-10-09T12:15:00.000Z'},
            },
          },
        ),
      );
      expect(f, isA<ForbiddenFailure>());
      expect(f.code, 'ACCOUNT_LOCKED');
      expect(f.details['until'], '2026-10-09T12:15:00.000Z');
    });

    test('a failure with no code or details has none', () {
      final f = failureFromDio(_failed(404, body: '<html>nope</html>'));
      expect(f.code, isNull);
      expect(f.details, isEmpty);
    });

    test(
      'a 5xx keeps its code for support but never repeats the server text',
      () {
        final f = failureFromDio(
          _failed(
            500,
            body: _envelope('INTERNAL', message: 'secret internals'),
          ),
        );
        expect(f.code, 'INTERNAL');
        expect(f.message, isNot(contains('secret')));
      },
    );

    test('maps each status to the failure the screens already handle', () {
      expect(
        failureFromDio(_failed(401, body: _envelope('UNAUTHENTICATED'))),
        isA<UnauthorizedFailure>(),
      );
      expect(failureFromDio(_failed(403)), isA<ForbiddenFailure>());
      expect(failureFromDio(_failed(404)), isA<NotFoundFailure>());
      expect(failureFromDio(_failed(409)), isA<ConflictFailure>());
      expect(failureFromDio(_failed(412)), isA<ConflictFailure>());
      expect(failureFromDio(_failed(413)), isA<ValidationFailure>());
      expect(failureFromDio(_failed(415)), isA<ValidationFailure>());
      expect(failureFromDio(_failed(500)), isA<UnknownFailure>());
    });

    test('429 and 503 carry the server wait', () {
      final limited = failureFromDio(
        _failed(
          429,
          headers: {
            'retry-after': ['7'],
          },
        ),
      );
      expect(
        (limited as RateLimitedFailure).retryAfter,
        const Duration(seconds: 7),
      );

      for (final status in [502, 503, 504]) {
        expect(
          failureFromDio(_failed(status)),
          isA<ServiceUnavailableFailure>(),
        );
      }
      final noHeader =
          failureFromDio(_failed(503)) as ServiceUnavailableFailure;
      expect(noHeader.retryAfter, isNull);
    });

    test(
      'a 500 never repeats what the server said (it may contain internals)',
      () {
        final f = failureFromDio(
          _failed(
            500,
            body: _envelope(
              'INTERNAL',
              message: 'select * from users where password=...',
            ),
          ),
        );
        expect(f.message, isNot(contains('select')));
      },
    );

    test('timeouts and lost connections are network failures', () {
      for (final type in [
        DioExceptionType.connectionTimeout,
        DioExceptionType.sendTimeout,
        DioExceptionType.receiveTimeout,
        DioExceptionType.connectionError,
      ]) {
        expect(failureFromDio(_transport(type)), isA<NetworkFailure>());
      }
    });

    test('a bad certificate is reported as insecure and nothing offers a way past it', () {
      final f = failureFromDio(_transport(DioExceptionType.badCertificate));
      expect(f, isA<NetworkFailure>());
      expect(f.message, contains('not secure'));
    });
  });
}
