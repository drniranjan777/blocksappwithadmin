import 'dart:math';

import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/mock/mock_catalog.dart' show meId;
import 'package:blocks_app/data/mock/mock_factory.dart' show stableHash;
import 'package:blocks_app/data/mock/mock_music_catalog.dart';
import 'package:blocks_app/data/mock/mock_world.dart';
import 'package:blocks_app/data/models/content_models.dart';
import 'package:blocks_app/data/models/creator_models.dart';
import 'package:blocks_app/data/models/kyc_models.dart';
import 'package:blocks_app/data/models/media_models.dart';
import 'package:blocks_app/data/models/music_models.dart';
import 'package:blocks_app/data/models/payout_models.dart';
import 'package:blocks_app/data/repositories/creator_repositories.dart';
import 'package:blocks_app/features/reach/domain/reach_level.dart';

class MockCreatorConfigRepository implements CreatorConfigRepository {
  MockCreatorConfigRepository(this._w);

  final MockWorld _w;

  @override
  Future<ReelConfig> getReelConfig() async => _w.creator.reelConfig;

  @override
  Future<KycConfig> getKycConfig() async => _w.creator.kycConfig;

  @override
  Future<PayoutConfig> getPayoutConfig() async => _w.creator.payoutConfig;
}

/// Mock "Copyright and music". Production: the rights service decides whether
/// each track is usable; this mock applies the same checks to the demo
/// catalogue.
class MockCreatorMusicRepository implements CreatorMusicRepository {
  MockCreatorMusicRepository(this._w, {this.country = 'IN'});

  final MockWorld _w;
  final String country;

  /// A licence ending inside this window is flagged. Server configuration.
  static const _warnWithin = Duration(days: 30);

  static const _seedOriginals = [
    OriginalAudio(
      id: 'oa1',
      title: 'Charminar morning walk',
      duration: Duration(seconds: 24),
      reelsUsing: 14,
      reusable: false,
    ),
    OriginalAudio(
      id: 'oa2',
      title: 'Biryani point sizzle',
      duration: Duration(seconds: 12),
      reelsUsing: 3,
      reusable: false,
    ),
  ];

  List<OriginalAudio> _originals() {
    final c = _w.creator;
    final all = [
      ..._seedOriginals,
      // Every reel published here with its own sound brings its audio along.
      for (final r in _w.createdReels)
        if (r.musicTitle == 'Original audio')
          OriginalAudio(
            id: 'oa~${r.id}',
            title: r.caption.isEmpty ? r.id : r.caption,
            duration: r.duration,
            reelsUsing: 1,
            reusable: false,
          ),
    ];
    return [
      for (final a in all) a.copyWith(reusable: c.reusableAudio.contains(a.id)),
    ];
  }

  @override
  Future<CreatorMusic> getOverview() async {
    await _w.pause();
    final now = _w.now();
    final counts = Map<String, int>.of(_w.creator.musicUses);
    // Reels made in this session that used a library track.
    for (final r in _w.createdReels) {
      for (final t in kMusicCatalog) {
        if (t.title == r.musicTitle) counts[t.id] = (counts[t.id] ?? 0) + 1;
      }
    }

    final usage = <MusicUsage>[];
    for (final e in counts.entries) {
      final track = kMusicCatalog.where((t) => t.id == e.key).firstOrNull;
      if (track == null) continue;
      final expiry = track.licenseExpiry;
      if (!track.isAvailable(country: country, now: now)) {
        usage.add(
          MusicUsage(
            track: track,
            reelCount: e.value,
            status: MusicUsageStatus.unavailable,
            reason: track.rightsType == MusicRightsType.restricted
                ? 'restricted'
                : (expiry != null && !now.isBefore(expiry)
                      ? 'expired'
                      : 'region'),
          ),
        );
      } else if (expiry != null && expiry.difference(now) <= _warnWithin) {
        usage.add(
          MusicUsage(
            track: track,
            reelCount: e.value,
            status: MusicUsageStatus.expiringSoon,
          ),
        );
      } else {
        usage.add(
          MusicUsage(
            track: track,
            reelCount: e.value,
            status: MusicUsageStatus.available,
          ),
        );
      }
    }
    // What needs attention first, then the most used.
    usage.sort((a, b) {
      final byStatus = b.status.index.compareTo(a.status.index);
      return byStatus != 0 ? byStatus : b.reelCount.compareTo(a.reelCount);
    });
    return CreatorMusic(usage: usage, originals: _originals());
  }

  @override
  Future<OriginalAudio> setReusable(
    String audioId, {
    required bool reusable,
  }) async {
    await _w.pause();
    final known = _originals().where((a) => a.id == audioId).firstOrNull;
    if (known == null) throw const NotFoundFailure('Audio not found');
    if (reusable) {
      _w.creator.reusableAudio.add(audioId);
    } else {
      _w.creator.reusableAudio.remove(audioId);
    }
    return known.copyWith(reusable: reusable);
  }
}

/// Mock analytics and earnings. Production: computed by the server from
/// qualified, de-duplicated, fraud-filtered activity.
class MockCreatorInsightsRepository implements CreatorInsightsRepository {
  MockCreatorInsightsRepository(this._w);

  final MockWorld _w;

  /// The reward the creator has earned so far this cycle, by the level their
  /// views came from. Demo figures.
  static const _byLevel = {
    ReachLevel.district: 1250,
    ReachLevel.state: 4820,
    ReachLevel.national: 12420,
    ReachLevel.global: 6090,
  };

  @override
  Future<EarningsSummary> getEarnings() async {
    await _w.pause();
    final c = _w.creator;
    c.syncPayouts();
    final t = _w.now();
    final monthStart = DateTime(t.year, t.month);
    final nextMonth = DateTime(t.year, t.month + 1);
    final total = _byLevel.values.fold(0, (a, b) => a + b);
    return EarningsSummary(
      estimatedTotal: total,
      thisMonth: 8420,
      available: c.available,
      pending: c.pending,
      paid: c.paid,
      byLevel: _byLevel,
      metrics: const QualifiedMetrics(
        qualifiedViews: 842300,
        watchTimeSeconds: 453600,
        shares: 18420,
        saves: 24910,
        engagementRate: 0.067,
      ),
      reachLevel: _w.me.reachLevel,
      rewardPool: RewardPoolInfo(
        qualifiedReach: 1281392,
        periodStart: monthStart,
        periodEnd: nextMonth.subtract(const Duration(days: 1)),
      ),
      months: [
        for (var i = 5; i >= 0; i--)
          EarningsMonth(
            month: DateTime(t.year, t.month - i),
            amount: const [8420, 7950, 6710, 7080, 6340, 5120][i],
          ),
      ],
    );
  }

  @override
  Future<CreatorAnalytics> getAnalytics(AnalyticsRange range) async {
    await _w.pause();
    final reels = _myReels();
    final performances = _performances(reels);
    final rnd = Random(range.days * 31);
    final base = switch (range) {
      AnalyticsRange.days7 => 9200,
      AnalyticsRange.days28 => 8600,
      AnalyticsRange.days90 => 7900,
    };
    return CreatorAnalytics(
      range: range,
      viewsSeries: [
        for (var i = 0; i < range.days; i++)
          (base * (0.7 + 0.6 * rnd.nextDouble()) + i * 12).round(),
      ],
      reels: performances,
      audience: const [
        AudienceSlice(label: 'Hyderabad', fraction: 0.41),
        AudienceSlice(label: 'Warangal', fraction: 0.12),
        AudienceSlice(label: 'Bengaluru', fraction: 0.09),
        AudienceSlice(label: 'Visakhapatnam', fraction: 0.08),
      ],
      followersGained: switch (range) {
        AnalyticsRange.days7 => 412,
        AnalyticsRange.days28 => 1680,
        AnalyticsRange.days90 => 4210,
      },
    );
  }

  @override
  Future<ReelPerformance> getReelPerformance(String reelId) async {
    await _w.pause();
    final all = _performances(_myReels());
    for (final p in all) {
      if (p.reelId == reelId) return p;
    }
    throw NotFoundFailure('Reel $reelId not found');
  }

  /// Newly published reels first, then the seeded ones.
  List<Reel> _myReels() => [
    for (final r in _w.createdReels.reversed) _w.factory.tryReel(r.id)!,
    for (var i = 0; i < 6; i++) ?_w.factory.tryReel('r~user~$meId~$i'),
  ];

  List<ReelPerformance> _performances(List<Reel> reels) {
    final pool = _byLevel.values.fold(0, (a, b) => a + b);
    final totalReach = reels.fold(0, (a, r) => a + r.qualifiedReach);
    final now = _w.now();
    return [
      for (var i = 0; i < reels.length; i++)
        _performance(
          reels[i],
          now: now,
          index: i,
          share: totalReach == 0
              ? 0
              : (pool * reels[i].qualifiedReach / totalReach).round(),
        ),
    ];
  }

  ReelPerformance _performance(
    Reel r, {
    required DateTime now,
    required int index,
    required int share,
  }) {
    final rnd = Random(stableHash(r.id));
    final views = r.stats.views;
    final seconds = max(1, r.duration.inSeconds);
    final avgWatch = (seconds * (0.35 + 0.4 * rnd.nextDouble())).round();
    final completion = 0.2 + 0.5 * rnd.nextDouble();
    return ReelPerformance(
      reelId: r.id,
      title: r.caption,
      thumbnailSeed: int.tryParse(r.videoUrl.split('/').last) ?? index,
      publishedAt: now.subtract(Duration(days: (index + 1) * 3, hours: 2)),
      views: views,
      qualifiedReach: r.qualifiedReach,
      qualifiedViews: (views * (0.62 + 0.2 * rnd.nextDouble())).round(),
      watchTimeSeconds: views * avgWatch,
      avgWatchSeconds: avgWatch,
      completionRate: completion,
      likes: r.stats.likes,
      comments: r.stats.comments,
      shares: r.stats.shares,
      saves: r.stats.saves,
      newFollowers: (views * 0.004).round(),
      estimatedEarnings: share,
      durationSeconds: seconds,
      retention: [
        for (var i = 0; i < 10; i++)
          (1 - (1 - completion) * pow(i / 9, 0.8)).toDouble(),
      ],
    );
  }
}
