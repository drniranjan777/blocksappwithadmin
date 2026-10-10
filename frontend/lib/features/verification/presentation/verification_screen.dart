import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/app_snack.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:blocks_app/data/models/app_user.dart';
import 'package:blocks_app/data/models/business_models.dart';
import 'package:blocks_app/features/verification/application/verification_controller.dart';
import 'package:blocks_app/l10n/gen/app_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

extension VerificationTypeLabels on VerificationType {
  String title(AppLocalizations l10n) => switch (this) {
    VerificationType.identity => l10n.verifiedIdentity,
    VerificationType.business => l10n.verifiedBusiness,
    VerificationType.creator => l10n.verifiedCreator,
    VerificationType.publisher => l10n.verifiedPublisher,
  };

  String body(AppLocalizations l10n) => switch (this) {
    VerificationType.identity => l10n.verifyBodyIdentity,
    VerificationType.business => l10n.verifyBodyBusiness,
    VerificationType.creator => l10n.verifyBodyCreator,
    VerificationType.publisher => l10n.verifyBodyPublisher,
  };

  IconData get icon => switch (this) {
    VerificationType.identity => Icons.badge_rounded,
    VerificationType.business => Icons.storefront_rounded,
    VerificationType.creator => Icons.star_rounded,
    VerificationType.publisher => Icons.newspaper_rounded,
  };
}

class VerificationScreen extends ConsumerWidget {
  const VerificationScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final async = ref.watch(verificationControllerProvider);
    final status = async.value;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.verifyTitle)),
      body: SafeArea(
        child: status == null
            ? (async.hasError
                  ? ErrorView(
                      onRetry: () =>
                          ref.invalidate(verificationControllerProvider),
                    )
                  : const LoadingView())
            : ResponsiveCenter(
                child: ListView(
                  padding: const EdgeInsets.all(BlocksSpacing.lg),
                  children: [
                    _StatusCard(status: status),
                    const SizedBox(height: BlocksSpacing.lg),
                    Text(l10n.verifyIntro, style: context.text.bodyMedium),
                    const SizedBox(height: BlocksSpacing.lg),
                    for (final type in VerificationType.values)
                      _TypeCard(type: type, status: status),
                    if (status.state == VerificationState.pending) ...[
                      const SizedBox(height: BlocksSpacing.md),
                      _DemoAdminCard(
                        onApprove: () async {
                          await ref
                              .read(verificationControllerProvider.notifier)
                              .approveForDemo();
                          if (context.mounted) {
                            showAppSnack(context, l10n.verifyApproved);
                          }
                        },
                      ),
                    ],
                  ],
                ),
              ),
      ),
    );
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({required this.status});

  final VerificationStatus status;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final (label, color, icon) = switch (status.state) {
      VerificationState.verified => (
        l10n.verifyStatusVerified,
        context.blocks.success,
        Icons.verified_rounded,
      ),
      VerificationState.pending => (
        l10n.verifyStatusPending,
        context.blocks.warning,
        Icons.hourglass_top_rounded,
      ),
      VerificationState.rejected => (
        l10n.verifyStatusRejected,
        context.scheme.error,
        Icons.cancel_rounded,
      ),
      VerificationState.notRequested => (
        l10n.verifyStatusNone,
        context.scheme.onSurfaceVariant,
        Icons.shield_outlined,
      ),
    };

    return Semantics(
      container: true,
      liveRegion: true,
      label: '${l10n.verifyStatusTitle}: $label',
      excludeSemantics: true,
      child: Container(
        padding: const EdgeInsets.all(BlocksSpacing.lg),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(BlocksRadius.xl),
          border: Border.all(color: color.withValues(alpha: 0.35)),
        ),
        child: Row(
          children: [
            Icon(icon, color: color, size: 40),
            const SizedBox(width: BlocksSpacing.lg),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    l10n.verifyStatusTitle.toUpperCase(),
                    style: context.text.labelSmall?.copyWith(
                      letterSpacing: 1.2,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Wrap(
                    spacing: 6,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text(
                        label,
                        style: context.text.titleLarge?.copyWith(color: color),
                      ),
                      if (status.state == VerificationState.verified)
                        Icon(Icons.check_rounded, color: color, size: 22),
                    ],
                  ),
                  if (status.type != null)
                    Text(
                      status.type!.title(l10n),
                      style: context.text.bodyMedium,
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TypeCard extends ConsumerWidget {
  const _TypeCard({required this.type, required this.status});

  final VerificationType type;
  final VerificationStatus status;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final isCurrent =
        status.state == VerificationState.verified && status.type == type;
    final isPendingThis =
        status.state == VerificationState.pending && status.type == type;
    final busy = status.state == VerificationState.pending;

    return Padding(
      padding: const EdgeInsets.only(bottom: BlocksSpacing.md),
      child: Container(
        padding: const EdgeInsets.all(BlocksSpacing.lg),
        decoration: BoxDecoration(
          color: context.scheme.surface,
          borderRadius: BorderRadius.circular(BlocksRadius.xl),
          border: Border.all(color: context.scheme.outlineVariant),
        ),
        // Text first, action underneath: the card never depends on how wide
        // a translated button label turns out to be.
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 46,
                  height: 46,
                  decoration: BoxDecoration(
                    color: context.scheme.primaryContainer,
                    borderRadius: BorderRadius.circular(BlocksRadius.md + 2),
                  ),
                  child: Icon(
                    type.icon,
                    color: context.scheme.onPrimaryContainer,
                  ),
                ),
                const SizedBox(width: BlocksSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(type.title(l10n), style: context.text.titleSmall),
                      const SizedBox(height: 2),
                      Text(type.body(l10n), style: context.text.bodySmall),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: BlocksSpacing.md),
            Align(
              alignment: AlignmentDirectional.centerEnd,
              child: isCurrent
                  ? Chip(
                      avatar: Icon(
                        Icons.check_rounded,
                        size: 16,
                        color: context.blocks.success,
                      ),
                      label: Text(l10n.verifyCurrent),
                    )
                  : BlocksButton(
                      label: isPendingThis
                          ? l10n.verifyRequested
                          : l10n.verifyRequest,
                      expand: false,
                      variant: BlocksButtonVariant.tonal,
                      onPressed: busy
                          ? null
                          : () async {
                              await ref
                                  .read(verificationControllerProvider.notifier)
                                  .request(type);
                              if (context.mounted) {
                                showAppSnack(context, l10n.verifySubmitted);
                              }
                            },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DemoAdminCard extends StatelessWidget {
  const _DemoAdminCard({required this.onApprove});

  final VoidCallback onApprove;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Container(
      padding: const EdgeInsets.all(BlocksSpacing.lg),
      decoration: BoxDecoration(
        color: context.blocks.warning.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(BlocksRadius.xl),
        border: Border.all(
          color: context.blocks.warning.withValues(alpha: 0.4),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                Icons.admin_panel_settings_outlined,
                color: context.blocks.warning,
              ),
              const SizedBox(width: BlocksSpacing.sm),
              Text(l10n.verifyDemoAdminTitle, style: context.text.titleSmall),
            ],
          ),
          const SizedBox(height: BlocksSpacing.sm),
          Text(l10n.verifyDemoAdminBody, style: context.text.bodySmall),
          const SizedBox(height: BlocksSpacing.md),
          BlocksButton(label: l10n.verifyApprove, onPressed: onApprove),
        ],
      ),
    );
  }
}
