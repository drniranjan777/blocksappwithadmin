import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/app_snack.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/core/widgets/blocks_mark.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/data/models/auth_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/auth/application/session_controller.dart';
import 'package:blocks_app/features/security/presentation/widgets/otp_widgets.dart';
import 'package:blocks_app/features/security/presentation/widgets/status_widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// "Enter the code we sent you": the second step of creating an account and of
/// a sign-in the server wants confirmed (two-step sign-in, or an unusual place
/// or device).
///
/// How many tries a code has, when it expires, how soon another can be sent and
/// when entry is locked are all decided by the server; this screen only shows
/// what it answered. The code is typed into a field, sent once, and never kept.
class VerifyCodeScreen extends ConsumerStatefulWidget {
  const VerifyCodeScreen({required this.challenge, super.key});

  final CodeChallenge challenge;

  @override
  ConsumerState<VerifyCodeScreen> createState() => _VerifyCodeScreenState();
}

class _VerifyCodeScreenState extends ConsumerState<VerifyCodeScreen> {
  final _code = TextEditingController();
  late CodeChallenge _challenge = widget.challenge;
  late SignInCodeMethod _method = _defaultMethod(widget.challenge);
  String? _error;
  bool _busy = false;
  bool _locked = false;

  static SignInCodeMethod _defaultMethod(CodeChallenge c) =>
      c.methods.contains(SignInCodeMethod.otp)
      ? SignInCodeMethod.otp
      : c.methods.first;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  bool get _isBackup => _method == SignInCodeMethod.backupCode;

  /// A 6-digit code, or (for a recovery code) anything long enough.
  bool get _complete =>
      _isBackup ? _code.text.trim().length >= 6 : _code.text.length == 6;

  Future<void> _submit() async {
    if (!_complete || _busy) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = null;
    });
    final l10n = context.l10n;
    // Recovery codes are issued in capitals; a phone keyboard may not have
    // capitalised what was typed.
    final code = _isBackup
        ? _code.text.trim().toUpperCase()
        : _code.text.trim();
    try {
      await ref
          .read(sessionControllerProvider.notifier)
          .submitCode(_challenge, code, method: _method);
      if (mounted) context.go(Routes.landing);
    } on AppFailure catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        switch (e.code) {
          case 'OTP_INVALID':
            final left = e.details['attemptsLeft'];
            _error = left is num
                ? l10n.otpIncorrect(left.toInt())
                : l10n.cvWrong;
            _code.clear();
          case 'OTP_EXPIRED':
            _error = l10n.otpExpired;
          case 'OTP_LOCKED':
            _locked = true;
            _error = l10n.cvLocked;
          default:
            _error = e is NetworkFailure ? l10n.errorBody : l10n.errorTitle;
        }
      });
    } on Object {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = context.l10n.errorBody;
      });
    }
  }

  Future<void> _resend() async {
    final l10n = context.l10n;
    try {
      final fresh = await ref
          .read(sessionControllerProvider.notifier)
          .resendCode(_challenge);
      if (!mounted) return;
      setState(() {
        _challenge = fresh;
        _locked = false;
        _error = null;
        _code.clear();
      });
      showAppSnack(context, l10n.otpResent);
    } on Object {
      if (!mounted) return;
      setState(() => _error = l10n.errorBody);
    }
  }

  String _intro() {
    final l10n = context.l10n;
    return switch (_challenge.kind) {
      CodeChallengeKind.contactVerification => l10n.cvContactIntro,
      CodeChallengeKind.unusualSignIn => l10n.cvUnusualIntro,
      CodeChallengeKind.secondFactor => '',
    };
  }

  String _instruction() {
    final l10n = context.l10n;
    return switch (_method) {
      SignInCodeMethod.totp => l10n.cvApp,
      SignInCodeMethod.backupCode => l10n.cvRecovery,
      SignInCodeMethod.otp =>
        _challenge.destinationMasked == null
            ? l10n.cvSent
            : l10n.cvSentTo(_challenge.destinationMasked!),
    };
  }

  void _switchTo(SignInCodeMethod method) => setState(() {
    _method = method;
    _error = null;
    _code.clear();
  });

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final intro = _intro();
    final others = [
      for (final m in _challenge.methods)
        if (m != _method) m,
    ];

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
                child: Text(l10n.cvTitle, style: context.text.headlineMedium),
              ),
              if (intro.isNotEmpty) ...[
                const SizedBox(height: BlocksSpacing.xs),
                Text(intro, style: context.text.bodyLarge),
              ],
              const SizedBox(height: BlocksSpacing.md),
              Text(_instruction(), style: context.text.bodyMedium),
              const SizedBox(height: BlocksSpacing.lg),
              if (_locked)
                StatusBanner.error(title: _error ?? l10n.cvLocked)
              else ...[
                if (_isBackup)
                  TextField(
                    controller: _code,
                    autofocus: true,
                    autocorrect: false,
                    enableSuggestions: false,
                    textCapitalization: TextCapitalization.characters,
                    textInputAction: TextInputAction.done,
                    inputFormatters: [
                      FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9-]')),
                      LengthLimitingTextInputFormatter(20),
                    ],
                    onChanged: (_) => setState(() => _error = null),
                    onSubmitted: (_) => _submit(),
                    decoration: InputDecoration(
                      labelText: l10n.cvRecoveryLabel,
                      errorText: _error,
                      errorMaxLines: 3,
                    ),
                  )
                else
                  OtpCodeField(
                    controller: _code,
                    length: 6,
                    errorText: _error,
                    autofocus: true,
                    onChanged: (_) => setState(() => _error = null),
                    onSubmitted: (_) => _submit(),
                  ),
                const SizedBox(height: BlocksSpacing.lg),
                BlocksButton(
                  label: l10n.cvButton,
                  isLoading: _busy,
                  onPressed: _complete ? _submit : null,
                ),
              ],
              const SizedBox(height: BlocksSpacing.xs),
              if (_method == SignInCodeMethod.otp && _challenge.canResend)
                ResendCodeButton(
                  availableAt:
                      _challenge.resendAvailableAt ?? ref.read(clockProvider)(),
                  onResend: _resend,
                ),
              for (final m in others)
                TextButton(
                  onPressed: () => _switchTo(m),
                  child: Text(switch (m) {
                    SignInCodeMethod.totp => l10n.cvUseApp,
                    SignInCodeMethod.otp => l10n.cvUseSent,
                    SignInCodeMethod.backupCode => l10n.cvUseRecovery,
                  }),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
