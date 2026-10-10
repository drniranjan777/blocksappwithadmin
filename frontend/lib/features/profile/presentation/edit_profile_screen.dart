import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/app_snack.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/core/widgets/blocks_chip.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:blocks_app/data/models/profile_models.dart';
import 'package:blocks_app/features/profile/application/edit_profile_controller.dart';
import 'package:blocks_app/features/profile/application/user_providers.dart';
import 'package:blocks_app/features/profile/domain/profile_validator.dart';
import 'package:blocks_app/features/profile/presentation/photo_widgets.dart';
import 'package:blocks_app/features/security/presentation/widgets/status_widgets.dart';
import 'package:blocks_app/features/settings/application/app_settings.dart';
import 'package:blocks_app/features/settings/presentation/settings_screen.dart';
import 'package:blocks_app/l10n/gen/app_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

String? _fieldError(AppLocalizations l, ProfileError? e) => switch (e) {
  null => null,
  ProfileError.required => l.secFieldRequired,
  ProfileError.nameTooShort => l.epErrNameShort(ProfileRules.nameMin),
  ProfileError.nameTooLong => l.epErrNameLong(ProfileRules.nameMax),
  ProfileError.usernameTooShort => l.epErrUsernameShort(
    ProfileRules.usernameMin,
  ),
  ProfileError.usernameTooLong => l.epErrUsernameLong(ProfileRules.usernameMax),
  ProfileError.usernameChars => l.epErrUsernameChars,
  ProfileError.usernameReserved => l.epErrUsernameReserved,
  ProfileError.usernameTaken => l.epErrUsernameTaken,
  ProfileError.bioTooLong => l.epErrBioLong(ProfileRules.bioMax),
  ProfileError.websiteInvalid => l.epErrWebsite,
  ProfileError.dobFuture => l.epErrDobFuture,
  ProfileError.dobUnderAge => l.epErrDobAge(ProfileRules.minAge),
  ProfileError.dobInvalid => l.epErrDobInvalid,
};

String _genderLabel(AppLocalizations l, Gender g) => switch (g) {
  Gender.female => l.epGenderFemale,
  Gender.male => l.epGenderMale,
  Gender.nonBinary => l.epGenderNonBinary,
  Gender.preferNotToSay => l.epGenderPrefer,
};

/// Profile -> Edit Profile.
///
/// Public details (what others see) are kept visibly apart from private ones
/// (only you see them). Everything is checked here for quick feedback and
/// checked again by the server when you save.
class EditProfileScreen extends ConsumerWidget {
  const EditProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(editProfileControllerProvider);
    return async.when(
      loading: () => Scaffold(
        appBar: AppBar(title: Text(context.l10n.epTitle)),
        body: const LoadingView(),
      ),
      error: (_, _) => Scaffold(
        appBar: AppBar(title: Text(context.l10n.epTitle)),
        body: ErrorView(
          onRetry: () => ref.invalidate(editProfileControllerProvider),
        ),
      ),
      data: (_) => const _EditProfileForm(),
    );
  }
}

class _EditProfileForm extends ConsumerStatefulWidget {
  const _EditProfileForm();

  @override
  ConsumerState<_EditProfileForm> createState() => _EditProfileFormState();
}

class _EditProfileFormState extends ConsumerState<_EditProfileForm> {
  late final TextEditingController _name;
  late final TextEditingController _username;
  late final TextEditingController _bio;
  late final TextEditingController _website;
  late final TextEditingController _state;
  late final TextEditingController _district;

  @override
  void initState() {
    super.initState();
    final d = ref.read(editProfileControllerProvider).requireValue.draft;
    _name = TextEditingController(text: d.name);
    _username = TextEditingController(text: d.username);
    _bio = TextEditingController(text: d.bio);
    _website = TextEditingController(text: d.website);
    _state = TextEditingController(text: d.state);
    _district = TextEditingController(text: d.district);
  }

  @override
  void dispose() {
    _name.dispose();
    _username.dispose();
    _bio.dispose();
    _website.dispose();
    _state.dispose();
    _district.dispose();
    super.dispose();
  }

  EditProfileController get _c =>
      ref.read(editProfileControllerProvider.notifier);

  Future<void> _save() async {
    FocusScope.of(context).unfocus();
    final l10n = context.l10n;
    final ok = await _c.save();
    if (ok && mounted) {
      showAppSnack(context, l10n.epSaved);
      context.pop();
    }
  }

  Future<bool> _confirmDiscard() async {
    final l10n = context.l10n;
    final discard = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text(l10n.epDiscard),
        content: Text(l10n.epDiscardBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(d).pop(false),
            child: Text(l10n.epKeepEditing),
          ),
          TextButton(
            onPressed: () => Navigator.of(d).pop(true),
            style: TextButton.styleFrom(foregroundColor: d.scheme.error),
            child: Text(l10n.epDiscardConfirm),
          ),
        ],
      ),
    );
    return discard ?? false;
  }

  Future<void> _pickDate(EditProfileState s) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate:
          s.draft.dateOfBirth ?? DateTime(now.year - 18, now.month, now.day),
      firstDate: DateTime(now.year - ProfileRules.maxAge),
      lastDate: now,
    );
    if (picked != null) _c.setDateOfBirth(picked);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final s = ref.watch(editProfileControllerProvider).requireValue;
    final user = ref.watch(currentUserProvider).value;
    final d = s.draft;
    final india = d.country == kHome;
    final capabilities = ref.watch(profileCapabilitiesProvider);
    final language = ref.watch(
      appSettingsProvider.select((a) => a.languageCode),
    );

    return PopScope(
      canPop: !s.isDirty,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await _confirmDiscard() && context.mounted) context.pop();
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(l10n.epTitle),
          actions: [
            TextButton(
              onPressed: s.canSave ? _save : null,
              child: Text(l10n.epSave),
            ),
          ],
        ),
        body: SafeArea(
          child: ResponsiveCenter(
            child: ListView(
              padding: const EdgeInsets.all(BlocksSpacing.lg),
              children: [
                if (user != null)
                  Center(child: EditableAvatar(user: user, size: 104)),
                const SizedBox(height: BlocksSpacing.sm),
                Center(
                  child: Text(
                    l10n.phTitle,
                    style: context.text.labelLarge?.copyWith(
                      color: context.scheme.primary,
                    ),
                  ),
                ),
                const SizedBox(height: BlocksSpacing.lg),
                const PhotoUploadStatus(),
                if (s.saveFailed) ...[
                  StatusBanner.error(
                    title: l10n.errorTitle,
                    body: l10n.errorBody,
                  ),
                  const SizedBox(height: BlocksSpacing.lg),
                ],

                // ------------------------------------------------ public --
                _SectionHeader(
                  icon: Icons.public_rounded,
                  title: l10n.epPublicSection,
                  hint: l10n.epPublicHint,
                ),
                TextField(
                  controller: _name,
                  textCapitalization: TextCapitalization.words,
                  textInputAction: TextInputAction.next,
                  autofillHints: const [AutofillHints.name],
                  inputFormatters: [LengthLimitingTextInputFormatter(80)],
                  onChanged: _c.setName,
                  decoration: InputDecoration(
                    labelText: l10n.epName,
                    prefixIcon: const Icon(Icons.badge_outlined),
                    errorText: _fieldError(l10n, s.errors[ProfileField.name]),
                    errorMaxLines: 2,
                  ),
                ),
                const SizedBox(height: BlocksSpacing.md),
                TextField(
                  controller: _username,
                  // The live service fixes the username at sign-up.
                  enabled: capabilities.canChangeUsername,
                  autocorrect: false,
                  textInputAction: TextInputAction.next,
                  autofillHints: const [AutofillHints.username],
                  inputFormatters: [
                    FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9._@]')),
                    LengthLimitingTextInputFormatter(40),
                  ],
                  onChanged: _c.setUsername,
                  decoration: InputDecoration(
                    labelText: l10n.epUsername,
                    prefixText: '@',
                    prefixIcon: const Icon(Icons.alternate_email_rounded),
                    suffixIcon: _usernameIcon(context, s.usernameStatus),
                    helperText: !capabilities.canChangeUsername
                        ? l10n.epUsernameLocked
                        : switch (s.usernameStatus) {
                            UsernameStatus.checking => l10n.epUsernameChecking,
                            UsernameStatus.available =>
                              l10n.epUsernameAvailable,
                            _ => null,
                          },
                    errorText: _fieldError(
                      l10n,
                      s.errors[ProfileField.username],
                    ),
                    errorMaxLines: 2,
                  ),
                ),
                const SizedBox(height: BlocksSpacing.md),
                TextField(
                  controller: _bio,
                  minLines: 3,
                  maxLines: 5,
                  textCapitalization: TextCapitalization.sentences,
                  onChanged: _c.setBio,
                  decoration: InputDecoration(
                    labelText: l10n.epBio,
                    alignLabelWithHint: true,
                    counterText: l10n.epBioCount(
                      d.bio.trim().length,
                      ProfileRules.bioMax,
                    ),
                    errorText: _fieldError(l10n, s.errors[ProfileField.bio]),
                    errorMaxLines: 2,
                  ),
                ),
                const SizedBox(height: BlocksSpacing.md),
                TextField(
                  controller: _website,
                  keyboardType: TextInputType.url,
                  autocorrect: false,
                  textInputAction: TextInputAction.next,
                  onChanged: _c.setWebsite,
                  decoration: InputDecoration(
                    labelText: l10n.epWebsite,
                    prefixIcon: const Icon(Icons.link_rounded),
                    errorText: _fieldError(
                      l10n,
                      s.errors[ProfileField.website],
                    ),
                    errorMaxLines: 2,
                  ),
                ),
                const SizedBox(height: BlocksSpacing.lg),
                Semantics(
                  header: true,
                  child: Text(l10n.epLocation, style: context.text.titleSmall),
                ),
                const SizedBox(height: BlocksSpacing.sm),
                DropdownButtonFormField<String>(
                  key: ValueKey('country-${d.country}'),
                  initialValue: d.country,
                  isExpanded: true,
                  decoration: InputDecoration(
                    labelText: l10n.epCountry,
                    prefixIcon: const Icon(Icons.flag_outlined),
                  ),
                  items: [
                    for (final c in kCountries)
                      DropdownMenuItem(value: c, child: Text(c)),
                  ],
                  onChanged: (v) {
                    if (v == null) return;
                    _c.setCountry(v);
                    final next = ref
                        .read(editProfileControllerProvider)
                        .requireValue
                        .draft;
                    _state.text = next.state;
                    _district.text = next.district;
                  },
                ),
                const SizedBox(height: BlocksSpacing.md),
                if (india) ...[
                  DropdownButtonFormField<String>(
                    key: ValueKey('state-${d.state}'),
                    initialValue: indianStates().contains(d.state)
                        ? d.state
                        : null,
                    isExpanded: true,
                    decoration: InputDecoration(labelText: l10n.epState),
                    items: [
                      for (final v in indianStates())
                        DropdownMenuItem(value: v, child: Text(v)),
                    ],
                    onChanged: (v) {
                      if (v != null) _c.setRegion(v);
                    },
                  ),
                  const SizedBox(height: BlocksSpacing.md),
                  DropdownButtonFormField<String>(
                    key: ValueKey('district-${d.state}-${d.district}'),
                    initialValue: districtsOf(d.state).contains(d.district)
                        ? d.district
                        : null,
                    isExpanded: true,
                    decoration: InputDecoration(labelText: l10n.epDistrict),
                    items: [
                      for (final v in districtsOf(d.state))
                        DropdownMenuItem(value: v, child: Text(v)),
                    ],
                    onChanged: (v) {
                      if (v != null) _c.setDistrict(v);
                    },
                  ),
                ] else ...[
                  TextField(
                    controller: _state,
                    textInputAction: TextInputAction.next,
                    onChanged: _c.setRegion,
                    decoration: InputDecoration(labelText: l10n.epState),
                  ),
                  const SizedBox(height: BlocksSpacing.md),
                  TextField(
                    controller: _district,
                    textInputAction: TextInputAction.done,
                    onChanged: _c.setDistrict,
                    decoration: InputDecoration(labelText: l10n.epDistrict),
                  ),
                ],

                // ----------------------------------------------- private --
                const SizedBox(height: BlocksSpacing.xl),
                _SectionHeader(
                  icon: Icons.lock_outline_rounded,
                  title: l10n.epPrivateSection,
                  hint: l10n.epPrivateHint,
                ),
                // The live service keeps the date of birth from sign-up and
                // never shows it again, so there is nothing to edit.
                if (capabilities.canEditDateOfBirth) ...[
                  _DobField(
                    value: d.dateOfBirth,
                    error: _fieldError(
                      l10n,
                      s.errors[ProfileField.dateOfBirth],
                    ),
                    onTap: () => _pickDate(s),
                  ),
                  const SizedBox(height: BlocksSpacing.md),
                ],
                Semantics(
                  header: true,
                  child: Text(l10n.epGender, style: context.text.titleSmall),
                ),
                const SizedBox(height: BlocksSpacing.sm),
                Wrap(
                  spacing: BlocksSpacing.sm,
                  runSpacing: BlocksSpacing.sm,
                  children: [
                    for (final g in Gender.values)
                      BlocksChip(
                        label: _genderLabel(l10n, g),
                        selected: d.gender == g,
                        onSelected: () =>
                            _c.setGender(d.gender == g ? null : g),
                      ),
                  ],
                ),

                // -------------------------------------------- preferences --
                const SizedBox(height: BlocksSpacing.xl),
                _SectionHeader(
                  icon: Icons.language_rounded,
                  title: l10n.epLanguage,
                  hint: l10n.epLanguageHint,
                ),
                Wrap(
                  spacing: BlocksSpacing.sm,
                  runSpacing: BlocksSpacing.sm,
                  children: [
                    BlocksChip(
                      label: l10n.settingsLanguageSystem,
                      selected: language == null,
                      onSelected: () => ref
                          .read(appSettingsProvider.notifier)
                          .setLanguage(null),
                    ),
                    for (final (code, name) in kSupportedLanguages)
                      BlocksChip(
                        label: name,
                        selected: language == code,
                        onSelected: () => ref
                            .read(appSettingsProvider.notifier)
                            .setLanguage(code),
                      ),
                  ],
                ),
                const SizedBox(height: BlocksSpacing.xl),
                BlocksButton(
                  label: l10n.epSaveChanges,
                  icon: Icons.check_rounded,
                  isLoading: s.saving,
                  onPressed: s.canSave ? _save : null,
                ),
                const SizedBox(height: BlocksSpacing.xl),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget? _usernameIcon(BuildContext context, UsernameStatus status) =>
      switch (status) {
        UsernameStatus.available => Icon(
          Icons.check_circle_rounded,
          color: context.blocks.success,
        ),
        UsernameStatus.taken || UsernameStatus.invalid => Icon(
          Icons.error_outline_rounded,
          color: context.scheme.error,
        ),
        _ => null,
      };
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({
    required this.icon,
    required this.title,
    required this.hint,
  });

  final IconData icon;
  final String title;
  final String hint;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: BlocksSpacing.md),
      child: Semantics(
        header: true,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 20, color: context.scheme.primary),
            const SizedBox(width: BlocksSpacing.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: context.text.titleMedium),
                  Text(hint, style: context.text.bodySmall),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DobField extends StatelessWidget {
  const _DobField({
    required this.value,
    required this.error,
    required this.onTap,
  });

  final DateTime? value;
  final String? error;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final text = value == null
        ? l10n.epDobHint
        : MaterialLocalizations.of(context).formatMediumDate(value!);
    return Semantics(
      button: true,
      label: '${l10n.epDob}: $text',
      excludeSemantics: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(BlocksRadius.md),
        onTap: onTap,
        child: InputDecorator(
          decoration: InputDecoration(
            labelText: l10n.epDob,
            prefixIcon: const Icon(Icons.cake_outlined),
            suffixIcon: const Icon(Icons.calendar_today_outlined),
            errorText: error,
            errorMaxLines: 2,
          ),
          child: Text(
            text,
            style: value == null
                ? context.text.bodyLarge?.copyWith(
                    color: context.scheme.onSurfaceVariant,
                  )
                : context.text.bodyLarge,
          ),
        ),
      ),
    );
  }
}
