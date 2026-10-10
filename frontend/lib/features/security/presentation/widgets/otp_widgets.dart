import 'dart:async';

import 'package:blocks_app/app/config/app_config.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/data/mock/demo_credentials.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// A numeric one-time-code input with big, evenly spaced digits.
class OtpCodeField extends StatelessWidget {
  const OtpCodeField({
    required this.controller,
    required this.length,
    super.key,
    this.errorText,
    this.onChanged,
    this.onSubmitted,
    this.autofocus = false,
  });

  final TextEditingController controller;
  final int length;
  final String? errorText;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final bool autofocus;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      autofocus: autofocus,
      keyboardType: TextInputType.number,
      textInputAction: TextInputAction.done,
      textAlign: TextAlign.center,
      autofillHints: const [AutofillHints.oneTimeCode],
      inputFormatters: [
        FilteringTextInputFormatter.digitsOnly,
        LengthLimitingTextInputFormatter(length),
      ],
      style: context.text.headlineSmall?.copyWith(
        letterSpacing: 10,
        fontWeight: FontWeight.w800,
      ),
      onChanged: onChanged,
      onSubmitted: onSubmitted,
      decoration: InputDecoration(
        labelText: context.l10n.otpLabel(length),
        errorText: errorText,
        errorMaxLines: 3,
        counterText: '',
      ),
    );
  }
}

/// "Demo OTP: 123456" — shown **only in demo builds**. A real build never
/// puts a code on screen; it arrives by SMS or e-mail.
class DemoOtpNotice extends ConsumerWidget {
  const DemoOtpNotice({required this.onUseCode, super.key});

  final VoidCallback onUseCode;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(appConfigProvider).isDemo) return const SizedBox.shrink();
    final l10n = context.l10n;
    return Semantics(
      button: true,
      label: '${l10n.otpDemoHint(DemoCredentials.otp)}. ${l10n.otpDemoFill}',
      excludeSemantics: true,
      child: Material(
        color: context.scheme.secondaryContainer,
        borderRadius: BorderRadius.circular(BlocksRadius.lg),
        child: InkWell(
          borderRadius: BorderRadius.circular(BlocksRadius.lg),
          onTap: onUseCode,
          child: ConstrainedBox(
            constraints: const BoxConstraints(
              minHeight: BlocksSpacing.touchTarget,
            ),
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
                          l10n.otpDemoHint(DemoCredentials.otp),
                          style: context.text.titleSmall?.copyWith(
                            color: context.scheme.onSecondaryContainer,
                          ),
                        ),
                        Text(
                          '${l10n.otpDemoNotice} ${l10n.otpDemoFill}',
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
      ),
    );
  }
}

/// "Resend code" that counts down the server's cool-down first. The server
/// enforces the real limit; this only mirrors it so the button is honest.
class ResendCodeButton extends ConsumerStatefulWidget {
  const ResendCodeButton({
    required this.availableAt,
    required this.onResend,
    super.key,
  });

  /// When the server will accept another request.
  final DateTime availableAt;
  final Future<void> Function() onResend;

  @override
  ConsumerState<ResendCodeButton> createState() => _ResendCodeButtonState();
}

class _ResendCodeButtonState extends ConsumerState<ResendCodeButton> {
  Timer? _timer;
  bool _busy = false;

  /// Whole seconds left. Counted down locally from the moment the server's
  /// cool-down is received, so it never depends on the phone's wall clock
  /// (which the user can change) staying in step.
  int _remaining = 0;

  @override
  void initState() {
    super.initState();
    _schedule();
  }

  @override
  void didUpdateWidget(ResendCodeButton old) {
    super.didUpdateWidget(old);
    if (old.availableAt != widget.availableAt) _schedule();
  }

  /// Ticks once a second, and only while there is something left to count.
  void _schedule() {
    _timer?.cancel();
    final diff = widget.availableAt.difference(ref.read(clockProvider)());
    _remaining = diff.isNegative ? 0 : (diff.inMilliseconds / 1000).ceil();
    if (_remaining <= 0) return;
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return;
      setState(() => _remaining = _remaining > 0 ? _remaining - 1 : 0);
      if (_remaining <= 0) t.cancel();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _resend() async {
    setState(() => _busy = true);
    try {
      await widget.onResend();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final left = _remaining;
    final ready = left <= 0 && !_busy;
    // Resend stays disabled while counting down, and while a request runs.
    return Center(
      child: TextButton(
        onPressed: ready ? _resend : null,
        child: Text(left > 0 ? l10n.otpResendIn(left) : l10n.otpResend),
      ),
    );
  }
}
