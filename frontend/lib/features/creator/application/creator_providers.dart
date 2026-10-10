import 'package:blocks_app/data/models/business_models.dart';
import 'package:blocks_app/data/models/creator_models.dart';
import 'package:blocks_app/data/models/music_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final creatorDashboardProvider = FutureProvider<CreatorDashboard>(
  (ref) => ref.watch(creatorRepositoryProvider).getDashboard(),
);

/// Earnings as the server's ledger reports them (estimates until a period
/// closes). The app never derives money from views itself.
final earningsProvider = FutureProvider.autoDispose<EarningsSummary>(
  (ref) => ref.watch(creatorInsightsRepositoryProvider).getEarnings(),
);

final analyticsProvider = FutureProvider.autoDispose
    .family<CreatorAnalytics, AnalyticsRange>(
      (ref, range) =>
          ref.watch(creatorInsightsRepositoryProvider).getAnalytics(range),
    );

final reelPerformanceProvider = FutureProvider.autoDispose
    .family<ReelPerformance, String>(
      (ref, reelId) => ref
          .watch(creatorInsightsRepositoryProvider)
          .getReelPerformance(reelId),
    );

/// The creator's tracks (and whether each is still usable) and original audio.
final creatorMusicProvider = FutureProvider.autoDispose<CreatorMusic>(
  (ref) => ref.watch(creatorMusicRepositoryProvider).getOverview(),
);
