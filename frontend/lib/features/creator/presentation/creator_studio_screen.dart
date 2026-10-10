import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/utils/number_format.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/core/widgets/blocks_image.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:blocks_app/data/models/business_models.dart';
import 'package:blocks_app/data/models/creator_models.dart';
import 'package:blocks_app/data/models/payout_models.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/features/creator/application/creator_providers.dart';
import 'package:blocks_app/features/creator/presentation/widgets/creator_widgets.dart';
import 'package:blocks_app/features/creator/presentation/widgets/studio_nav.dart';
import 'package:blocks_app/features/payout/application/payout_providers.dart';
import 'package:blocks_app/features/profile/application/profile_controllers.dart';
import 'package:blocks_app/features/profile/application/user_providers.dart';
import 'package:blocks_app/features/reach/application/reach_providers.dart';
import 'package:blocks_app/features/reach/domain/reach_level.dart';
import 'package:blocks_app/features/reach/domain/reach_progress.dart';
import 'package:blocks_app/features/reach/presentation/reach_level_labels.dart';
import 'package:blocks_app/features/reach/presentation/widgets/reach_ladder.dart';
import 'package:blocks_app/features/reach/presentation/widgets/reach_level_badge.dart';
import 'package:blocks_app/features/reel_studio/application/reel_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Creator Studio's Overview: what you have earned (an estimate), what you can
/// withdraw, how to get paid, and a way into every other section.
class CreatorStudioScreen extends ConsumerWidget {
  const CreatorStudioScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dash = ref.watch(creatorDashboardProvider);
    final earnings = ref.watch(earningsProvider);

    Future<void> refresh() async {
      ref
        ..invalidate(creatorDashboardProvider)
        ..invalidate(earningsProvider)
        ..invalidate(payoutOverviewProvider)
        ..invalidate(reelDraftsProvider)
        ..invalidate(currentUserProvider);
      await ref.read(creatorDashboardProvider.future);
    }

    return StudioScaffold(
      section: StudioSection.overview,
      body: dash.hasError || earnings.hasError
          ? ErrorView(onRetry: refresh)
          : !dash.hasValue || !earnings.hasValue
          ? const LoadingView()
          : RefreshIndicator(
              onRefresh: refresh,
              child: _Body(
                dashboard: dash.requireValue,
                earnings: earnings.requireValue,
              ),
            ),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body({required this.dashboard, required this.earnings});

  final CreatorDashboard dashboard;
  final EarningsSummary earnings;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final calc = ref.watch(reachCalculatorProvider);
    final milestone = calc.evaluate(dashboard.bestPostQualifiedReach);

    return ListView(
      padding: const EdgeInsets.all(BlocksSpacing.lg),
      children: [
        _EarningsHero(summary: earnings),
        const SizedBox(height: BlocksSpacing.md),
        _BalanceRow(summary: earnings),
        const SizedBox(height: BlocksSpacing.lg),
        const _PayoutSetupCard(),
        const SizedBox(height: BlocksSpacing.xl),
        const _StudioMenu(),
        const SizedBox(height: BlocksSpacing.xl),
        _StatGrid(dashboard: dashboard),
        const SizedBox(height: BlocksSpacing.xl),
        _Section(
          title: l10n.studioReachPerformance,
          subtitle: l10n.studioReachPerformanceBody,
          child: _CoverageBars(coverage: dashboard.coverage),
        ),
        const SizedBox(height: BlocksSpacing.lg),
        _MilestoneCard(progress: milestone),
        const SizedBox(height: BlocksSpacing.xl),
        _TopPosts(),
        const SizedBox(height: BlocksSpacing.xl),
      ],
    );
  }
}

class _EarningsHero extends StatelessWidget {
  const _EarningsHero({required this.summary});

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
          Semantics(
            label: '${l10n.csThisMonth}: $month',
            excludeSemantics: true,
            child: Row(
              children: [
                Icon(
                  Icons.calendar_month_rounded,
                  size: 16,
                  color: colors.onHeroMuted,
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    l10n.csThisMonthAmount(month),
                    style: context.text.titleSmall?.copyWith(
                      color: colors.onHero,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: BlocksSpacing.sm),
          Text(
            l10n.studioEarningsNote,
            style: context.text.bodySmall?.copyWith(color: colors.onHeroMuted),
          ),
        ],
      ),
    );
  }
}

/// Available · Pending · Paid.
class _BalanceRow extends StatelessWidget {
  const _BalanceRow({required this.summary});

  final EarningsSummary summary;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Row(
      children: [
        Expanded(
          child: BalanceTile(
            label: l10n.csAvailable,
            amount: summary.available,
            color: context.blocks.success,
          ),
        ),
        const SizedBox(width: BlocksSpacing.sm),
        Expanded(
          child: BalanceTile(
            label: l10n.csPending,
            amount: summary.pending,
            color: context.blocks.warning,
          ),
        ),
        const SizedBox(width: BlocksSpacing.sm),
        Expanded(
          child: BalanceTile(
            label: l10n.csPaid,
            amount: summary.paid,
            color: context.scheme.primary,
          ),
        ),
      ],
    );
  }
}

/// "Get paid" progress, or "Ready to withdraw". The checks are the server's.
class _PayoutSetupCard extends ConsumerWidget {
  const _PayoutSetupCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final overview = ref.watch(payoutOverviewProvider).value;
    if (overview == null) return const SizedBox.shrink();
    final e = overview.eligibility;
    final ready = e.isEligible;

    Widget step(String label, {required bool done}) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Icon(
            done
                ? Icons.check_circle_rounded
                : Icons.radio_button_unchecked_rounded,
            size: 18,
            color: done ? context.blocks.success : context.scheme.outline,
          ),
          const SizedBox(width: BlocksSpacing.sm),
          Expanded(child: Text(label, style: context.text.bodyMedium)),
          if (done) Text(l10n.csStepDone, style: context.text.labelSmall),
        ],
      ),
    );

    return _Section(
      title: ready ? l10n.csPayoutReadyTitle : l10n.csPayoutSetupTitle,
      subtitle: ready
          ? l10n.csPayoutReadyBody(formatRupees(overview.available))
          : l10n.csPayoutSetupBody(formatRupees(overview.config.minimumAmount)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          step(
            l10n.csStepIdentity,
            done: e.isMet(EligibilityCheck.identityVerified),
          ),
          step(l10n.csStepBank, done: e.isMet(EligibilityCheck.bankVerified)),
          step(l10n.csStepWithdraw, done: overview.paid > 0 && ready),
          const SizedBox(height: BlocksSpacing.md),
          BlocksButton(
            label: ready ? l10n.csRequestPayout : l10n.csSetUpPayouts,
            icon: ready ? Icons.send_rounded : Icons.arrow_forward_rounded,
            onPressed: () => context.push(
              ready ? Routes.requestPayout : Routes.payoutCenter,
            ),
          ),
        ],
      ),
    );
  }
}

/// A way into every other part of the studio.
class _StudioMenu extends ConsumerWidget {
  const _StudioMenu();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final drafts = ref.watch(reelDraftsProvider).value?.length;
    final tiles = <(StudioSection, String)>[
      (StudioSection.reels, l10n.csHintReels),
      (StudioSection.posts, l10n.csHintPosts),
      (
        StudioSection.drafts,
        drafts == null ? l10n.csHintDrafts : l10n.csHintDraftsCount(drafts),
      ),
      (StudioSection.analytics, l10n.csHintAnalytics),
      (StudioSection.reach, l10n.csHintReach),
      (StudioSection.earnings, l10n.csHintEarnings),
      (StudioSection.payout, l10n.csHintPayout),
    ];
    return _Section(
      title: l10n.csMenuTitle,
      child: LayoutBuilder(
        builder: (context, c) {
          final w = (c.maxWidth - BlocksSpacing.md) / 2;
          return Wrap(
            spacing: BlocksSpacing.md,
            runSpacing: BlocksSpacing.md,
            children: [
              for (final (section, hint) in tiles)
                SizedBox(
                  width: w,
                  child: Semantics(
                    button: true,
                    label: '${section.label(context)}. $hint',
                    excludeSemantics: true,
                    child: Material(
                      color: context.scheme.primaryContainer.withValues(
                        alpha: 0.5,
                      ),
                      borderRadius: BorderRadius.circular(BlocksRadius.lg),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(BlocksRadius.lg),
                        onTap: () => context.push(section.route),
                        child: Padding(
                          padding: const EdgeInsets.all(BlocksSpacing.md),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(section.icon, color: context.scheme.primary),
                              const SizedBox(height: BlocksSpacing.sm),
                              Text(
                                section.label(context),
                                style: context.text.titleSmall,
                              ),
                              Text(
                                hint,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: context.text.bodySmall,
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _StatGrid extends StatelessWidget {
  const _StatGrid({required this.dashboard});

  final CreatorDashboard dashboard;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    String pct(ReachLevel l) =>
        '${((dashboard.coverage[l] ?? 0) * 100).round()}%';

    final cards = [
      (
        Icons.people_alt_rounded,
        l10n.studioFollowers,
        compactCount(dashboard.followers),
        null,
        null,
      ),
      (
        Icons.trending_up_rounded,
        l10n.studioQualifiedReach,
        compactCount(dashboard.qualifiedReach30d),
        l10n.studioLast30,
        null,
      ),
      for (final level in ReachLevel.values)
        (
          Icons.location_on_rounded,
          l10n.studioLevelReach(level.label(l10n)),
          pct(level),
          null,
          level,
        ),
    ];

    return LayoutBuilder(
      builder: (context, c) {
        final w = (c.maxWidth - BlocksSpacing.md) / 2;
        return Wrap(
          spacing: BlocksSpacing.md,
          runSpacing: BlocksSpacing.md,
          children: [
            for (final (icon, label, value, sub, level) in cards)
              SizedBox(
                width: w,
                child: _StatCard(
                  icon: icon,
                  label: label,
                  value: value,
                  caption: sub,
                  color: level == null
                      ? context.scheme.primary
                      : context.blocks.reachColor(level),
                ),
              ),
          ],
        );
      },
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
    this.caption,
  });

  final IconData icon;
  final String label;
  final String value;
  final String? caption;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      label: '$label: $value',
      excludeSemantics: true,
      child: Container(
        padding: const EdgeInsets.all(BlocksSpacing.lg),
        decoration: BoxDecoration(
          color: context.scheme.surface,
          borderRadius: BorderRadius.circular(BlocksRadius.lg),
          border: Border.all(color: context.scheme.outlineVariant),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(BlocksRadius.md),
              ),
              child: Icon(icon, color: color, size: 20),
            ),
            const SizedBox(height: BlocksSpacing.md),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: AlignmentDirectional.centerStart,
              child: Text(value, style: context.text.headlineSmall),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: context.text.bodySmall,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            if (caption != null) Text(caption!, style: context.text.labelSmall),
          ],
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child, this.subtitle});

  final String title;
  final String? subtitle;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(BlocksSpacing.lg),
      decoration: BoxDecoration(
        color: context.scheme.surface,
        borderRadius: BorderRadius.circular(BlocksRadius.xl),
        border: Border.all(color: context.scheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
            header: true,
            child: Text(title, style: context.text.titleMedium),
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 2),
            Text(subtitle!, style: context.text.bodySmall),
          ],
          const SizedBox(height: BlocksSpacing.lg),
          child,
        ],
      ),
    );
  }
}

/// Horizontal bars: District / State / National / Global.
class _CoverageBars extends StatelessWidget {
  const _CoverageBars({required this.coverage});

  final Map<ReachLevel, double> coverage;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Column(
      children: [
        for (final level in ReachLevel.values)
          Padding(
            padding: const EdgeInsets.only(bottom: BlocksSpacing.md),
            child: Semantics(
              label:
                  '${level.label(l10n)}: ${((coverage[level] ?? 0) * 100).round()}%',
              excludeSemantics: true,
              child: Row(
                children: [
                  SizedBox(
                    width: 88,
                    child: Text(
                      level.label(l10n),
                      style: context.text.labelMedium,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Expanded(
                    child: TweenAnimationBuilder<double>(
                      tween: Tween(end: (coverage[level] ?? 0).clamp(0.0, 1.0)),
                      duration: context.reduceMotion
                          ? Duration.zero
                          : BlocksDurations.slow * 1.6,
                      curve: Curves.easeOutCubic,
                      builder: (context, v, _) => ClipRRect(
                        borderRadius: BorderRadius.circular(BlocksRadius.pill),
                        child: LinearProgressIndicator(
                          value: v,
                          minHeight: 14,
                          color: context.blocks.reachColor(level),
                          backgroundColor: context.blocks
                              .reachColor(level)
                              .withValues(alpha: 0.14),
                        ),
                      ),
                    ),
                  ),
                  SizedBox(
                    width: 48,
                    child: Text(
                      '${((coverage[level] ?? 0) * 100).round()}%',
                      textAlign: TextAlign.end,
                      style: context.text.labelLarge,
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class _MilestoneCard extends StatelessWidget {
  const _MilestoneCard({required this.progress});

  final ReachProgress progress;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final next = progress.next;
    final color = context.blocks.reachColor(next ?? progress.current);

    return _Section(
      title: l10n.studioNextMilestone,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (next != null) ...[
            Row(
              children: [
                ReachLevelBadge(level: next, showName: false),
                const SizedBox(width: BlocksSpacing.sm),
                Expanded(
                  child: Text(
                    next.label(l10n).toUpperCase(),
                    style: context.text.titleLarge?.copyWith(
                      color: color,
                      letterSpacing: 1,
                    ),
                  ),
                ),
                Text(
                  l10n.studioMilestoneProgress(progress.percentToNext),
                  style: context.text.titleSmall,
                ),
              ],
            ),
            const SizedBox(height: BlocksSpacing.lg),
          ],
          ReachLadder(progress: progress),
          const SizedBox(height: BlocksSpacing.lg),
          Text(
            next == null ? l10n.studioMilestoneTop : l10n.studioMilestoneBody,
            style: context.text.bodyMedium,
          ),
        ],
      ),
    );
  }
}

class _TopPosts extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final me = ref.watch(currentUserProvider).value;
    if (me == null) return const SizedBox.shrink();
    final posts =
        ref.watch(userPostsProvider(me.id)).value?.items ?? const <Post>[];
    final top =
        ([...posts]
              ..sort((a, b) => b.qualifiedReach.compareTo(a.qualifiedReach)))
            .take(3)
            .toList();
    if (top.isEmpty) return const SizedBox.shrink();

    final calc = ref.watch(reachCalculatorProvider);
    return _Section(
      title: l10n.studioTopPosts,
      child: Column(
        children: [
          for (final p in top)
            Semantics(
              button: true,
              label: '${l10n.studioOpenPost}: ${p.caption}',
              excludeSemantics: true,
              child: InkWell(
                borderRadius: BlocksRadius.mdAll,
                onTap: () => context.push(Routes.post(p.id)),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    vertical: BlocksSpacing.sm,
                  ),
                  child: Row(
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(BlocksRadius.md),
                        child: SizedBox(
                          width: 52,
                          height: 64,
                          child: p.mediaUrl == null
                              ? ColoredBox(
                                  color: context.scheme.primaryContainer,
                                )
                              : BlocksImage(
                                  url: p.mediaUrl!,
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
                              p.caption,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: context.text.bodyMedium,
                            ),
                            const SizedBox(height: 4),
                            Row(
                              children: [
                                ReachLevelBadge(
                                  level: calc
                                      .evaluate(p.qualifiedReach)
                                      .current,
                                  showName: false,
                                  dense: true,
                                ),
                                const SizedBox(width: BlocksSpacing.sm),
                                Text(
                                  compactCount(p.qualifiedReach),
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
            ),
        ],
      ),
    );
  }
}
