import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/app_snack.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/data/mock/demo_credentials.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/features/security/presentation/security_labels.dart';
import 'package:blocks_app/features/security/presentation/widgets/otp_widgets.dart';
import 'package:blocks_app/features/security/presentation/widgets/status_widgets.dart';
import 'package:flutter/material.dart';

/// The "enter the code we sent you" step, shared by every flow that uses
/// one-time codes. All counting (attempts, expiry, resend cool-down, lock-out)
/// happens on the server; this widget only shows what the server answered.
class OtpVerificationForm extends StatefulWidget {
  const OtpVerificationForm({
    required this.challenge,
    required this.description,
    required this.submitLabel,
    required this.onVerify,
    required this.onResend,
    required this.onVerified,
    super.key,
  });

  final OtpChallenge challenge;

  /// e.g. "We sent a code to a***v@blocks.example."
  final String description;
  final String submitLabel;
  final Future<OtpResult> Function(String code) onVerify;
  final Future<OtpChallenge> Function() onResend;

  /// Called with the single-use token once the code is accepted.
  final void Function(String token) onVerified;

  @override
  State<OtpVerificationForm> createState() => _OtpVerificationFormState();
}

class _OtpVerificationFormState extends State<OtpVerificationForm> {
  final _code = TextEditingController();
  late OtpChallenge _challenge = widget.challenge;
  String? _error;
  DateTime? _lockedUntil;
  bool _busy = false;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  bool get _complete => _code.text.length == _challenge.length;

  Future<void> _submit() async {
    if (!_complete || _busy || _lockedUntil != null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final l10n = context.l10n;
    try {
      final result = await widget.onVerify(_code.text);
      if (!mounted) return;
      switch (result) {
        case OtpVerified(:final token):
          setState(() => _busy = false);
          widget.onVerified(token);
        case OtpIncorrect(:final attemptsRemaining):
          setState(() {
            _busy = false;
            _error = l10n.otpIncorrect(attemptsRemaining);
            _code.clear();
          });
        case OtpExpired():
          setState(() {
            _busy = false;
            _error = l10n.otpExpired;
          });
        case OtpLocked(:final retryAt):
          setState(() {
            _busy = false;
            _lockedUntil = retryAt;
            _error = l10n.otpLocked(formatClock(context, retryAt));
          });
      }
    } on Object {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = l10n.errorBody;
      });
    }
  }

  Future<void> _resend() async {
    final l10n = context.l10n;
    try {
      final fresh = await widget.onResend();
      if (!mounted) return;
      setState(() {
        _challenge = fresh;
        _error = null;
        _code.clear();
      });
      showAppSnack(context, l10n.otpResent);
    } on Object {
      if (!mounted) return;
      setState(() => _error = l10n.errorBody);
    }
  }

  @override
  Widget build(BuildContext context) {
    final locked = _lockedUntil != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(widget.description, style: context.text.bodyMedium),
        const SizedBox(height: BlocksSpacing.lg),
        if (locked) ...[
          StatusBanner.error(title: _error ?? ''),
          const SizedBox(height: BlocksSpacing.lg),
        ] else ...[
          OtpCodeField(
            controller: _code,
            length: _challenge.length,
            errorText: _error,
            autofocus: true,
            onChanged: (_) => setState(() => _error = null),
            onSubmitted: (_) => _submit(),
          ),
          const SizedBox(height: BlocksSpacing.md),
          DemoOtpNotice(
            onUseCode: () {
              _code.text = DemoCredentials.otp;
              setState(() => _error = null);
            },
          ),
          const SizedBox(height: BlocksSpacing.lg),
          BlocksButton(
            label: widget.submitLabel,
            isLoading: _busy,
            onPressed: _complete ? _submit : null,
          ),
          const SizedBox(height: BlocksSpacing.xs),
          ResendCodeButton(
            availableAt: _challenge.resendAvailableAt,
            onResend: _resend,
          ),
        ],
      ],
    );
  }
}
