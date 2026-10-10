import 'package:blocks_app/app/config/app_config.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/app_snack.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/security/application/security_providers.dart';
import 'package:blocks_app/features/security/presentation/widgets/otp_verification_form.dart';
import 'package:blocks_app/features/security/presentation/widgets/password_widgets.dart';
import 'package:blocks_app/features/security/presentation/widgets/status_widgets.dart';
import 'package:blocks_app/features/settings/presentation/settings_widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Turn two-factor authentication on or off and choose how codes arrive.
/// Demo: the codes are mocked; the server checks them in production.
class TwoFactorScreen extends ConsumerStatefulWidget {
  const TwoFactorScreen({super.key});

  @override
  ConsumerState<TwoFactorScreen> createState() => _TwoFactorScreenState();
}

class _TwoFactorScreenState extends ConsumerState<TwoFactorScreen> {
  TwoFactorMethod _method = TwoFactorMethod.sms;
  bool _starting = false;

  Future<void> _enable() async {
    if (_starting) return;
    setState(() => _starting = true);
    final l10n = context.l10n;
    try {
      final challenge = await ref
          .read(securityRepositoryProvider)
          .startTwoFactorSetup(_method);
      if (!mounted) return;
      // The request is finished; do not leave a spinner behind the sheet.
      setState(() => _starting = false);
      final done = await showModalBottomSheet<bool>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        builder: (_) => _SetupSheet(challenge: challenge, method: _method),
      );
      if (done ?? false) {
        refreshSecurity(ref);
        if (mounted) showAppSnack(context, l10n.tfEnabledToast);
      }
    } on AppFailure {
      if (mounted) showAppSnack(context, l10n.errorBody);
    } finally {
      if (mounted) setState(() => _starting = false);
    }
  }

  Future<void> _disable() async {
    final l10n = context.l10n;
    final done = await showDialog<bool>(
      context: context,
      builder: (_) => const _DisableDialog(),
    );
    if (done ?? false) {
      refreshSecurity(ref);
      if (mounted) showAppSnack(context, l10n.tfDisabledToast);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final settings = ref.watch(twoFactorProvider);
    final contacts = ref.watch(securityContactsProvider).value;
    final isDemo = ref.watch(appConfigProvider).isDemo;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.tfTitle)),
      body: SafeArea(
        child: ResponsiveCenter(
          child: AsyncValueView<TwoFactorSettings>(
            value: settings,
            onRetry: () => ref.invalidate(twoFactorProvider),
            data: (tf) => ListView(
              padding: const EdgeInsets.all(BlocksSpacing.lg),
              children: [
                Text(l10n.tfIntro, style: context.text.bodyMedium),
                const SizedBox(height: BlocksSpacing.lg),
                SettingsCard(
                  child: SwitchListTile(
                    secondary: Icon(
                      tf.enabled
                          ? Icons.verified_user_rounded
                          : Icons.shield_outlined,
                      color: tf.enabled
                          ? context.blocks.success
                          : context.scheme.onSurfaceVariant,
                    ),
                    title: Text(
                      tf.enabled ? l10n.tfStatusOn : l10n.tfStatusOff,
                    ),
                    value: tf.enabled,
                    onChanged: _starting
                        ? null
                        : (on) => on ? _enable() : _disable(),
                  ),
                ),
                if (tf.enabled) ...[
                  SettingsSection(
                    title: l10n.tfMethod,
                    children: [
                      SettingsInfoTile(
                        icon: tf.method == TwoFactorMethod.sms
                            ? Icons.sms_outlined
                            : Icons.phonelink_lock_rounded,
                        title: tf.method == TwoFactorMethod.sms
                            ? l10n.tfSms
                            : l10n.tfAuthenticator,
                        subtitle: tf.method == TwoFactorMethod.sms
                            ? l10n.tfSmsBody(contacts?.maskedPhone ?? '')
                            : l10n.tfAuthenticatorBody,
                      ),
                      SwitchListTile(
                        secondary: const Icon(Icons.alternate_email_rounded),
                        title: Text(l10n.tfEmailFallback),
                        subtitle: Text(l10n.tfEmailFallbackBody),
                        value: tf.emailFallback,
                        onChanged: (v) async {
                          await ref
                              .read(securityRepositoryProvider)
                              .setEmailFallback(enabled: v);
                          ref.invalidate(twoFactorProvider);
                        },
                      ),
                    ],
                  ),
                  const SizedBox(height: BlocksSpacing.lg),
                  BlocksButton(
                    label: l10n.tfDisable,
                    icon: Icons.shield_outlined,
                    variant: BlocksButtonVariant.outline,
                    onPressed: _disable,
                  ),
                ] else ...[
                  SettingsSection(
                    title: l10n.tfChooseMethod,
                    children: [
                      RadioGroup<TwoFactorMethod>(
                        groupValue: _method,
                        onChanged: (m) =>
                            setState(() => _method = m ?? TwoFactorMethod.sms),
                        child: Column(
                          children: [
                            RadioListTile<TwoFactorMethod>(
                              value: TwoFactorMethod.sms,
                              title: Text(l10n.tfSms),
                              subtitle: Text(
                                l10n.tfSmsBody(contacts?.maskedPhone ?? ''),
                              ),
                            ),
                            RadioListTile<TwoFactorMethod>(
                              value: TwoFactorMethod.authenticatorApp,
                              title: Text(l10n.tfAuthenticator),
                              subtitle: Text(l10n.tfAuthenticatorBody),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: BlocksSpacing.lg),
                  BlocksButton(
                    label: l10n.tfEnable,
                    icon: Icons.verified_user_rounded,
                    isLoading: _starting,
                    onPressed: _enable,
                  ),
                ],
                if (isDemo) ...[
                  const SizedBox(height: BlocksSpacing.lg),
                  Text(
                    l10n.tfDemoNote,
                    style: context.text.bodySmall,
                    textAlign: TextAlign.center,
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Bottom sheet: enter the code to finish turning 2FA on.
class _SetupSheet extends ConsumerWidget {
  const _SetupSheet({required this.challenge, required this.method});

  final OtpChallenge challenge;
  final TwoFactorMethod method;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final repo = ref.read(securityRepositoryProvider);
    return Padding(
      padding: EdgeInsets.fromLTRB(
        BlocksSpacing.lg,
        BlocksSpacing.lg,
        BlocksSpacing.lg,
        BlocksSpacing.lg + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(l10n.tfTitle, style: context.text.titleLarge),
            const SizedBox(height: BlocksSpacing.md),
            OtpVerificationForm(
              challenge: challenge,
              description: method == TwoFactorMethod.sms
                  ? l10n.tfCodeSentTo(challenge.maskedDestination)
                  : l10n.tfAuthSetup,
              submitLabel: l10n.tfVerify,
              onVerify: (code) => repo.confirmTwoFactorSetup(
                challengeId: challenge.id,
                code: code,
              ),
              onResend: () => repo.resendTwoFactorCode(challenge.id),
              onVerified: (_) => Navigator.of(context).pop(true),
            ),
          ],
        ),
      ),
    );
  }
}

/// Turning 2FA off needs the account password.
class _DisableDialog extends ConsumerStatefulWidget {
  const _DisableDialog();

  @override
  ConsumerState<_DisableDialog> createState() => _DisableDialogState();
}

class _DisableDialogState extends ConsumerState<_DisableDialog> {
  final _password = TextEditingController();
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _password.dispose();
    super.dispose();
  }

  Future<void> _confirm() async {
    if (_password.text.isEmpty || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final l10n = context.l10n;
    try {
      await ref
          .read(securityRepositoryProvider)
          .disableTwoFactor(currentPassword: _password.text);
      if (mounted) Navigator.of(context).pop(true);
    } on ValidationFailure {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = l10n.tfWrongPassword;
        });
      }
    } on Object {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = l10n.errorBody;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AlertDialog(
      title: Text(l10n.tfDisableTitle),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l10n.tfDisableBody),
            const SizedBox(height: BlocksSpacing.md),
            if (_error != null) ...[
              StatusBanner.error(title: _error!),
              const SizedBox(height: BlocksSpacing.md),
            ],
            PasswordField(
              controller: _password,
              label: l10n.secPasswordLabel,
              textInputAction: TextInputAction.done,
              onChanged: (_) => setState(() => _error = null),
              onSubmitted: (_) => _confirm(),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: Text(l10n.cancel),
        ),
        TextButton(
          onPressed: _password.text.isEmpty || _busy ? null : _confirm,
          style: TextButton.styleFrom(foregroundColor: context.scheme.error),
          child: Text(l10n.tfDisable),
        ),
      ],
    );
  }
}
