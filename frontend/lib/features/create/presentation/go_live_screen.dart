import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:blocks_app/data/models/app_user.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/create/application/create_controllers.dart';
import 'package:blocks_app/features/create/domain/live_eligibility.dart';
import 'package:blocks_app/features/profile/application/user_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Live access gate. Shows each requirement against the user's own numbers.
/// Live streaming itself is intentionally not implemented in the demo.
class GoLiveScreen extends ConsumerWidget {
  const GoLiveScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final eligibility = ref.watch(liveEligibilityProvider);
    final user = ref.watch(currentUserProvider).value;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.liveTitle),
        leading: IconButton(
          tooltip: l10n.close,
          icon: const Icon(Icons.close_rounded),
          onPressed: () => context.pop(),
        ),
      ),
      body: SafeArea(
        child: eligibility.when(
          loading: () => const LoadingView(),
          error: (_, _) =>
              ErrorView(onRetry: () => ref.invalidate(currentUserProvider)),
          data: (result) => ResponsiveCenter(
            child: ListView(
              padding: const EdgeInsets.all(BlocksSpacing.lg),
              children: [
                _StatusBanner(granted: result.isEligible),
                const SizedBox(height: BlocksSpacing.xl),
                Semantics(
                  header: true,
                  child: Text(
                    l10n.liveAccessTitle,
                    style: context.text.labelMedium?.copyWith(
                      letterSpacing: 1.4,
                      color: context.scheme.onSurfaceVariant,
                    ),
                  ),
                ),
                const SizedBox(height: BlocksSpacing.sm),
                Container(
                  decoration: BoxDecoration(
                    color: context.scheme.surface,
                    borderRadius: BorderRadius.circular(BlocksRadius.xl),
                    border: Border.all(color: context.scheme.outlineVariant),
                  ),
                  child: Column(
                    children: [
                      for (var i = 0; i < result.checks.length; i++) ...[
                        _CheckRow(check: result.checks[i], user: user),
                        if (i < result.checks.length - 1)
                          const Divider(height: 1),
                      ],
                    ],
                  ),
                ),
                if (user != null &&
                    result.checks.any(
                      (c) => c.rule == LiveRule.twoFactor && !c.passed,
                    )) ...[
                  const SizedBox(height: BlocksSpacing.lg),
                  BlocksButton(
                    label: l10n.liveEnableTwoFactor,
                    icon: Icons.lock_rounded,
                    variant: BlocksButtonVariant.tonal,
                    onPressed: () async {
                      await ref
                          .read(userRepositoryProvider)
                          .setTwoFactorEnabled(enabled: true);
                      ref.invalidate(currentUserProvider);
                    },
                  ),
                ],
                const SizedBox(height: BlocksSpacing.xl),
                // Disabled on purpose: no live infrastructure in the demo.
                BlocksButton(
                  label: l10n.liveStart,
                  icon: Icons.sensors_rounded,
                  onPressed: null,
                ),
                const SizedBox(height: BlocksSpacing.md),
                Text(
                  l10n.liveGrantedBody,
                  style: context.text.bodySmall,
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _StatusBanner extends StatelessWidget {
  const _StatusBanner({required this.granted});

  final bool granted;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final color = granted ? context.blocks.success : context.blocks.warning;
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.all(BlocksSpacing.lg),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(BlocksRadius.xl),
          border: Border.all(color: color.withValues(alpha: 0.4)),
        ),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: color,
                borderRadius: BorderRadius.circular(BlocksRadius.md + 2),
              ),
              child: Icon(
                granted ? Icons.check_rounded : Icons.lock_clock_rounded,
                color: Colors.white,
              ),
            ),
            const SizedBox(width: BlocksSpacing.lg),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    granted ? l10n.liveGranted : l10n.liveNotYet,
                    style: context.text.titleMedium?.copyWith(color: color),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    granted ? l10n.liveGrantedBody : l10n.liveNotYetBody,
                    style: context.text.bodySmall,
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

class _CheckRow extends StatelessWidget {
  const _CheckRow({required this.check, required this.user});

  final LiveCheck check;
  final AppUser? user;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final (title, detail) = switch (check.rule) {
      LiveRule.followers => (
        l10n.liveFollowersRule(check.required ?? 0),
        l10n.liveFollowersYours(check.current ?? 0),
      ),
      LiveRule.accountAge => (
        l10n.liveAgeRule(check.required ?? 0),
        l10n.liveAgeYours(check.current ?? 0),
      ),
      LiveRule.trust => (
        l10n.liveTrustRule,
        switch (user?.trustStatus) {
          TrustStatus.eligible || null => l10n.liveTrustEligible,
          TrustStatus.underReview => l10n.liveTrustReview,
          TrustStatus.restricted => l10n.liveTrustRestricted,
        },
      ),
      LiveRule.twoFactor => (
        l10n.liveTwoFactorRule,
        check.passed ? l10n.liveEnabled : l10n.liveNotEnabled,
      ),
      LiveRule.noViolation => (
        l10n.liveViolationRule,
        check.passed ? l10n.liveMet : l10n.liveNotMet,
      ),
      LiveRule.age => (
        l10n.liveAgeRuleEligible,
        check.passed ? l10n.liveMet : l10n.liveNotMet,
      ),
    };
    final color = check.passed ? context.blocks.success : context.scheme.error;

    return Semantics(
      container: true,
      label:
          '$title. $detail. ${check.passed ? l10n.liveRequirementMet : l10n.liveRequirementNotMet}',
      excludeSemantics: true,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: BlocksSpacing.lg,
          vertical: BlocksSpacing.md,
        ),
        child: Row(
          children: [
            Icon(
              check.passed ? Icons.check_circle_rounded : Icons.cancel_rounded,
              color: color,
            ),
            const SizedBox(width: BlocksSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: context.text.titleSmall),
                  Text(detail, style: context.text.bodySmall),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
