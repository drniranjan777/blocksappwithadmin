import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/data/models/payout_models.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/security/presentation/widgets/otp_verification_form.dart';
import 'package:blocks_app/features/security/presentation/widgets/password_widgets.dart';
import 'package:blocks_app/features/security/presentation/widgets/status_widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Asks the creator to prove it is them, again, before a sensitive money
/// action: their **password**, then a **one-time code** (their two-factor code
/// if two-factor is on, otherwise a code to their e-mail).
///
/// Returns the single-use step-up token for [purpose], or null if the sheet
/// was dismissed. The server will not perform the action without it.
Future<String?> showStepUp(BuildContext context, StepUpPurpose purpose) {
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (_) => StepUpSheet(purpose: purpose),
  );
}

class StepUpSheet extends ConsumerStatefulWidget {
  const StepUpSheet({required this.purpose, super.key});

  final StepUpPurpose purpose;

  @override
  ConsumerState<StepUpSheet> createState() => _StepUpSheetState();
}

class _StepUpSheetState extends ConsumerState<StepUpSheet> {
  final _password = TextEditingController();
  OtpChallenge? _challenge;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    // The password never outlives this sheet.
    _password.clear();
    _password.dispose();
    super.dispose();
  }

  String _why(BuildContext context) {
    final l = context.l10n;
    return switch (widget.purpose) {
      StepUpPurpose.addBankAccount => l.suWhyAddBank,
      StepUpPurpose.changeBankAccount => l.suWhyChangeBank,
      StepUpPurpose.removeBankAccount => l.suWhyRemoveBank,
      StepUpPurpose.requestPayout => l.suWhyPayout,
      StepUpPurpose.updateTaxInfo => l.suWhyTax,
    };
  }

  Future<void> _submitPassword() async {
    if (_password.text.isEmpty || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final l = context.l10n;
    try {
      final challenge = await ref
          .read(stepUpRepositoryProvider)
          .begin(widget.purpose, password: _password.text);
      if (!mounted) return;
      _password.clear();
      setState(() {
        _challenge = challenge;
        _busy = false;
      });
    } on ValidationFailure catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e.message == 'wrongPassword' ? l.suWrongPassword : l.errorBody;
      });
    } on AppFailure {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = l.errorBody;
      });
    }
  }

  String _codeDescription(BuildContext context, OtpChallenge c) {
    final l = context.l10n;
    return switch (c.channel) {
      OtpChannel.authenticator => l.suCodeAuthenticator,
      OtpChannel.phone => l.suCodeSentPhone(c.maskedDestination),
      OtpChannel.email => l.suCodeSentEmail(c.maskedDestination),
    };
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final repo = ref.read(stepUpRepositoryProvider);
    final challenge = _challenge;

    return Padding(
      padding: EdgeInsets.fromLTRB(
        BlocksSpacing.lg,
        0,
        BlocksSpacing.lg,
        MediaQuery.viewInsetsOf(context).bottom + BlocksSpacing.lg,
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Icon(Icons.shield_rounded, color: context.scheme.primary),
                const SizedBox(width: BlocksSpacing.sm),
                Expanded(
                  child: Semantics(
                    header: true,
                    child: Text(l.suTitle, style: context.text.titleLarge),
                  ),
                ),
              ],
            ),
            const SizedBox(height: BlocksSpacing.sm),
            Text(_why(context), style: context.text.bodyMedium),
            const SizedBox(height: BlocksSpacing.lg),
            if (challenge == null) ...[
              PasswordField(
                controller: _password,
                label: l.secPasswordLabel,
                errorText: _error,
                textInputAction: TextInputAction.done,
                onChanged: (_) => setState(() => _error = null),
                onSubmitted: (_) => _submitPassword(),
              ),
              const SizedBox(height: BlocksSpacing.lg),
              BlocksButton(
                label: l.next,
                isLoading: _busy,
                onPressed: _password.text.isEmpty ? null : _submitPassword,
              ),
            ] else
              OtpVerificationForm(
                challenge: challenge,
                description: _codeDescription(context, challenge),
                submitLabel: l.suConfirm,
                onVerify: (code) =>
                    repo.verify(challengeId: challenge.id, code: code),
                onResend: () => repo.resend(challenge.id),
                onVerified: (token) => Navigator.of(context).pop(token),
              ),
            const SizedBox(height: BlocksSpacing.md),
            StatusBanner.warning(title: l.suNeverShare),
          ],
        ),
      ),
    );
  }
}
