import 'package:blocks_app/app/config/app_config.dart';
import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/core/widgets/blocks_mark.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/data/mock/demo_credentials.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/features/auth/application/sign_in_controller.dart';
import 'package:blocks_app/features/security/application/security_providers.dart';
import 'package:blocks_app/features/security/presentation/security_labels.dart';
import 'package:blocks_app/features/security/presentation/widgets/password_widgets.dart';
import 'package:blocks_app/features/security/presentation/widgets/status_widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Email / phone / username + password sign-in.
///
/// The failed-attempt limit and temporary protection are enforced by the
/// server. The screen only displays what the server says; it never counts
/// attempts itself and so cannot be tricked into resetting a count.
class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _identifier = TextEditingController();
  final _password = TextEditingController();

  @override
  void dispose() {
    _identifier.dispose();
    _password.dispose();
    super.dispose();
  }

  bool get _canSubmit =>
      _identifier.text.trim().isNotEmpty && _password.text.isNotEmpty;

  Future<void> _submit() async {
    if (!_canSubmit) return;
    FocusScope.of(context).unfocus();
    final ok = await ref
        .read(signInControllerProvider.notifier)
        .submit(identifier: _identifier.text, password: _password.text);
    if (!mounted) return;
    if (ok) {
      context.go(Routes.landing);
      return;
    }
    // Right password, but the server wants a code first.
    final result = ref.read(signInControllerProvider).result;
    if (result is LoginNeedsCode) {
      await context.push(Routes.verifyCode, extra: result.challenge);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final state = ref.watch(signInControllerProvider);
    final isDemo = ref.watch(appConfigProvider).isDemo;
    final result = state.result;
    final maxAttempts =
        ref.watch(securityPolicyProvider).value?.maxFailedAttempts ?? 5;

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          tooltip: l10n.backTooltip,
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () =>
              context.canPop() ? context.pop() : context.go(Routes.auth),
        ),
      ),
      body: SafeArea(
        child: ResponsiveCenter(
          child: ListView(
            padding: const EdgeInsets.all(BlocksSpacing.xl),
            children: [
              const BlocksMark(size: 40),
              const SizedBox(height: BlocksSpacing.lg),
              Semantics(
                header: true,
                child: Text(l10n.siTitle, style: context.text.headlineMedium),
              ),
              const SizedBox(height: BlocksSpacing.xs),
              Text(l10n.siSubtitle, style: context.text.bodyLarge),
              const SizedBox(height: BlocksSpacing.xl),
              if (result is LoginProtected) ...[
                _ProtectedPanel(
                  result: result,
                  maxAttempts: maxAttempts,
                  onReset: () => context.push(Routes.forgotPassword),
                ),
                const SizedBox(height: BlocksSpacing.xl),
              ] else ...[
                if (result is LoginRejected) ...[
                  StatusBanner.error(
                    title: l10n.siInvalid,
                    body: result.attemptsRemaining <= 2
                        ? l10n.siAttemptsLeft(result.attemptsRemaining)
                        : null,
                  ),
                  const SizedBox(height: BlocksSpacing.lg),
                ] else if (state.failed) ...[
                  StatusBanner.error(
                    title: l10n.errorTitle,
                    body: l10n.errorBody,
                  ),
                  const SizedBox(height: BlocksSpacing.lg),
                ],
                TextField(
                  controller: _identifier,
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.next,
                  autocorrect: false,
                  autofillHints: const [
                    AutofillHints.username,
                    AutofillHints.email,
                  ],
                  onChanged: (_) {
                    ref.read(signInControllerProvider.notifier).clearError();
                    setState(() {});
                  },
                  decoration: InputDecoration(
                    labelText: l10n.siIdentifier,
                    prefixIcon: const Icon(Icons.person_outline_rounded),
                  ),
                ),
                const SizedBox(height: BlocksSpacing.md),
                PasswordField(
                  controller: _password,
                  label: l10n.secPasswordLabel,
                  textInputAction: TextInputAction.done,
                  autofillHints: const [AutofillHints.password],
                  onChanged: (_) {
                    ref.read(signInControllerProvider.notifier).clearError();
                    setState(() {});
                  },
                  onSubmitted: (_) => _submit(),
                ),
                const SizedBox(height: BlocksSpacing.lg),
                BlocksButton(
                  label: l10n.siButton,
                  icon: Icons.login_rounded,
                  isLoading: state.submitting,
                  onPressed: _canSubmit ? _submit : null,
                ),
                const SizedBox(height: BlocksSpacing.sm),
                BlocksButton(
                  label: l10n.siForgot,
                  variant: BlocksButtonVariant.ghost,
                  onPressed: () => context.push(Routes.forgotPassword),
                ),
              ],
              if (isDemo) ...[
                const SizedBox(height: BlocksSpacing.md),
                _DemoCredentialsCard(
                  onUse: () => setState(() {
                    _identifier.text = DemoCredentials.email;
                    _password.text = DemoCredentials.password;
                    ref.read(signInControllerProvider.notifier).clearError();
                  }),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// "5 failed login attempts detected. Your account has been temporarily
/// protected. If this wasn't you, secure your account immediately."
class _ProtectedPanel extends StatelessWidget {
  const _ProtectedPanel({
    required this.result,
    required this.maxAttempts,
    required this.onReset,
  });

  final LoginProtected result;
  final int maxAttempts;
  final VoidCallback onReset;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final color = context.scheme.error;
    return Semantics(
      liveRegion: true,
      container: true,
      child: Container(
        padding: const EdgeInsets.all(BlocksSpacing.lg),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(BlocksRadius.xl),
          border: Border.all(color: color.withValues(alpha: 0.35)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.gpp_maybe_rounded, color: color, size: 32),
                const SizedBox(width: BlocksSpacing.md),
                Expanded(
                  child: Text(
                    l10n.siProtectedTitle,
                    style: context.text.titleMedium,
                  ),
                ),
              ],
            ),
            const SizedBox(height: BlocksSpacing.md),
            if (result.justTriggered)
              Text(
                l10n.siProtectedAttempts(maxAttempts),
                style: context.text.titleSmall,
              ),
            const SizedBox(height: BlocksSpacing.xs),
            Text(l10n.siProtectedBody, style: context.text.bodyMedium),
            const SizedBox(height: BlocksSpacing.sm),
            Text(l10n.siProtectedAdvice, style: context.text.bodyMedium),
            const SizedBox(height: BlocksSpacing.sm),
            Text(
              l10n.siProtectedUntil(formatClock(context, result.retryAt)),
              style: context.text.bodySmall,
            ),
            if (result.justTriggered) ...[
              const SizedBox(height: BlocksSpacing.md),
              StatusBanner.success(
                title: l10n.alertSent,
                body: l10n.alertSentBody,
              ),
            ],
            const SizedBox(height: BlocksSpacing.lg),
            BlocksButton(
              label: l10n.siResetPassword,
              icon: Icons.lock_reset_rounded,
              onPressed: onReset,
            ),
          ],
        ),
      ),
    );
  }
}

class _DemoCredentialsCard extends StatelessWidget {
  const _DemoCredentialsCard({required this.onUse});

  final VoidCallback onUse;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Semantics(
      button: true,
      label: '${l10n.siDemoCard}. ${DemoCredentials.email}. ${l10n.siDemoFill}',
      excludeSemantics: true,
      child: Material(
        color: context.scheme.secondaryContainer,
        borderRadius: BorderRadius.circular(BlocksRadius.lg),
        child: InkWell(
          borderRadius: BorderRadius.circular(BlocksRadius.lg),
          onTap: onUse,
          child: Padding(
            padding: const EdgeInsets.all(BlocksSpacing.md),
            child: Row(
              children: [
                Icon(
                  Icons.science_outlined,
                  color: context.scheme.onSecondaryContainer,
                ),
                const SizedBox(width: BlocksSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        l10n.siDemoCard,
                        style: context.text.titleSmall?.copyWith(
                          color: context.scheme.onSecondaryContainer,
                        ),
                      ),
                      Text(
                        DemoCredentials.email,
                        style: context.text.bodySmall?.copyWith(
                          color: context.scheme.onSecondaryContainer,
                        ),
                      ),
                      Text(
                        l10n.siDemoPassword(DemoCredentials.password),
                        style: context.text.bodySmall?.copyWith(
                          color: context.scheme.onSecondaryContainer,
                        ),
                      ),
                      Text(
                        l10n.siDemoFill,
                        style: context.text.bodySmall?.copyWith(
                          color: context.scheme.onSecondaryContainer,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
