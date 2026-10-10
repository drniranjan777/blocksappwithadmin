import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/utils/number_format.dart';
import 'package:blocks_app/core/widgets/app_snack.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/data/services/creator_demo_service.dart';
import 'package:blocks_app/features/creator/application/creator_providers.dart';
import 'package:blocks_app/features/payout/application/payout_providers.dart';
import 'package:blocks_app/features/payout/presentation/payout_labels.dart';
import 'package:blocks_app/features/kyc/application/kyc_providers.dart';
import 'package:blocks_app/features/reel_studio/application/reel_providers.dart';
import 'package:blocks_app/features/reel_studio/presentation/widgets/panel_parts.dart';
import 'package:blocks_app/features/settings/presentation/settings_widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// What the mock creator back-end currently believes.
final creatorDemoStatusProvider = FutureProvider.autoDispose<CreatorDemoStatus>(
  (ref) => ref.watch(creatorDemoServiceProvider).status(),
);

/// Demo lab: steer the mock creator back-end so a walk-through can show the
/// unhappy paths as well (rejected identity, failed upload, held payout...).
/// Exists in demo builds only.
class CreatorDemoSection extends ConsumerWidget {
  const CreatorDemoSection({super.key});

  Future<void> _apply(
    BuildContext context,
    WidgetRef ref,
    Future<void> Function(CreatorDemoService) change,
  ) async {
    await change(ref.read(creatorDemoServiceProvider));
    ref
      ..invalidate(creatorDemoStatusProvider)
      ..invalidate(kycApplicationProvider)
      ..invalidate(payoutOverviewProvider)
      ..invalidate(payoutHistoryProvider)
      ..invalidate(bankAccountsProvider)
      ..invalidate(taxInfoProvider)
      ..invalidate(earningsProvider)
      ..invalidate(reelDraftsProvider)
      ..invalidate(payoutConfigProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final status = ref.watch(creatorDemoStatusProvider).value;

    Widget group(String title, List<Widget> chips) => Padding(
      padding: const EdgeInsets.only(top: BlocksSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: context.text.labelLarge),
          Wrap(spacing: BlocksSpacing.sm, children: chips),
        ],
      ),
    );

    return SettingsCard(
      child: Padding(
        padding: const EdgeInsets.all(BlocksSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Semantics(
              header: true,
              child: Text(l10n.cdTitle, style: context.text.titleMedium),
            ),
            const SizedBox(height: 2),
            Text(l10n.cdIntro, style: context.text.bodySmall),
            if (status != null) ...[
              const SizedBox(height: BlocksSpacing.md),
              Text(
                l10n.cdStatus(
                  kycStatusLabel(l10n, status.kycStatus),
                  formatRupees(status.available),
                  status.bankAccounts,
                  status.openPayouts,
                ),
                style: context.text.bodyMedium,
              ),
              group(l10n.cdKycOutcome, [
                for (final (o, label) in [
                  (DemoKycOutcome.verified, l10n.cdOutcomeVerified),
                  (DemoKycOutcome.rejected, l10n.cdOutcomeRejected),
                  (DemoKycOutcome.actionRequired, l10n.cdOutcomeAction),
                ])
                  PanelChip(
                    label: label,
                    selected: status.kycOutcome == o,
                    onTap: () =>
                        _apply(context, ref, (s) => s.setKycOutcome(o)),
                  ),
              ]),
              group(l10n.cdPayoutOutcome, [
                for (final (o, label) in [
                  (DemoPayoutOutcome.completed, l10n.cdPayCompleted),
                  (DemoPayoutOutcome.failed, l10n.cdPayFailed),
                  (DemoPayoutOutcome.onHold, l10n.cdPayHold),
                  (DemoPayoutOutcome.reversed, l10n.cdPayReversed),
                ])
                  PanelChip(
                    label: label,
                    selected: status.payoutOutcome == o,
                    onTap: () =>
                        _apply(context, ref, (s) => s.setPayoutOutcome(o)),
                  ),
              ]),
              group(l10n.cdPublishOutcome, [
                for (final (o, label) in [
                  (DemoPublishOutcome.published, l10n.cdPubNormal),
                  (DemoPublishOutcome.uploadFails, l10n.cdPubUploadFails),
                  (DemoPublishOutcome.moderationRejects, l10n.cdPubModeration),
                ])
                  PanelChip(
                    label: label,
                    selected: status.publishOutcome == o,
                    onTap: () =>
                        _apply(context, ref, (s) => s.setPublishOutcome(o)),
                  ),
              ]),
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(l10n.cdPubNote, style: context.text.labelSmall),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: status.safetyHoldOn,
                onChanged: (v) =>
                    _apply(context, ref, (s) => s.setSafetyHold(enabled: v)),
                title: Text(l10n.cdSafetyHold),
                subtitle: Text(l10n.cdSafetyHoldBody),
              ),
            ],
            const SizedBox(height: BlocksSpacing.sm),
            Wrap(
              spacing: BlocksSpacing.sm,
              runSpacing: BlocksSpacing.sm,
              children: [
                BlocksButton(
                  label: l10n.cdOpenStudio,
                  icon: Icons.insights_rounded,
                  variant: BlocksButtonVariant.tonal,
                  expand: false,
                  onPressed: () => context.push(Routes.creatorStudio),
                ),
                BlocksButton(
                  label: l10n.cdExpire,
                  icon: Icons.event_busy_rounded,
                  variant: BlocksButtonVariant.outline,
                  expand: false,
                  onPressed: () =>
                      _apply(context, ref, (s) => s.expireVerification()),
                ),
                BlocksButton(
                  label: l10n.cdReset,
                  icon: Icons.restart_alt_rounded,
                  variant: BlocksButtonVariant.outline,
                  expand: false,
                  onPressed: () async {
                    await _apply(context, ref, (s) => s.reset());
                    if (context.mounted) {
                      showAppSnack(context, l10n.cdResetDone);
                    }
                  },
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
