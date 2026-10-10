import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/app_snack.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/data/services/security_demo_service.dart';
import 'package:blocks_app/features/auth/application/session_controller.dart';
import 'package:blocks_app/features/creator/presentation/widgets/creator_demo_section.dart';
import 'package:blocks_app/features/security/application/security_providers.dart';
import 'package:blocks_app/features/security/presentation/security_labels.dart';
import 'package:blocks_app/features/security/presentation/widgets/status_widgets.dart';
import 'package:blocks_app/features/settings/presentation/settings_widgets.dart';
import 'package:blocks_app/l10n/gen/app_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// What the mock server currently believes. Refreshed after every action.
final demoStatusProvider = FutureProvider.autoDispose<DemoServerStatus>(
  (ref) => ref.watch(securityDemoServiceProvider).status(),
);

extension on DemoScenario {
  String letter() => String.fromCharCode(65 + index);

  String title(AppLocalizations l) => switch (this) {
    DemoScenario.normalLogin => l.labNormalTitle,
    DemoScenario.wrongPassword => l.labWrongTitle,
    DemoScenario.maxFailedAttempts => l.labMaxTitle,
    DemoScenario.suspiciousLogin => l.labSuspiciousTitle,
    DemoScenario.passwordChanged => l.labPasswordTitle,
    DemoScenario.newDeviceLogin => l.labNewDeviceTitle,
    DemoScenario.sessionRevoked => l.labRevokedTitle,
    DemoScenario.photoUploadFails => l.labPhotoTitle,
  };

  String body(AppLocalizations l) => switch (this) {
    DemoScenario.normalLogin => l.labNormalBody,
    DemoScenario.wrongPassword => l.labWrongBody,
    DemoScenario.maxFailedAttempts => l.labMaxBody,
    DemoScenario.suspiciousLogin => l.labSuspiciousBody,
    DemoScenario.passwordChanged => l.labPasswordBody,
    DemoScenario.newDeviceLogin => l.labNewDeviceBody,
    DemoScenario.sessionRevoked => l.labRevokedBody,
    DemoScenario.photoUploadFails => l.labPhotoBody,
  };
}

/// Demo-only: trigger the security scenarios on demand (investor / client
/// walkthrough). The scenarios act on the mock server; none of this exists in
/// a production build.
class SecurityDemoScreen extends ConsumerStatefulWidget {
  const SecurityDemoScreen({super.key});

  @override
  ConsumerState<SecurityDemoScreen> createState() => _SecurityDemoScreenState();
}

class _SecurityDemoScreenState extends ConsumerState<SecurityDemoScreen> {
  DemoScenario? _running;

  Future<void> _run(DemoScenario s) async {
    if (_running != null) return;
    setState(() => _running = s);
    DemoScenarioResult? result;
    try {
      result = await ref.read(securityDemoServiceProvider).run(s);
      refreshSecurity(ref);
      ref.invalidate(demoStatusProvider);
    } finally {
      // Stop the spinner before any sheet opens; it must not keep spinning
      // behind it until the sheet is dismissed.
      if (mounted) setState(() => _running = null);
    }
    if (!mounted) return;
    final eventId = result.eventId;
    if (result.alertRaised && eventId != null) {
      // Not an in-list banner: the list is long and the result must be seen.
      await _showAlertSent(eventId);
    } else {
      showAppSnack(context, s.title(context.l10n));
    }
  }

  /// "Security Alert Sent: we've sent a security notification to your
  /// registered email and active BLOCKS devices."
  Future<void> _showAlertSent(String eventId) {
    final l10n = context.l10n;
    return showModalBottomSheet<void>(
      context: context,
      builder: (sheet) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(BlocksSpacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              StatusBanner.success(
                title: l10n.alertSent,
                body: l10n.alertSentBody,
              ),
              const SizedBox(height: BlocksSpacing.lg),
              BlocksButton(
                label: l10n.labOpenAlert,
                icon: Icons.open_in_new_rounded,
                onPressed: () {
                  Navigator.of(sheet).pop();
                  context.push(Routes.securityAlert(eventId));
                },
              ),
              const SizedBox(height: BlocksSpacing.sm),
              BlocksButton(
                label: l10n.done,
                variant: BlocksButtonVariant.ghost,
                onPressed: () => Navigator.of(sheet).pop(),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _reset() async {
    await ref.read(securityDemoServiceProvider).reset();
    refreshSecurity(ref);
    ref.invalidate(demoStatusProvider);
    if (!mounted) return;
    showAppSnack(context, context.l10n.labResetDone);
  }

  Future<void> _trySignIn() async {
    await ref.read(sessionControllerProvider.notifier).signOut();
    if (mounted) context.go(Routes.signIn);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final status = ref.watch(demoStatusProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.secDemoLab)),
      body: SafeArea(
        child: ResponsiveCenter(
          child: ListView(
            padding: const EdgeInsets.all(BlocksSpacing.lg),
            children: [
              Text(l10n.labIntro, style: context.text.bodyMedium),
              const SizedBox(height: BlocksSpacing.lg),
              status.when(
                data: (s) => _StatusCard(status: s),
                loading: () =>
                    const SizedBox(height: 120, child: LoadingView()),
                error: (_, _) => ErrorView(
                  onRetry: () => ref.invalidate(demoStatusProvider),
                ),
              ),
              const SizedBox(height: BlocksSpacing.sm),
              for (final s in DemoScenario.values) ...[
                const SizedBox(height: BlocksSpacing.md),
                _ScenarioCard(
                  scenario: s,
                  running: _running == s,
                  onRun: () => _run(s),
                ),
              ],
              const SizedBox(height: BlocksSpacing.xl),
              const CreatorDemoSection(),
              const SizedBox(height: BlocksSpacing.xl),
              BlocksButton(
                label: l10n.labTrySignIn,
                icon: Icons.login_rounded,
                variant: BlocksButtonVariant.tonal,
                onPressed: _trySignIn,
              ),
              const SizedBox(height: BlocksSpacing.sm),
              BlocksButton(
                label: l10n.labReset,
                icon: Icons.restart_alt_rounded,
                variant: BlocksButtonVariant.outline,
                onPressed: _reset,
              ),
              const SizedBox(height: BlocksSpacing.xl),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({required this.status});

  final DemoServerStatus status;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final until = status.protectedUntil;
    final rows = [
      (
        Icons.pin_outlined,
        l10n.labFailed(status.failedAttempts, status.maxAttempts),
      ),
      (
        until == null ? Icons.lock_open_rounded : Icons.gpp_maybe_rounded,
        until == null
            ? l10n.labNotProtected
            : l10n.labProtectedUntil(formatClock(context, until)),
      ),
      (Icons.mark_email_read_outlined, l10n.labEmails(status.emailsSent)),
      (Icons.devices_rounded, l10n.labDevices(status.activeSessions)),
      if (status.photoUploadWillFail)
        (Icons.image_not_supported_outlined, l10n.labPhotoArmed),
    ];
    return SettingsCard(
      child: Padding(
        padding: const EdgeInsets.all(BlocksSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Semantics(
              header: true,
              child: Text(l10n.labStatus, style: context.text.titleSmall),
            ),
            const SizedBox(height: BlocksSpacing.sm),
            for (final (icon, text) in rows)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: [
                    Icon(icon, size: 18, color: context.scheme.primary),
                    const SizedBox(width: BlocksSpacing.md),
                    Expanded(child: Text(text, style: context.text.bodyMedium)),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _ScenarioCard extends StatelessWidget {
  const _ScenarioCard({
    required this.scenario,
    required this.running,
    required this.onRun,
  });

  final DemoScenario scenario;
  final bool running;
  final VoidCallback onRun;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return SettingsCard(
      child: Padding(
        padding: const EdgeInsets.all(BlocksSpacing.md),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 36,
              height: 36,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: context.scheme.primaryContainer,
                borderRadius: BorderRadius.circular(BlocksRadius.md),
              ),
              child: ExcludeSemantics(
                child: Text(
                  scenario.letter(),
                  style: context.text.titleSmall?.copyWith(
                    color: context.scheme.onPrimaryContainer,
                  ),
                ),
              ),
            ),
            const SizedBox(width: BlocksSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(scenario.title(l10n), style: context.text.titleSmall),
                  const SizedBox(height: 2),
                  Text(scenario.body(l10n), style: context.text.bodySmall),
                  const SizedBox(height: BlocksSpacing.xs),
                  Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: BlocksButton(
                      label: l10n.labRun,
                      icon: Icons.play_arrow_rounded,
                      variant: BlocksButtonVariant.tonal,
                      expand: false,
                      isLoading: running,
                      onPressed: onRun,
                    ),
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
