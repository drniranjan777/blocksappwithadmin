import 'package:blocks_app/data/models/creator_models.dart';
import 'package:blocks_app/data/models/kyc_models.dart';
import 'package:blocks_app/data/models/media_models.dart';
import 'package:blocks_app/data/models/music_models.dart';
import 'package:blocks_app/data/models/payout_models.dart';

/// Server-controlled limits and rules for creators. Nothing in the UI
/// hard-codes a number from here: reel length, accepted documents, payout
/// minimum and timings all arrive through this repository, so they can change
/// per country, per creator tier or per season without an app release.
abstract interface class CreatorConfigRepository {
  Future<ReelConfig> getReelConfig();
  Future<KycConfig> getKycConfig();
  Future<PayoutConfig> getPayoutConfig();
}

/// What the creator sees about their performance and earnings.
///
/// All figures are computed by the server from qualified activity. The app
/// shows them as **estimates** until a period closes, and never works out
/// money from views itself.
/// The creator's own music: tracks used, whether each can still be used,
/// and their original audio.
abstract interface class CreatorMusicRepository {
  Future<CreatorMusic> getOverview();

  /// Lets others reuse (or stops them reusing) an original audio. Throws
  /// `NotFoundFailure` for an audio that is not the creator's.
  Future<OriginalAudio> setReusable(String audioId, {required bool reusable});
}

abstract interface class CreatorInsightsRepository {
  Future<EarningsSummary> getEarnings();

  Future<CreatorAnalytics> getAnalytics(AnalyticsRange range);

  /// Throws `NotFoundFailure` for an unknown reel.
  Future<ReelPerformance> getReelPerformance(String reelId);
}
