import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/data/models/media_models.dart';
import 'package:blocks_app/features/create/presentation/widgets/create_widgets.dart';
import 'package:blocks_app/features/reel_studio/application/reel_publish_controller.dart';
import 'package:blocks_app/features/reel_studio/application/reel_studio_controller.dart';
import 'package:blocks_app/features/reel_studio/domain/media_optimizer.dart';
import 'package:blocks_app/features/reel_studio/presentation/studio_labels.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Preparing -> Compressing -> Processing -> Uploading -> Processing on server
/// -> Moderation -> Published, with Retry and Save Draft if anything fails.
class ReelPublishingScreen extends ConsumerStatefulWidget {
  const ReelPublishingScreen({super.key});

  @override
  ConsumerState<ReelPublishingScreen> createState() =>
      _ReelPublishingScreenState();
}

class _ReelPublishingScreenState extends ConsumerState<ReelPublishingScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final s = ref.read(reelStudioProvider);
      ref.read(reelPublishProvider.notifier).start(s.draft, s.profile);
    });
  }

  Future<bool> _confirmLeave() async {
    final l10n = context.l10n;
    final leave = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.pubLeaveTitle),
        content: Text(l10n.pubLeaveBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(l10n.pubLeaveStay),
          ),
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size(64, 48)),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(l10n.pubLeaveCancel),
          ),
        ],
      ),
    );
    return leave ?? false;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final p = ref.watch(reelPublishProvider);
    final studio = ref.watch(reelStudioProvider);
    final district = studio.draft.settings.district;

    return PopScope(
      canPop: !p.isRunning,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await _confirmLeave() && context.mounted) {
          await ref.read(reelPublishProvider.notifier).cancel();
          if (context.mounted) context.pop();
        }
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(l10n.pubTitle),
          automaticallyImplyLeading: !p.isRunning,
        ),
        body: SafeArea(
          child: ResponsiveCenter(
            maxWidth: 520,
            child: ListView(
              padding: const EdgeInsets.all(BlocksSpacing.xl),
              children: [
                if (p.isPublished)
                  _Published(district: district)
                else if (p.isInReview)
                  const _InReview()
                else if (p.hasFailed)
                  _Failed(progress: p.progress)
                else
                  _Working(progress: p.progress),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

const _steps = <PublishStage>[
  PublishStage.preparing,
  PublishStage.compressing,
  PublishStage.processing,
  PublishStage.uploading,
  PublishStage.serverProcessing,
  PublishStage.moderation,
  PublishStage.published,
];

class _Working extends StatelessWidget {
  const _Working({required this.progress});

  final PublishProgress progress;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final stage = progress.stage;
    final current = _steps.indexOf(stage);
    final determinate = const {
      PublishStage.compressing,
      PublishStage.processing,
      PublishStage.uploading,
    }.contains(stage);

    final detail = switch (stage) {
      PublishStage.compressing ||
      PublishStage.processing ||
      PublishStage.preparing when progress.fileCount > 0 => l10n.pubFileOf(
        progress.fileIndex,
        progress.fileCount,
      ),
      PublishStage.uploading => l10n.pubBytesOf(
        MediaOptimizer.formatBytes(progress.bytesDone),
        MediaOptimizer.formatBytes(progress.bytesTotal),
      ),
      PublishStage.serverProcessing => l10n.pubServerBody,
      PublishStage.moderation => l10n.pubModerationBody,
      _ => '',
    };

    return Column(
      children: [
        Semantics(
          liveRegion: true,
          label: '${publishStageLabel(l10n, stage)}. $detail',
          child: SizedBox(
            width: 148,
            height: 148,
            child: Stack(
              alignment: Alignment.center,
              children: [
                SizedBox.expand(
                  child: CircularProgressIndicator(
                    value: determinate
                        ? progress.fraction.clamp(0.0, 1.0)
                        : null,
                    strokeWidth: 8,
                    strokeCap: StrokeCap.round,
                  ),
                ),
                if (determinate)
                  Text(
                    '${(progress.fraction * 100).round()}%',
                    style: context.text.headlineMedium,
                  )
                else
                  Icon(
                    Icons.cloud_sync_rounded,
                    size: 44,
                    color: context.scheme.primary,
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: BlocksSpacing.xl),
        Text(
          publishStageLabel(l10n, stage),
          style: context.text.headlineSmall,
          textAlign: TextAlign.center,
        ),
        if (detail.isNotEmpty) ...[
          const SizedBox(height: BlocksSpacing.xs),
          Text(
            detail,
            style: context.text.bodyMedium,
            textAlign: TextAlign.center,
          ),
        ],
        const SizedBox(height: BlocksSpacing.xl),
        _KeepOpenNote(text: l10n.pubKeepOpen),
        const SizedBox(height: BlocksSpacing.xl),
        _StageList(
          current: current,
          moderationFraction: stage == PublishStage.moderation
              ? progress.fraction
              : 0,
        ),
      ],
    );
  }
}

class _KeepOpenNote extends StatelessWidget {
  const _KeepOpenNote({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(BlocksSpacing.md),
    decoration: BoxDecoration(
      color: context.scheme.primaryContainer.withValues(alpha: 0.55),
      borderRadius: BlocksRadius.lgAll,
    ),
    child: Row(
      children: [
        Icon(Icons.phone_android_rounded, color: context.scheme.primary),
        const SizedBox(width: BlocksSpacing.md),
        Expanded(child: Text(text, style: context.text.bodyMedium)),
      ],
    ),
  );
}

/// The seven stages with a tick for the finished ones.
class _StageList extends StatelessWidget {
  const _StageList({required this.current, required this.moderationFraction});

  final int current;
  final double moderationFraction;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final checks = [
      l10n.pubCheckSafety,
      l10n.pubCheckCopyright,
      l10n.pubCheckPolicy,
    ];
    return Column(
      children: [
        for (var i = 0; i < _steps.length; i++)
          Semantics(
            label:
                '${publishStageLabel(l10n, _steps[i])}: '
                '${i < current
                    ? l10n.pubDone
                    : i == current
                    ? l10n.pubInProgress
                    : l10n.pubWaiting}',
            excludeSemantics: true,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Column(
                children: [
                  Row(
                    children: [
                      _StepIcon(
                        state: i < current
                            ? _StepState.done
                            : i == current
                            ? _StepState.active
                            : _StepState.waiting,
                      ),
                      const SizedBox(width: BlocksSpacing.md),
                      Expanded(
                        child: Text(
                          publishStageLabel(l10n, _steps[i]),
                          style: context.text.titleSmall?.copyWith(
                            color: i > current ? context.scheme.outline : null,
                            fontWeight: i == current ? FontWeight.w800 : null,
                          ),
                        ),
                      ),
                    ],
                  ),
                  if (_steps[i] == PublishStage.moderation && i == current)
                    Padding(
                      padding: const EdgeInsetsDirectional.only(
                        start: 36,
                        top: 6,
                      ),
                      child: Column(
                        children: [
                          for (var k = 0; k < checks.length; k++)
                            Row(
                              children: [
                                Icon(
                                  moderationFraction >= (k + 1) / checks.length
                                      ? Icons.check_circle_rounded
                                      : Icons.radio_button_unchecked_rounded,
                                  size: 16,
                                  color:
                                      moderationFraction >=
                                          (k + 1) / checks.length
                                      ? context.blocks.success
                                      : context.scheme.outline,
                                ),
                                const SizedBox(width: BlocksSpacing.sm),
                                Text(checks[k], style: context.text.bodySmall),
                              ],
                            ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

enum _StepState { done, active, waiting }

class _StepIcon extends StatelessWidget {
  const _StepIcon({required this.state});

  final _StepState state;

  @override
  Widget build(BuildContext context) {
    return switch (state) {
      _StepState.done => Icon(
        Icons.check_circle_rounded,
        color: context.blocks.success,
      ),
      _StepState.active => const SizedBox.square(
        dimension: 24,
        child: Padding(
          padding: EdgeInsets.all(2),
          child: CircularProgressIndicator(strokeWidth: 2.6),
        ),
      ),
      _StepState.waiting => Icon(
        Icons.radio_button_unchecked_rounded,
        color: context.scheme.outline,
      ),
    };
  }
}

class _Published extends ConsumerWidget {
  const _Published({required this.district});

  final String district;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    return Column(
      children: [
        Container(
          width: 112,
          height: 112,
          decoration: BoxDecoration(
            color: context.blocks.success.withValues(alpha: 0.14),
            shape: BoxShape.circle,
          ),
          child: Icon(
            Icons.check_rounded,
            size: 64,
            color: context.blocks.success,
          ),
        ),
        const SizedBox(height: BlocksSpacing.xl),
        Semantics(
          liveRegion: true,
          child: Text(
            l10n.pubPublishedTitle,
            style: context.text.headlineMedium,
            textAlign: TextAlign.center,
          ),
        ),
        const SizedBox(height: BlocksSpacing.sm),
        Text(
          l10n.pubPublishedBody(district),
          style: context.text.bodyLarge,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: BlocksSpacing.xl),
        ReachStartCard(district: district),
        const SizedBox(height: BlocksSpacing.xl),
        BlocksButton(
          label: l10n.pubViewReels,
          icon: Icons.play_circle_rounded,
          onPressed: () => context.go(Routes.reels),
        ),
        const SizedBox(height: BlocksSpacing.sm),
        BlocksButton(
          label: l10n.pubOpenStudio,
          icon: Icons.insights_rounded,
          variant: BlocksButtonVariant.tonal,
          onPressed: () => context.go(Routes.creatorStudio),
        ),
      ],
    );
  }
}

/// A reel the server is holding for a person to approve: submitted, not live.
class _InReview extends ConsumerWidget {
  const _InReview();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    return Column(
      children: [
        Container(
          width: 112,
          height: 112,
          decoration: BoxDecoration(
            color: context.scheme.primaryContainer,
            shape: BoxShape.circle,
          ),
          child: Icon(
            Icons.hourglass_top_rounded,
            size: 60,
            color: context.scheme.primary,
          ),
        ),
        const SizedBox(height: BlocksSpacing.xl),
        Semantics(
          liveRegion: true,
          child: Text(
            l10n.pubInReviewTitle,
            style: context.text.headlineMedium,
            textAlign: TextAlign.center,
          ),
        ),
        const SizedBox(height: BlocksSpacing.sm),
        Text(
          l10n.pubInReviewBody,
          style: context.text.bodyLarge,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: BlocksSpacing.xl),
        BlocksButton(
          label: l10n.pubOpenStudio,
          icon: Icons.insights_rounded,
          onPressed: () => context.go(Routes.creatorStudio),
        ),
        const SizedBox(height: BlocksSpacing.sm),
        BlocksButton(
          label: l10n.pubViewReels,
          icon: Icons.play_circle_rounded,
          variant: BlocksButtonVariant.tonal,
          onPressed: () => context.go(Routes.reels),
        ),
      ],
    );
  }
}

class _Failed extends ConsumerWidget {
  const _Failed({required this.progress});

  final PublishProgress progress;

  String _reason(BuildContext context) {
    final l10n = context.l10n;
    return switch (progress.failureCode) {
      'network' => l10n.pubFailNetwork,
      'moderation' => l10n.pubFailModeration(
        progress.moderation?.reason ?? 'policy',
      ),
      'cancelled' => l10n.pubFailCancelled,
      'tooLong' ||
      'tooManyClips' ||
      'tooManyPhotos' ||
      'videoTooLarge' ||
      'noClips' ||
      'clipTooShort' => l10n.pubFailLimits,
      _ => l10n.pubFailUnknown,
    };
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final code = progress.failureCode;
    final canRetry =
        code == 'network' ||
        code == 'unknown' ||
        code == 'cancelled' ||
        code == null;
    final c = ref.read(reelPublishProvider.notifier);
    return Column(
      children: [
        Container(
          width: 112,
          height: 112,
          decoration: BoxDecoration(
            color: context.scheme.error.withValues(alpha: 0.12),
            shape: BoxShape.circle,
          ),
          child: Icon(
            Icons.cloud_off_rounded,
            size: 56,
            color: context.scheme.error,
          ),
        ),
        const SizedBox(height: BlocksSpacing.xl),
        Semantics(
          liveRegion: true,
          child: Text(
            l10n.pubFailedTitle,
            style: context.text.headlineMedium,
            textAlign: TextAlign.center,
          ),
        ),
        const SizedBox(height: BlocksSpacing.sm),
        Text(
          _reason(context),
          style: context.text.bodyLarge,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: BlocksSpacing.md),
        Container(
          padding: const EdgeInsets.all(BlocksSpacing.md),
          decoration: BoxDecoration(
            color: context.scheme.primaryContainer.withValues(alpha: 0.55),
            borderRadius: BlocksRadius.lgAll,
          ),
          child: Row(
            children: [
              Icon(Icons.bookmark_added_rounded, color: context.scheme.primary),
              const SizedBox(width: BlocksSpacing.md),
              Expanded(
                child: Text(
                  l10n.pubSavedAsDraft,
                  style: context.text.bodyMedium,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: BlocksSpacing.xl),
        if (canRetry)
          BlocksButton(
            label: l10n.pubRetry,
            icon: Icons.refresh_rounded,
            onPressed: c.retry,
          )
        else
          BlocksButton(
            label: l10n.pubEditReel,
            icon: Icons.edit_rounded,
            onPressed: () => context.pop(),
          ),
        const SizedBox(height: BlocksSpacing.sm),
        BlocksButton(
          label: l10n.pubSaveDraft,
          icon: Icons.bookmark_rounded,
          variant: BlocksButtonVariant.tonal,
          onPressed: () => context.go(Routes.creatorDrafts),
        ),
      ],
    );
  }
}
