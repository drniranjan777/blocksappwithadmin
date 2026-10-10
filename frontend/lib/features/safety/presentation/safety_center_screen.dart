import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/blocks_chip.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/data/models/business_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/profile/application/user_providers.dart';
import 'package:blocks_app/features/safety/application/safety_actions.dart';
import 'package:blocks_app/features/safety/presentation/report_sheet.dart';
import 'package:blocks_app/features/settings/application/app_settings.dart';
import 'package:blocks_app/features/settings/presentation/settings_widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// One place for every safety and privacy control.
class SafetyCenterScreen extends ConsumerWidget {
  const SafetyCenterScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final settings = ref.watch(appSettingsProvider);
    final c = ref.read(appSettingsProvider.notifier);
    final me = ref.watch(currentUserProvider).value;
    final blocked = ref.watch(blockedUsersProvider).value?.length ?? 0;
    final muted = ref.watch(mutedUsersProvider).value?.length ?? 0;

    String scope(InteractionScope s) => switch (s) {
      InteractionScope.everyone => l10n.safetyEveryone,
      InteractionScope.followers => l10n.safetyFollowers,
      InteractionScope.nobody => l10n.safetyNobody,
    };

    return Scaffold(
      appBar: AppBar(title: Text(l10n.safetyTitle)),
      body: SafeArea(
        child: ResponsiveCenter(
          child: ListView(
            padding: const EdgeInsets.all(BlocksSpacing.lg),
            children: [
              Container(
                padding: const EdgeInsets.all(BlocksSpacing.lg),
                decoration: BoxDecoration(
                  color: context.scheme.primaryContainer.withValues(alpha: 0.6),
                  borderRadius: BorderRadius.circular(BlocksRadius.xl),
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.shield_rounded,
                      size: 32,
                      color: context.scheme.primary,
                    ),
                    const SizedBox(width: BlocksSpacing.md),
                    Expanded(
                      child: Text(
                        l10n.safetyIntro,
                        style: context.text.bodyMedium,
                      ),
                    ),
                  ],
                ),
              ),
              SettingsSection(
                title: l10n.safetySectionReport,
                children: [
                  SettingsNavTile(
                    icon: Icons.flag_outlined,
                    title: l10n.safetyReportContent,
                    subtitle: l10n.safetyReportContentBody,
                    onTap: () => showReportSheet(
                      context,
                      targetType: ReportTargetType.post,
                      targetId: 'safety-center',
                    ),
                  ),
                ],
              ),
              SettingsSection(
                title: l10n.safetySectionPeople,
                children: [
                  SettingsNavTile(
                    icon: Icons.block_rounded,
                    title: l10n.safetyBlocked,
                    trailingText: '$blocked',
                    onTap: () => context.push(Routes.blocked),
                  ),
                  SettingsNavTile(
                    icon: Icons.volume_off_outlined,
                    title: l10n.safetyMuted,
                    trailingText: '$muted',
                    onTap: () => context.push(Routes.muted),
                  ),
                  SettingsNavTile(
                    icon: Icons.visibility_off_outlined,
                    title: l10n.safetyRestricted,
                    onTap: () => showModalBottomSheet<void>(
                      context: context,
                      builder: (_) => SafeArea(
                        child: Padding(
                          padding: const EdgeInsets.all(BlocksSpacing.xl),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                l10n.safetyRestricted,
                                style: context.text.titleLarge,
                              ),
                              const SizedBox(height: BlocksSpacing.sm),
                              Text(
                                l10n.safetyRestrictedBody,
                                style: context.text.bodyMedium,
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              SettingsSection(
                title: l10n.safetySectionControls,
                children: [
                  SettingsChoiceRow(
                    title: l10n.safetySensitive,
                    subtitle: l10n.safetySensitiveBody,
                    child: Wrap(
                      spacing: BlocksSpacing.sm,
                      runSpacing: BlocksSpacing.sm,
                      children: [
                        for (final (v, label) in [
                          (
                            SensitiveContentLevel.less,
                            l10n.safetySensitiveLess,
                          ),
                          (
                            SensitiveContentLevel.standard,
                            l10n.safetySensitiveStandard,
                          ),
                          (
                            SensitiveContentLevel.more,
                            l10n.safetySensitiveMore,
                          ),
                        ])
                          BlocksChip(
                            label: label,
                            selected: settings.sensitive == v,
                            onSelected: () => c.setSensitive(v),
                          ),
                      ],
                    ),
                  ),
                  SettingsChoiceRow(
                    title: l10n.safetyComments,
                    child: Wrap(
                      spacing: BlocksSpacing.sm,
                      runSpacing: BlocksSpacing.sm,
                      children: [
                        for (final v in InteractionScope.values)
                          BlocksChip(
                            label: scope(v),
                            selected: settings.whoCanComment == v,
                            onSelected: () => c.setWhoCanComment(v),
                          ),
                      ],
                    ),
                  ),
                  SettingsChoiceRow(
                    title: l10n.safetyMessages,
                    child: Wrap(
                      spacing: BlocksSpacing.sm,
                      runSpacing: BlocksSpacing.sm,
                      children: [
                        for (final v in InteractionScope.values)
                          BlocksChip(
                            label: scope(v),
                            selected: settings.whoCanMessage == v,
                            onSelected: () => c.setWhoCanMessage(v),
                          ),
                      ],
                    ),
                  ),
                  SettingsSwitchTile(
                    title: l10n.safetyPrivateAccount,
                    subtitle: l10n.safetyPrivateAccountBody,
                    value: settings.isOn(AppFlag.privateAccount),
                    onChanged: (v) =>
                        c.setFlag(AppFlag.privateAccount, value: v),
                  ),
                ],
              ),
              SettingsSection(
                title: l10n.safetySectionSecurity,
                children: [
                  SettingsSwitchTile(
                    title: l10n.safetyTwoFactor,
                    subtitle: l10n.safetyTwoFactorBody,
                    value: me?.isTwoFactorEnabled ?? false,
                    onChanged: me == null
                        ? null
                        : (v) async {
                            await ref
                                .read(userRepositoryProvider)
                                .setTwoFactorEnabled(enabled: v);
                            ref.invalidate(currentUserProvider);
                          },
                  ),
                  SettingsInfoTile(
                    icon: Icons.devices_rounded,
                    title: l10n.safetyLoginSecurity,
                    subtitle: l10n.safetyLoginBody(me?.district ?? ''),
                  ),
                  SettingsSwitchTile(
                    title: l10n.safetyLoginAlerts,
                    value: settings.isOn(AppFlag.loginAlerts),
                    onChanged: (v) => c.setFlag(AppFlag.loginAlerts, value: v),
                  ),
                ],
              ),
              const SizedBox(height: BlocksSpacing.xl),
            ],
          ),
        ),
      ),
    );
  }
}
