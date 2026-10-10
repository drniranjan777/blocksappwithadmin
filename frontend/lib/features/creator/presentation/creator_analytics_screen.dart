import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/utils/number_format.dart';
import 'package:blocks_app/core/widgets/blocks_image.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:blocks_app/data/models/creator_models.dart';
import 'package:blocks_app/features/creator/application/creator_providers.dart';
import 'package:blocks_app/features/creator/presentation/widgets/creator_widgets.dart';
import 'package:blocks_app/features/creator/presentation/widgets/studio_nav.dart';
import 'package:blocks_app/features/reach/application/reach_providers.dart';
import 'package:blocks_app/features/reach/presentation/widgets/reach_ladder.dart';
import 'package:blocks_app/features/reach/presentation/widgets/reach_level_badge.dart';
import 'package:blocks_app/l10n/gen/app_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// "126 h" / "42 min" for a watch-time total.
String watchTimeLabel(AppLocalizations l10n, int seconds) {
  if (seconds >= 3600) return l10n.caHours((seconds / 3600).round());
  return l10n.caMinutes((seconds / 60).round());
}

String percentLabel(double fraction) =>
    '${(fraction * 100).toStringAsFixed(1)}%';

/// How the creator's reels are doing over 7, 28 or 90 days.
class CreatorAnalyticsScreen extends ConsumerStatefulWidget {
  const CreatorAnalyticsScreen({super.key});

  @override
  ConsumerState<CreatorAnalyticsScreen> createState() =>
      _CreatorAnalyticsScreenState();
}

class _CreatorAnalyticsScreenState
    extends ConsumerState<CreatorAnalyticsScreen> {
  AnalyticsRange _range = AnalyticsRange.days28;

  String _rangeLabel(AppLocalizations l, AnalyticsRange r) => switch (r) {
    AnalyticsRange.days7 => l.caRange7,
    AnalyticsRange.days28 => l.caRange28,
    AnalyticsRange.days90 => l.caRange90,
  };

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final data = ref.watch(analyticsProvider(_range));

    return StudioScaffold(
      section: StudioSection.analytics,
      body: ListView(
        padding: const EdgeInsets.all(BlocksSpacing.lg),
        children: [
          Semantics(
            container: true,
            label: l10n.caRangeLabel,
            child: SegmentedButton<AnalyticsRange>(
              showSelectedIcon: false,
              segments: [
                for (final r in AnalyticsRange.values)
                  ButtonSegment(value: r, label: Text(_rangeLabel(l10n, r))),
              ],
              selected: {_range},
              onSelectionChanged: (v) => setState(() => _range = v.first),
            ),
          ),
          const SizedBox(height: BlocksSpacing.lg),
          data.when(
            loading: () => const Padding(
              padding: EdgeInsets.symmetric(vertical: BlocksSpacing.huge),
              child: LoadingView(),
            ),
            error: (err, _) => Padding(
              padding: const EdgeInsets.symmetric(vertical: BlocksSpacing.xl),
              child: ErrorView(
                error: err,
                onRetry: () => ref.invalidate(analyticsProvider(_range)),
              ),
            ),
            data: (a) => _Content(analytics: a),
          ),
        ],
      ),
    );
  }
}

class _Content extends ConsumerWidget {
  const _Content({required this.analytics});

  final CreatorAnalytics analytics;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final a = analytics;
    final audienceShare = a.audience.fold<double>(0, (s, x) => s + x.fraction);
    final reels = [...a.reels]..sort((x, y) => y.views.compareTo(x.views));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        StudioCard(
          title: l10n.caViewsChartTitle,
          subtitle: l10n.caViewsChartSubtitle(
            compactCount(a.views),
            a.range.days,
          ),
          child: BarsChart(
            values: a.viewsSeries,
            semanticLabel: l10n.caViewsChartLabel(
              a.range.days,
              compactCount(a.views),
            ),
          ),
        ),
        const SizedBox(height: BlocksSpacing.lg),
        MetricGrid(
          children: [
            MetricTile(
              icon: Icons.visibility_rounded,
              label: l10n.caViews,
              value: compactCount(a.views),
            ),
            MetricTile(
              icon: Icons.verified_rounded,
              label: l10n.caQualifiedViews,
              value: compactCount(a.qualifiedViews),
              color: context.blocks.success,
            ),
            MetricTile(
              icon: Icons.timer_rounded,
              label: l10n.caWatchTime,
              value: watchTimeLabel(l10n, a.watchTimeSeconds),
            ),
            MetricTile(
              icon: Icons.favorite_rounded,
              label: l10n.caEngagement,
              value: percentLabel(a.engagementRate),
              color: context.blocks.reachGlobal,
            ),
            MetricTile(
              icon: Icons.thumb_up_alt_rounded,
              label: l10n.caLikes,
              value: compactCount(a.likes),
            ),
            MetricTile(
              icon: Icons.chat_bubble_rounded,
              label: l10n.caComments,
              value: compactCount(a.comments),
            ),
            MetricTile(
              icon: Icons.share_rounded,
              label: l10n.caShares,
              value: compactCount(a.shares),
            ),
            MetricTile(
              icon: Icons.bookmark_rounded,
              label: l10n.caSaves,
              value: compactCount(a.saves),
            ),
            MetricTile(
              icon: Icons.person_add_alt_1_rounded,
              label: l10n.caFollowers,
              value: compactCount(a.followersGained),
              color: context.blocks.reachDistrict,
            ),
          ],
        ),
        const SizedBox(height: BlocksSpacing.lg),
        StudioCard(
          title: l10n.caAudienceTitle,
          child: Column(
            children: [
              for (final s in a.audience)
                LabeledBar(
                  label: s.label,
                  fraction: s.fraction,
                  valueLabel: '${(s.fraction * 100).round()}%',
                  color: context.scheme.primary,
                ),
              if (audienceShare < 1)
                LabeledBar(
                  label: l10n.caAudienceOther,
                  fraction: 1 - audienceShare,
                  valueLabel: '${((1 - audienceShare) * 100).round()}%',
                  color: context.scheme.outline,
                ),
            ],
          ),
        ),
        const SizedBox(height: BlocksSpacing.lg),
        StudioCard(
          title: l10n.caReelsTitle,
          subtitle: l10n.caReelsHint,
          child: Column(
            children: [for (final r in reels) _ReelPerformanceRow(reel: r)],
          ),
        ),
        const SizedBox(height: BlocksSpacing.xl),
      ],
    );
  }
}

class _ReelPerformanceRow extends ConsumerWidget {
  const _ReelPerformanceRow({required this.reel});

  final ReelPerformance reel;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final level = ref
        .watch(reachCalculatorProvider)
        .evaluate(reel.qualifiedReach)
        .current;
    return Semantics(
      button: true,
      label: reel.isCollecting
          ? '${reel.title}. ${l10n.caCollecting}'
          : l10n.csReelRowLabel(reel.title, compactCount(reel.views)),
      excludeSemantics: true,
      child: InkWell(
        borderRadius: BlocksRadius.mdAll,
        onTap: () => context.push(Routes.reelAnalytics(reel.reelId)),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: BlocksSpacing.sm),
          child: Row(
            children: [
              ClipRRect(
                borderRadius: BlocksRadius.smAll,
                child: SizedBox(
                  width: 44,
                  height: 72,
                  child: BlocksImage(
                    url: 'demo://reel/${reel.thumbnailSeed}',
                    variant: ImageVariant.thumbnail,
                  ),
                ),
              ),
              const SizedBox(width: BlocksSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      reel.title.isEmpty ? l10n.csNoCaption : reel.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: context.text.titleSmall,
                    ),
                    const SizedBox(height: 4),
                    if (reel.isCollecting)
                      Text(l10n.caCollecting, style: context.text.labelMedium)
                    else
                      Wrap(
                        spacing: BlocksSpacing.md,
                        runSpacing: 2,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          ReachLevelBadge(
                            level: level,
                            showName: false,
                            dense: true,
                          ),
                          Text(
                            l10n.csViewsCount(compactCount(reel.views)),
                            style: context.text.labelMedium,
                          ),
                          Text(
                            l10n.caCompletionShort(
                              percentLabel(reel.completionRate),
                            ),
                            style: context.text.labelMedium,
                          ),
                        ],
                      ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded),
            ],
          ),
        ),
      ),
    );
  }
}

/// One reel's full numbers: reach level, retention and estimated earnings.
class ReelAnalyticsScreen extends ConsumerWidget {
  const ReelAnalyticsScreen({required this.reelId, super.key});

  final String reelId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final data = ref.watch(reelPerformanceProvider(reelId));

    return Scaffold(
      appBar: AppBar(title: Text(l10n.caReelTitle)),
      body: SafeArea(
        child: data.when(
          loading: () => const LoadingView(),
          error: (err, _) => ErrorView(
            error: err,
            onRetry: () => ref.invalidate(reelPerformanceProvider(reelId)),
          ),
          data: (r) {
            final progress = ref
                .watch(reachCalculatorProvider)
                .evaluate(r.qualifiedReach);
            return ListView(
              padding: const EdgeInsets.all(BlocksSpacing.lg),
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ClipRRect(
                      borderRadius: BlocksRadius.mdAll,
                      child: SizedBox(
                        width: 72,
                        height: 128,
                        child: BlocksImage(
                          url: 'demo://reel/${r.thumbnailSeed}',
                          variant: ImageVariant.thumbnail,
                        ),
                      ),
                    ),
                    const SizedBox(width: BlocksSpacing.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            r.title.isEmpty ? l10n.csNoCaption : r.title,
                            maxLines: 4,
                            overflow: TextOverflow.ellipsis,
                            style: context.text.titleMedium,
                          ),
                          const SizedBox(height: BlocksSpacing.sm),
                          ReachLevelBadge(level: progress.current),
                          const SizedBox(height: BlocksSpacing.xs),
                          Text(
                            l10n.caQualifiedReachIs(
                              compactCount(r.qualifiedReach),
                            ),
                            style: context.text.labelLarge,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: BlocksSpacing.lg),
                if (r.isCollecting)
                  StudioCard(
                    title: l10n.caCollecting,
                    child: Text(
                      l10n.caCollectingBody,
                      style: context.text.bodyMedium,
                    ),
                  )
                else ...[
                  StudioCard(
                    title: l10n.caReachTitle,
                    subtitle: l10n.caReachBody,
                    child: ReachLadder(progress: progress),
                  ),
                  const SizedBox(height: BlocksSpacing.lg),
                  MetricGrid(
                    children: [
                      MetricTile(
                        icon: Icons.visibility_rounded,
                        label: l10n.caViews,
                        value: compactCount(r.views),
                      ),
                      MetricTile(
                        icon: Icons.verified_rounded,
                        label: l10n.caQualifiedViews,
                        value: compactCount(r.qualifiedViews),
                        color: context.blocks.success,
                      ),
                      MetricTile(
                        icon: Icons.timer_rounded,
                        label: l10n.caAvgWatch,
                        value: l10n.caSecondsOf(
                          r.avgWatchSeconds,
                          r.durationSeconds,
                        ),
                      ),
                      MetricTile(
                        icon: Icons.flag_rounded,
                        label: l10n.caCompletion,
                        value: percentLabel(r.completionRate),
                      ),
                      MetricTile(
                        icon: Icons.thumb_up_alt_rounded,
                        label: l10n.caLikes,
                        value: compactCount(r.likes),
                      ),
                      MetricTile(
                        icon: Icons.chat_bubble_rounded,
                        label: l10n.caComments,
                        value: compactCount(r.comments),
                      ),
                      MetricTile(
                        icon: Icons.share_rounded,
                        label: l10n.caShares,
                        value: compactCount(r.shares),
                      ),
                      MetricTile(
                        icon: Icons.bookmark_rounded,
                        label: l10n.caSaves,
                        value: compactCount(r.saves),
                      ),
                      MetricTile(
                        icon: Icons.person_add_alt_1_rounded,
                        label: l10n.caFollowers,
                        value: compactCount(r.newFollowers),
                        color: context.blocks.reachDistrict,
                      ),
                      MetricTile(
                        icon: Icons.payments_rounded,
                        label: l10n.caEstEarnings,
                        value: formatRupees(r.estimatedEarnings),
                        caption: l10n.csEstimatedChip,
                        color: context.blocks.accent,
                      ),
                    ],
                  ),
                  const SizedBox(height: BlocksSpacing.lg),
                  StudioCard(
                    title: l10n.caRetentionTitle,
                    subtitle: l10n.caRetentionBody,
                    child: RetentionChart(
                      points: r.retention,
                      semanticLabel: l10n.caRetentionLabel(
                        percentLabel(r.completionRate),
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: BlocksSpacing.xl),
              ],
            );
          },
        ),
      ),
    );
  }
}
