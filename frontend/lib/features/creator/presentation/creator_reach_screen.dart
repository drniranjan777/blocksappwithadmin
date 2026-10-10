import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/utils/number_format.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:blocks_app/data/models/creator_models.dart';
import 'package:blocks_app/features/creator/application/creator_providers.dart';
import 'package:blocks_app/features/creator/presentation/widgets/creator_widgets.dart';
import 'package:blocks_app/features/creator/presentation/widgets/studio_nav.dart';
import 'package:blocks_app/features/reach/application/reach_providers.dart';
import 'package:blocks_app/features/reach/domain/reach_config.dart';
import 'package:blocks_app/features/reach/domain/reach_level.dart';
import 'package:blocks_app/features/reach/domain/reach_progress.dart';
import 'package:blocks_app/features/reach/presentation/reach_level_labels.dart';
import 'package:blocks_app/features/reach/presentation/widgets/reach_ladder.dart';
import 'package:blocks_app/features/reach/presentation/widgets/reach_level_badge.dart';
import 'package:blocks_app/l10n/gen/app_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// The Reach Ladder, for the creator and for each reel: where you are, what
/// each level means, and how far to the next. Thresholds come from server
/// configuration, never from this file.
class CreatorReachScreen extends ConsumerWidget {
  const CreatorReachScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final dash = ref.watch(creatorDashboardProvider);
    final analytics = ref.watch(analyticsProvider(AnalyticsRange.days28));
    final calc = ref.watch(reachCalculatorProvider);
    final config =
        ref.watch(reachConfigProvider).value ?? const ReachConfig.demo();

    return StudioScaffold(
      section: StudioSection.reach,
      body: dash.when(
        loading: () => const LoadingView(),
        error: (_, _) =>
            ErrorView(onRetry: () => ref.invalidate(creatorDashboardProvider)),
        data: (d) {
          final mine = calc.evaluate(d.qualifiedReach30d);
          return ListView(
            padding: const EdgeInsets.all(BlocksSpacing.lg),
            children: [
              StudioCard(
                title: l10n.crYourLevel,
                trailing: ReachLevelBadge(level: mine.current),
                subtitle: l10n.crYourLevelBody(
                  compactCount(d.qualifiedReach30d),
                ),
                child: ReachLadder(progress: mine),
              ),
              const SizedBox(height: BlocksSpacing.lg),
              StudioCard(
                title: l10n.crLevelsTitle,
                subtitle: l10n.crLevelsBody,
                child: Column(
                  children: [
                    for (final level in ReachLevel.values)
                      _LevelRow(
                        level: level,
                        range: _range(l10n, config, level),
                        reached: mine.current.isAtLeast(level),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: BlocksSpacing.lg),
              StudioCard(
                title: l10n.studioReachPerformance,
                subtitle: l10n.studioReachPerformanceBody,
                child: Column(
                  children: [
                    for (final level in ReachLevel.values)
                      LabeledBar(
                        label: level.label(l10n),
                        fraction: d.coverage[level] ?? 0,
                        valueLabel:
                            '${((d.coverage[level] ?? 0) * 100).round()}%',
                        color: context.blocks.reachColor(level),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: BlocksSpacing.lg),
              StudioCard(
                title: l10n.crReelsTitle,
                subtitle: l10n.crReelsBody,
                child: analytics.when(
                  loading: () => const Padding(
                    padding: EdgeInsets.all(BlocksSpacing.lg),
                    child: LoadingView(),
                  ),
                  error: (_, _) => ErrorView(
                    onRetry: () => ref.invalidate(
                      analyticsProvider(AnalyticsRange.days28),
                    ),
                  ),
                  data: (a) => Column(
                    children: [
                      for (final r in a.reels)
                        _ReelReachRow(
                          title: r.title,
                          progress: calc.evaluate(r.qualifiedReach),
                        ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: BlocksSpacing.lg),
              StudioCard(
                title: l10n.crQualifiedTitle,
                child: Text(
                  l10n.crQualifiedBody,
                  style: context.text.bodyMedium,
                ),
              ),
              const SizedBox(height: BlocksSpacing.xl),
            ],
          );
        },
      ),
    );
  }

  /// "10,001 – 100,000 qualified reach", or "1,000,001+ ..." at the top.
  String _range(AppLocalizations l10n, ReachConfig config, ReachLevel level) {
    final from = config.thresholdFor(level);
    final next = level.next;
    return next == null
        ? l10n.crRangeOpen(groupIndian(from))
        : l10n.crRange(
            groupIndian(from),
            groupIndian(config.thresholdFor(next) - 1),
          );
  }
}

class _LevelRow extends StatelessWidget {
  const _LevelRow({
    required this.level,
    required this.range,
    required this.reached,
  });

  final ReachLevel level;
  final String range;
  final bool reached;

  @override
  Widget build(BuildContext context) {
    final color = context.blocks.reachColor(level);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: BlocksSpacing.xs),
      child: Row(
        children: [
          ReachLevelBadge(level: level, isLocked: !reached),
          const SizedBox(width: BlocksSpacing.md),
          Expanded(child: Text(range, style: context.text.bodyMedium)),
          Icon(
            reached ? Icons.check_circle_rounded : Icons.lock_outline_rounded,
            size: 20,
            color: reached ? color : context.scheme.outline,
            semanticLabel: reached
                ? context.l10n.crLevelReached
                : context.l10n.crLevelLocked,
          ),
        ],
      ),
    );
  }
}

class _ReelReachRow extends StatelessWidget {
  const _ReelReachRow({required this.title, required this.progress});

  final String title;
  final ReachProgress progress;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final next = progress.next;
    final color = context.blocks.reachColor(next ?? progress.current);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: BlocksSpacing.sm),
      child: Semantics(
        container: true,
        label: next == null
            ? l10n.crReelTop(title)
            : l10n.crReelProgress(
                title,
                progress.current.label(l10n),
                compactCount(progress.remainingToNext),
                next.label(l10n),
              ),
        excludeSemantics: true,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                ReachLevelBadge(
                  level: progress.current,
                  showName: false,
                  dense: true,
                ),
                const SizedBox(width: BlocksSpacing.sm),
                Expanded(
                  child: Text(
                    title.isEmpty ? l10n.csNoCaption : title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: context.text.titleSmall,
                  ),
                ),
                Text(
                  compactCount(progress.qualifiedReach),
                  style: context.text.labelLarge,
                ),
              ],
            ),
            const SizedBox(height: 6),
            ClipRRect(
              borderRadius: BorderRadius.circular(BlocksRadius.pill),
              child: LinearProgressIndicator(
                value: progress.fractionToNext,
                minHeight: 8,
                color: color,
                backgroundColor: color.withValues(alpha: 0.14),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              next == null
                  ? l10n.crTopLevel
                  : l10n.crToNext(
                      compactCount(progress.remainingToNext),
                      next.label(l10n),
                    ),
              style: context.text.labelSmall,
            ),
          ],
        ),
      ),
    );
  }
}
