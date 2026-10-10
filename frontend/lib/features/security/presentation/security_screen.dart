import 'package:blocks_app/app/config/app_config.dart';
import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/utils/time_ago.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/security/application/security_providers.dart';
import 'package:blocks_app/features/security/presentation/security_actions.dart';
import 'package:blocks_app/features/settings/presentation/settings_widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Settings -> Security: one place for everything that protects the account.
class SecurityScreen extends ConsumerWidget {
  const SecurityScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final contacts = ref.watch(securityContactsProvider);
    final twoFactor = ref.watch(twoFactorProvider);
    final sessions = ref.watch(sessionsProvider);
    final events = ref.watch(securityEventsProvider(SecurityEventFilter.all));
    final isDemo = ref.watch(appConfigProvider).isDemo;

    final loading = contacts.isLoading || twoFactor.isLoading;
    final failed = contacts.hasError || twoFactor.hasError;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.secTitle)),
      body: SafeArea(
        child: ResponsiveCenter(
          child: failed
              ? ErrorView(onRetry: () => refreshSecurity(ref))
              : loading || contacts.value == null || twoFactor.value == null
              ? const LoadingView()
              : RefreshIndicator(
                  onRefresh: () async => refreshSecurity(ref),
                  child: ListView(
                    padding: const EdgeInsets.all(BlocksSpacing.lg),
                    children: [
                      _StatusCard(
                        twoFactorOn: twoFactor.value!.enabled,
                        events: events.value ?? const [],
                      ),
                      SettingsSection(
                        title: l10n.secSectionAccount,
                        children: [
                          SettingsNavTile(
                            icon: Icons.password_rounded,
                            title: l10n.secChangePassword,
                            onTap: () => context.push(Routes.changePassword),
                          ),
                          SettingsNavTile(
                            icon: Icons.alternate_email_rounded,
                            title: l10n.secChangeEmail,
                            subtitle: contacts.value!.maskedEmail,
                            onTap: () => context.push(Routes.changeEmail),
                          ),
                          SettingsNavTile(
                            icon: Icons.phone_android_rounded,
                            title: l10n.secChangePhone,
                            subtitle: contacts.value!.maskedPhone,
                            onTap: () => context.push(Routes.changePhone),
                          ),
                          SettingsNavTile(
                            icon: Icons.verified_user_outlined,
                            title: l10n.secTwoFactor,
                            trailingText: twoFactor.value!.enabled
                                ? l10n.secOn
                                : l10n.secOff,
                            onTap: () => context.push(Routes.twoFactor),
                          ),
                          SettingsNavTile(
                            icon: Icons.history_rounded,
                            title: l10n.secLoginActivity,
                            trailingText: _needsReview(events.value)
                                ? l10n.secReviewNeeded
                                : null,
                            onTap: () => context.push(Routes.loginActivity),
                          ),
                          SettingsNavTile(
                            icon: Icons.devices_rounded,
                            title: l10n.secDevices,
                            trailingText: sessions.value == null
                                ? null
                                : l10n.secDevicesCount(sessions.value!.length),
                            onTap: () => context.push(Routes.devices),
                          ),
                          SettingsNavTile(
                            icon: Icons.logout_rounded,
                            title: l10n.secLogoutOthers,
                            destructive: true,
                            onTap: () =>
                                confirmLogoutOtherDevices(context, ref),
                          ),
                          SettingsNavTile(
                            icon: Icons.notifications_active_outlined,
                            title: l10n.secNotifications,
                            onTap: () =>
                                context.push(Routes.securityNotifications),
                          ),
                        ],
                      ),
                      if (isDemo)
                        SettingsSection(
                          title: l10n.secSectionDemo,
                          children: [
                            SettingsNavTile(
                              icon: Icons.science_outlined,
                              title: l10n.secDemoLab,
                              subtitle: l10n.secDemoLabBody,
                              onTap: () => context.push(Routes.securityDemo),
                            ),
                          ],
                        ),
                      const SizedBox(height: BlocksSpacing.xl),
                    ],
                  ),
                ),
        ),
      ),
    );
  }

  static bool _needsReview(List<SecurityEvent>? events) =>
      events != null &&
      events.any(
        (e) => e.status == SecurityEventStatus.suspicious && !e.acknowledged,
      );
}

/// "Your account is protected" / "needs attention", driven by real state.
class _StatusCard extends ConsumerWidget {
  const _StatusCard({required this.twoFactorOn, required this.events});

  final bool twoFactorOn;
  final List<SecurityEvent> events;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    SecurityEvent? suspicious;
    for (final e in events) {
      if (e.status == SecurityEventStatus.suspicious && !e.acknowledged) {
        suspicious = e;
        break;
      }
    }
    final attention = suspicious != null || !twoFactorOn;
    final color = suspicious != null
        ? context.scheme.error
        : attention
        ? context.blocks.warning
        : context.blocks.success;
    final body = suspicious != null
        ? l10n.secStatusBodySuspicious
        : !twoFactorOn
        ? l10n.secStatusBody2faOff
        : l10n.secStatusBody2faOn;

    SecurityEvent? lastLogin;
    for (final e in events) {
      if (e.type == SecurityEventType.loginSuccess) {
        lastLogin = e;
        break;
      }
    }
    final now = ref.read(clockProvider)();

    return Semantics(
      container: true,
      child: Container(
        padding: const EdgeInsets.all(BlocksSpacing.lg),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(BlocksRadius.xl),
          border: Border.all(color: color.withValues(alpha: 0.35)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(BlocksRadius.md),
                  ),
                  child: Icon(
                    attention
                        ? Icons.gpp_maybe_rounded
                        : Icons.verified_user_rounded,
                    color: color,
                  ),
                ),
                const SizedBox(width: BlocksSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        attention
                            ? l10n.secStatusAttention
                            : l10n.secStatusProtected,
                        style: context.text.titleMedium,
                      ),
                      const SizedBox(height: BlocksSpacing.xs),
                      Text(body, style: context.text.bodyMedium),
                      if (lastLogin != null) ...[
                        const SizedBox(height: BlocksSpacing.sm),
                        Text(
                          l10n.secLastSignIn(
                            timeAgo(l10n, lastLogin.timestamp, now: now),
                          ),
                          style: context.text.bodySmall,
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
            if (suspicious != null) ...[
              const SizedBox(height: BlocksSpacing.md),
              BlocksButton(
                label: l10n.secReviewNeeded,
                icon: Icons.shield_outlined,
                onPressed: () =>
                    context.push(Routes.securityAlert(suspicious!.id)),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
