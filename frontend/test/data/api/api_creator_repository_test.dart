import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/api/api_creator_repository.dart';
import 'package:blocks_app/data/models/creator_models.dart';
import 'package:blocks_app/features/reach/domain/reach_level.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fake_api.dart';

Map<String, Object?> _dashboard({Map<String, Object?>? reach}) => {
  'data': {
    'followers': 42,
    'monetization': {'status': 'ELIGIBLE', 'eligible': true},
    'reach':
        reach ??
        {
          'qualifiedReach30d': 1200,
          'bestLevel': 'STATE',
          'itemsByLevel': {
            'district': 2,
            'state': 1,
            'national': 0,
            'global': 0,
          },
          'coverage': {
            'district': 1,
            'state': 0.3333,
            'national': 0,
            'global': 0,
          },
          'bestItemQualifiedReach': 800,
        },
    'earnings': {'available': '10.00'},
  },
};

Map<String, Object?> _summary({
  Map<String, Object?>? estimated,
  String available = '1234.56',
  String pending = '200.00',
  String paidOut = '300.99',
}) => {
  'data': {
    'currency': 'INR',
    'bestLevel': 'NATIONAL',
    'estimated': estimated,
    'pending': pending,
    'finalized': '900.00',
    'available': available,
    'paidOut': paidOut,
    'metrics30d': {
      'qualifiedViews': 700,
      'watchSeconds': 7200,
      'shares': 12,
      'saves': 30,
      'likes': 100,
      'comments': 8,
      'engagementRate': 0.2143,
      'bestItemQualifiedReach': 500,
    },
    'notice': 'ESTIMATE_NOT_GUARANTEED',
  },
};

Map<String, Object?> _cycle(String start, String end, String label) => {
  'label': label,
  'startsAt': start,
  'endsAt': end,
  'status': 'CLOSED',
};

Reply _history(List<Map<String, Object?>> rows) => Reply.ok({
  'data': rows,
  'meta': {'nextCursor': null, 'hasMore': false},
});

void main() {
  group('the creator dashboard', () {
    test('reads the numbers the server computed', () async {
      final rig = Rig((_) async => Reply.ok(_dashboard()));
      final d = await ApiCreatorRepository(rig.api).getDashboard();
      expect(rig.fake.requests.single.path, '/api/v1/creator/dashboard');
      expect(d.followers, 42);
      expect(d.qualifiedReach30d, 1200);
      expect(d.bestPostQualifiedReach, 800);
      expect(d.reachLevel, ReachLevel.state);
      expect(d.coverage[ReachLevel.district], 1);
      expect(d.coverage[ReachLevel.state], closeTo(0.3333, 1e-9));
      expect(d.coverage[ReachLevel.global], 0);
    });

    test('treats a missing coverage as none, never as full', () async {
      final rig = Rig(
        (_) async => Reply.ok(
          _dashboard(
            reach: {
              'qualifiedReach30d': 0,
              'bestLevel': 'DISTRICT',
              'itemsByLevel': {
                'district': 0,
                'state': 0,
                'national': 0,
                'global': 0,
              },
            },
          ),
        ),
      );
      final d = await ApiCreatorRepository(rig.api).getDashboard();
      expect(d.coverage.values, everyElement(0));
      expect(d.bestPostQualifiedReach, 0);
    });

    test('refuses a rung it does not know instead of guessing', () async {
      final rig = Rig(
        (_) async => Reply.ok(
          _dashboard(reach: {'qualifiedReach30d': 1, 'bestLevel': 'GALACTIC'}),
        ),
      );
      await expectLater(
        ApiCreatorRepository(rig.api).getDashboard(),
        throwsA(isA<UnknownFailure>()),
      );
    });

    test('lets a server failure through unchanged', () async {
      final rig = Rig((_) async => Reply.error(401, 'UNAUTHENTICATED'));
      await expectLater(
        ApiCreatorRepository(rig.api).getDashboard(),
        throwsA(isA<UnauthorizedFailure>()),
      );
    });
  });

  group('earnings', () {
    final now = DateTime.utc(2026, 10, 10, 12);

    ApiCreatorInsightsRepository repo(Rig rig) =>
        ApiCreatorInsightsRepository(rig.api, now: () => now);

    test('shows what the server says and never rounds money up', () async {
      final rig = Rig((request) async {
        if (request.path.endsWith('/earnings/summary')) {
          return Reply.ok(
            _summary(
              estimated: {
                'amount': '99.99',
                'cycle': _cycle(
                  '2026-10-01T00:00:00.000Z',
                  '2026-11-01T00:00:00.000Z',
                  'Oct',
                ),
                'qualifiedReach': 650,
                'level': 'NATIONAL',
              },
            ),
          );
        }
        return _history([
          {
            'id': 'a',
            'cycle': _cycle(
              '2026-10-01T00:00:00.000Z',
              '2026-11-01T00:00:00.000Z',
              'Oct',
            ),
            'status': 'ESTIMATED',
            'amount': '99.99',
            'isEstimate': true,
            'qualifiedReach': 650,
            'level': 'NATIONAL',
          },
          {
            'id': 'b',
            'cycle': _cycle(
              '2026-09-01T00:00:00.000Z',
              '2026-10-01T00:00:00.000Z',
              'Sep',
            ),
            'status': 'FINALIZED',
            'amount': '500.50',
            'isEstimate': false,
            'qualifiedReach': 400,
            'level': 'STATE',
          },
          {
            'id': 'c',
            'cycle': _cycle(
              '2026-08-01T00:00:00.000Z',
              '2026-09-01T00:00:00.000Z',
              'Aug',
            ),
            'status': 'VOID',
            'amount': '0.00',
            'isEstimate': false,
            'qualifiedReach': 0,
            'level': 'DISTRICT',
          },
        ]);
      });
      final s = await repo(rig).getEarnings();

      // Whole rupees, fraction dropped: the app shows no more than the creator has.
      expect(s.estimatedTotal, 99);
      expect(s.available, 1234);
      expect(s.pending, 200);
      expect(s.paid, 300);
      expect(s.thisMonth, 99);
      expect(s.reachLevel, ReachLevel.national);

      expect(s.byLevel[ReachLevel.national], 99);
      expect(s.byLevel[ReachLevel.state], 500);
      expect(s.byLevel[ReachLevel.district], 0);

      expect(s.metrics.qualifiedViews, 700);
      expect(s.metrics.watchTimeSeconds, 7200);
      expect(s.metrics.shares, 12);
      expect(s.metrics.saves, 30);
      expect(s.metrics.engagementRate, closeTo(0.2143, 1e-9));

      expect(s.rewardPool.isEstimate, isTrue);
      expect(s.rewardPool.qualifiedReach, 650);
      expect(s.rewardPool.periodStart, DateTime.utc(2026, 10));
      expect(s.rewardPool.periodEnd, DateTime.utc(2026, 11));

      // Six calendar months ending this one, oldest first, zero where nothing was earned.
      expect(s.months, hasLength(6));
      expect(s.months.last.month, DateTime.utc(2026, 10));
      expect(s.months.last.amount, 99);
      expect(s.months[4].amount, 500); // September
      expect(s.months.first.amount, 0);
      expect(
        [for (final m in s.months) m.month],
        [for (var i = 5; i >= 0; i--) DateTime.utc(2026, 10 - i)],
      );
    });

    test('with nothing earned yet, reports zero, not an error', () async {
      final rig = Rig((request) async {
        if (request.path.endsWith('/earnings/summary')) {
          return Reply.ok(
            _summary(available: '0.00', pending: '0.00', paidOut: '0.00'),
          );
        }
        return _history(const []);
      });
      final s = await repo(rig).getEarnings();
      expect(s.estimatedTotal, 0);
      expect(s.available, 0);
      expect(s.paid, 0);
      expect(s.thisMonth, 0);
      expect(s.rewardPool.isEstimate, isFalse);
      expect(s.months.every((m) => m.amount == 0), isTrue);
      expect(s.levelTotal, 0);
    });

    test('asks for the summary and the history, and nothing else', () async {
      final rig = Rig((request) async {
        return request.path.endsWith('/earnings/summary')
            ? Reply.ok(_summary())
            : _history(const []);
      });
      await repo(rig).getEarnings();
      final paths = rig.fake.requests.map((r) => r.path).toSet();
      expect(paths, {'/api/v1/earnings/summary', '/api/v1/earnings/history'});
      expect(rig.fake.requests.every((r) => r.method == 'GET'), isTrue);
    });

    test('analytics are honestly not available yet', () async {
      final rig = Rig((_) async => Reply.ok(_summary()));
      final r = repo(rig);
      await expectLater(
        r.getAnalytics(AnalyticsRange.days28),
        throwsA(
          isA<AppFailure>().having((f) => f.code, 'code', 'NOT_AVAILABLE'),
        ),
      );
      await expectLater(r.getReelPerformance('x'), throwsA(isA<AppFailure>()));
      expect(rig.fake.requests, isEmpty);
    });
  });
}
