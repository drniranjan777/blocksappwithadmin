import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/utils/number_format.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:blocks_app/data/models/payout_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/creator/presentation/widgets/creator_widgets.dart';
import 'package:blocks_app/features/payout/application/payout_providers.dart';
import 'package:blocks_app/features/payout/domain/payout_rules.dart';
import 'package:blocks_app/features/payout/presentation/payout_center_screen.dart';
import 'package:blocks_app/features/payout/presentation/step_up_sheet.dart';
import 'package:blocks_app/features/reel_studio/presentation/widgets/panel_parts.dart';
import 'package:blocks_app/features/security/presentation/widgets/status_widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

/// Withdraw to a verified bank account.
///
/// The app shows the rules and checks the amount as you type, but the server
/// re-checks everything (eligibility, minimum, balance, holds, and the extra
/// confirmation for large amounts) when you confirm.
class RequestPayoutScreen extends ConsumerStatefulWidget {
  const RequestPayoutScreen({super.key});

  @override
  ConsumerState<RequestPayoutScreen> createState() =>
      _RequestPayoutScreenState();
}

class _RequestPayoutScreenState extends ConsumerState<RequestPayoutScreen> {
  final _amount = TextEditingController();
  String? _accountId;
  bool _busy = false;
  String? _error;
  PayoutRequest? _done;

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  int? get _value => int.tryParse(_amount.text.replaceAll(',', '').trim());

  String _date(DateTime d) =>
      DateFormat.MMMd(Localizations.localeOf(context).toString()).format(d);

  String _reason(String code) {
    final l = context.l10n;
    return switch (code) {
      'belowMinimum' => l.poErrBelowMinimum,
      'exceedsAvailable' => l.poErrExceeds,
      'notEligible' => l.poErrNotEligible,
      'onHold' => l.poErrOnHold,
      'noBankAccount' => l.poErrNoBank,
      _ => l.errorBody,
    };
  }

  Future<void> _review(PayoutOverview o, BankAccount bank) async {
    final l10n = context.l10n;
    final amount = _value;
    if (amount == null) return;
    final (from, to) = PayoutRules.estimateArrival(
      ref.read(clockProvider)(),
      o.config,
    );
    final needsStepUp = PayoutRules.needsStepUp(amount, o.config);

    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(
          BlocksSpacing.lg,
          0,
          BlocksSpacing.lg,
          BlocksSpacing.lg,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Semantics(
                header: true,
                child: Text(l10n.poConfirmTitle, style: ctx.text.titleLarge),
              ),
              const SizedBox(height: BlocksSpacing.lg),
              _Line(
                label: l10n.poConfirmAmount,
                value: formatRupees(amount),
                big: true,
              ),
              _Line(
                label: l10n.poConfirmTo,
                value: '${bank.bankName} •••• ${bank.last4}',
              ),
              _Line(
                label: l10n.poConfirmArrival,
                value: '${_date(from)} – ${_date(to)}',
              ),
              const SizedBox(height: BlocksSpacing.md),
              Text(l10n.poConfirmNote, style: ctx.text.bodySmall),
              if (needsStepUp) ...[
                const SizedBox(height: BlocksSpacing.md),
                StatusBanner.warning(title: l10n.poConfirmStepUp),
              ],
              const SizedBox(height: BlocksSpacing.lg),
              BlocksButton(
                label: l10n.poConfirmButton(formatRupees(amount)),
                icon: Icons.check_rounded,
                onPressed: () => Navigator.of(ctx).pop(true),
              ),
              const SizedBox(height: BlocksSpacing.sm),
              BlocksButton(
                label: l10n.cancel,
                variant: BlocksButtonVariant.tonal,
                onPressed: () => Navigator.of(ctx).pop(false),
              ),
            ],
          ),
        ),
      ),
    );
    if (!(confirmed ?? false) || !mounted) return;

    String? token;
    if (needsStepUp) {
      token = await showStepUp(context, StepUpPurpose.requestPayout);
      if (token == null || !mounted) return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final r = await ref
          .read(payoutRepositoryProvider)
          .requestPayout(
            amount: amount,
            accountId: bank.id,
            stepUpToken: token,
          );
      refreshPayoutData(ref);
      ref.invalidate(payoutOverviewProvider);
      if (mounted) {
        setState(() {
          _busy = false;
          _done = r;
        });
      }
    } on ValidationFailure catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = _reason(e.message);
      });
    } on UnauthorizedFailure {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = context.l10n.poErrStepUp;
      });
    } on AppFailure {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = context.l10n.errorBody;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final data = ref.watch(payoutOverviewProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.poRequestTitle)),
      body: SafeArea(
        child: ResponsiveCenter(
          maxWidth: 560,
          child: _done != null
              ? _Success(payout: _done!)
              : data.when(
                  loading: () => const LoadingView(),
                  error: (err, _) => ErrorView(
                    error: err,
                    onRetry: () => ref.invalidate(payoutOverviewProvider),
                  ),
                  data: (o) => _form(context, o),
                ),
        ),
      ),
    );
  }

  Widget _form(BuildContext context, PayoutOverview o) {
    final l10n = context.l10n;
    final verified = [
      for (final b in o.bankAccounts)
        if (b.status.isVerified) b,
    ];

    if (!o.eligibility.isEligible || verified.isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(BlocksSpacing.lg),
        children: [
          StatusBanner.warning(
            title: l10n.poNotReadyTitle,
            body: l10n.poNotReadyBody,
          ),
          const SizedBox(height: BlocksSpacing.lg),
          BlocksButton(
            label: l10n.poGoToCenter,
            onPressed: () => context.pushReplacement(Routes.payoutCenter),
          ),
        ],
      );
    }

    final bank = verified.firstWhere(
      (b) => b.id == _accountId,
      orElse: () => o.primaryBank != null && o.primaryBank!.status.isVerified
          ? o.primaryBank!
          : verified.first,
    );
    final amount = _value;
    final issue = amount == null
        ? null
        : PayoutRules.checkAmount(
            amount,
            available: o.available,
            config: o.config,
          );
    final valid = amount != null && issue == null;
    final (from, to) = PayoutRules.estimateArrival(
      ref.read(clockProvider)(),
      o.config,
    );
    final min = formatRupees(o.config.minimumAmount);

    return ListView(
      padding: const EdgeInsets.all(BlocksSpacing.lg),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      children: [
        BalanceTile(
          label: l10n.poAvailable,
          amount: o.available,
          color: context.blocks.success,
          caption: l10n.poMinimumIs(min),
        ),
        const SizedBox(height: BlocksSpacing.lg),
        TextField(
          controller: _amount,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          onChanged: (_) => setState(() => _error = null),
          style: context.text.headlineSmall,
          decoration: InputDecoration(
            labelText: l10n.poAmount,
            prefixText: '₹ ',
            errorText: issue == null
                ? null
                : issue == PayoutAmountIssue.belowMinimum
                ? l10n.poErrBelowMinimum
                : l10n.poErrExceeds,
          ),
        ),
        const SizedBox(height: BlocksSpacing.sm),
        Wrap(
          spacing: BlocksSpacing.sm,
          children: [
            PanelChip(
              label: min,
              selected: false,
              onTap: () =>
                  setState(() => _amount.text = '${o.config.minimumAmount}'),
            ),
            PanelChip(
              label: '25%',
              selected: false,
              onTap: () => setState(() => _amount.text = '${o.available ~/ 4}'),
            ),
            PanelChip(
              label: '50%',
              selected: false,
              onTap: () => setState(() => _amount.text = '${o.available ~/ 2}'),
            ),
            PanelChip(
              label: l10n.poAll,
              selected: false,
              onTap: () => setState(() => _amount.text = '${o.available}'),
            ),
          ],
        ),
        const SizedBox(height: BlocksSpacing.lg),
        Text(l10n.poSendTo, style: context.text.titleSmall),
        RadioGroup<String>(
          groupValue: bank.id,
          onChanged: (v) => setState(() => _accountId = v),
          child: Column(
            children: [
              for (final b in verified)
                RadioListTile<String>(
                  contentPadding: EdgeInsets.zero,
                  value: b.id,
                  title: Text('${b.bankName} •••• ${b.last4}'),
                  subtitle: Text(
                    b.isPrimary
                        ? '${b.holderName} · ${l10n.bankPrimary}'
                        : b.holderName,
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: BlocksSpacing.md),
        StudioCard(
          title: l10n.poSummaryTitle,
          child: Column(
            children: [
              _Line(
                label: l10n.poConfirmAmount,
                value: valid ? formatRupees(amount) : '—',
                big: true,
              ),
              _Line(
                label: l10n.poConfirmArrival,
                value: '${_date(from)} – ${_date(to)}',
              ),
              const SizedBox(height: BlocksSpacing.xs),
              Text(
                l10n.poRuleTiming(
                  o.config.estimatedDaysMin,
                  o.config.estimatedDaysMax,
                ),
                style: context.text.bodySmall,
              ),
            ],
          ),
        ),
        const SizedBox(height: BlocksSpacing.md),
        StatusBannerInfo(text: l10n.poTaxNote),
        if (_error != null) ...[
          const SizedBox(height: BlocksSpacing.md),
          StatusBanner.error(title: _error!),
        ],
        const SizedBox(height: BlocksSpacing.lg),
        BlocksButton(
          label: l10n.poReview,
          icon: Icons.arrow_forward_rounded,
          isLoading: _busy,
          onPressed: valid ? () => _review(o, bank) : null,
        ),
        const SizedBox(height: BlocksSpacing.xl),
      ],
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({required this.label, required this.value, this.big = false});

  final String label;
  final String value;
  final bool big;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(
      children: [
        Expanded(child: Text(label, style: context.text.bodyMedium)),
        Text(
          value,
          style: big ? context.text.titleLarge : context.text.titleSmall,
        ),
      ],
    ),
  );
}

class _Success extends StatelessWidget {
  const _Success({required this.payout});

  final PayoutRequest payout;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final locale = Localizations.localeOf(context).toString();
    String d(DateTime t) => DateFormat.MMMd(locale).format(t);
    return ListView(
      padding: const EdgeInsets.all(BlocksSpacing.lg),
      children: [
        SizedBox(
          height: 340,
          child: ResultPanel(
            icon: Icons.send_rounded,
            title: l10n.poSuccessTitle,
            body: l10n.poSuccessBody(
              formatRupees(payout.amount),
              payout.bankLabel,
              '${d(payout.estimatedFrom)} – ${d(payout.estimatedTo)}',
            ),
            actionLabel: l10n.poViewHistory,
            onAction: () => context.pushReplacement(Routes.payoutHistory),
            secondaryLabel: l10n.done,
            onSecondary: () => context.pop(),
          ),
        ),
        Center(
          child: Text(
            l10n.poReference(payout.reference),
            style: context.text.labelLarge,
          ),
        ),
        const SizedBox(height: BlocksSpacing.xl),
      ],
    );
  }
}
