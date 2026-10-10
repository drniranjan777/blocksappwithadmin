import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/core/errors/provider_retry.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('providerRetry', () {
    test('never retries a failure that cannot succeed', () {
      for (final failure in <Object>[
        const ForbiddenFailure('no', 'NOT_AVAILABLE'),
        const NotFoundFailure(),
        const UnauthorizedFailure(),
        const ValidationFailure('bad'),
        const ConflictFailure(),
        const RateLimitedFailure(),
        const UnknownFailure(),
        StateError('a bug'),
      ]) {
        expect(providerRetry(0, failure), isNull, reason: '$failure');
      }
    });

    test('gives a dropped connection a short second and third chance', () {
      expect(
        providerRetry(0, const NetworkFailure()),
        const Duration(milliseconds: 800),
      );
      expect(
        providerRetry(1, const NetworkFailure()),
        const Duration(milliseconds: 1600),
      );
      expect(providerRetry(2, const NetworkFailure()), isNull);
    });

    test('waits as long as a busy server asks, but never long', () {
      expect(
        providerRetry(
          0,
          const ServiceUnavailableFailure(retryAfter: Duration(seconds: 2)),
        ),
        const Duration(seconds: 2),
      );
      expect(
        providerRetry(0, const ServiceUnavailableFailure()),
        const Duration(seconds: 1),
      );
      expect(
        providerRetry(
          0,
          const ServiceUnavailableFailure(retryAfter: Duration(seconds: 30)),
        ),
        isNull,
      );
    });

    test('adds up to a few seconds at the very most', () {
      var total = Duration.zero;
      for (var n = 0; ; n++) {
        final wait = providerRetry(n, const NetworkFailure());
        if (wait == null) break;
        total += wait;
      }
      expect(total, lessThan(const Duration(seconds: 5)));
    });
  });
}
