import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/features/security/application/recovery_controllers.dart';
import 'package:blocks_app/features/security/application/security_providers.dart';
import 'package:blocks_app/features/security/presentation/widgets/otp_verification_form.dart';
import 'package:blocks_app/features/security/presentation/widgets/password_widgets.dart';
import 'package:blocks_app/features/security/presentation/widgets/status_widgets.dart';
import 'package:blocks_app/features/settings/presentation/settings_widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Change the account e-mail or phone number.
///
/// Current account -> new value (+ password) -> code sent to the NEW address
/// -> confirm -> updated. A sensitive identifier never changes without that
/// verification, and the previous address is alerted by the server.
class ChangeContactScreen extends ConsumerStatefulWidget {
  const ChangeContactScreen({required this.channel, super.key})
    : assert(
        channel == OtpChannel.email || channel == OtpChannel.phone,
        'only e-mail and phone can be changed',
      );

  final OtpChannel channel;

  @override
  ConsumerState<ChangeContactScreen> createState() =>
      _ChangeContactScreenState();
}

class _ChangeContactScreenState extends ConsumerState<ChangeContactScreen> {
  final _value = TextEditingController();
  final _password = TextEditingController();

  bool get _isEmail => widget.channel == OtpChannel.email;

  @override
  void dispose() {
    _value.dispose();
    _password.dispose();
    super.dispose();
  }

  String _title() =>
      _isEmail ? context.l10n.secChangeEmail : context.l10n.secChangePhone;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final provider = contactChangeControllerProvider(widget.channel);
    final state = ref.watch(provider);
    final notifier = ref.read(provider.notifier);
    final contacts = ref.watch(securityContactsProvider).value;
    final current = _isEmail ? contacts?.maskedEmail : contacts?.maskedPhone;

    return Scaffold(
      appBar: AppBar(title: Text(_title())),
      body: SafeArea(
        child: ResponsiveCenter(
          child: state.step == ContactStep.done
              ? ResultPanel(
                  icon: Icons.check_circle_rounded,
                  title: _isEmail
                      ? l10n.ccDoneEmailTitle
                      : l10n.ccDonePhoneTitle,
                  body: _isEmail ? l10n.ccDoneEmailBody : l10n.ccDonePhoneBody,
                  actionLabel: l10n.done,
                  onAction: () => context.pop(),
                )
              : ListView(
                  padding: const EdgeInsets.all(BlocksSpacing.lg),
                  children: switch (state.step) {
                    ContactStep.form => _form(context, state, current),
                    ContactStep.code => [
                      OtpVerificationForm(
                        challenge: state.challenge!,
                        description: l10n.tfCodeSentTo(
                          state.challenge!.maskedDestination,
                        ),
                        submitLabel: l10n.fpVerifyCode,
                        onVerify: notifier.verifyCode,
                        onResend: notifier.resend,
                        onVerified: (_) {},
                      ),
                    ],
                    ContactStep.confirm => _confirm(context, state),
                    ContactStep.done => const [],
                  },
                ),
        ),
      ),
    );
  }

  String? _errorText(FlowError? e) {
    final l10n = context.l10n;
    return switch (e) {
      null => null,
      FlowError.invalidEmail => l10n.fpErrEmail,
      FlowError.invalidPhone => l10n.fpErrPhone,
      FlowError.sameValue =>
        _isEmail ? l10n.ccErrSameEmail : l10n.ccErrSamePhone,
      FlowError.wrongPassword => l10n.tfWrongPassword,
      FlowError.tooManyAttempts => l10n.fpTooMany,
      _ => l10n.errorBody,
    };
  }

  List<Widget> _form(
    BuildContext context,
    ContactChangeState state,
    String? current,
  ) {
    final l10n = context.l10n;
    final notifier = ref.read(
      contactChangeControllerProvider(widget.channel).notifier,
    );
    final error = state.error;
    // The password error belongs on the password field, the rest on the value.
    final passwordError = error == FlowError.wrongPassword
        ? _errorText(error)
        : null;
    final valueError = error == null || error == FlowError.wrongPassword
        ? null
        : _errorText(error);
    final ready = _value.text.trim().isNotEmpty && _password.text.isNotEmpty;

    return [
      SettingsCard(
        child: SettingsInfoTile(
          icon: _isEmail
              ? Icons.alternate_email_rounded
              : Icons.phone_android_rounded,
          title: _isEmail ? l10n.ccCurrentEmail : l10n.ccCurrentPhone,
          subtitle: current ?? '',
        ),
      ),
      const SizedBox(height: BlocksSpacing.lg),
      TextField(
        controller: _value,
        autofocus: true,
        keyboardType: _isEmail
            ? TextInputType.emailAddress
            : TextInputType.phone,
        textInputAction: TextInputAction.next,
        inputFormatters: _isEmail
            ? null
            : [FilteringTextInputFormatter.allow(RegExp(r'[0-9+\-\s()]'))],
        onChanged: (_) {
          notifier.clearError();
          setState(() {});
        },
        decoration: InputDecoration(
          labelText: _isEmail ? l10n.ccNewEmail : l10n.ccNewPhone,
          prefixIcon: Icon(
            _isEmail
                ? Icons.alternate_email_rounded
                : Icons.phone_android_rounded,
          ),
          prefixText: _isEmail ? null : '+91 ',
          errorText: valueError,
          errorMaxLines: 3,
        ),
      ),
      const SizedBox(height: BlocksSpacing.md),
      Text(l10n.ccPasswordHint, style: context.text.bodySmall),
      const SizedBox(height: BlocksSpacing.sm),
      PasswordField(
        controller: _password,
        label: l10n.secPasswordLabel,
        textInputAction: TextInputAction.done,
        errorText: passwordError,
        onChanged: (_) {
          notifier.clearError();
          setState(() {});
        },
        onSubmitted: (_) {
          if (ready) {
            notifier.start(
              newValue: _value.text,
              currentPassword: _password.text,
            );
          }
        },
      ),
      const SizedBox(height: BlocksSpacing.xl),
      BlocksButton(
        label: l10n.ccSendCode,
        icon: Icons.send_rounded,
        isLoading: state.submitting,
        onPressed: ready
            ? () => notifier.start(
                newValue: _value.text,
                currentPassword: _password.text,
              )
            : null,
      ),
    ];
  }

  List<Widget> _confirm(BuildContext context, ContactChangeState state) {
    final l10n = context.l10n;
    final notifier = ref.read(
      contactChangeControllerProvider(widget.channel).notifier,
    );
    return [
      Semantics(
        header: true,
        child: Text(l10n.ccConfirmTitle, style: context.text.headlineSmall),
      ),
      const SizedBox(height: BlocksSpacing.sm),
      Text(
        _isEmail
            ? l10n.ccConfirmBodyEmail(state.newValue)
            : l10n.ccConfirmBodyPhone(state.newValue),
        style: context.text.bodyLarge,
      ),
      const SizedBox(height: BlocksSpacing.lg),
      if (state.error != null) ...[
        StatusBanner.error(title: _errorText(state.error) ?? ''),
        const SizedBox(height: BlocksSpacing.lg),
      ],
      BlocksButton(
        label: l10n.ccConfirm,
        icon: Icons.check_rounded,
        isLoading: state.submitting,
        onPressed: notifier.confirm,
      ),
    ];
  }
}
