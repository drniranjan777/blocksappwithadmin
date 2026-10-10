import 'package:blocks_app/app/config/app_config.dart';
import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/blocks_chip.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/features/auth/application/session_controller.dart';
import 'package:blocks_app/features/security/application/security_providers.dart';
import 'package:blocks_app/features/settings/application/app_settings.dart';
import 'package:blocks_app/features/settings/presentation/settings_widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Settings, grouped the way people look for things:
/// Account · Security · Privacy & safety · Preferences · Support · Logout.
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final themeMode = ref.watch(appSettingsProvider.select((s) => s.themeMode));
    final languageCode = ref.watch(
      appSettingsProvider.select((s) => s.languageCode),
    );
    final contacts = ref.watch(securityContactsProvider).value;
    final c = ref.read(appSettingsProvider.notifier);
    final demo = ref.watch(appConfigProvider).useMockData;

    Future<void> confirmLogout() async {
      final ok = await showDialog<bool>(
        context: context,
        builder: (d) => AlertDialog(
          title: Text(l10n.settingsLogoutTitle),
          content: Text(
            demo ? l10n.settingsLogoutBody : l10n.settingsLogoutBodyLive,
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(d).pop(false),
              child: Text(l10n.cancel),
            ),
            TextButton(
              onPressed: () => Navigator.of(d).pop(true),
              style: TextButton.styleFrom(foregroundColor: d.scheme.error),
              child: Text(l10n.settingsLogout),
            ),
          ],
        ),
      );
      if (ok ?? false) {
        await ref.read(sessionControllerProvider.notifier).signOut();
      }
    }

    return Scaffold(
      appBar: AppBar(title: Text(l10n.settingsTitle)),
      body: SafeArea(
        child: ResponsiveCenter(
          child: ListView(
            padding: const EdgeInsets.all(BlocksSpacing.lg),
            children: [
              SettingsSection(
                title: l10n.settingsSectionAccount,
                children: [
                  SettingsNavTile(
                    icon: Icons.edit_outlined,
                    title: l10n.epTitle,
                    onTap: () => context.push(Routes.editProfile),
                  ),
                  SettingsNavTile(
                    icon: Icons.alternate_email_rounded,
                    title: l10n.settingsEmail,
                    subtitle: contacts?.maskedEmail,
                    onTap: () => context.push(Routes.changeEmail),
                  ),
                  SettingsNavTile(
                    icon: Icons.phone_android_rounded,
                    title: l10n.settingsPhone,
                    subtitle: contacts?.maskedPhone,
                    onTap: () => context.push(Routes.changePhone),
                  ),
                  SettingsNavTile(
                    icon: Icons.password_rounded,
                    title: l10n.settingsPassword,
                    onTap: () => context.push(Routes.changePassword),
                  ),
                  SettingsNavTile(
                    icon: Icons.person_outline_rounded,
                    title: l10n.settingsAccount,
                    onTap: () => context.push('/settings/account'),
                  ),
                ],
              ),
              SettingsSection(
                title: l10n.settingsSecurity,
                children: [
                  SettingsNavTile(
                    icon: Icons.security_rounded,
                    title: l10n.secOverview,
                    onTap: () => context.push(Routes.security),
                  ),
                  SettingsNavTile(
                    icon: Icons.lock_reset_rounded,
                    title: l10n.secChangePassword,
                    onTap: () => context.push(Routes.changePassword),
                  ),
                  SettingsNavTile(
                    icon: Icons.verified_user_outlined,
                    title: l10n.secTwoFactor,
                    onTap: () => context.push(Routes.twoFactor),
                  ),
                  SettingsNavTile(
                    icon: Icons.history_rounded,
                    title: l10n.secLoginActivity,
                    onTap: () => context.push(Routes.loginActivity),
                  ),
                  SettingsNavTile(
                    icon: Icons.devices_rounded,
                    title: l10n.secDevices,
                    onTap: () => context.push(Routes.devices),
                  ),
                  SettingsNavTile(
                    icon: Icons.notifications_active_outlined,
                    title: l10n.secNotifications,
                    onTap: () => context.push(Routes.securityNotifications),
                  ),
                ],
              ),
              SettingsSection(
                title: l10n.settingsSectionPrivacySafety,
                children: [
                  SettingsNavTile(
                    icon: Icons.lock_outline_rounded,
                    title: l10n.settingsPrivacy,
                    onTap: () => context.push(Routes.safety),
                  ),
                  SettingsNavTile(
                    icon: Icons.block_rounded,
                    title: l10n.safetyBlocked,
                    onTap: () => context.push(Routes.blocked),
                  ),
                  SettingsNavTile(
                    icon: Icons.volume_off_outlined,
                    title: l10n.safetyMuted,
                    onTap: () => context.push(Routes.muted),
                  ),
                  SettingsNavTile(
                    icon: Icons.insights_rounded,
                    title: l10n.settingsCreator,
                    onTap: () => context.push('/settings/creator'),
                  ),
                  SettingsNavTile(
                    icon: Icons.storefront_rounded,
                    title: l10n.settingsBusiness,
                    onTap: () => context.push('/settings/business'),
                  ),
                ],
              ),
              SettingsSection(
                title: l10n.settingsSectionPreferences,
                children: [
                  SettingsChoiceRow(
                    title: l10n.settingsAppearance,
                    child: Wrap(
                      spacing: BlocksSpacing.sm,
                      runSpacing: BlocksSpacing.sm,
                      children: [
                        for (final (mode, label) in [
                          (ThemeMode.system, l10n.themeSystem),
                          (ThemeMode.light, l10n.themeLight),
                          (ThemeMode.dark, l10n.themeDark),
                        ])
                          BlocksChip(
                            label: label,
                            selected: themeMode == mode,
                            onSelected: () => c.setThemeMode(mode),
                          ),
                      ],
                    ),
                  ),
                  SettingsNavTile(
                    icon: Icons.notifications_none_rounded,
                    title: l10n.settingsNotifications,
                    onTap: () => context.push('/settings/notifications'),
                  ),
                  SettingsNavTile(
                    icon: Icons.tune_rounded,
                    title: l10n.settingsContent,
                    onTap: () => context.push('/settings/content'),
                  ),
                  SettingsNavTile(
                    icon: Icons.language_rounded,
                    title: l10n.settingsLanguage,
                    trailingText: languageLabel(
                      languageCode,
                      l10n.settingsLanguageSystem,
                    ),
                    onTap: () => context.push('/settings/language'),
                  ),
                ],
              ),
              SettingsSection(
                title: l10n.settingsSectionSupport,
                children: [
                  SettingsNavTile(
                    icon: Icons.help_outline_rounded,
                    title: l10n.settingsHelp,
                    onTap: () => context.push(Routes.info('help')),
                  ),
                  SettingsNavTile(
                    icon: Icons.rule_rounded,
                    title: l10n.settingsGuidelines,
                    onTap: () => context.push(Routes.info('guidelines')),
                  ),
                  SettingsNavTile(
                    icon: Icons.privacy_tip_outlined,
                    title: l10n.settingsPrivacyPolicy,
                    onTap: () => context.push(Routes.info('privacy')),
                  ),
                  SettingsNavTile(
                    icon: Icons.description_outlined,
                    title: l10n.settingsTerms,
                    onTap: () => context.push(Routes.info('terms')),
                  ),
                ],
              ),
              const SizedBox(height: BlocksSpacing.xl),
              SettingsCard(
                child: SettingsNavTile(
                  icon: Icons.logout_rounded,
                  title: l10n.settingsLogout,
                  destructive: true,
                  onTap: confirmLogout,
                ),
              ),
              const SizedBox(height: BlocksSpacing.xl),
              // The only place the demo announces itself.
              if (demo) ...[
                Center(
                  child: Text(
                    l10n.settingsDemoMode,
                    style: context.text.bodySmall,
                    textAlign: TextAlign.center,
                  ),
                ),
                const SizedBox(height: BlocksSpacing.xl),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Native-script language names are intentionally not translated: each
/// language is always shown in itself so people can find their own.
const kSupportedLanguages = <(String, String)>[
  ('en', 'English'),
  ('hi', 'हिन्दी'),
  ('te', 'తెలుగు'),
];

String languageLabel(String? code, String systemLabel) {
  for (final (c, name) in kSupportedLanguages) {
    if (c == code) return name;
  }
  return systemLabel;
}
