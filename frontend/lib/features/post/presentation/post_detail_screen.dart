import 'package:blocks_app/app/config/app_config.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/utils/number_format.dart';
import 'package:blocks_app/core/widgets/app_snack.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/creator/application/creator_providers.dart';
import 'package:blocks_app/features/engagement/application/engagement_controllers.dart';
import 'package:blocks_app/features/home/application/feed_controller.dart';
import 'package:blocks_app/features/post/application/post_providers.dart';
import 'package:blocks_app/features/post/presentation/post_card.dart';
import 'package:blocks_app/features/profile/application/user_providers.dart';
import 'package:blocks_app/features/reach/application/reach_providers.dart';
import 'package:blocks_app/features/reach/domain/reach_progress.dart';
import 'package:blocks_app/features/reach/presentation/widgets/reach_ladder.dart';
import 'package:blocks_app/features/reach/presentation/widgets/reach_unlock_celebration.dart';
import 'package:blocks_app/features/reach/presentation/widgets/rising_banner.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class PostDetailScreen extends ConsumerWidget {
  const PostDetailScreen({required this.postId, super.key});

  final String postId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(postProvider(postId));

    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.postScreenTitle)),
      body: SafeArea(
        child: async.when(
          loading: () => const LoadingView(),
          error: (_, _) =>
              ErrorView(onRetry: () => ref.invalidate(postProvider(postId))),
          data: (post) => _Body(post: post),
        ),
      ),
    );
  }
}

class _Body extends ConsumerStatefulWidget {
  const _Body({required this.post});

  final Post post;

  @override
  ConsumerState<_Body> createState() => _BodyState();
}

class _BodyState extends ConsumerState<_Body> {
  bool _boosting = false;

  Future<void> _boost() async {
    setState(() => _boosting = true);
    final result = await ref
        .read(reachRepositoryProvider)
        .simulateBoost(widget.post.id);
    ref
      ..invalidate(postProvider(widget.post.id))
      ..invalidate(feedControllerProvider)
      ..invalidate(creatorDashboardProvider)
      ..invalidate(currentUserProvider);
    if (!mounted) return;
    setState(() => _boosting = false);
    if (result.didLevelUp) {
      await showReachUnlockCelebration(context, result.after.current);
    } else {
      showAppSnack(context, context.l10n.reachBoostDone);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final overlay = ref.watch(interactionProvider(widget.post.id));
    final p = widget.post.withInteraction(overlay);
    final progress = ref
        .watch(reachCalculatorProvider)
        .evaluate(p.qualifiedReach);
    final isOwn = ref.watch(currentUserProvider).value?.id == p.author.id;
    // The live service shows the reach count to the author only, and has no
    // "simulate a boost" (that is a demo tool).
    final demo = ref.watch(appConfigProvider).useMockData;

    return ResponsiveCenter(
      child: ListView(
        padding: const EdgeInsets.all(BlocksSpacing.lg),
        children: [
          PostCard(post: p, isDetail: true),
          const SizedBox(height: BlocksSpacing.lg),
          _ReachSection(
            progress: progress,
            isOwn: isOwn,
            stats: p.stats,
            isBoosting: _boosting,
            onBoost: _boost,
            showCount: demo || isOwn,
            showBoost: demo,
          ),
          const SizedBox(height: BlocksSpacing.xl),
          Text(l10n.reachExplain, style: context.text.bodySmall),
        ],
      ),
    );
  }
}

class _ReachSection extends StatelessWidget {
  const _ReachSection({
    required this.progress,
    required this.isOwn,
    required this.stats,
    required this.isBoosting,
    required this.onBoost,
    required this.showCount,
    required this.showBoost,
  });

  final ReachProgress progress;
  final bool isOwn;
  final PostStats stats;
  final bool isBoosting;
  final VoidCallback onBoost;
  final bool showCount;
  final bool showBoost;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Container(
      padding: const EdgeInsets.all(BlocksSpacing.lg),
      decoration: BoxDecoration(
        color: context.scheme.surface,
        borderRadius: BorderRadius.circular(BlocksRadius.xl),
        border: Border.all(color: context.scheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(
                    l10n.reachJourney,
                    style: context.text.titleMedium,
                  ),
                ),
              ),
              if (showCount) ...[
                const SizedBox(width: BlocksSpacing.md),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      compactCount(progress.qualifiedReach),
                      style: context.text.titleLarge,
                    ),
                    Text(
                      l10n.reachQualifiedLabel,
                      style: context.text.bodySmall,
                    ),
                  ],
                ),
              ],
            ],
          ),
          const SizedBox(height: BlocksSpacing.xl),
          ReachLadder(progress: progress),
          if (RisingBanner.shouldShow(progress)) ...[
            const SizedBox(height: BlocksSpacing.xl),
            RisingBanner(progress: progress, isOwnPost: isOwn),
          ],
          const SizedBox(height: BlocksSpacing.xl),
          Wrap(
            spacing: BlocksSpacing.sm,
            runSpacing: BlocksSpacing.sm,
            children: [
              _Stat(l10n.statViews, stats.views),
              _Stat(l10n.statLikes, stats.likes),
              _Stat(l10n.statComments, stats.comments),
              _Stat(l10n.statShares, stats.shares),
              _Stat(l10n.statSaves, stats.saves),
            ],
          ),
          if (showBoost) ...[
            const SizedBox(height: BlocksSpacing.xl),
            BlocksButton(
              label: l10n.reachSimulateBoost,
              icon: Icons.rocket_launch_rounded,
              variant: BlocksButtonVariant.tonal,
              isLoading: isBoosting,
              onPressed: onBoost,
            ),
          ],
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat(this.label, this.value);

  final String label;
  final int value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: BlocksSpacing.md,
        vertical: BlocksSpacing.sm,
      ),
      decoration: BoxDecoration(
        color: context.blocks.surfaceMuted,
        borderRadius: BorderRadius.circular(BlocksRadius.md),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(compactCount(value), style: context.text.titleSmall),
          Text(label, style: context.text.bodySmall),
        ],
      ),
    );
  }
}
