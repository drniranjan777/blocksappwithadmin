import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/features/security/domain/password_policy.dart';
import 'package:blocks_app/l10n/gen/app_localizations.dart';
import 'package:flutter/material.dart';

/// Password input that is hidden by default and never autocorrected or
/// learned by the keyboard. A visibility button toggles the text.
class PasswordField extends StatefulWidget {
  const PasswordField({
    required this.controller,
    required this.label,
    super.key,
    this.onChanged,
    this.onSubmitted,
    this.textInputAction,
    this.autofillHints,
    this.errorText,
    this.focusNode,
  });

  final TextEditingController controller;
  final String label;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final TextInputAction? textInputAction;
  final Iterable<String>? autofillHints;
  final String? errorText;
  final FocusNode? focusNode;

  @override
  State<PasswordField> createState() => _PasswordFieldState();
}

class _PasswordFieldState extends State<PasswordField> {
  bool _obscured = true;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return TextField(
      controller: widget.controller,
      focusNode: widget.focusNode,
      obscureText: _obscured,
      autocorrect: false,
      enableSuggestions: false,
      enableIMEPersonalizedLearning: false,
      keyboardType: TextInputType.visiblePassword,
      textInputAction: widget.textInputAction,
      autofillHints: widget.autofillHints,
      onChanged: widget.onChanged,
      onSubmitted: widget.onSubmitted,
      decoration: InputDecoration(
        labelText: widget.label,
        errorText: widget.errorText,
        errorMaxLines: 3,
        prefixIcon: const Icon(Icons.lock_outline_rounded),
        suffixIcon: IconButton(
          tooltip: _obscured ? l10n.cpShow : l10n.cpHide,
          icon: Icon(
            _obscured
                ? Icons.visibility_outlined
                : Icons.visibility_off_outlined,
          ),
          onPressed: () => setState(() => _obscured = !_obscured),
        ),
      ),
    );
  }
}

extension PasswordStrengthLabel on PasswordStrength {
  String label(AppLocalizations l10n) => switch (this) {
    PasswordStrength.weak => l10n.cpStrengthWeak,
    PasswordStrength.fair => l10n.cpStrengthFair,
    PasswordStrength.strong => l10n.cpStrengthStrong,
    PasswordStrength.veryStrong => l10n.cpStrengthVeryStrong,
  };

  /// Segments filled in the meter (1-4).
  int get segments => index + 1;
}

/// "Password strength: Weak / Fair / Strong / Very strong" with a four-segment
/// bar. Colour is never the only signal: the word is always shown.
class PasswordStrengthMeter extends StatelessWidget {
  const PasswordStrengthMeter({required this.strength, super.key});

  /// Null while the field is empty.
  final PasswordStrength? strength;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final s = strength;
    final colors = context.blocks;
    final color = switch (s) {
      null => context.scheme.outlineVariant,
      PasswordStrength.weak => context.scheme.error,
      PasswordStrength.fair => colors.warning,
      PasswordStrength.strong => colors.success,
      PasswordStrength.veryStrong => colors.reachDistrict,
    };
    final filled = s?.segments ?? 0;

    return Semantics(
      container: true,
      label: s == null
          ? l10n.cpStrength
          : '${l10n.cpStrength}: ${s.label(l10n)}',
      excludeSemantics: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(l10n.cpStrength, style: context.text.labelMedium),
              ),
              if (s != null)
                Text(
                  s.label(l10n),
                  style: context.text.labelLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
            ],
          ),
          const SizedBox(height: BlocksSpacing.sm),
          Row(
            children: [
              for (var i = 0; i < 4; i++) ...[
                if (i > 0) const SizedBox(width: 6),
                Expanded(
                  child: AnimatedContainer(
                    duration: BlocksDurations.fast,
                    height: 6,
                    decoration: BoxDecoration(
                      color: i < filled
                          ? color
                          : context.scheme.outlineVariant.withValues(
                              alpha: 0.6,
                            ),
                      borderRadius: BorderRadius.circular(BlocksRadius.pill),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

/// The rules of the current policy with a tick next to each one that the
/// typed password already satisfies.
class PasswordRequirementsList extends StatelessWidget {
  const PasswordRequirementsList({
    required this.policy,
    required this.password,
    super.key,
  });

  final PasswordPolicy policy;
  final String password;

  String _label(AppLocalizations l10n, PasswordRule rule) => switch (rule) {
    PasswordRule.minLength => l10n.cpRuleMinLength(policy.minLength),
    PasswordRule.uppercase => l10n.cpRuleUpper,
    PasswordRule.lowercase => l10n.cpRuleLower,
    PasswordRule.digit => l10n.cpRuleDigit,
    PasswordRule.special => l10n.cpRuleSpecial,
  };

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final results = policy.check(password);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final rule in policy.rules)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 3),
            child: Semantics(
              label:
                  '${_label(l10n, rule)}, '
                  '${results[rule]! ? l10n.cpRuleMet : l10n.cpRuleNotMet}',
              excludeSemantics: true,
              child: Row(
                children: [
                  Icon(
                    results[rule]!
                        ? Icons.check_circle_rounded
                        : Icons.radio_button_unchecked_rounded,
                    size: 18,
                    color: results[rule]!
                        ? context.blocks.success
                        : context.scheme.outline,
                  ),
                  const SizedBox(width: BlocksSpacing.sm),
                  Expanded(
                    child: Text(
                      _label(l10n, rule),
                      style: context.text.bodySmall?.copyWith(
                        color: results[rule]!
                            ? context.scheme.onSurface
                            : context.scheme.onSurfaceVariant,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}
