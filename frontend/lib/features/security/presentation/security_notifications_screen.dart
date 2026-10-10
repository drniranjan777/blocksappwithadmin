import 'package:blocks_app/app/config/app_config.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/security/application/security_providers.dart';
import 'package:blocks_app/features/security/presentation/security_labels.dart';
import 'package:blocks_app/features/settings/presentation/settings_widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Which optional alerts the server may send, plus a log of the security
/// e-mails it did send (demo transparency).
class SecurityNotificationsScreen extends ConsumerWidget {
  const SecurityNotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final prefs = ref.watch(alertPreferencesProvider);
    final sent = ref.watch(sentAlertsProvider);
    final isDemo = ref.watch(appConfigProvider).isDemo;

    Future<void> update(SecurityAlertPreferences next) async {
      await ref.read(securityRepositoryProvider).setAlertPreferences(next);
      ref.invalidate(alertPreferencesProvider);
    }

    return Scaffold(
      appBar: AppBar(title: Text(l10n.snTitle)),
      body: SafeArea(
        child: ResponsiveCenter(
          child: AsyncValueView<SecurityAlertPreferences>(
            value: prefs,
            onRetry: () => ref.invalidate(alertPreferencesProvider),
            data: (p) => ListView(
              padding: const EdgeInsets.all(BlocksSpacing.lg),
              children: [
                Text(l10n.snIntro, style: context.text.bodyMedium),
                const SizedBox(height: BlocksSpacing.lg),
                SettingsCard(
                  child: Column(
                    children: [
                      SettingsSwitchTile(
                        title: l10n.secAlertEmail,
                        value: p.emailCopies,
                        onChanged: (v) => update(p.copyWith(emailCopies: v)),
                      ),
                      SettingsSwitchTile(
                        title: l10n.secAlertPush,
                        value: p.pushAlerts,
                        onChanged: (v) => update(p.copyWith(pushAlerts: v)),
                      ),
                      SettingsSwitchTile(
                        title: l10n.secAlertNewDevice,
                        value: p.newDeviceAlerts,
                        onChanged: (v) =>
                            update(p.copyWith(newDeviceAlerts: v)),
                      ),
                      // Critical alerts can never be switched off.
                      SettingsSwitchTile(
                        title: l10n.snCritical,
                        subtitle: l10n.snCriticalBody,
                        value: true,
                        onChanged: null,
                      ),
                    ],
                  ),
                ),
                SettingsSection(
                  title: l10n.snSentTitle,
                  children: [..._sentRows(context, ref, sent)],
                ),
                if (isDemo) ...[
                  const SizedBox(height: BlocksSpacing.lg),
                  Text(
                    l10n.snDemoNote,
                    style: context.text.bodySmall,
                    textAlign: TextAlign.center,
                  ),
                ],
                const SizedBox(height: BlocksSpacing.xl),
              ],
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _sentRows(
    BuildContext context,
    WidgetRef ref,
    AsyncValue<List<SentSecurityEmail>> sent,
  ) {
    final l10n = context.l10n;
    final list = sent.value;
    if (list == null) {
      return [
        const Padding(
          padding: EdgeInsets.all(BlocksSpacing.lg),
          child: LinearProgressIndicator(),
        ),
      ];
    }
    if (list.isEmpty) {
      return [
        ListTile(
          leading: const Icon(Icons.mail_outline_rounded),
          title: Text(l10n.snSentEmpty),
        ),
      ];
    }
    return [
      for (final m in list)
        ListTile(
          leading: Icon(
            Icons.mark_email_read_outlined,
            color: context.scheme.primary,
          ),
          title: Text(securityEventTitle(l10n, m.type)),
          subtitle: Text(l10n.snSentTo(m.maskedTo)),
          trailing: Text(
            formatClock(context, m.sentAt),
            style: context.text.labelMedium,
          ),
        ),
    ];
  }
}
