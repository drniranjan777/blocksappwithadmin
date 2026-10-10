import 'package:blocks_app/app/config/app_config.dart';
import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/features/security/application/recovery_controllers.dart';
import 'package:blocks_app/features/security/application/security_providers.dart';
import 'package:blocks_app/features/security/domain/password_policy.dart';
import 'package:blocks_app/features/security/presentation/widgets/otp_verification_form.dart';
import 'package:blocks_app/features/security/presentation/widgets/password_widgets.dart';
import 'package:blocks_app/features/security/presentation/widgets/status_widgets.dart';
import 'package:blocks_app/l10n/gen/app_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Reset a forgotten password by e-mail or by phone.
///
/// Email:  Choose Email -> Enter Email -> Send Verification Code -> Enter OTP
///         -> Create New Password -> Password Changed Successfully
/// Phone:  Choose Phone -> Enter Phone Number -> Send OTP -> Verify OTP
///         -> Create New Password -> Success
///
/// [inApp] is the signed-in variant (opened from Change Password); the other
/// is reachable while signed out from the sign-in screen.
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key, this.inApp = false});

  final bool inApp;

  @override
  ConsumerState<ForgotPasswordScreen> createState() =>
      _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _destination = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();

  @override
  void dispose() {
    _destination.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  void _leave() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(widget.inApp ? Routes.security : Routes.signIn);
    }
  }

  void _back() {
    final stepped = ref.read(resetPasswordControllerProvider.notifier).back();
    if (!stepped) _leave();
  }

  int _stepNumber(ResetStep s) => switch (s) {
    ResetStep.method => 1,
    ResetStep.destination => 2,
    ResetStep.code => 3,
    ResetStep.password => 4,
    ResetStep.done => 4,
  };

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final state = ref.watch(resetPasswordControllerProvider);
    final done = state.step == ResetStep.done;

    return PopScope(
      canPop: state.step == ResetStep.method || done,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _back();
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(l10n.fpTitle),
          leading: IconButton(
            tooltip: l10n.backTooltip,
            icon: const Icon(Icons.arrow_back_rounded),
            onPressed: done ? _leave : _back,
          ),
        ),
        body: SafeArea(
          child: ResponsiveCenter(
            child: done
                ? ResultPanel(
                    icon: Icons.check_circle_rounded,
                    title: l10n.fpDoneTitle,
                    body: widget.inApp ? l10n.fpDoneBodyInApp : l10n.fpDoneBody,
                    actionLabel: widget.inApp ? l10n.done : l10n.fpBackToSignIn,
                    onAction: _leave,
                  )
                : ListView(
                    padding: const EdgeInsets.all(BlocksSpacing.lg),
                    children: [
                      Semantics(
                        label: l10n.fpStep(_stepNumber(state.step), 4),
                        child: LinearProgressIndicator(
                          value: _stepNumber(state.step) / 4,
                          minHeight: 4,
                          borderRadius: BorderRadius.circular(
                            BlocksRadius.pill,
                          ),
                        ),
                      ),
                      const SizedBox(height: BlocksSpacing.xs),
                      Text(
                        l10n.fpStep(_stepNumber(state.step), 4),
                        style: context.text.labelMedium,
                      ),
                      const SizedBox(height: BlocksSpacing.lg),
                      _stepBody(context, state),
                    ],
                  ),
          ),
        ),
      ),
    );
  }

  Widget _stepBody(BuildContext context, ResetState state) {
    switch (state.step) {
      case ResetStep.method:
        return _MethodStep(
          onChoose: (c) => ref
              .read(resetPasswordControllerProvider.notifier)
              .chooseChannel(c),
        );
      case ResetStep.destination:
        return _DestinationStep(
          channel: state.channel!,
          controller: _destination,
          state: state,
          onChanged: () {
            ref.read(resetPasswordControllerProvider.notifier).clearError();
            setState(() {});
          },
          onSend: () => ref
              .read(resetPasswordControllerProvider.notifier)
              .sendCode(_destination.text),
        );
      case ResetStep.code:
        final notifier = ref.read(resetPasswordControllerProvider.notifier);
        final challenge = state.challenge!;
        return OtpVerificationForm(
          challenge: challenge,
          description: context.l10n.tfCodeSentTo(challenge.maskedDestination),
          submitLabel: context.l10n.fpVerifyCode,
          onVerify: notifier.verifyCode,
          onResend: notifier.resend,
          onVerified: (_) {},
        );
      case ResetStep.password:
        return _PasswordStep(
          password: _password,
          confirm: _confirm,
          state: state,
          onChanged: () => setState(() {}),
          onSubmit: () => ref
              .read(resetPasswordControllerProvider.notifier)
              .complete(_password.text),
        );
      case ResetStep.done:
        return const SizedBox.shrink();
    }
  }
}

// ----------------------------------------------------------------- steps --

class _MethodStep extends StatelessWidget {
  const _MethodStep({required this.onChoose});

  final ValueChanged<OtpChannel> onChoose;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(
          header: true,
          child: Text(l10n.fpChooseTitle, style: context.text.headlineSmall),
        ),
        const SizedBox(height: BlocksSpacing.xs),
        Text(l10n.fpChooseBody, style: context.text.bodyMedium),
        const SizedBox(height: BlocksSpacing.lg),
        _MethodCard(
          icon: Icons.alternate_email_rounded,
          title: l10n.fpViaEmail,
          body: l10n.fpEmailBody,
          onTap: () => onChoose(OtpChannel.email),
        ),
        const SizedBox(height: BlocksSpacing.md),
        _MethodCard(
          icon: Icons.phone_android_rounded,
          title: l10n.fpViaPhone,
          body: l10n.fpPhoneBody,
          onTap: () => onChoose(OtpChannel.phone),
        ),
      ],
    );
  }
}

class _MethodCard extends StatelessWidget {
  const _MethodCard({
    required this.icon,
    required this.title,
    required this.body,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String body;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: '$title. $body',
      excludeSemantics: true,
      child: Material(
        color: context.scheme.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(BlocksRadius.xl),
          side: BorderSide(color: context.scheme.outlineVariant),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(BlocksSpacing.lg),
            child: Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: context.scheme.primaryContainer,
                    borderRadius: BorderRadius.circular(BlocksRadius.md),
                  ),
                  child: Icon(icon, color: context.scheme.onPrimaryContainer),
                ),
                const SizedBox(width: BlocksSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: context.text.titleSmall),
                      const SizedBox(height: 2),
                      Text(body, style: context.text.bodySmall),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right_rounded),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

String? _destinationError(AppLocalizations l10n, FlowError? e) => switch (e) {
  null => null,
  FlowError.invalidEmail => l10n.fpErrEmail,
  FlowError.invalidPhone => l10n.fpErrPhone,
  FlowError.tooManyAttempts => l10n.fpTooMany,
  _ => l10n.errorBody,
};

class _DestinationStep extends ConsumerWidget {
  const _DestinationStep({
    required this.channel,
    required this.controller,
    required this.state,
    required this.onChanged,
    required this.onSend,
  });

  final OtpChannel channel;
  final TextEditingController controller;
  final ResetState state;
  final VoidCallback onChanged;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final isEmail = channel == OtpChannel.email;
    final isDemo = ref.watch(appConfigProvider).isDemo;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(
          header: true,
          child: Text(
            isEmail ? l10n.fpViaEmail : l10n.fpViaPhone,
            style: context.text.headlineSmall,
          ),
        ),
        const SizedBox(height: BlocksSpacing.xs),
        Text(
          isEmail ? l10n.fpEmailBody : l10n.fpPhoneBody,
          style: context.text.bodyMedium,
        ),
        const SizedBox(height: BlocksSpacing.lg),
        TextField(
          controller: controller,
          autofocus: true,
          keyboardType: isEmail
              ? TextInputType.emailAddress
              : TextInputType.phone,
          textInputAction: TextInputAction.done,
          autofillHints: [
            if (isEmail) AutofillHints.email else AutofillHints.telephoneNumber,
          ],
          inputFormatters: isEmail
              ? null
              : [FilteringTextInputFormatter.allow(RegExp(r'[0-9+\-\s()]'))],
          onChanged: (_) => onChanged(),
          onSubmitted: (_) {
            if (controller.text.trim().isNotEmpty) onSend();
          },
          decoration: InputDecoration(
            labelText: isEmail ? l10n.fpEmailLabel : l10n.fpPhoneLabel,
            prefixIcon: Icon(
              isEmail
                  ? Icons.alternate_email_rounded
                  : Icons.phone_android_rounded,
            ),
            prefixText: isEmail ? null : '+91 ',
            errorText: _destinationError(l10n, state.error),
            errorMaxLines: 3,
          ),
        ),
        if (isDemo) ...[
          const SizedBox(height: BlocksSpacing.sm),
          Text(l10n.fpDemoAny, style: context.text.bodySmall),
        ],
        const SizedBox(height: BlocksSpacing.lg),
        BlocksButton(
          label: isEmail ? l10n.fpSendCode : l10n.fpSendOtp,
          icon: Icons.send_rounded,
          isLoading: state.submitting,
          onPressed: controller.text.trim().isEmpty ? null : onSend,
        ),
      ],
    );
  }
}

class _PasswordStep extends ConsumerWidget {
  const _PasswordStep({
    required this.password,
    required this.confirm,
    required this.state,
    required this.onChanged,
    required this.onSubmit,
  });

  final TextEditingController password;
  final TextEditingController confirm;
  final ResetState state;
  final VoidCallback onChanged;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final policy =
        ref.watch(securityPolicyProvider).value?.password ??
        const PasswordPolicy.demo();
    final typed = password.text;
    final mismatch = confirm.text.isNotEmpty && confirm.text != typed;
    final valid =
        policy.isSatisfiedBy(typed) && confirm.text == typed && !mismatch;

    final error = state.error;
    final errorText = switch (error) {
      null => null,
      FlowError.weakPassword => l10n.cpErrWeak,
      FlowError.expired => l10n.fpExpired,
      _ => l10n.errorBody,
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(
          header: true,
          child: Text(l10n.fpNewTitle, style: context.text.headlineSmall),
        ),
        const SizedBox(height: BlocksSpacing.xs),
        Text(l10n.fpNewBody, style: context.text.bodyMedium),
        const SizedBox(height: BlocksSpacing.lg),
        if (errorText != null) ...[
          StatusBanner.error(title: errorText),
          const SizedBox(height: BlocksSpacing.lg),
        ],
        PasswordField(
          controller: password,
          label: l10n.cpNew,
          textInputAction: TextInputAction.next,
          autofillHints: const [AutofillHints.newPassword],
          onChanged: (_) {
            ref.read(resetPasswordControllerProvider.notifier).clearError();
            onChanged();
          },
        ),
        const SizedBox(height: BlocksSpacing.md),
        PasswordStrengthMeter(
          strength: typed.isEmpty ? null : policy.strengthOf(typed),
        ),
        const SizedBox(height: BlocksSpacing.md),
        PasswordRequirementsList(policy: policy, password: typed),
        const SizedBox(height: BlocksSpacing.lg),
        PasswordField(
          controller: confirm,
          label: l10n.cpConfirm,
          textInputAction: TextInputAction.done,
          autofillHints: const [AutofillHints.newPassword],
          errorText: mismatch ? l10n.cpMismatch : null,
          onChanged: (_) => onChanged(),
          onSubmitted: (_) {
            if (valid) onSubmit();
          },
        ),
        const SizedBox(height: BlocksSpacing.xl),
        BlocksButton(
          label: l10n.fpSave,
          icon: Icons.lock_reset_rounded,
          isLoading: state.submitting,
          onPressed: valid ? onSubmit : null,
        ),
      ],
    );
  }
}
