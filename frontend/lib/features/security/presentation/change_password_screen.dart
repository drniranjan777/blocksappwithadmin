import 'dart:async';

import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/features/security/application/change_password_controller.dart';
import 'package:blocks_app/features/security/application/security_providers.dart';
import 'package:blocks_app/features/security/domain/password_policy.dart';
import 'package:blocks_app/features/security/presentation/widgets/password_widgets.dart';
import 'package:blocks_app/features/security/presentation/widgets/status_widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class ChangePasswordScreen extends ConsumerStatefulWidget {
  const ChangePasswordScreen({super.key});

  @override
  ConsumerState<ChangePasswordScreen> createState() =>
      _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends ConsumerState<ChangePasswordScreen> {
  final _current = TextEditingController();
  final _new = TextEditingController();
  final _confirm = TextEditingController();

  @override
  void dispose() {
    _current.dispose();
    _new.dispose();
    _confirm.dispose();
    super.dispose();
  }

  PasswordPolicy get _policy =>
      ref.read(securityPolicyProvider).value?.password ??
      const PasswordPolicy.demo();

  bool get _canSubmit =>
      _current.text.isNotEmpty &&
      _policy.isSatisfiedBy(_new.text) &&
      _confirm.text == _new.text;

  Future<void> _submit() async {
    if (!_canSubmit) return;
    FocusScope.of(context).unfocus();
    final ok = await ref
        .read(changePasswordControllerProvider.notifier)
        .submit(currentPassword: _current.text, newPassword: _new.text);
    if (ok) unawaited(HapticFeedback.mediumImpact());
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final state = ref.watch(changePasswordControllerProvider);
    final policy =
        ref.watch(securityPolicyProvider).value?.password ??
        const PasswordPolicy.demo();
    final typed = _new.text;
    final mismatch = _confirm.text.isNotEmpty && _confirm.text != typed;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.cpTitle)),
      body: SafeArea(
        child: ResponsiveCenter(
          child: state.succeeded
              ? ResultPanel(
                  icon: Icons.check_circle_rounded,
                  title: l10n.cpSuccessTitle,
                  body: l10n.cpSuccessBody,
                  actionLabel: l10n.done,
                  onAction: () => context.pop(),
                )
              : ListView(
                  padding: const EdgeInsets.all(BlocksSpacing.lg),
                  children: [
                    Text(l10n.cpIntro, style: context.text.bodyMedium),
                    const SizedBox(height: BlocksSpacing.lg),
                    if (state.error != null) ...[
                      StatusBanner.error(
                        title: _errorTitle(state.error!),
                        body: _errorBody(state.error!),
                      ),
                      const SizedBox(height: BlocksSpacing.lg),
                    ],
                    PasswordField(
                      controller: _current,
                      label: l10n.cpCurrent,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.password],
                      onChanged: (_) {
                        ref
                            .read(changePasswordControllerProvider.notifier)
                            .clearError();
                        setState(() {});
                      },
                    ),
                    const SizedBox(height: BlocksSpacing.md),
                    PasswordField(
                      controller: _new,
                      label: l10n.cpNew,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.newPassword],
                      onChanged: (_) => setState(() {}),
                    ),
                    const SizedBox(height: BlocksSpacing.md),
                    PasswordStrengthMeter(
                      strength: typed.isEmpty ? null : policy.strengthOf(typed),
                    ),
                    const SizedBox(height: BlocksSpacing.md),
                    PasswordRequirementsList(policy: policy, password: typed),
                    const SizedBox(height: BlocksSpacing.lg),
                    PasswordField(
                      controller: _confirm,
                      label: l10n.cpConfirm,
                      textInputAction: TextInputAction.done,
                      autofillHints: const [AutofillHints.newPassword],
                      errorText: mismatch ? l10n.cpMismatch : null,
                      onChanged: (_) => setState(() {}),
                      onSubmitted: (_) => _submit(),
                    ),
                    const SizedBox(height: BlocksSpacing.xl),
                    BlocksButton(
                      label: l10n.cpSubmit,
                      icon: Icons.lock_reset_rounded,
                      isLoading: state.submitting,
                      onPressed: _canSubmit ? _submit : null,
                    ),
                    const SizedBox(height: BlocksSpacing.sm),
                    BlocksButton(
                      label: l10n.cpForgot,
                      variant: BlocksButtonVariant.ghost,
                      onPressed: () => context.push(Routes.resetPassword),
                    ),
                  ],
                ),
        ),
      ),
    );
  }

  String _errorTitle(PasswordChangeError e) => switch (e) {
    PasswordChangeError.weak => context.l10n.cpErrWeak,
    PasswordChangeError.same => context.l10n.cpErrSame,
    _ => context.l10n.cpErrorTitle,
  };

  String? _errorBody(PasswordChangeError e) => switch (e) {
    PasswordChangeError.wrongCurrent ||
    PasswordChangeError.other => context.l10n.cpErrorBody,
    _ => null,
  };
}
