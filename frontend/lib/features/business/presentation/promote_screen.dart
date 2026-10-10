import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/constants/ad_interests.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/utils/number_format.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/core/widgets/blocks_chip.dart';
import 'package:blocks_app/core/widgets/blocks_image.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:blocks_app/data/models/business_models.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/features/business/application/business_providers.dart';
import 'package:blocks_app/features/business/domain/campaign_rules.dart';
import 'package:blocks_app/features/create/presentation/widgets/create_widgets.dart';
import 'package:blocks_app/features/reach/application/reach_providers.dart';
import 'package:blocks_app/features/reach/presentation/widgets/reach_level_badge.dart';
import 'package:blocks_app/l10n/gen/app_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

extension AdGoalLabels on AdGoal {
  String title(AppLocalizations l10n) => switch (this) {
    AdGoal.followers => l10n.goalFollowers,
    AdGoal.reach => l10n.goalReach,
    AdGoal.websiteVisits => l10n.goalWebsite,
    AdGoal.contact => l10n.goalContact,
    AdGoal.videoViews => l10n.goalVideoViews,
  };

  String body(AppLocalizations l10n) => switch (this) {
    AdGoal.followers => l10n.goalFollowersBody,
    AdGoal.reach => l10n.goalReachBody,
    AdGoal.websiteVisits => l10n.goalWebsiteBody,
    AdGoal.contact => l10n.goalContactBody,
    AdGoal.videoViews => l10n.goalVideoViewsBody,
  };

  IconData get icon => switch (this) {
    AdGoal.followers => Icons.person_add_alt_1_rounded,
    AdGoal.reach => Icons.campaign_rounded,
    AdGoal.websiteVisits => Icons.language_rounded,
    AdGoal.contact => Icons.chat_rounded,
    AdGoal.videoViews => Icons.play_circle_rounded,
  };
}

extension CampaignErrorLabels on CampaignError {
  String message(AppLocalizations l10n) => switch (this) {
    CampaignError.postRequired => l10n.campErrPost,
    CampaignError.goalRequired => l10n.campErrGoal,
    CampaignError.locationRequired => l10n.campErrLocation,
    CampaignError.budgetTooLow => l10n.campErrBudgetLow,
    CampaignError.budgetTooHigh => l10n.campErrBudgetHigh,
    CampaignError.durationInvalid => l10n.campErrDuration,
  };
}

extension PromoteStepLabels on PromoteStep {
  String title(AppLocalizations l10n) => switch (this) {
    PromoteStep.post => l10n.promoteStepPost,
    PromoteStep.goal => l10n.promoteStepGoal,
    PromoteStep.audience => l10n.promoteStepAudience,
    PromoteStep.location => l10n.promoteStepLocation,
    PromoteStep.budget => l10n.promoteStepBudget,
    PromoteStep.review => l10n.promoteStepReview,
    PromoteStep.publish => l10n.promoteStepPublish,
  };
}

/// "Promote Your Post" — 7 steps, all simulated (no money, no real ads).
class PromoteScreen extends ConsumerStatefulWidget {
  const PromoteScreen({super.key, this.postId});

  final String? postId;

  @override
  ConsumerState<PromoteScreen> createState() => _PromoteScreenState();
}

class _PromoteScreenState extends ConsumerState<PromoteScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        ref.read(promoteControllerProvider.notifier).preselect(widget.postId);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final s = ref.watch(promoteControllerProvider);
    final c = ref.read(promoteControllerProvider.notifier);
    final isFinal = s.step == PromoteStep.publish;
    const total = 7;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.promoteTitle),
        leading: IconButton(
          tooltip: l10n.close,
          icon: const Icon(Icons.close_rounded),
          onPressed: () => context.pop(),
        ),
      ),
      body: SafeArea(
        child: ResponsiveCenter(
          child: Column(
            children: [
              _StepHeader(step: s.step, total: total),
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(BlocksSpacing.lg),
                  child: switch (s.step) {
                    PromoteStep.post => const _PostStep(),
                    PromoteStep.goal => const _GoalStep(),
                    PromoteStep.audience => const _AudienceStep(),
                    PromoteStep.location => const _LocationStep(),
                    PromoteStep.budget => const _BudgetStep(),
                    PromoteStep.review => const _ReviewStep(),
                    PromoteStep.publish => const _SuccessStep(),
                  },
                ),
              ),
              _BottomBar(
                state: s,
                onBack: c.back,
                onNext: c.next,
                onPublish: c.publish,
                onDone: () => context.pop(),
                isFinal: isFinal,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StepHeader extends StatelessWidget {
  const _StepHeader({required this.step, required this.total});

  final PromoteStep step;
  final int total;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final n = step.index + 1;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        BlocksSpacing.lg,
        BlocksSpacing.sm,
        BlocksSpacing.lg,
        0,
      ),
      child: Semantics(
        container: true,
        label: '${l10n.promoteStepOf(n, total)}. ${step.title(l10n)}',
        excludeSemantics: true,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(step.title(l10n), style: context.text.titleLarge),
                ),
                Text(
                  l10n.promoteStepOf(n, total),
                  style: context.text.labelMedium,
                ),
              ],
            ),
            const SizedBox(height: BlocksSpacing.sm),
            Row(
              children: [
                for (var i = 0; i < total; i++)
                  Expanded(
                    child: Container(
                      height: 5,
                      margin: EdgeInsets.only(right: i == total - 1 ? 0 : 4),
                      decoration: BoxDecoration(
                        color: i < n
                            ? context.scheme.primary
                            : context.scheme.outlineVariant,
                        borderRadius: BorderRadius.circular(BlocksRadius.pill),
                      ),
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _BottomBar extends StatelessWidget {
  const _BottomBar({
    required this.state,
    required this.onBack,
    required this.onNext,
    required this.onPublish,
    required this.onDone,
    required this.isFinal,
  });

  final PromoteState state;
  final VoidCallback onBack;
  final VoidCallback onNext;
  final Future<void> Function() onPublish;
  final VoidCallback onDone;
  final bool isFinal;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final isReview = state.step == PromoteStep.review;

    return Container(
      padding: const EdgeInsets.all(BlocksSpacing.lg),
      decoration: BoxDecoration(
        color: context.scheme.surface,
        border: Border(top: BorderSide(color: context.scheme.outlineVariant)),
      ),
      child: isFinal
          ? BlocksButton(label: l10n.promoteDone, onPressed: onDone)
          : Row(
              children: [
                if (state.step != PromoteStep.post) ...[
                  Expanded(
                    child: BlocksButton(
                      label: l10n.promoteBack,
                      variant: BlocksButtonVariant.outline,
                      onPressed: onBack,
                    ),
                  ),
                  const SizedBox(width: BlocksSpacing.md),
                ],
                Expanded(
                  flex: 2,
                  child: BlocksButton(
                    label: isReview
                        ? l10n.promotePublish
                        : l10n.promoteContinue,
                    isLoading: state.isSubmitting,
                    onPressed: isReview ? onPublish : onNext,
                  ),
                ),
              ],
            ),
    );
  }
}

// ------------------------------------------------------------------ steps --

class _ErrorNote extends StatelessWidget {
  const _ErrorNote(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: BlocksSpacing.md),
      child: Semantics(
        liveRegion: true,
        child: Row(
          children: [
            Icon(
              Icons.error_outline_rounded,
              size: 18,
              color: context.scheme.error,
            ),
            const SizedBox(width: BlocksSpacing.sm),
            Expanded(
              child: Text(
                text,
                style: context.text.bodyMedium?.copyWith(
                  color: context.scheme.error,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PostStep extends ConsumerWidget {
  const _PostStep();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final s = ref.watch(promoteControllerProvider);
    final posts = ref.watch(promotablePostsProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        posts.when(
          loading: () => const SizedBox(height: 200, child: LoadingView()),
          error: (_, _) => SizedBox(
            height: 240,
            child: ErrorView(
              onRetry: () => ref.invalidate(promotablePostsProvider),
            ),
          ),
          data: (list) => list.isEmpty
              ? SizedBox(
                  height: 240,
                  child: EmptyView(body: l10n.promoteNoPosts),
                )
              : Column(
                  children: [
                    for (final p in list)
                      _PostChoice(
                        post: p,
                        selected: p.id == s.draft.postId,
                        onTap: () => ref
                            .read(promoteControllerProvider.notifier)
                            .setPost(p.id),
                      ),
                  ],
                ),
        ),
        if (s.showErrors && s.draft.postId == null)
          _ErrorNote(l10n.campErrPost),
      ],
    );
  }
}

class _PostChoice extends ConsumerWidget {
  const _PostChoice({
    required this.post,
    required this.selected,
    required this.onTap,
  });

  final Post post;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final level = ref
        .watch(reachCalculatorProvider)
        .evaluate(post.qualifiedReach)
        .current;
    return Padding(
      padding: const EdgeInsets.only(bottom: BlocksSpacing.sm),
      child: Semantics(
        button: true,
        selected: selected,
        label: post.caption,
        excludeSemantics: true,
        child: Material(
          color: selected
              ? context.scheme.primaryContainer
              : context.scheme.surface,
          shape: RoundedRectangleBorder(
            borderRadius: BlocksRadius.lgAll,
            side: BorderSide(
              color: selected
                  ? context.scheme.primary
                  : context.scheme.outlineVariant,
              width: selected ? 2 : 1,
            ),
          ),
          child: InkWell(
            borderRadius: BlocksRadius.lgAll,
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.all(BlocksSpacing.md),
              child: Row(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(BlocksRadius.md),
                    child: SizedBox(
                      width: 52,
                      height: 64,
                      child: post.mediaUrl == null
                          ? ColoredBox(color: context.scheme.primaryContainer)
                          : BlocksImage(
                              url: post.mediaUrl!,
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
                          post.caption,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: context.text.bodyMedium,
                        ),
                        const SizedBox(height: 4),
                        Align(
                          alignment: AlignmentDirectional.centerStart,
                          child: FittedBox(
                            fit: BoxFit.scaleDown,
                            child: ReachLevelBadge(level: level, dense: true),
                          ),
                        ),
                      ],
                    ),
                  ),
                  Icon(
                    selected
                        ? Icons.radio_button_checked_rounded
                        : Icons.radio_button_unchecked_rounded,
                    color: selected
                        ? context.scheme.primary
                        : context.scheme.outline,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _GoalStep extends ConsumerWidget {
  const _GoalStep();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final s = ref.watch(promoteControllerProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final g in AdGoal.values)
          Padding(
            padding: const EdgeInsets.only(bottom: BlocksSpacing.sm),
            child: Semantics(
              button: true,
              selected: s.draft.goal == g,
              label: '${g.title(l10n)}. ${g.body(l10n)}',
              excludeSemantics: true,
              child: Material(
                color: s.draft.goal == g
                    ? context.scheme.primaryContainer
                    : context.scheme.surface,
                shape: RoundedRectangleBorder(
                  borderRadius: BlocksRadius.lgAll,
                  side: BorderSide(
                    color: s.draft.goal == g
                        ? context.scheme.primary
                        : context.scheme.outlineVariant,
                    width: s.draft.goal == g ? 2 : 1,
                  ),
                ),
                child: InkWell(
                  borderRadius: BlocksRadius.lgAll,
                  onTap: () =>
                      ref.read(promoteControllerProvider.notifier).setGoal(g),
                  child: Padding(
                    padding: const EdgeInsets.all(BlocksSpacing.lg),
                    child: Row(
                      children: [
                        Icon(g.icon, color: context.scheme.primary),
                        const SizedBox(width: BlocksSpacing.md),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                g.title(l10n),
                                style: context.text.titleSmall,
                              ),
                              Text(g.body(l10n), style: context.text.bodySmall),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        if (s.showErrors && s.draft.goal == null) _ErrorNote(l10n.campErrGoal),
      ],
    );
  }
}

class _AudienceStep extends ConsumerWidget {
  const _AudienceStep();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final s = ref.watch(promoteControllerProvider);
    final c = ref.read(promoteControllerProvider.notifier);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.all(BlocksSpacing.md),
          decoration: BoxDecoration(
            color: context.scheme.primaryContainer.withValues(alpha: 0.5),
            borderRadius: BorderRadius.circular(BlocksRadius.md),
          ),
          child: Row(
            children: [
              Icon(
                Icons.shield_outlined,
                size: 20,
                color: context.scheme.primary,
              ),
              const SizedBox(width: BlocksSpacing.md),
              Expanded(
                child: Text(
                  l10n.promoteAudienceNote,
                  style: context.text.bodySmall,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: BlocksSpacing.xl),
        FieldLabel(l10n.promoteInterests),
        Wrap(
          spacing: BlocksSpacing.sm,
          runSpacing: BlocksSpacing.sm,
          children: [
            for (final i in kAdInterests)
              BlocksChip(
                label: i,
                selected: s.draft.interests.contains(i),
                onSelected: () => c.toggleInterest(i),
              ),
          ],
        ),
      ],
    );
  }
}

class _LocationStep extends ConsumerWidget {
  const _LocationStep();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final s = ref.watch(promoteControllerProvider);
    final c = ref.read(promoteControllerProvider.notifier);
    // Quick picks plus anything the user added that is not a quick pick.
    final names = <String>{...kPopularDistricts, ...s.draft.locations}.toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(l10n.promoteLocationsHint, style: context.text.bodyMedium),
        const SizedBox(height: BlocksSpacing.lg),
        Wrap(
          spacing: BlocksSpacing.sm,
          runSpacing: BlocksSpacing.sm,
          children: [
            for (final d in names)
              BlocksChip(
                label: d,
                icon: Icons.location_on_rounded,
                selected: s.draft.locations.contains(d),
                onSelected: () => c.toggleLocation(d),
              ),
            BlocksChip(
              label: l10n.promoteAddDistrict,
              icon: Icons.add_rounded,
              selected: false,
              onSelected: () async {
                final picked = await showDistrictPicker(context);
                if (picked != null &&
                    !s.draft.locations.contains(picked.name)) {
                  c.toggleLocation(picked.name);
                }
              },
            ),
          ],
        ),
        if (s.showErrors && s.draft.locations.isEmpty)
          _ErrorNote(l10n.campErrLocation),
      ],
    );
  }
}

class _BudgetStep extends ConsumerWidget {
  const _BudgetStep();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final s = ref.watch(promoteControllerProvider);
    final c = ref.read(promoteControllerProvider.notifier);
    final (lo, hi) = CampaignRules.estimateReach(s.draft);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                l10n.promoteDailyBudget,
                style: context.text.titleSmall,
              ),
            ),
            Text(
              formatRupees(s.draft.dailyBudgetRupees),
              style: context.text.titleMedium,
            ),
          ],
        ),
        Slider(
          min: CampaignRules.minDailyBudget.toDouble(),
          max: 5000,
          divisions: 49,
          value: s.draft.dailyBudgetRupees
              .clamp(CampaignRules.minDailyBudget, 5000)
              .toDouble(),
          label: formatRupees(s.draft.dailyBudgetRupees),
          onChanged: (v) => c.setDailyBudget((v / 100).round() * 100),
        ),
        const SizedBox(height: BlocksSpacing.lg),
        Row(
          children: [
            Expanded(
              child: Text(l10n.promoteDuration, style: context.text.titleSmall),
            ),
            Text(
              l10n.promoteDays(s.draft.days),
              style: context.text.titleMedium,
            ),
          ],
        ),
        Slider(
          min: 1,
          max: CampaignRules.maxDays.toDouble(),
          divisions: CampaignRules.maxDays - 1,
          value: s.draft.days.toDouble(),
          label: l10n.promoteDays(s.draft.days),
          onChanged: (v) => c.setDays(v.round()),
        ),
        const SizedBox(height: BlocksSpacing.xl),
        Container(
          padding: const EdgeInsets.all(BlocksSpacing.lg),
          decoration: BoxDecoration(
            color: context.scheme.surface,
            borderRadius: BorderRadius.circular(BlocksRadius.lg),
            border: Border.all(color: context.scheme.outlineVariant),
          ),
          child: Column(
            children: [
              _kv(
                context,
                l10n.promoteTotal,
                formatRupees(s.draft.totalBudgetRupees),
                bold: true,
              ),
              const Divider(height: BlocksSpacing.xl),
              _kv(
                context,
                l10n.promoteEstimatedReach,
                l10n.promoteReachRange(compactCount(lo), compactCount(hi)),
              ),
            ],
          ),
        ),
        if (s.showErrors && !s.canContinue) ...[
          for (final e in CampaignRules.validate(s.draft).where(
            (e) =>
                e == CampaignError.budgetTooLow ||
                e == CampaignError.budgetTooHigh ||
                e == CampaignError.durationInvalid,
          ))
            _ErrorNote(e.message(l10n)),
        ],
      ],
    );
  }
}

Widget _kv(BuildContext context, String k, String v, {bool bold = false}) {
  return Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Expanded(
        child: Text(
          k,
          style: context.text.bodyMedium?.copyWith(
            color: context.scheme.onSurfaceVariant,
          ),
        ),
      ),
      const SizedBox(width: BlocksSpacing.md),
      Flexible(
        child: Text(
          v,
          textAlign: TextAlign.end,
          style: bold ? context.text.titleMedium : context.text.titleSmall,
        ),
      ),
    ],
  );
}

class _ReviewStep extends ConsumerWidget {
  const _ReviewStep();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final s = ref.watch(promoteControllerProvider);
    final d = s.draft;
    final post = ref
        .watch(promotablePostsProvider)
        .value
        ?.where((p) => p.id == d.postId)
        .firstOrNull;
    final (lo, hi) = CampaignRules.estimateReach(d);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.all(BlocksSpacing.md),
          decoration: BoxDecoration(
            color: context.blocks.warning.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(BlocksRadius.md),
            border: Border.all(
              color: context.blocks.warning.withValues(alpha: 0.4),
            ),
          ),
          child: Row(
            children: [
              Icon(Icons.science_outlined, color: context.blocks.warning),
              const SizedBox(width: BlocksSpacing.md),
              Expanded(
                child: Text(
                  l10n.promoteDemoBanner,
                  style: context.text.titleSmall,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: BlocksSpacing.lg),
        Container(
          padding: const EdgeInsets.all(BlocksSpacing.lg),
          decoration: BoxDecoration(
            color: context.scheme.surface,
            borderRadius: BorderRadius.circular(BlocksRadius.xl),
            border: Border.all(color: context.scheme.outlineVariant),
          ),
          child: Column(
            children: [
              _kv(context, l10n.promoteReviewPost, post?.caption ?? '—'),
              const Divider(height: BlocksSpacing.xl),
              _kv(context, l10n.promoteReviewGoal, d.goal?.title(l10n) ?? '—'),
              const Divider(height: BlocksSpacing.xl),
              _kv(
                context,
                l10n.promoteReviewAudience,
                d.interests.isEmpty ? l10n.exploreAll : d.interests.join(', '),
              ),
              const Divider(height: BlocksSpacing.xl),
              _kv(context, l10n.promoteReviewLocation, d.locations.join(', ')),
              const Divider(height: BlocksSpacing.xl),
              _kv(
                context,
                l10n.promoteReviewBudget,
                '${formatRupees(d.dailyBudgetRupees)} × ${l10n.promoteDays(d.days)} = ${formatRupees(d.totalBudgetRupees)}',
                bold: true,
              ),
              const Divider(height: BlocksSpacing.xl),
              _kv(
                context,
                l10n.promoteEstimatedReach,
                l10n.promoteReachRange(compactCount(lo), compactCount(hi)),
              ),
            ],
          ),
        ),
        if (s.showErrors)
          for (final e in CampaignRules.validate(d))
            _ErrorNote(e.message(l10n)),
      ],
    );
  }
}

class _SuccessStep extends ConsumerWidget {
  const _SuccessStep();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final c = ref.watch(promoteControllerProvider).campaign;
    return Padding(
      padding: const EdgeInsets.only(top: BlocksSpacing.xl),
      child: Column(
        children: [
          Container(
            width: 84,
            height: 84,
            decoration: BoxDecoration(
              color: context.blocks.success,
              borderRadius: BorderRadius.circular(28),
            ),
            child: const Icon(
              Icons.check_rounded,
              color: Colors.white,
              size: 48,
            ),
          ),
          const SizedBox(height: BlocksSpacing.xl),
          Semantics(
            liveRegion: true,
            child: Text(
              l10n.promoteSuccessTitle,
              style: context.text.headlineSmall,
              textAlign: TextAlign.center,
            ),
          ),
          const SizedBox(height: BlocksSpacing.md),
          Text(
            l10n.promoteSuccessBody,
            style: context.text.bodyMedium,
            textAlign: TextAlign.center,
          ),
          if (c != null) ...[
            const SizedBox(height: BlocksSpacing.xl),
            Container(
              padding: const EdgeInsets.all(BlocksSpacing.lg),
              decoration: BoxDecoration(
                color: context.scheme.surface,
                borderRadius: BorderRadius.circular(BlocksRadius.lg),
                border: Border.all(color: context.scheme.outlineVariant),
              ),
              child: Column(
                children: [
                  _kv(
                    context,
                    l10n.promoteTotal,
                    formatRupees(c.draft.totalBudgetRupees),
                    bold: true,
                  ),
                  const Divider(height: BlocksSpacing.xl),
                  _kv(
                    context,
                    l10n.promoteEstimatedReach,
                    l10n.promoteReachRange(
                      compactCount(c.estimatedReachMin),
                      compactCount(c.estimatedReachMax),
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: BlocksSpacing.lg),
          Text(
            l10n.promoteDemoBanner,
            style: context.text.bodySmall,
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}
