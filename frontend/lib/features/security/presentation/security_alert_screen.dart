import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/app_snack.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/security/application/security_providers.dart';
import 'package:blocks_app/features/security/presentation/security_labels.dart';
import 'package:blocks_app/features/security/presentation/widgets/status_widgets.dart';
import 'package:blocks_app/features/settings/presentation/settings_widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// "Suspicious Login Attempt": what happened, where (approximately) and what
/// to do about it. Reached from a security notification or Login Activity.
class SecurityAlertScreen extends ConsumerWidget {
  const SecurityAlertScreen({required this.eventId, super.key});

  final String eventId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final event = ref.watch(securityEventProvider(eventId));
    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.secTitle)),
      body: SafeArea(
        child: ResponsiveCenter(
          child: AsyncValueView<SecurityEvent>(
            value: event,
            onRetry: () => ref.invalidate(securityEventProvider(eventId)),
            data: (e) => _AlertBody(event: e),
          ),
        ),
      ),
    );
  }
}

class _AlertBody extends ConsumerWidget {
  const _AlertBody({required this.event});

  final SecurityEvent event;

  bool get _suspicious => event.type == SecurityEventType.suspiciousLogin;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final now = ref.read(clockProvider)();
    final color = _suspicious
        ? context.scheme.error
        : securityStatusColor(context, event.status);

    final title = switch (event.type) {
      SecurityEventType.suspiciousLogin => l10n.alertSuspiciousTitle,
      SecurityEventType.loginSuccess => l10n.alertNewDeviceTitle,
      _ => securityEventTitle(l10n, event.type),
    };
    final body = switch (event.type) {
      SecurityEventType.suspiciousLogin => l10n.alertSuspiciousBody,
      SecurityEventType.loginSuccess => l10n.alertNewDeviceBody,
      _ => '',
    };

    Future<void> thisWasMe() async {
      await ref.read(securityRepositoryProvider).acknowledgeEvent(event.id);
      refreshSecurity(ref);
      if (context.mounted) showAppSnack(context, l10n.alertAcknowledged);
    }

    return ListView(
      padding: const EdgeInsets.all(BlocksSpacing.lg),
      children: [
        Center(
          child: Container(
            width: 84,
            height: 84,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(BlocksRadius.xl + 4),
            ),
            child: Icon(securityEventIcon(event.type), size: 42, color: color),
          ),
        ),
        const SizedBox(height: BlocksSpacing.lg),
        Semantics(
          header: true,
          child: Text(
            title,
            style: context.text.headlineSmall,
            textAlign: TextAlign.center,
          ),
        ),
        if (body.isNotEmpty) ...[
          const SizedBox(height: BlocksSpacing.sm),
          Text(
            body,
            style: context.text.bodyMedium,
            textAlign: TextAlign.center,
          ),
        ],
        const SizedBox(height: BlocksSpacing.lg),
        SettingsCard(
          child: Column(
            children: [
              _DetailRow(
                icon: Icons.devices_rounded,
                label: l10n.alertDevice,
                value: event.deviceName,
              ),
              const Divider(height: 1),
              _DetailRow(
                icon: Icons.location_on_outlined,
                label: l10n.alertLocation,
                value: event.approximateLocation,
              ),
              const Divider(height: 1),
              _DetailRow(
                icon: Icons.schedule_rounded,
                label: l10n.alertTime,
                value:
                    '${dayLabel(context, event.timestamp, now)}, '
                    '${formatClock(context, event.timestamp)}',
              ),
              if (event.attempts != null) ...[
                const Divider(height: 1),
                _DetailRow(
                  icon: Icons.error_outline_rounded,
                  label: l10n.evLoginFailed,
                  value: l10n.evAttempts(event.attempts!),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: BlocksSpacing.sm),
        Text(
          l10n.alertPrivacyNote,
          style: context.text.bodySmall,
          textAlign: TextAlign.center,
        ),
        if (_suspicious) ...[
          const SizedBox(height: BlocksSpacing.lg),
          StatusBanner.success(title: l10n.alertSent, body: l10n.alertSentBody),
        ],
        const SizedBox(height: BlocksSpacing.lg),
        _Guidance(
          title: l10n.alertIfYou,
          body: l10n.alertIfYouBody,
          icon: Icons.thumb_up_alt_outlined,
        ),
        const SizedBox(height: BlocksSpacing.md),
        _Guidance(
          title: l10n.alertIfNotYou,
          body: l10n.alertIfNotYouBody,
          icon: Icons.report_gmailerrorred_rounded,
        ),
        const SizedBox(height: BlocksSpacing.xl),
        BlocksButton(
          label: l10n.alertSecure,
          icon: Icons.lock_reset_rounded,
          onPressed: () => context.push(Routes.changePassword),
        ),
        const SizedBox(height: BlocksSpacing.sm),
        BlocksButton(
          label: l10n.alertReview,
          icon: Icons.devices_rounded,
          variant: BlocksButtonVariant.tonal,
          onPressed: () => context.push(Routes.devices),
        ),
        const SizedBox(height: BlocksSpacing.sm),
        BlocksButton(
          label: event.acknowledged ? l10n.evReviewed : l10n.alertWasMe,
          icon: Icons.check_rounded,
          variant: BlocksButtonVariant.outline,
          onPressed: event.acknowledged ? null : thisWasMe,
        ),
        const SizedBox(height: BlocksSpacing.xl),
      ],
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      label: '$label: $value',
      excludeSemantics: true,
      child: Padding(
        padding: const EdgeInsets.all(BlocksSpacing.md),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 20, color: context.scheme.onSurfaceVariant),
            const SizedBox(width: BlocksSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: context.text.labelMedium),
                  const SizedBox(height: 2),
                  Text(value, style: context.text.bodyLarge),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Guidance extends StatelessWidget {
  const _Guidance({
    required this.title,
    required this.body,
    required this.icon,
  });

  final String title;
  final String body;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      label: '$title. $body',
      excludeSemantics: true,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: context.scheme.primary),
          const SizedBox(width: BlocksSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: context.text.titleSmall),
                const SizedBox(height: 2),
                Text(body, style: context.text.bodyMedium),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
