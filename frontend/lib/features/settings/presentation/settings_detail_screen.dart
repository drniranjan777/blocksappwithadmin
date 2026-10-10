import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/features/profile/application/user_providers.dart';
import 'package:blocks_app/features/settings/application/app_settings.dart';
import 'package:blocks_app/features/settings/presentation/settings_screen.dart';
import 'package:blocks_app/features/settings/presentation/settings_widgets.dart';
import 'package:blocks_app/l10n/gen/app_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

enum SettingsKind {
  account,
  notifications,
  language,
  content,
  creator,
  business,
}

extension on AppFlag {
  String title(AppLocalizations l) => switch (this) {
    AppFlag.notifLikes => l.prefNotifLikes,
    AppFlag.notifComments => l.prefNotifComments,
    AppFlag.notifFollowers => l.prefNotifFollowers,
    AppFlag.notifReach => l.prefNotifReach,
    AppFlag.notifEarnings => l.prefNotifEarnings,
    AppFlag.notifBusiness => l.prefNotifBusiness,
    AppFlag.autoplay => l.prefAutoplay,
    AppFlag.dataSaver => l.prefDataSaver,
    AppFlag.showReachBadge => l.prefShowReachBadge,
    AppFlag.creatorShowEarnings => l.prefCreatorEarnings,
    AppFlag.weeklySummary => l.prefWeeklySummary,
    AppFlag.businessAutoReply => l.prefBusinessAutoReply,
    AppFlag.businessShowContact => l.prefBusinessContact,
    AppFlag.privateAccount => l.safetyPrivateAccount,
    AppFlag.loginAlerts => l.safetyLoginAlerts,
    AppFlag.reelsSoundEnabled => l.prefReelsSound,
  };

  String? subtitle(AppLocalizations l) => switch (this) {
    AppFlag.dataSaver => l.prefDataSaverBody,
    AppFlag.reelsSoundEnabled => l.prefReelsSoundBody,
    _ => null,
  };
}

class SettingsDetailScreen extends ConsumerWidget {
  const SettingsDetailScreen({required this.kind, super.key});

  final SettingsKind kind;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final title = switch (kind) {
      SettingsKind.account => l10n.settingsAccount,
      SettingsKind.notifications => l10n.settingsNotifications,
      SettingsKind.language => l10n.settingsLanguage,
      SettingsKind.content => l10n.settingsContent,
      SettingsKind.creator => l10n.settingsCreator,
      SettingsKind.business => l10n.settingsBusiness,
    };

    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: SafeArea(
        child: ResponsiveCenter(
          child: ListView(
            padding: const EdgeInsets.all(BlocksSpacing.lg),
            children: switch (kind) {
              SettingsKind.account => [_account(context, ref)],
              SettingsKind.language => [_language(context, ref)],
              SettingsKind.notifications => [
                _flags(
                  context,
                  ref,
                  [
                    AppFlag.notifLikes,
                    AppFlag.notifComments,
                    AppFlag.notifFollowers,
                    AppFlag.notifReach,
                    AppFlag.notifEarnings,
                    AppFlag.notifBusiness,
                  ],
                  extra: [
                    // Safety alerts cannot be switched off.
                    SettingsSwitchTile(
                      title: l10n.prefNotifSafety,
                      subtitle: l10n.prefAlwaysOn,
                      value: true,
                      onChanged: null,
                    ),
                  ],
                ),
              ],
              SettingsKind.content => [
                _flags(context, ref, [
                  AppFlag.autoplay,
                  AppFlag.reelsSoundEnabled,
                  AppFlag.dataSaver,
                  AppFlag.showReachBadge,
                ]),
              ],
              SettingsKind.creator => [
                _flags(context, ref, [
                  AppFlag.creatorShowEarnings,
                  AppFlag.weeklySummary,
                ]),
              ],
              SettingsKind.business => [
                _flags(context, ref, [
                  AppFlag.businessAutoReply,
                  AppFlag.businessShowContact,
                ]),
                const SizedBox(height: BlocksSpacing.lg),
                _OpenBusiness(),
              ],
            },
          ),
        ),
      ),
    );
  }

  Widget _flags(
    BuildContext context,
    WidgetRef ref,
    List<AppFlag> flags, {
    List<Widget> extra = const [],
  }) {
    final l10n = context.l10n;
    final c = ref.read(appSettingsProvider.notifier);
    return SettingsCard(
      child: Column(
        children: [
          for (final f in flags)
            SettingsSwitchTile(
              title: f.title(l10n),
              subtitle: f.subtitle(l10n),
              value: ref.watch(flagProvider(f)),
              onChanged: (v) => c.setFlag(f, value: v),
            ),
          ...extra,
        ],
      ),
    );
  }

  Widget _language(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final current = ref.watch(
      appSettingsProvider.select((s) => s.languageCode),
    );
    final c = ref.read(appSettingsProvider.notifier);
    final options = <(String?, String)>[
      (null, l10n.settingsLanguageSystem),
      for (final (code, name) in kSupportedLanguages) (code, name),
    ];
    return SettingsCard(
      child: RadioGroup<String?>(
        groupValue: current,
        onChanged: c.setLanguage,
        child: Column(
          children: [
            for (final (code, name) in options)
              RadioListTile<String?>(value: code, title: Text(name)),
          ],
        ),
      ),
    );
  }

  Widget _account(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final me = ref.watch(currentUserProvider).value;
    if (me == null) return const SizedBox.shrink();
    return SettingsSection(
      title: l10n.settingsSectionAccount,
      children: [
        SettingsInfoTile(
          icon: Icons.badge_outlined,
          title: l10n.settingsAccountName,
          subtitle: me.name,
        ),
        SettingsInfoTile(
          icon: Icons.alternate_email_rounded,
          title: l10n.settingsAccountUsername,
          subtitle: me.username,
        ),
        SettingsInfoTile(
          icon: Icons.location_on_outlined,
          title: l10n.settingsAccountLocation,
          subtitle: me.location,
        ),
        SettingsInfoTile(
          icon: Icons.schedule_rounded,
          title: l10n.settingsAccountAge,
          subtitle: l10n.settingsAccountDays('${me.accountAgeDays}'),
        ),
      ],
    );
  }
}

class _OpenBusiness extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final id = ref.watch(currentUserProvider).value?.businessId;
    if (id == null) return const SizedBox.shrink();
    return BlocksButton(
      label: context.l10n.prefOpenBusiness,
      icon: Icons.storefront_rounded,
      variant: BlocksButtonVariant.tonal,
      onPressed: () => context.push('/business/$id'),
    );
  }
}
