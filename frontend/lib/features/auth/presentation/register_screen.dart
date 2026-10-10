import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/core/widgets/blocks_mark.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/data/models/auth_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/auth/application/session_controller.dart';
import 'package:blocks_app/features/security/presentation/widgets/password_widgets.dart';
import 'package:blocks_app/features/security/presentation/widgets/status_widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Create an account with a username, a name, an e-mail and/or phone, a
/// password and a date of birth.
///
/// Every rule (username format, password strength, the minimum age) is applied
/// by the server and its refusals are shown next to the field; the screen only
/// checks that required fields are not empty. Nothing typed here is kept: the
/// password and date of birth are sent once and then dropped.
class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _name = TextEditingController();
  final _username = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  DateTime? _dob;
  bool _busy = false;
  bool _failed = false;
  Map<String, String> _errors = const {};

  @override
  void dispose() {
    _name.dispose();
    _username.dispose();
    _email.dispose();
    _phone.dispose();
    _password.dispose();
    super.dispose();
  }

  bool get _canSubmit =>
      _name.text.trim().isNotEmpty &&
      _username.text.trim().isNotEmpty &&
      (_email.text.trim().isNotEmpty || _phone.text.trim().isNotEmpty) &&
      _password.text.isNotEmpty &&
      _dob != null;

  void _changed() => setState(() {
    _errors = const {};
    _failed = false;
  });

  Future<void> _pickDob() async {
    final now = ref.read(clockProvider)();
    final picked = await showDatePicker(
      context: context,
      helpText: context.l10n.regDobChoose,
      initialDate: _dob ?? DateTime(now.year - 20, now.month, now.day),
      firstDate: DateTime(1900),
      lastDate: now,
    );
    if (picked != null && mounted) {
      setState(() {
        _dob = picked;
        _errors = const {};
      });
    }
  }

  Future<void> _submit() async {
    if (!_canSubmit || _busy) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _failed = false;
      _errors = const {};
    });
    final language = Localizations.localeOf(context).languageCode;
    try {
      final challenge = await ref
          .read(sessionControllerProvider.notifier)
          .register(
            RegistrationRequest(
              username: _username.text,
              displayName: _name.text,
              password: _password.text,
              dateOfBirth: _dob!,
              email: _email.text,
              phone: _phone.text,
              language: const {'en', 'hi', 'te'}.contains(language)
                  ? language
                  : null,
            ),
          );
      if (!mounted) return;
      setState(() => _busy = false);
      await context.push(Routes.verifyCode, extra: challenge);
    } on FieldValidationFailure catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _errors = e.errors;
        });
      }
    } on ConflictFailure catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        if (e.code == 'USERNAME_TAKEN') {
          _errors = const {'username': 'taken'};
        } else {
          _failed = true;
        }
      });
    } on Object {
      if (mounted) {
        setState(() {
          _busy = false;
          _failed = true;
        });
      }
    }
  }

  /// The server's reason for a refused field, in the person's language.
  String? _reason(String field) {
    final reason = _errors[field];
    if (reason == null) return null;
    final l10n = context.l10n;
    return switch ((field, reason)) {
      (_, 'taken') => l10n.regErrTaken,
      (_, 'required') => l10n.regErrRequired,
      ('username', 'invalid_format') => l10n.regErrUsername,
      ('email', 'email_or_phone_required') => l10n.regErrContact,
      ('dateOfBirth', 'too_young') => l10n.regErrTooYoung,
      ('password', _) => l10n.regErrPassword,
      _ => l10n.regErrInvalid,
    };
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final dobText = _dob == null
        ? null
        : MaterialLocalizations.of(context).formatMediumDate(_dob!);

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
                child: Text(l10n.regTitle, style: context.text.headlineMedium),
              ),
              const SizedBox(height: BlocksSpacing.xs),
              Text(l10n.regSubtitle, style: context.text.bodyLarge),
              const SizedBox(height: BlocksSpacing.xl),
              if (_failed) ...[
                StatusBanner.error(
                  title: l10n.errorTitle,
                  body: l10n.errorBody,
                ),
                const SizedBox(height: BlocksSpacing.lg),
              ],
              TextField(
                controller: _name,
                textInputAction: TextInputAction.next,
                textCapitalization: TextCapitalization.words,
                autofillHints: const [AutofillHints.name],
                onChanged: (_) => _changed(),
                decoration: InputDecoration(
                  labelText: l10n.regName,
                  prefixIcon: const Icon(Icons.badge_outlined),
                  errorText: _reason('displayName'),
                ),
              ),
              const SizedBox(height: BlocksSpacing.md),
              TextField(
                controller: _username,
                textInputAction: TextInputAction.next,
                autocorrect: false,
                enableSuggestions: false,
                autofillHints: const [AutofillHints.newUsername],
                onChanged: (_) => _changed(),
                decoration: InputDecoration(
                  labelText: l10n.regUsername,
                  helperText: l10n.regUsernameHelp,
                  helperMaxLines: 2,
                  prefixIcon: const Icon(Icons.alternate_email_rounded),
                  errorText: _reason('username'),
                ),
              ),
              const SizedBox(height: BlocksSpacing.md),
              TextField(
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.next,
                autocorrect: false,
                autofillHints: const [AutofillHints.email],
                onChanged: (_) => _changed(),
                decoration: InputDecoration(
                  labelText: l10n.regEmail,
                  prefixIcon: const Icon(Icons.mail_outline_rounded),
                  errorText: _reason('email'),
                ),
              ),
              const SizedBox(height: BlocksSpacing.md),
              TextField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.telephoneNumber],
                onChanged: (_) => _changed(),
                decoration: InputDecoration(
                  labelText: l10n.regPhone,
                  helperText: l10n.regContactHelp,
                  helperMaxLines: 3,
                  prefixIcon: const Icon(Icons.phone_outlined),
                  errorText: _reason('phone'),
                ),
              ),
              const SizedBox(height: BlocksSpacing.md),
              PasswordField(
                controller: _password,
                label: l10n.regPassword,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.newPassword],
                errorText: _reason('password'),
                onChanged: (_) => _changed(),
              ),
              const SizedBox(height: BlocksSpacing.md),
              InkWell(
                borderRadius: BorderRadius.circular(BlocksRadius.lg),
                onTap: _pickDob,
                child: InputDecorator(
                  decoration: InputDecoration(
                    labelText: l10n.regDob,
                    helperText: l10n.regDobHelp,
                    helperMaxLines: 3,
                    prefixIcon: const Icon(Icons.cake_outlined),
                    errorText: _reason('dateOfBirth'),
                  ),
                  child: Text(
                    dobText ?? l10n.regDobChoose,
                    style: dobText == null
                        ? context.text.bodyLarge?.copyWith(
                            color: context.scheme.onSurfaceVariant,
                          )
                        : context.text.bodyLarge,
                  ),
                ),
              ),
              const SizedBox(height: BlocksSpacing.xl),
              BlocksButton(
                label: l10n.regButton,
                icon: Icons.person_add_alt_1_rounded,
                isLoading: _busy,
                onPressed: _canSubmit ? _submit : null,
              ),
              const SizedBox(height: BlocksSpacing.sm),
              BlocksButton(
                label: l10n.regHaveAccount,
                variant: BlocksButtonVariant.ghost,
                onPressed: () => context.pushReplacement(Routes.signIn),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
