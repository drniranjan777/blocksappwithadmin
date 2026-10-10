import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/utils/number_format.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:blocks_app/data/models/creator_models.dart';
import 'package:blocks_app/features/creator/application/creator_providers.dart';
import 'package:blocks_app/features/creator/presentation/creator_analytics_screen.dart';
import 'package:blocks_app/features/creator/presentation/widgets/creator_widgets.dart';
import 'package:blocks_app/features/creator/presentation/widgets/studio_nav.dart';
import 'package:blocks_app/features/reach/domain/reach_level.dart';
import 'package:blocks_app/features/reach/presentation/reach_level_labels.dart';
import 'package:blocks_app/features/reach/presentation/widgets/reach_level_badge.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

/// Earnings, honestly labelled.
///
/// Every figure here is an **estimate** from the server's ledger until the
/// month closes. BLOCKS pays a Qualified Creator Reward from a shared pool,
/// based on quality signals, so there is no "₹ per view" anywhere.
class CreatorEarningsScreen extends ConsumerWidget {
  const CreatorEarningsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final data = ref.watch(earningsProvider);
    return StudioScaffold(
      section: StudioSection.earnings,
      body: data.when(
        loading: () => const LoadingView(),
        error: (err, _) => ErrorView(
          error: err,
          onRetry: () => ref.invalidate(earningsProvider),
        ),
        data: (e) => RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(earningsProvider);
            await ref.read(earningsProvider.future);
          },
          child: _Body(summary: e),
        ),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.summary});

  final EarningsSummary summary;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final s = summary;
    final locale = Localizations.localeOf(context).toString();
    String monthName(DateTime d) => DateFormat.MMM(locale).format(d);

    return ListView(
      padding: const EdgeInsets.all(BlocksSpacing.lg),
      children: [
        _Hero(summary: s),
        const SizedBox(height: BlocksSpacing.md),
        Row(
          children: [
            Expanded(
              child: BalanceTile(
                label: l10n.csAvailable,
                amount: s.available,
                color: context.blocks.success,
                caption: l10n.ceAvailableHint,
              ),
            ),
            const SizedBox(width: BlocksSpacing.sm),
            Expanded(
              child: BalanceTile(
                label: l10n.csPending,
                amount: s.pending,
                color: context.blocks.warning,
                caption: l10n.cePendingHint,
              ),
            ),
            const SizedBox(width: BlocksSpacing.sm),
            Expanded(
              child: BalanceTile(
                label: l10n.csPaid,
                amount: s.paid,
                color: context.scheme.primary,
                caption: l10n.cePaidHint,
              ),
            ),
          ],
        ),
        const SizedBox(height: BlocksSpacing.lg),
        StudioCard(
          title: l10n.ceByLevelTitle,
          subtitle: l10n.ceByLevelBody,
          trailing: _EstimatedTag(),
          child: Column(
            children: [
              for (final level in ReachLevel.values)
                LabeledBar(
                  label: level.label(l10n),
                  fraction: s.levelTotal == 0
                      ? 0
                      : (s.byLevel[level] ?? 0) / s.levelTotal,
                  valueLabel: formatRupees(s.byLevel[level] ?? 0),
                  color: context.blocks.reachColor(level),
                  labelWidth: 88,
                ),
              const Divider(),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      l10n.ceLevelTotal,
                      style: context.text.titleSmall,
                    ),
                  ),
                  Text(
                    formatRupees(s.levelTotal),
                    style: context.text.titleMedium,
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: BlocksSpacing.lg),
        StudioCard(
          title: l10n.ceMonthsTitle,
          child: Column(
            children: [
              BarsChart(
                values: [for (final m in s.months) m.amount],
                semanticLabel: l10n.ceMonthsLabel(formatRupees(s.thisMonth)),
              ),
              const SizedBox(height: BlocksSpacing.xs),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  for (final m in s.months)
                    Expanded(
                      child: ExcludeSemantics(
                        child: Text(
                          monthName(m.month),
                          textAlign: TextAlign.center,
                          style: context.text.labelSmall,
                        ),
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: BlocksSpacing.lg),
        _RewardCard(summary: s),
        const SizedBox(height: BlocksSpacing.lg),
        BlocksButton(
          label: l10n.ceGoToPayout,
          icon: Icons.account_balance_wallet_rounded,
          onPressed: () => context.push(Routes.payoutCenter),
        ),
        const SizedBox(height: BlocksSpacing.xl),
      ],
    );
  }
}

class _EstimatedTag extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final c = context.blocks.accent;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(BlocksRadius.pill),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
        child: Text(
          context.l10n.csEstimatedChip,
          style: context.text.labelMedium?.copyWith(
            fontWeight: FontWeight.w800,
            color: context.scheme.onSurface,
          ),
        ),
      ),
    );
  }
}

class _Hero extends StatelessWidget {
  const _Hero({required this.summary});

  final EarningsSummary summary;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = context.blocks;
    final amount = formatRupees(summary.estimatedTotal);
    final month = formatRupees(summary.thisMonth);
    return Container(
      padding: const EdgeInsets.all(BlocksSpacing.xl),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(BlocksRadius.xl),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [colors.heroTop, colors.heroBottom],
        ),
        boxShadow: BlocksShadows.lifted(colors.heroTop),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  l10n.studioEstimatedEarnings.toUpperCase(),
                  style: context.text.labelMedium?.copyWith(
                    color: colors.onHeroMuted,
                    letterSpacing: 1.4,
                  ),
                ),
              ),
              ReachLevelBadge(level: summary.reachLevel),
            ],
          ),
          const SizedBox(height: BlocksSpacing.md),
          Semantics(
            label: '${l10n.studioEstimatedEarnings}: $amount',
            excludeSemantics: true,
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: AlignmentDirectional.centerStart,
              child: Text(
                amount,
                style: context.text.displaySmall?.copyWith(
                  color: colors.onHero,
                  fontSize: 44,
                ),
              ),
            ),
          ),
          const SizedBox(height: BlocksSpacing.sm),
          Text(
            l10n.csThisMonthAmount(month),
            style: context.text.titleSmall?.copyWith(color: colors.onHero),
          ),
          const SizedBox(height: BlocksSpacing.sm),
          Text(
            l10n.ceHeroNote,
            style: context.text.bodySmall?.copyWith(color: colors.onHeroMuted),
          ),
        ],
      ),
    );
  }
}

/// "Qualified Creator Reward": what actually earns money, and the shared
/// reward pool it comes from. Never a flat rate.
class _RewardCard extends StatelessWidget {
  const _RewardCard({required this.summary});

  final EarningsSummary summary;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final m = summary.metrics;
    final pool = summary.rewardPool;
    final locale = Localizations.localeOf(context).toString();
    final period =
        '${DateFormat.MMMd(locale).format(pool.periodStart)} – '
        '${DateFormat.MMMd(locale).format(pool.periodEnd)}';

    return StudioCard(
      title: l10n.ceRewardTitle,
      subtitle: l10n.ceRewardBody,
      trailing: pool.isEstimate ? _EstimatedTag() : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          MetricGrid(
            children: [
              MetricTile(
                icon: Icons.verified_rounded,
                label: l10n.caQualifiedViews,
                value: compactCount(m.qualifiedViews),
                color: context.blocks.success,
              ),
              MetricTile(
                icon: Icons.timer_rounded,
                label: l10n.caWatchTime,
                value: watchTimeLabel(l10n, m.watchTimeSeconds),
              ),
              MetricTile(
                icon: Icons.share_rounded,
                label: l10n.caShares,
                value: compactCount(m.shares),
              ),
              MetricTile(
                icon: Icons.bookmark_rounded,
                label: l10n.caSaves,
                value: compactCount(m.saves),
              ),
              MetricTile(
                icon: Icons.favorite_rounded,
                label: l10n.caEngagement,
                value: percentLabel(m.engagementRate),
                color: context.blocks.reachGlobal,
              ),
              MetricTile(
                icon: Icons.stacked_line_chart_rounded,
                label: l10n.ceReachLevel,
                value: summary.reachLevel.code,
                caption: summary.reachLevel.label(l10n),
                color: context.blocks.reachColor(summary.reachLevel),
              ),
            ],
          ),
          const SizedBox(height: BlocksSpacing.lg),
          Container(
            padding: const EdgeInsets.all(BlocksSpacing.md),
            decoration: BoxDecoration(
              color: context.scheme.primaryContainer.withValues(alpha: 0.5),
              borderRadius: BlocksRadius.lgAll,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(
                      Icons.water_drop_rounded,
                      color: context.scheme.primary,
                    ),
                    const SizedBox(width: BlocksSpacing.sm),
                    Expanded(
                      child: Text(
                        l10n.cePoolTitle,
                        style: context.text.titleSmall,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: BlocksSpacing.xs),
                Text(
                  l10n.cePoolBody(compactCount(pool.qualifiedReach), period),
                  style: context.text.bodyMedium,
                ),
                const SizedBox(height: BlocksSpacing.xs),
                Text(l10n.cePoolNote, style: context.text.bodySmall),
              ],
            ),
          ),
          const SizedBox(height: BlocksSpacing.md),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton.icon(
              onPressed: () => _showHow(context),
              icon: const Icon(Icons.help_outline_rounded),
              label: Text(l10n.ceHowItWorks),
            ),
          ),
        ],
      ),
    );
  }

  void _showHow(BuildContext context) {
    final l10n = context.l10n;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(
            BlocksSpacing.lg,
            0,
            BlocksSpacing.lg,
            BlocksSpacing.xl,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Semantics(
                header: true,
                child: Text(l10n.ceHowTitle, style: ctx.text.titleLarge),
              ),
              const SizedBox(height: BlocksSpacing.md),
              for (final (i, line) in [
                l10n.ceHow1,
                l10n.ceHow2,
                l10n.ceHow3,
                l10n.ceHow4,
              ].indexed)
                Padding(
                  padding: const EdgeInsets.only(bottom: BlocksSpacing.md),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      CircleAvatar(
                        radius: 13,
                        backgroundColor: ctx.scheme.primaryContainer,
                        child: Text(
                          '${i + 1}',
                          style: ctx.text.labelLarge?.copyWith(
                            color: ctx.scheme.onPrimaryContainer,
                          ),
                        ),
                      ),
                      const SizedBox(width: BlocksSpacing.md),
                      Expanded(child: Text(line, style: ctx.text.bodyMedium)),
                    ],
                  ),
                ),
              Text(l10n.ceHowDisclaimer, style: ctx.text.bodySmall),
            ],
          ),
        ),
      ),
    );
  }
}
