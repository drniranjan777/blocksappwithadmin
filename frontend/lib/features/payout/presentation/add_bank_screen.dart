import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/utils/debouncer.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/data/models/payout_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/kyc/application/kyc_providers.dart';
import 'package:blocks_app/features/payout/application/payout_providers.dart';
import 'package:blocks_app/features/payout/domain/bank_validator.dart';
import 'package:blocks_app/features/payout/presentation/payout_center_screen.dart';
import 'package:blocks_app/features/payout/presentation/payout_labels.dart';
import 'package:blocks_app/features/payout/presentation/step_up_sheet.dart';
import 'package:blocks_app/features/profile/application/user_providers.dart';
import 'package:blocks_app/features/security/presentation/widgets/status_widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Add a payout bank account.
///
/// The account number is typed twice, sent once (after a password + code
/// confirmation) and then **never shown again**: from here on the app only
/// holds the masked number the server returns.
class AddBankScreen extends ConsumerStatefulWidget {
  const AddBankScreen({super.key});

  @override
  ConsumerState<AddBankScreen> createState() => _AddBankScreenState();
}

class _AddBankScreenState extends ConsumerState<AddBankScreen> {
  final _holder = TextEditingController();
  final _account = TextEditingController();
  final _confirm = TextEditingController();
  final _ifsc = TextEditingController();
  final _debounce = Debouncer(delay: const Duration(milliseconds: 300));
  BankAccountType _type = BankAccountType.savings;
  BankBranch? _branch;
  bool _lookingUp = false;
  bool _ifscNotFound = false;
  bool _saving = false;
  bool _prefilled = false;
  Map<BankField, String> _errors = const {};
  String? _formError;
  BankAccount? _result;

  @override
  void dispose() {
    _debounce.dispose();
    _holder.dispose();
    // Account numbers do not outlive the form.
    _account
      ..clear()
      ..dispose();
    _confirm
      ..clear()
      ..dispose();
    _ifsc.dispose();
    super.dispose();
  }

  Future<void> _lookup(String raw) async {
    final code = BankAccountValidator.normalizeIfsc(raw);
    if (!BankAccountValidator.isValidIfsc(code)) {
      setState(() {
        _branch = null;
        _ifscNotFound = false;
      });
      return;
    }
    setState(() => _lookingUp = true);
    final found = await ref
        .read(bankAccountRepositoryProvider)
        .lookupIfsc(code);
    if (!mounted || BankAccountValidator.normalizeIfsc(_ifsc.text) != code) {
      return;
    }
    setState(() {
      _lookingUp = false;
      _branch = found;
      _ifscNotFound = found == null;
    });
  }

  BankAccountInput _input() => BankAccountInput(
    holderName: _holder.text,
    accountNumber: _account.text,
    confirmAccountNumber: _confirm.text,
    ifsc: _ifsc.text,
    type: _type,
  );

  String _message(BankField f, String code) {
    final l = context.l10n;
    return switch ((f, code)) {
      (BankField.holderName, 'required') => l.bankErrHolderRequired,
      (BankField.holderName, _) => l.bankErrHolderInvalid,
      (BankField.accountNumber, 'required') => l.bankErrAccountRequired,
      (BankField.accountNumber, 'duplicate') => l.bankErrDuplicate,
      (BankField.accountNumber, _) => l.bankErrAccountInvalid,
      (BankField.confirmAccountNumber, 'mismatch') => l.bankErrConfirmMismatch,
      (BankField.confirmAccountNumber, _) => l.bankErrConfirmRequired,
      (BankField.ifsc, 'required') => l.bankErrIfscRequired,
      (BankField.ifsc, 'unknown') => l.bankErrIfscUnknown,
      (BankField.ifsc, _) => l.bankErrIfscInvalid,
    };
  }

  Future<void> _save() async {
    final local = BankAccountValidator.validate(_input());
    if (local.isNotEmpty || _ifscNotFound) {
      setState(() {
        _errors = {
          for (final e in local.entries) e.key: e.value.name,
          if (_ifscNotFound && !local.containsKey(BankField.ifsc))
            BankField.ifsc: 'unknown',
        };
        _formError = null;
      });
      return;
    }
    setState(() {
      _errors = const {};
      _formError = null;
    });

    final token = await showStepUp(context, StepUpPurpose.addBankAccount);
    if (token == null || !mounted) return;

    setState(() => _saving = true);
    try {
      final account = await ref
          .read(bankAccountRepositoryProvider)
          .addAccount(_input(), stepUpToken: token);
      _account.clear();
      _confirm.clear();
      refreshPayoutData(ref);
      if (mounted) {
        setState(() {
          _saving = false;
          _result = account;
        });
      }
    } on FieldValidationFailure catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _errors = {
          for (final f in e.errors.entries)
            ?BankField.values.where((b) => b.name == f.key).firstOrNull:
                f.value,
        };
      });
    } on AppFailure {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _formError = context.l10n.errorBody;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final result = _result;

    // Start from the verified legal name when there is one.
    if (!_prefilled) {
      final legal = ref.watch(kycApplicationProvider).value?.legalName;
      final me = ref.watch(currentUserProvider).value?.name;
      final name = (legal != null && legal.isNotEmpty) ? legal : me;
      if (name != null) {
        _prefilled = true;
        _holder.text = name;
      }
    }

    return Scaffold(
      appBar: AppBar(title: Text(l10n.bankAddTitle)),
      body: SafeArea(
        child: ResponsiveCenter(
          maxWidth: 560,
          child: result != null
              ? _Result(
                  account: result,
                  onEdit: () => setState(() => _result = null),
                )
              : ListView(
                  padding: const EdgeInsets.all(BlocksSpacing.lg),
                  keyboardDismissBehavior:
                      ScrollViewKeyboardDismissBehavior.onDrag,
                  children: [
                    StatusBannerInfo(text: l10n.bankFormNote),
                    const SizedBox(height: BlocksSpacing.lg),
                    TextField(
                      controller: _holder,
                      textCapitalization: TextCapitalization.words,
                      autocorrect: false,
                      enableSuggestions: false,
                      decoration: InputDecoration(
                        labelText: l10n.bankHolder,
                        helperText: l10n.bankHolderHelp,
                        errorText: _errors.containsKey(BankField.holderName)
                            ? _message(
                                BankField.holderName,
                                _errors[BankField.holderName]!,
                              )
                            : null,
                      ),
                    ),
                    const SizedBox(height: BlocksSpacing.md),
                    TextField(
                      controller: _account,
                      keyboardType: TextInputType.number,
                      autocorrect: false,
                      enableSuggestions: false,
                      enableIMEPersonalizedLearning: false,
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(RegExp(r'[0-9 ]')),
                        LengthLimitingTextInputFormatter(23),
                      ],
                      decoration: InputDecoration(
                        labelText: l10n.bankAccountNumber,
                        errorText: _errors.containsKey(BankField.accountNumber)
                            ? _message(
                                BankField.accountNumber,
                                _errors[BankField.accountNumber]!,
                              )
                            : null,
                      ),
                    ),
                    const SizedBox(height: BlocksSpacing.md),
                    TextField(
                      controller: _confirm,
                      keyboardType: TextInputType.number,
                      autocorrect: false,
                      enableSuggestions: false,
                      enableIMEPersonalizedLearning: false,
                      // Retype it: pasting would defeat the point.
                      enableInteractiveSelection: false,
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(RegExp(r'[0-9 ]')),
                        LengthLimitingTextInputFormatter(23),
                      ],
                      decoration: InputDecoration(
                        labelText: l10n.bankConfirmAccount,
                        errorText:
                            _errors.containsKey(BankField.confirmAccountNumber)
                            ? _message(
                                BankField.confirmAccountNumber,
                                _errors[BankField.confirmAccountNumber]!,
                              )
                            : null,
                      ),
                    ),
                    const SizedBox(height: BlocksSpacing.md),
                    TextField(
                      controller: _ifsc,
                      textCapitalization: TextCapitalization.characters,
                      autocorrect: false,
                      enableSuggestions: false,
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(
                          RegExp('[A-Za-z0-9]'),
                        ),
                        LengthLimitingTextInputFormatter(11),
                      ],
                      onChanged: (v) => _debounce.run(() => _lookup(v)),
                      decoration: InputDecoration(
                        labelText: l10n.bankIfsc,
                        hintText: 'HDFC0001234',
                        suffixIcon: _lookingUp
                            ? const Padding(
                                padding: EdgeInsets.all(12),
                                child: SizedBox.square(
                                  dimension: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                ),
                              )
                            : null,
                        errorText: _errors.containsKey(BankField.ifsc)
                            ? _message(BankField.ifsc, _errors[BankField.ifsc]!)
                            : null,
                      ),
                    ),
                    if (_branch != null)
                      Padding(
                        padding: const EdgeInsets.only(top: BlocksSpacing.sm),
                        child: Semantics(
                          liveRegion: true,
                          child: Row(
                            children: [
                              Icon(
                                Icons.account_balance_rounded,
                                size: 18,
                                color: context.blocks.success,
                              ),
                              const SizedBox(width: BlocksSpacing.sm),
                              Expanded(
                                child: Text(
                                  '${_branch!.bankName} · ${_branch!.branch}, ${_branch!.city}',
                                  style: context.text.bodyMedium,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    const SizedBox(height: BlocksSpacing.lg),
                    Text(l10n.bankType, style: context.text.titleSmall),
                    const SizedBox(height: BlocksSpacing.xs),
                    SegmentedButton<BankAccountType>(
                      showSelectedIcon: false,
                      segments: [
                        for (final t in BankAccountType.values)
                          ButtonSegment(
                            value: t,
                            label: Text(accountTypeLabel(l10n, t)),
                          ),
                      ],
                      selected: {_type},
                      onSelectionChanged: (v) =>
                          setState(() => _type = v.first),
                    ),
                    const SizedBox(height: BlocksSpacing.xl),
                    if (_formError != null)
                      Padding(
                        padding: const EdgeInsets.only(
                          bottom: BlocksSpacing.md,
                        ),
                        child: StatusBanner.error(title: _formError!),
                      ),
                    BlocksButton(
                      label: l10n.bankSaveAndVerify,
                      icon: Icons.verified_user_rounded,
                      isLoading: _saving,
                      onPressed: _save,
                    ),
                    if (_saving)
                      Padding(
                        padding: const EdgeInsets.only(top: BlocksSpacing.md),
                        child: Semantics(
                          liveRegion: true,
                          child: Text(
                            l10n.bankVerifyingNow,
                            textAlign: TextAlign.center,
                            style: context.text.bodyMedium,
                          ),
                        ),
                      ),
                    const SizedBox(height: BlocksSpacing.xl),
                  ],
                ),
        ),
      ),
    );
  }
}

class _Result extends ConsumerWidget {
  const _Result({required this.account, required this.onEdit});

  final BankAccount account;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final s = account.status;
    final (kind, icon) = switch (s) {
      BankVerificationStatus.verified => (
        StatusKind.success,
        Icons.verified_rounded,
      ),
      BankVerificationStatus.awaitingIdentity ||
      BankVerificationStatus.verifying => (
        StatusKind.info,
        Icons.hourglass_top_rounded,
      ),
      BankVerificationStatus.nameMismatch || BankVerificationStatus.failed => (
        StatusKind.error,
        Icons.person_off_rounded,
      ),
    };
    return ListView(
      padding: const EdgeInsets.all(BlocksSpacing.lg),
      children: [
        SizedBox(
          height: 360,
          child: ResultPanel(
            icon: icon,
            kind: kind,
            title: bankStatusLabel(l10n, s),
            body: bankStatusHint(l10n, s),
            actionLabel: s == BankVerificationStatus.awaitingIdentity
                ? l10n.poActionVerify
                : l10n.done,
            onAction: () => s == BankVerificationStatus.awaitingIdentity
                ? context.pushReplacement(Routes.kycFlow)
                : context.pop(),
            secondaryLabel: s.needsAttention ? l10n.bankEditDetails : null,
            onSecondary: s.needsAttention ? onEdit : null,
          ),
        ),
        BankAccountCard(account: account),
        if (s.needsAttention) ...[
          const SizedBox(height: BlocksSpacing.md),
          BlocksButton(
            label: l10n.bankManageAccounts,
            variant: BlocksButtonVariant.tonal,
            onPressed: () => context.pushReplacement(Routes.payoutBank),
          ),
        ],
        const SizedBox(height: BlocksSpacing.xl),
      ],
    );
  }
}
