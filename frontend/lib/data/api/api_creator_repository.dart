import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/api/api_client.dart';
import 'package:blocks_app/data/api/json_reader.dart';
import 'package:blocks_app/data/api/unavailable_repositories.dart';
import 'package:blocks_app/data/models/business_models.dart';
import 'package:blocks_app/data/models/creator_models.dart';
import 'package:blocks_app/data/repositories/creator_repositories.dart';
import 'package:blocks_app/data/repositories/misc_repositories.dart';
import 'package:blocks_app/features/reach/domain/reach_level.dart';

/// The Reach Ladder rung a server key names (`DISTRICT`, `STATE`, ...).
ReachLevel _level(String key) {
  for (final level in ReachLevel.values) {
    if (level.name.toUpperCase() == key.toUpperCase()) return level;
  }
  throw const UnknownFailure('The server sent something unexpected');
}

/// Whole rupees from the server's decimal text (`"1234.50"` -> 1234).
///
/// The fraction is dropped, never rounded up, so the app can show less than a creator has but
/// never more. (The exact amount is on the server's ledger; the app only displays it.)
int _wholeRupees(Object? text) {
  if (text is! String) return 0;
  final negative = text.startsWith('-');
  final whole = (negative ? text.substring(1) : text).split('.').first;
  final value = int.tryParse(whole) ?? 0;
  return negative ? -value : value;
}

/// Creator Studio's headline numbers, exactly as the server computed them.
class ApiCreatorRepository implements CreatorRepository {
  ApiCreatorRepository(this._api);

  final ApiClient _api;

  @override
  Future<CreatorDashboard> getDashboard() async {
    final answer = await _api.get('/creator/dashboard');
    final d = JsonObject.of(answer.data);
    final reach = d.object('reach');
    final coverage = reach.objectOrNull('coverage');
    return CreatorDashboard(
      followers: d.integer('followers'),
      qualifiedReach30d: reach.integer('qualifiedReach30d'),
      bestPostQualifiedReach: reach.integer('bestItemQualifiedReach'),
      coverage: {
        for (final level in ReachLevel.values)
          level: (coverage?.decimal(level.name) ?? 0).clamp(0.0, 1.0),
      },
      reachLevel: _level(reach.string('bestLevel')),
    );
  }
}

/// Earnings (and later analytics) for the signed-in creator.
///
/// Only earnings exist on the server so far; analytics and per-reel performance answer
/// "not available yet" rather than inventing figures.
class ApiCreatorInsightsRepository implements CreatorInsightsRepository {
  ApiCreatorInsightsRepository(this._api, {DateTime Function()? now})
    : _now = now ?? DateTime.now;

  final ApiClient _api;
  final DateTime Function() _now;

  /// How many monthly bars the earnings chart shows.
  static const _monthsShown = 6;

  @override
  Future<EarningsSummary> getEarnings() async {
    final results = await Future.wait([
      _api.get('/earnings/summary'),
      _api.get('/earnings/history', query: {'limit': 50}),
    ]);
    final s = JsonObject.of(results[0].data);
    // The history is a list: `{ "data": [ ...cycles ] }`, newest first.
    final rows = results[1].data;
    final history = [
      if (rows is List)
        for (final row in rows) JsonObject.of(row),
    ];

    final estimated = s.objectOrNull('estimated');
    final metrics = s.object('metrics30d');

    // What each cycle is worth to the creator now (a projection while it is open, a fixed figure
    // once closed, the money released once finalized). Void cycles are worth nothing.
    int worth(JsonObject row) => row.stringOr('status', '') == 'VOID'
        ? 0
        : _wholeRupees(row.raw['amount']);

    final byLevel = {for (final l in ReachLevel.values) l: 0};
    final byMonth = <DateTime, int>{};
    for (final row in history) {
      final amount = worth(row);
      final level = row.stringOrNull('level');
      if (level != null) {
        final key = _level(level);
        byLevel[key] = (byLevel[key] ?? 0) + amount;
      }
      final start = row.object('cycle').date('startsAt');
      final month = DateTime.utc(start.year, start.month);
      byMonth[month] = (byMonth[month] ?? 0) + amount;
    }

    final now = _now().toUtc();
    final thisMonthStart = DateTime.utc(now.year, now.month);
    final months = [
      for (var i = _monthsShown - 1; i >= 0; i--)
        EarningsMonth(
          month: DateTime.utc(now.year, now.month - i),
          amount: byMonth[DateTime.utc(now.year, now.month - i)] ?? 0,
        ),
    ];

    // The period shown is the open cycle's; with none open, the latest one the creator has.
    final cycle =
        estimated?.objectOrNull('cycle') ??
        (history.isEmpty ? null : history.first.object('cycle'));

    return EarningsSummary(
      estimatedTotal: _wholeRupees(estimated?.raw['amount']),
      thisMonth: byMonth[thisMonthStart] ?? 0,
      available: _wholeRupees(s.raw['available']),
      pending: _wholeRupees(s.raw['pending']),
      paid: _wholeRupees(s.raw['paidOut']),
      byLevel: byLevel,
      metrics: QualifiedMetrics(
        qualifiedViews: metrics.integer('qualifiedViews'),
        watchTimeSeconds: metrics.integer('watchSeconds'),
        shares: metrics.integer('shares'),
        saves: metrics.integer('saves'),
        engagementRate: metrics.decimal('engagementRate').clamp(0.0, 1.0),
      ),
      reachLevel: _level(s.stringOr('bestLevel', 'DISTRICT')),
      rewardPool: RewardPoolInfo(
        qualifiedReach: estimated?.integer('qualifiedReach') ?? 0,
        periodStart: cycle?.date('startsAt') ?? thisMonthStart,
        periodEnd: cycle?.date('endsAt') ?? now,
        isEstimate: estimated != null,
      ),
      months: months,
    );
  }

  @override
  Future<CreatorAnalytics> getAnalytics(AnalyticsRange range) =>
      Future.error(featureUnavailable);

  @override
  Future<ReelPerformance> getReelPerformance(String reelId) =>
      Future.error(featureUnavailable);
}
