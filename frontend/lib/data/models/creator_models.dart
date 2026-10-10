import 'package:blocks_app/features/reach/domain/reach_level.dart';
import 'package:equatable/equatable.dart';

/// Window for the analytics screens.
enum AnalyticsRange {
  days7(7),
  days28(28),
  days90(90);

  const AnalyticsRange(this.days);

  final int days;
}

/// Counts that earn money. Plain views do not: only views the platform judged
/// *qualified* (real, deduplicated, watched long enough) feed the reward.
///
/// Computed and filtered by the server; the app never works these out.
class QualifiedMetrics extends Equatable {
  const QualifiedMetrics({
    required this.qualifiedViews,
    required this.watchTimeSeconds,
    required this.shares,
    required this.saves,
    required this.engagementRate,
  });

  final int qualifiedViews;
  final int watchTimeSeconds;
  final int shares;
  final int saves;

  /// 0..1.
  final double engagementRate;

  int get watchTimeHours => (watchTimeSeconds / 3600).round();

  @override
  List<Object?> get props => [
    qualifiedViews,
    watchTimeSeconds,
    shares,
    saves,
    engagementRate,
  ];
}

/// The shared pool a creator's reward comes from. Figures are estimates until
/// the period closes; the rule that turns them into rupees lives on the server
/// and changes with the pool, so the app never shows a "₹ per view" rate.
class RewardPoolInfo extends Equatable {
  const RewardPoolInfo({
    required this.qualifiedReach,
    required this.periodStart,
    required this.periodEnd,
    this.isEstimate = true,
  });

  /// The creator's qualified reach in the period.
  final int qualifiedReach;
  final DateTime periodStart;
  final DateTime periodEnd;
  final bool isEstimate;

  @override
  List<Object?> get props => [
    qualifiedReach,
    periodStart,
    periodEnd,
    isEstimate,
  ];
}

class EarningsMonth extends Equatable {
  const EarningsMonth({required this.month, required this.amount});

  /// First day of the month.
  final DateTime month;
  final int amount;

  @override
  List<Object?> get props => [month, amount];
}

/// Where a creator's money stands. Whole rupees (production: paise).
///
/// * [estimatedTotal] — this cycle, not yet final, and shown as an estimate.
/// * [available] — settled and withdrawable.
/// * [pending] — settled but still in its holding period.
/// * [paid] — already paid out.
class EarningsSummary extends Equatable {
  const EarningsSummary({
    required this.estimatedTotal,
    required this.thisMonth,
    required this.available,
    required this.pending,
    required this.paid,
    required this.byLevel,
    required this.metrics,
    required this.reachLevel,
    required this.rewardPool,
    required this.months,
  });

  final int estimatedTotal;
  final int thisMonth;
  final int available;
  final int pending;
  final int paid;

  /// Estimated earnings by the Reach Ladder level the views came from.
  final Map<ReachLevel, int> byLevel;
  final QualifiedMetrics metrics;
  final ReachLevel reachLevel;
  final RewardPoolInfo rewardPool;
  final List<EarningsMonth> months;

  int get levelTotal => byLevel.values.fold(0, (a, b) => a + b);

  @override
  List<Object?> get props => [
    estimatedTotal,
    thisMonth,
    available,
    pending,
    paid,
    byLevel,
    metrics,
    reachLevel,
    rewardPool,
    months,
  ];
}

// -------------------------------------------------------------- analytics --

/// How one reel is doing.
class ReelPerformance extends Equatable {
  const ReelPerformance({
    required this.reelId,
    required this.title,
    required this.thumbnailSeed,
    required this.publishedAt,
    required this.views,
    required this.qualifiedReach,
    required this.qualifiedViews,
    required this.watchTimeSeconds,
    required this.avgWatchSeconds,
    required this.completionRate,
    required this.likes,
    required this.comments,
    required this.shares,
    required this.saves,
    required this.newFollowers,
    required this.estimatedEarnings,
    this.retention = const [],
    this.durationSeconds = 0,
  });

  final String reelId;
  final String title;
  final int thumbnailSeed;
  final DateTime publishedAt;
  final int views;

  /// Drives the Reach Ladder: the level is derived from this by the app's
  /// configured thresholds, not stored.
  final int qualifiedReach;
  final int qualifiedViews;
  final int watchTimeSeconds;
  final int avgWatchSeconds;

  /// 0..1: share of viewers who watched to the end.
  final double completionRate;
  final int likes;
  final int comments;
  final int shares;
  final int saves;
  final int newFollowers;
  final int estimatedEarnings;

  /// Share of viewers still watching at each tenth of the reel (0..1).
  final List<double> retention;
  final int durationSeconds;

  int get engagements => likes + comments + shares + saves;

  /// 0..1; zero when nobody viewed it yet.
  double get engagementRate => views == 0 ? 0 : engagements / views;

  /// A brand-new reel has no meaningful numbers yet.
  bool get isCollecting => views == 0;

  @override
  List<Object?> get props => [
    reelId,
    title,
    thumbnailSeed,
    publishedAt,
    views,
    qualifiedReach,
    qualifiedViews,
    watchTimeSeconds,
    avgWatchSeconds,
    completionRate,
    likes,
    comments,
    shares,
    saves,
    newFollowers,
    estimatedEarnings,
    retention,
    durationSeconds,
  ];
}

/// One slice of "where your viewers are".
class AudienceSlice extends Equatable {
  const AudienceSlice({required this.label, required this.fraction});

  final String label;

  /// 0..1.
  final double fraction;

  @override
  List<Object?> get props => [label, fraction];
}

class CreatorAnalytics extends Equatable {
  const CreatorAnalytics({
    required this.range,
    required this.viewsSeries,
    required this.reels,
    required this.audience,
    required this.followersGained,
  });

  final AnalyticsRange range;

  /// Views per day, oldest first; one entry per day of [range].
  final List<int> viewsSeries;
  final List<ReelPerformance> reels;
  final List<AudienceSlice> audience;
  final int followersGained;

  int get views => viewsSeries.fold(0, (a, b) => a + b);
  int get qualifiedViews => reels.fold(0, (a, r) => a + r.qualifiedViews);
  int get watchTimeSeconds => reels.fold(0, (a, r) => a + r.watchTimeSeconds);
  int get likes => reels.fold(0, (a, r) => a + r.likes);
  int get comments => reels.fold(0, (a, r) => a + r.comments);
  int get shares => reels.fold(0, (a, r) => a + r.shares);
  int get saves => reels.fold(0, (a, r) => a + r.saves);
  int get engagements => likes + comments + shares + saves;
  double get engagementRate {
    final v = reels.fold(0, (a, r) => a + r.views);
    return v == 0 ? 0 : engagements / v;
  }

  @override
  List<Object?> get props => [
    range,
    viewsSeries,
    reels,
    audience,
    followersGained,
  ];
}
