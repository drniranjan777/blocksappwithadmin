import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/utils/time_ago.dart';
import 'package:blocks_app/core/widgets/app_snack.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/security/application/security_providers.dart';
import 'package:blocks_app/features/security/presentation/security_actions.dart';
import 'package:blocks_app/features/security/presentation/security_labels.dart';
import 'package:blocks_app/features/settings/presentation/settings_widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Every device signed in to the account, with a way to log each one out.
class DevicesScreen extends ConsumerWidget {
  const DevicesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final sessions = ref.watch(sessionsProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.devTitle)),
      body: SafeArea(
        child: ResponsiveCenter(
          child: AsyncValueView<List<DeviceSession>>(
            value: sessions,
            onRetry: () => ref.invalidate(sessionsProvider),
            data: (list) {
              final others = list.where((s) => !s.isCurrent).toList();
              return RefreshIndicator(
                onRefresh: () async => ref.invalidate(sessionsProvider),
                child: ListView(
                  padding: const EdgeInsets.all(BlocksSpacing.lg),
                  children: [
                    for (final s in list) ...[
                      _DeviceTile(session: s),
                      const SizedBox(height: BlocksSpacing.md),
                    ],
                    const SizedBox(height: BlocksSpacing.sm),
                    if (others.isEmpty)
                      Center(
                        child: Text(
                          l10n.devEmpty,
                          style: context.text.bodyMedium,
                          textAlign: TextAlign.center,
                        ),
                      )
                    else
                      BlocksButton(
                        label: l10n.secLogoutOthers,
                        icon: Icons.logout_rounded,
                        variant: BlocksButtonVariant.outline,
                        onPressed: () =>
                            confirmLogoutOtherDevices(context, ref),
                      ),
                    const SizedBox(height: BlocksSpacing.xl),
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}

class _DeviceTile extends ConsumerWidget {
  const _DeviceTile({required this.session});

  final DeviceSession session;

  Future<void> _logOut(BuildContext context, WidgetRef ref) async {
    final l10n = context.l10n;
    final ok = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text(l10n.devLogOutTitle),
        content: Text(l10n.devLogOutBody(session.deviceName)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(d).pop(false),
            child: Text(l10n.cancel),
          ),
          TextButton(
            onPressed: () => Navigator.of(d).pop(true),
            style: TextButton.styleFrom(foregroundColor: d.scheme.error),
            child: Text(l10n.devLogOut),
          ),
        ],
      ),
    );
    if (!(ok ?? false)) return;
    await ref.read(sessionRepositoryProvider).revokeSession(session.id);
    refreshSecurity(ref);
    if (context.mounted) showAppSnack(context, l10n.devLoggedOut);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final now = ref.read(clockProvider)();
    final when = session.isCurrent
        ? l10n.devActiveNow
        : timeAgo(l10n, session.lastActive, now: now);
    final app = session.appOrBrowser.isEmpty
        ? session.platform
        : l10n.devOnPlatform(session.appOrBrowser, session.platform);

    return SettingsCard(
      child: Padding(
        padding: const EdgeInsets.all(BlocksSpacing.lg),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: context.scheme.primaryContainer,
                borderRadius: BorderRadius.circular(BlocksRadius.md),
              ),
              child: Icon(
                devicePlatformIcon(session.platform),
                color: context.scheme.onPrimaryContainer,
              ),
            ),
            const SizedBox(width: BlocksSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(session.deviceName, style: context.text.titleSmall),
                  const SizedBox(height: 2),
                  Text(app, style: context.text.bodySmall),
                  Text(
                    '${session.approximateLocation} · $when',
                    style: context.text.bodySmall,
                  ),
                  if (session.isCurrent) ...[
                    const SizedBox(height: BlocksSpacing.sm),
                    _CurrentBadge(label: l10n.devCurrentBadge),
                  ] else ...[
                    const SizedBox(height: BlocksSpacing.xs),
                    Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: TextButton(
                        onPressed: () => _logOut(context, ref),
                        style: TextButton.styleFrom(
                          foregroundColor: context.scheme.error,
                          padding: EdgeInsets.zero,
                          minimumSize: const Size(
                            BlocksSpacing.touchTarget,
                            BlocksSpacing.touchTarget,
                          ),
                          alignment: AlignmentDirectional.centerStart,
                        ),
                        child: Text(l10n.devLogOut),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CurrentBadge extends StatelessWidget {
  const _CurrentBadge({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final color = context.blocks.success;
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: BlocksSpacing.md,
        vertical: 4,
      ),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(BlocksRadius.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.check_rounded, size: 14, color: color),
          const SizedBox(width: 4),
          Flexible(
            child: Text(
              label,
              style: context.text.labelMedium?.copyWith(color: color),
            ),
          ),
        ],
      ),
    );
  }
}
