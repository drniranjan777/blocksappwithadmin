import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/utils/number_format.dart';
import 'package:blocks_app/core/widgets/app_snack.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/core/widgets/poll_while.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:blocks_app/data/models/kyc_models.dart';
import 'package:blocks_app/data/models/payout_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/creator/presentation/widgets/creator_widgets.dart';
import 'package:blocks_app/features/creator/presentation/widgets/studio_nav.dart';
import 'package:blocks_app/features/kyc/application/kyc_providers.dart';
import 'package:blocks_app/features/payout/application/payout_providers.dart';
import 'package:blocks_app/features/payout/presentation/payout_labels.dart';
import 'package:blocks_app/features/payout/presentation/step_up_sheet.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

enum PayoutTab { overview, methods, verification, history }

String _date(BuildContext context, DateTime d) =>
    DateFormat.yMMMd(Localizations.localeOf(context).toString()).format(d);

/// Where money leaves BLOCKS: balances and whether you can withdraw, your
/// bank accounts, identity verification and every payout so far.
class PayoutCenterScreen extends ConsumerWidget {
  const PayoutCenterScreen({super.key, this.initialTab = PayoutTab.overview});

  final PayoutTab initialTab;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    return DefaultTabController(
      length: PayoutTab.values.length,
      initialIndex: initialTab.index,
      child: StudioScaffold(
        section: StudioSection.payout,
        title: l10n.poTitle,
        body: Column(
          children: [
            TabBar(
              isScrollable: true,
              tabAlignment: TabAlignment.start,
              tabs: [
                Tab(text: l10n.poTabOverview),
                Tab(text: l10n.poTabMethods),
                Tab(text: l10n.poTabVerification),
                Tab(text: l10n.poTabHistory),
              ],
            ),
            const Expanded(
              child: TabBarView(
                children: [
                  _OverviewTab(),
                  _MethodsTab(),
                  _VerificationTab(),
                  _HistoryTab(),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// -------------------------------------------------------------- overview --

class _OverviewTab extends ConsumerWidget {
  const _OverviewTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final data = ref.watch(payoutOverviewProvider);
    return data.when(
      loading: () => const LoadingView(),
      error: (err, _) => ErrorView(
        error: err,
        onRetry: () => ref.invalidate(payoutOverviewProvider),
      ),
      data: (o) => PollWhile(
        active: o.openPayout != null,
        onTick: () => ref.invalidate(payoutOverviewProvider),
        child: RefreshIndicator(
          onRefresh: () async {
            refreshPayoutData(ref);
            await ref.read(payoutOverviewProvider.future);
          },
          child: ListView(
            padding: const EdgeInsets.all(BlocksSpacing.lg),
            children: [
              _BalanceCard(overview: o),
              if (o.openPayout != null) ...[
                const SizedBox(height: BlocksSpacing.md),
                _OpenPayoutBanner(payout: o.openPayout!),
              ],
              const SizedBox(height: BlocksSpacing.lg),
              StudioCard(
                title: l10n.poEligibilityTitle,
                subtitle: l10n.poEligibilityBody,
                child: Column(
                  children: [
                    for (final item in o.eligibility.items)
                      _EligibilityRow(item: item, overview: o),
                  ],
                ),
              ),
              const SizedBox(height: BlocksSpacing.lg),
              StudioCard(
                title: l10n.poRulesTitle,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _Bullet(
                      icon: Icons.south_rounded,
                      text: l10n.poRuleMinimum(
                        formatRupees(o.config.minimumAmount),
                      ),
                    ),
                    _Bullet(
                      icon: Icons.schedule_rounded,
                      text: l10n.poRuleTiming(
                        o.config.estimatedDaysMin,
                        o.config.estimatedDaysMax,
                      ),
                    ),
                    _Bullet(
                      icon: Icons.shield_rounded,
                      text: l10n.poRuleStepUp(
                        formatRupees(o.config.stepUpAmount),
                      ),
                    ),
                    if (o.config.holdAfterAccountChange > Duration.zero)
                      _Bullet(
                        icon: Icons.pause_circle_outline_rounded,
                        text: l10n.poRuleHold(
                          o.config.holdAfterAccountChange.inHours,
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: BlocksSpacing.lg),
              if (!o.eligibility.isEligible)
                Padding(
                  padding: const EdgeInsets.only(bottom: BlocksSpacing.sm),
                  child: Semantics(
                    liveRegion: true,
                    child: Text(
                      l10n.poBlockedBy(_firstBlocker(context, o)),
                      style: context.text.bodyMedium?.copyWith(
                        color: context.scheme.error,
                      ),
                    ),
                  ),
                ),
              BlocksButton(
                label: l10n.poRequest,
                icon: Icons.send_rounded,
                onPressed: o.eligibility.isEligible
                    ? () => context.push(Routes.requestPayout)
                    : null,
              ),
              const SizedBox(height: BlocksSpacing.sm),
              BlocksButton(
                label: l10n.poTaxInfo,
                icon: Icons.receipt_long_rounded,
                variant: BlocksButtonVariant.tonal,
                onPressed: () => context.push(Routes.payoutTax),
              ),
              const SizedBox(height: BlocksSpacing.xl),
            ],
          ),
        ),
      ),
    );
  }

  String _firstBlocker(BuildContext context, PayoutOverview o) {
    final first = o.eligibility.items.firstWhere((i) => !i.met);
    return eligibilityLabel(
      context.l10n,
      first.check,
      minimum: formatRupees(o.config.minimumAmount),
    );
  }
}

class _BalanceCard extends StatelessWidget {
  const _BalanceCard({required this.overview});

  final PayoutOverview overview;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = context.blocks;
    final available = formatRupees(overview.available);
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
          Text(
            l10n.poAvailable.toUpperCase(),
            style: context.text.labelMedium?.copyWith(
              color: colors.onHeroMuted,
              letterSpacing: 1.4,
            ),
          ),
          const SizedBox(height: BlocksSpacing.sm),
          Semantics(
            label: '${l10n.poAvailable}: $available',
            excludeSemantics: true,
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: AlignmentDirectional.centerStart,
              child: Text(
                available,
                style: context.text.displaySmall?.copyWith(
                  color: colors.onHero,
                  fontSize: 44,
                ),
              ),
            ),
          ),
          const SizedBox(height: BlocksSpacing.sm),
          Text(
            l10n.poPendingPaid(
              formatRupees(overview.pending),
              formatRupees(overview.paid),
            ),
            style: context.text.bodyMedium?.copyWith(color: colors.onHeroMuted),
          ),
        ],
      ),
    );
  }
}

class _OpenPayoutBanner extends StatelessWidget {
  const _OpenPayoutBanner({required this.payout});

  final PayoutRequest payout;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final color = payoutStatusColor(context, payout.status);
    return Semantics(
      container: true,
      liveRegion: true,
      label:
          '${l10n.poOpenTitle(formatRupees(payout.amount))}. ${payoutStatusLabel(l10n, payout.status)}',
      excludeSemantics: true,
      child: Container(
        padding: const EdgeInsets.all(BlocksSpacing.md),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.10),
          borderRadius: BlocksRadius.lgAll,
          border: Border.all(color: color.withValues(alpha: 0.35)),
        ),
        child: Row(
          children: [
            Icon(payoutStatusIcon(payout.status), color: color),
            const SizedBox(width: BlocksSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    l10n.poOpenTitle(formatRupees(payout.amount)),
                    style: context.text.titleSmall,
                  ),
                  Text(
                    l10n.poArrival(
                      _date(context, payout.estimatedFrom),
                      _date(context, payout.estimatedTo),
                    ),
                    style: context.text.bodySmall,
                  ),
                ],
              ),
            ),
            StatusPill(
              label: payoutStatusLabel(l10n, payout.status),
              icon: payoutStatusIcon(payout.status),
              color: color,
            ),
          ],
        ),
      ),
    );
  }
}

class _EligibilityRow extends StatelessWidget {
  const _EligibilityRow({required this.item, required this.overview});

  final EligibilityItem item;
  final PayoutOverview overview;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final label = eligibilityLabel(
      l10n,
      item.check,
      minimum: formatRupees(overview.config.minimumAmount),
    );
    final ok = item.met;
    final action = switch (item.check) {
      EligibilityCheck.identityVerified when !ok => (
        l10n.poActionVerify,
        () => context.push(Routes.kycFlow),
      ),
      EligibilityCheck.bankVerified when !ok => (
        overview.bankAccounts.isEmpty
            ? l10n.poActionAddBank
            : l10n.poActionFixBank,
        () => context.push(
          overview.bankAccounts.isEmpty ? Routes.addBank : Routes.payoutBank,
        ),
      ),
      _ => null,
    };
    final hold = item.check == EligibilityCheck.noActiveHold && !ok
        ? overview.eligibility.holdUntil
        : null;

    return Semantics(
      container: true,
      label: '$label: ${ok ? l10n.pubDone : l10n.poNotYet}',
      excludeSemantics: true,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: BlocksSpacing.xs),
        child: Row(
          children: [
            Icon(
              ok ? Icons.check_circle_rounded : Icons.cancel_rounded,
              color: ok ? context.blocks.success : context.scheme.error,
            ),
            const SizedBox(width: BlocksSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: context.text.bodyLarge),
                  if (hold != null)
                    Text(
                      l10n.poHoldUntil(_date(context, hold)),
                      style: context.text.bodySmall,
                    ),
                  // Under the text, not beside it: a long label in another
                  // language would otherwise squeeze the row off screen.
                  if (action != null)
                    Semantics(
                      button: true,
                      label: action.$1,
                      excludeSemantics: true,
                      child: TextButton(
                        style: TextButton.styleFrom(
                          minimumSize: const Size(64, 48),
                          padding: EdgeInsets.zero,
                        ),
                        onPressed: action.$2,
                        child: Text(action.$1),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Bullet extends StatelessWidget {
  const _Bullet({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: context.scheme.primary),
        const SizedBox(width: BlocksSpacing.sm),
        Expanded(child: Text(text, style: context.text.bodyMedium)),
      ],
    ),
  );
}

// --------------------------------------------------------------- methods --

class _MethodsTab extends ConsumerWidget {
  const _MethodsTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final data = ref.watch(payoutOverviewProvider);
    return data.when(
      loading: () => const LoadingView(),
      error: (err, _) => ErrorView(
        error: err,
        onRetry: () => ref.invalidate(payoutOverviewProvider),
      ),
      data: (o) {
        final accounts = o.bankAccounts;
        return RefreshIndicator(
          onRefresh: () async {
            refreshPayoutData(ref);
            await ref.read(payoutOverviewProvider.future);
          },
          child: ListView(
            padding: const EdgeInsets.all(BlocksSpacing.lg),
            children: [
              if (accounts.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(
                    vertical: BlocksSpacing.xl,
                  ),
                  child: EmptyView(
                    icon: Icons.account_balance_rounded,
                    title: l10n.bankEmptyTitle,
                    body: l10n.bankEmptyBody,
                  ),
                )
              else
                for (final a in accounts)
                  Padding(
                    padding: const EdgeInsets.only(bottom: BlocksSpacing.md),
                    child: BankAccountCard(account: a, canRemove: true),
                  ),
              const SizedBox(height: BlocksSpacing.sm),
              BlocksButton(
                label: l10n.bankAdd,
                icon: Icons.add_rounded,
                onPressed: () => context.push(Routes.addBank),
              ),
              const SizedBox(height: BlocksSpacing.lg),
              StatusBannerInfo(text: l10n.bankSecurityNote),
              const SizedBox(height: BlocksSpacing.xl),
            ],
          ),
        );
      },
    );
  }
}

/// One payout account: only masked details are ever shown.
class BankAccountCard extends ConsumerWidget {
  const BankAccountCard({
    required this.account,
    super.key,
    this.canRemove = false,
  });

  final BankAccount account;
  final bool canRemove;

  Future<void> _makePrimary(BuildContext context, WidgetRef ref) async {
    final l10n = context.l10n;
    final token = await showStepUp(context, StepUpPurpose.changeBankAccount);
    if (token == null || !context.mounted) return;
    try {
      await ref
          .read(bankAccountRepositoryProvider)
          .setPrimary(account.id, stepUpToken: token);
      refreshPayoutData(ref);
      if (context.mounted) showAppSnack(context, l10n.bankPrimaryNow);
    } on AppFailure {
      if (context.mounted) showAppSnack(context, l10n.errorBody);
    }
  }

  Future<void> _remove(BuildContext context, WidgetRef ref) async {
    final l10n = context.l10n;
    final sure = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.bankRemoveTitle),
        content: Text(l10n.bankRemoveBody(account.bankName, account.last4)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(l10n.cancel),
          ),
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size(64, 48)),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(l10n.bankRemove),
          ),
        ],
      ),
    );
    if (!(sure ?? false) || !context.mounted) return;
    final token = await showStepUp(context, StepUpPurpose.removeBankAccount);
    if (token == null || !context.mounted) return;
    try {
      await ref
          .read(bankAccountRepositoryProvider)
          .removeAccount(account.id, stepUpToken: token);
      refreshPayoutData(ref);
      if (context.mounted) showAppSnack(context, l10n.bankRemoved);
    } on AppFailure {
      if (context.mounted) showAppSnack(context, l10n.errorBody);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final color = bankStatusColor(context, account.status);
    return Semantics(
      container: true,
      label: l10n.bankCardLabel(
        account.bankName,
        account.last4,
        bankStatusLabel(l10n, account.status),
      ),
      child: Container(
        padding: const EdgeInsets.all(BlocksSpacing.lg),
        decoration: BoxDecoration(
          color: context.scheme.surface,
          borderRadius: BlocksRadius.xlAll,
          border: Border.all(
            color: account.isPrimary
                ? context.scheme.primary
                : context.scheme.outlineVariant,
            width: account.isPrimary ? 2 : 1,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: context.scheme.primaryContainer,
                    borderRadius: BlocksRadius.mdAll,
                  ),
                  child: Icon(
                    Icons.account_balance_rounded,
                    color: context.scheme.onPrimaryContainer,
                  ),
                ),
                const SizedBox(width: BlocksSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(account.bankName, style: context.text.titleMedium),
                      Text(
                        '•••• ${account.last4}  ·  ${accountTypeLabel(l10n, account.type)}',
                        style: context.text.bodyMedium,
                      ),
                    ],
                  ),
                ),
                if (account.isPrimary)
                  StatusPill(
                    label: l10n.bankPrimary,
                    icon: Icons.star_rounded,
                    color: context.scheme.primary,
                  ),
              ],
            ),
            const SizedBox(height: BlocksSpacing.md),
            _Detail(label: l10n.bankHolder, value: account.holderName),
            _Detail(
              label: l10n.bankAccountNumber,
              value: account.maskedAccountNumber,
            ),
            _Detail(label: l10n.bankIfsc, value: account.ifsc),
            if (account.branch.isNotEmpty)
              _Detail(label: l10n.bankBranch, value: account.branch),
            const SizedBox(height: BlocksSpacing.sm),
            StatusPill(
              label: bankStatusLabel(l10n, account.status),
              icon: bankStatusIcon(account.status),
              color: color,
            ),
            const SizedBox(height: BlocksSpacing.xs),
            Text(
              bankStatusHint(l10n, account.status),
              style: context.text.bodySmall,
            ),
            if (canRemove) ...[
              const SizedBox(height: BlocksSpacing.md),
              Wrap(
                spacing: BlocksSpacing.sm,
                runSpacing: BlocksSpacing.sm,
                children: [
                  if (!account.isPrimary)
                    OutlinedButton.icon(
                      onPressed: () => _makePrimary(context, ref),
                      icon: const Icon(Icons.star_outline_rounded),
                      label: Text(l10n.bankMakePrimary),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(64, 48),
                      ),
                    ),
                  OutlinedButton.icon(
                    onPressed: () => _remove(context, ref),
                    icon: const Icon(Icons.delete_outline_rounded),
                    label: Text(l10n.bankRemove),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size(64, 48),
                      foregroundColor: context.scheme.error,
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Detail extends StatelessWidget {
  const _Detail({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 2),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(width: 112, child: Text(label, style: context.text.bodySmall)),
        Expanded(child: Text(value, style: context.text.bodyMedium)),
      ],
    ),
  );
}

/// An information strip.
class StatusBannerInfo extends StatelessWidget {
  const StatusBannerInfo({required this.text, super.key});

  final String text;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(BlocksSpacing.md),
    decoration: BoxDecoration(
      color: context.scheme.primaryContainer.withValues(alpha: 0.5),
      borderRadius: BlocksRadius.lgAll,
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(Icons.lock_outline_rounded, color: context.scheme.primary),
        const SizedBox(width: BlocksSpacing.md),
        Expanded(child: Text(text, style: context.text.bodyMedium)),
      ],
    ),
  );
}

// ---------------------------------------------------------- verification --

class _VerificationTab extends ConsumerWidget {
  const _VerificationTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final data = ref.watch(kycApplicationProvider);
    return data.when(
      loading: () => const LoadingView(),
      error: (err, _) => ErrorView(
        error: err,
        onRetry: () => ref.invalidate(kycApplicationProvider),
      ),
      data: (k) {
        final color = kycStatusColor(context, k.status);
        final reason =
            k.status == KycStatus.rejected ||
                k.status == KycStatus.actionRequired
            ? kycReasonLabel(l10n, k.reasonCode)
            : null;
        return PollWhile(
          active: k.status.isInProgress,
          interval: const Duration(seconds: 2),
          onTick: () {
            ref
              ..invalidate(kycApplicationProvider)
              ..invalidate(payoutOverviewProvider);
          },
          child: RefreshIndicator(
            onRefresh: () async {
              ref
                ..invalidate(kycApplicationProvider)
                ..invalidate(payoutOverviewProvider);
              await ref.read(kycApplicationProvider.future);
            },
            child: ListView(
              padding: const EdgeInsets.all(BlocksSpacing.lg),
              children: [
                Container(
                  padding: const EdgeInsets.all(BlocksSpacing.xl),
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.10),
                    borderRadius: BlocksRadius.xlAll,
                    border: Border.all(color: color.withValues(alpha: 0.35)),
                  ),
                  child: Semantics(
                    container: true,
                    liveRegion: true,
                    label:
                        '${l10n.kycTitle}: ${kycStatusLabel(l10n, k.status)}. ${kycStatusHint(l10n, k.status)}',
                    excludeSemantics: true,
                    child: Column(
                      children: [
                        Icon(kycStatusIcon(k.status), size: 56, color: color),
                        const SizedBox(height: BlocksSpacing.md),
                        Text(
                          kycStatusLabel(l10n, k.status),
                          style: context.text.headlineSmall,
                        ),
                        const SizedBox(height: BlocksSpacing.xs),
                        Text(
                          kycStatusHint(l10n, k.status),
                          textAlign: TextAlign.center,
                          style: context.text.bodyMedium,
                        ),
                        if (reason != null) ...[
                          const SizedBox(height: BlocksSpacing.sm),
                          Text(
                            reason,
                            textAlign: TextAlign.center,
                            style: context.text.bodyMedium?.copyWith(
                              color: color,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: BlocksSpacing.lg),
                if (k.status != KycStatus.notStarted)
                  StudioCard(
                    title: l10n.kycDetailsTitle,
                    child: Column(
                      children: [
                        if (k.subject != null)
                          _Detail(
                            label: l10n.kycType,
                            value: kycSubjectLabel(l10n, k.subject!),
                          ),
                        _Detail(label: l10n.kycLegalName, value: k.legalName),
                        if (k.businessName.isNotEmpty)
                          _Detail(
                            label: l10n.kycBusinessName,
                            value: k.businessName,
                          ),
                        if (k.businessType.isNotEmpty)
                          _Detail(
                            label: l10n.kycBusinessType,
                            value: k.businessType,
                          ),
                        if (k.submittedAt != null)
                          _Detail(
                            label: l10n.kycSubmitted,
                            value: _date(context, k.submittedAt!),
                          ),
                        if (k.reviewedAt != null)
                          _Detail(
                            // "Verified on <date>" once it is verified.
                            label: k.status == KycStatus.verified
                                ? l10n.kycVerifiedOn
                                : l10n.kycReviewed,
                            value: _date(context, k.reviewedAt!),
                          ),
                        if (k.expiresAt != null)
                          _Detail(
                            label: l10n.kycValidUntil,
                            value: _date(context, k.expiresAt!),
                          ),
                      ],
                    ),
                  ),
                if (k.documents.isNotEmpty) ...[
                  const SizedBox(height: BlocksSpacing.lg),
                  StudioCard(
                    title: l10n.kycDocumentsTitle,
                    subtitle: l10n.kycMaskedNote,
                    child: Column(
                      children: [
                        for (final d in k.documents)
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 6),
                            child: Semantics(
                              container: true,
                              label:
                                  '${d.label}, ${d.maskedNumber}, ${kycDocStateLabel(l10n, d.state)}',
                              excludeSemantics: true,
                              child: Row(
                                children: [
                                  const Icon(Icons.description_outlined),
                                  const SizedBox(width: BlocksSpacing.md),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          d.label,
                                          style: context.text.titleSmall,
                                        ),
                                        Text(
                                          d.maskedNumber,
                                          style: context.text.bodyMedium
                                              ?.copyWith(
                                                fontFeatures: const [
                                                  FontFeature.tabularFigures(),
                                                ],
                                                letterSpacing: 1.2,
                                              ),
                                        ),
                                        Text(
                                          d.fileName,
                                          style: context.text.bodySmall,
                                        ),
                                      ],
                                    ),
                                  ),
                                  StatusPill(
                                    label: kycDocStateLabel(l10n, d.state),
                                    icon: switch (d.state) {
                                      KycDocumentState.accepted =>
                                        Icons.check_circle_rounded,
                                      KycDocumentState.rejected =>
                                        Icons.cancel_rounded,
                                      KycDocumentState.received =>
                                        Icons.inbox_rounded,
                                    },
                                    color: switch (d.state) {
                                      KycDocumentState.accepted =>
                                        context.blocks.success,
                                      KycDocumentState.rejected =>
                                        context.scheme.error,
                                      KycDocumentState.received =>
                                        context.scheme.primary,
                                    },
                                  ),
                                ],
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: BlocksSpacing.lg),
                if (k.status.canSubmit)
                  BlocksButton(
                    label: switch (k.status) {
                      KycStatus.notStarted => l10n.kycStart,
                      KycStatus.expired => l10n.kycRenew,
                      _ => l10n.kycTryAgain,
                    },
                    icon: Icons.badge_rounded,
                    onPressed: () => context.push(Routes.kycFlow),
                  )
                else if (k.status.isInProgress)
                  BlocksButton(
                    label: l10n.kycCheckStatus,
                    icon: Icons.refresh_rounded,
                    variant: BlocksButtonVariant.tonal,
                    onPressed: () {
                      ref.invalidate(kycApplicationProvider);
                    },
                  ),
                const SizedBox(height: BlocksSpacing.lg),
                StudioCard(
                  title: l10n.kycPrivacyTitle,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _Bullet(icon: Icons.lock_rounded, text: l10n.kycPrivacy1),
                      _Bullet(
                        icon: Icons.phone_android_rounded,
                        text: l10n.kycPrivacy2,
                      ),
                      _Bullet(
                        icon: Icons.visibility_off_rounded,
                        text: l10n.kycPrivacy3,
                      ),
                      _Bullet(
                        icon: Icons.verified_user_rounded,
                        text: l10n.kycPrivacy4,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: BlocksSpacing.xl),
              ],
            ),
          ),
        );
      },
    );
  }
}

// --------------------------------------------------------------- history --

class _HistoryTab extends ConsumerWidget {
  const _HistoryTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final data = ref.watch(payoutHistoryProvider);
    return data.when(
      loading: () => const LoadingView(),
      error: (err, _) => ErrorView(
        error: err,
        onRetry: () => ref.invalidate(payoutHistoryProvider),
      ),
      data: (list) {
        if (list.isEmpty) {
          return EmptyView(
            icon: Icons.receipt_long_rounded,
            title: l10n.poHistoryEmpty,
            body: l10n.poHistoryEmptyBody,
          );
        }
        return PollWhile(
          active: list.any((p) => p.status.isOpen),
          onTick: () {
            ref
              ..invalidate(payoutHistoryProvider)
              ..invalidate(payoutOverviewProvider);
          },
          child: RefreshIndicator(
            onRefresh: () async {
              refreshPayoutData(ref);
              await ref.read(payoutHistoryProvider.future);
            },
            child: ListView.builder(
              padding: const EdgeInsets.all(BlocksSpacing.lg),
              itemCount: list.length,
              itemBuilder: (context, i) => Padding(
                padding: const EdgeInsets.only(bottom: BlocksSpacing.md),
                child: PayoutTile(payout: list[i]),
              ),
            ),
          ),
        );
      },
    );
  }
}

/// One payout: amount, status, bank, reference and what is expected next.
class PayoutTile extends StatelessWidget {
  const PayoutTile({required this.payout, super.key});

  final PayoutRequest payout;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final p = payout;
    final color = payoutStatusColor(context, p.status);
    final amount = formatRupees(p.amount);
    final note = switch (p.status) {
      PayoutStatus.failed ||
      PayoutStatus.reversed ||
      PayoutStatus.onHold => payoutReasonLabel(l10n, p.reasonCode),
      PayoutStatus.requested || PayoutStatus.processing => l10n.poArrival(
        _date(context, p.estimatedFrom),
        _date(context, p.estimatedTo),
      ),
      PayoutStatus.completed =>
        p.completedAt == null
            ? null
            : l10n.poPaidOn(_date(context, p.completedAt!)),
    };
    return Semantics(
      container: true,
      label: l10n.poTileLabel(
        amount,
        payoutStatusLabel(l10n, p.status),
        _date(context, p.requestedAt),
      ),
      excludeSemantics: true,
      child: Container(
        padding: const EdgeInsets.all(BlocksSpacing.lg),
        decoration: BoxDecoration(
          color: context.scheme.surface,
          borderRadius: BlocksRadius.xlAll,
          border: Border.all(color: context.scheme.outlineVariant),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(amount, style: context.text.headlineSmall),
                ),
                StatusPill(
                  label: payoutStatusLabel(l10n, p.status),
                  icon: payoutStatusIcon(p.status),
                  color: color,
                ),
              ],
            ),
            const SizedBox(height: BlocksSpacing.xs),
            Text(p.bankLabel, style: context.text.bodyMedium),
            Text(
              l10n.poRequestedOn(_date(context, p.requestedAt)),
              style: context.text.bodySmall,
            ),
            if (note != null) ...[
              const SizedBox(height: BlocksSpacing.xs),
              Text(note, style: context.text.bodySmall?.copyWith(color: color)),
            ],
            const SizedBox(height: BlocksSpacing.xs),
            Text(l10n.poReference(p.reference), style: context.text.labelSmall),
          ],
        ),
      ),
    );
  }
}
