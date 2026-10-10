import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/utils/number_format.dart';
import 'package:blocks_app/core/utils/time_ago.dart';
import 'package:blocks_app/core/widgets/app_snack.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/core/widgets/blocks_image.dart';
import 'package:blocks_app/core/widgets/load_more_footer.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:blocks_app/data/models/content_models.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/data/models/reel_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/creator/presentation/widgets/studio_nav.dart';
import 'package:blocks_app/features/profile/application/profile_controllers.dart';
import 'package:blocks_app/features/profile/application/user_providers.dart';
import 'package:blocks_app/features/reach/application/reach_providers.dart';
import 'package:blocks_app/features/reach/presentation/widgets/reach_level_badge.dart';
import 'package:blocks_app/features/reel_studio/application/reel_providers.dart';
import 'package:blocks_app/features/reel_studio/domain/reel_validator.dart';
import 'package:blocks_app/features/reel_studio/presentation/studio_labels.dart';
import 'package:blocks_app/features/reel_studio/presentation/widgets/draft_cover.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

// ----------------------------------------------------------------- reels --

/// Everything the creator has published as a reel, newest first.
class CreatorReelsScreen extends ConsumerWidget {
  const CreatorReelsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final me = ref.watch(currentUserProvider);

    return StudioScaffold(
      section: StudioSection.reels,
      actions: [
        Padding(
          padding: const EdgeInsetsDirectional.only(end: BlocksSpacing.sm),
          child: Center(
            child: BlocksButton(
              label: l10n.csNewReel,
              icon: Icons.add_rounded,
              expand: false,
              onPressed: () => context.push(Routes.createReel),
            ),
          ),
        ),
      ],
      body: me.when(
        loading: () => const LoadingView(),
        error: (_, _) =>
            ErrorView(onRetry: () => ref.invalidate(currentUserProvider)),
        data: (user) {
          final reels = ref.watch(userReelsProvider(user.id));
          return reels.when(
            loading: () => const LoadingView(),
            error: (_, _) => ErrorView(
              onRetry: () => ref.invalidate(userReelsProvider(user.id)),
            ),
            data: (page) {
              if (page.isEmpty) {
                return EmptyView(
                  icon: Icons.movie_creation_outlined,
                  title: l10n.csReelsEmpty,
                  body: l10n.csReelsEmptyBody,
                  actionLabel: l10n.csNewReel,
                  onAction: () => context.push(Routes.createReel),
                );
              }
              return RefreshIndicator(
                onRefresh: () =>
                    ref.read(userReelsProvider(user.id).notifier).refresh(),
                child: ListView.builder(
                  padding: const EdgeInsets.all(BlocksSpacing.lg),
                  itemCount: page.items.length + 1,
                  itemBuilder: (context, i) {
                    if (i == page.items.length) {
                      return LoadMoreFooter(
                        state: page,
                        onLoadMore: () => ref
                            .read(userReelsProvider(user.id).notifier)
                            .loadMore(),
                      );
                    }
                    return _ReelRow(reel: page.items[i]);
                  },
                ),
              );
            },
          );
        },
      ),
    );
  }
}

class _ReelRow extends ConsumerWidget {
  const _ReelRow({required this.reel});

  final Reel reel;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final level = ref
        .watch(reachCalculatorProvider)
        .evaluate(reel.qualifiedReach)
        .current;
    final isNew = reel.id.startsWith('r~mine');
    final seconds = reel.duration.inSeconds;
    final length =
        '${seconds ~/ 60}:${(seconds % 60).toString().padLeft(2, '0')}';

    return Semantics(
      button: true,
      label: l10n.csReelRowLabel(reel.caption, compactCount(reel.stats.views)),
      excludeSemantics: true,
      child: InkWell(
        borderRadius: BlocksRadius.lgAll,
        onTap: () => context.push(Routes.reelAnalytics(reel.id)),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: BlocksSpacing.sm),
          child: Row(
            children: [
              ClipRRect(
                borderRadius: BlocksRadius.mdAll,
                child: SizedBox(
                  width: 60,
                  height: 96,
                  child: BlocksImage(
                    url: reel.videoUrl,
                    variant: ImageVariant.thumbnail,
                  ),
                ),
              ),
              const SizedBox(width: BlocksSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      reel.caption.isEmpty ? l10n.csNoCaption : reel.caption,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: context.text.titleSmall,
                    ),
                    const SizedBox(height: 4),
                    Wrap(
                      spacing: BlocksSpacing.sm,
                      runSpacing: 4,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        ReachLevelBadge(
                          level: level,
                          showName: false,
                          dense: true,
                        ),
                        Text(
                          l10n.csViewsCount(compactCount(reel.stats.views)),
                          style: context.text.labelMedium,
                        ),
                        Text(length, style: context.text.labelMedium),
                        if (isNew) _Tag(label: l10n.csNew),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        Icon(
                          Icons.music_note_rounded,
                          size: 14,
                          color: context.scheme.onSurfaceVariant,
                        ),
                        const SizedBox(width: 3),
                        Expanded(
                          child: Text(
                            reel.musicTitle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: context.text.bodySmall,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded),
            ],
          ),
        ),
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag({required this.label, this.color});

  final String label;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = color ?? context.scheme.primary;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(BlocksRadius.pill),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        child: Text(
          label,
          style: context.text.labelSmall?.copyWith(
            color: c,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    );
  }
}

// ----------------------------------------------------------------- posts --

class CreatorPostsScreen extends ConsumerWidget {
  const CreatorPostsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final me = ref.watch(currentUserProvider);

    return StudioScaffold(
      section: StudioSection.posts,
      actions: [
        Padding(
          padding: const EdgeInsetsDirectional.only(end: BlocksSpacing.sm),
          child: Center(
            child: BlocksButton(
              label: l10n.csNewPost,
              icon: Icons.add_rounded,
              expand: false,
              onPressed: () => context.push(Routes.createPost),
            ),
          ),
        ),
      ],
      body: me.when(
        loading: () => const LoadingView(),
        error: (_, _) =>
            ErrorView(onRetry: () => ref.invalidate(currentUserProvider)),
        data: (user) {
          final posts = ref.watch(userPostsProvider(user.id));
          return posts.when(
            loading: () => const LoadingView(),
            error: (_, _) => ErrorView(
              onRetry: () => ref.invalidate(userPostsProvider(user.id)),
            ),
            data: (page) {
              if (page.isEmpty) {
                return EmptyView(
                  icon: Icons.grid_view_rounded,
                  title: l10n.csPostsEmpty,
                  body: l10n.csPostsEmptyBody,
                  actionLabel: l10n.csNewPost,
                  onAction: () => context.push(Routes.createPost),
                );
              }
              return RefreshIndicator(
                onRefresh: () =>
                    ref.read(userPostsProvider(user.id).notifier).refresh(),
                child: ListView.builder(
                  padding: const EdgeInsets.all(BlocksSpacing.lg),
                  itemCount: page.items.length + 1,
                  itemBuilder: (context, i) {
                    if (i == page.items.length) {
                      return LoadMoreFooter(
                        state: page,
                        onLoadMore: () => ref
                            .read(userPostsProvider(user.id).notifier)
                            .loadMore(),
                      );
                    }
                    return _PostRow(post: page.items[i]);
                  },
                ),
              );
            },
          );
        },
      ),
    );
  }
}

class _PostRow extends ConsumerWidget {
  const _PostRow({required this.post});

  final Post post;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final level = ref
        .watch(reachCalculatorProvider)
        .evaluate(post.qualifiedReach)
        .current;
    return Semantics(
      button: true,
      label: '${l10n.studioOpenPost}: ${post.caption}',
      excludeSemantics: true,
      child: InkWell(
        borderRadius: BlocksRadius.lgAll,
        onTap: () => context.push(Routes.post(post.id)),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: BlocksSpacing.sm),
          child: Row(
            children: [
              ClipRRect(
                borderRadius: BlocksRadius.mdAll,
                child: SizedBox(
                  width: 64,
                  height: 64,
                  child: post.mediaUrl == null
                      ? ColoredBox(color: context.scheme.primaryContainer)
                      : BlocksImage(
                          url: post.mediaUrl!,
                          variant: ImageVariant.thumbnail,
                        ),
                ),
              ),
              const SizedBox(width: BlocksSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      post.caption,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: context.text.bodyMedium,
                    ),
                    const SizedBox(height: 4),
                    Wrap(
                      spacing: BlocksSpacing.sm,
                      runSpacing: 2,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        ReachLevelBadge(
                          level: level,
                          showName: false,
                          dense: true,
                        ),
                        Text(
                          l10n.csViewsCount(compactCount(post.stats.views)),
                          style: context.text.labelMedium,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------- drafts --

/// Unfinished reels. Continue Editing, Duplicate or Delete.
class CreatorDraftsScreen extends ConsumerWidget {
  const CreatorDraftsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final drafts = ref.watch(reelDraftsProvider);

    return StudioScaffold(
      section: StudioSection.drafts,
      actions: [
        Padding(
          padding: const EdgeInsetsDirectional.only(end: BlocksSpacing.sm),
          child: Center(
            child: BlocksButton(
              label: l10n.csNewReel,
              icon: Icons.add_rounded,
              expand: false,
              onPressed: () => context.push(Routes.createReel),
            ),
          ),
        ),
      ],
      body: drafts.when(
        loading: () => const LoadingView(),
        error: (_, _) =>
            ErrorView(onRetry: () => ref.invalidate(reelDraftsProvider)),
        data: (list) {
          if (list.isEmpty) {
            return EmptyView(
              icon: Icons.edit_note_rounded,
              title: l10n.csDraftsEmpty,
              body: l10n.csDraftsEmptyBody,
              actionLabel: l10n.csNewReel,
              onAction: () => context.push(Routes.createReel),
            );
          }
          return ListView.builder(
            padding: const EdgeInsets.all(BlocksSpacing.lg),
            itemCount: list.length,
            itemBuilder: (context, i) => Padding(
              padding: const EdgeInsets.only(bottom: BlocksSpacing.md),
              child: DraftCard(draft: list[i]),
            ),
          );
        },
      ),
    );
  }
}

/// One draft: thumbnail, length, clip count, music, last edited and status.
class DraftCard extends ConsumerWidget {
  const DraftCard({required this.draft, super.key});

  final ReelDraft draft;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final config = ref.watch(reelConfigProvider).value;
    final now = ref.watch(clockProvider)();
    final issues = config == null
        ? const <ReelIssue>[]
        : ReelValidator.validate(draft, config);
    final ready = issues.isEmpty && !draft.isEmpty;
    final length = formatMinSec(draft.totalDuration);

    Future<void> delete() async {
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(l10n.csDraftDeleteTitle),
          content: Text(l10n.csDraftDeleteBody),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: Text(l10n.cancel),
            ),
            FilledButton(
              style: FilledButton.styleFrom(minimumSize: const Size(64, 48)),
              onPressed: () => Navigator.of(ctx).pop(true),
              child: Text(l10n.rsDelete),
            ),
          ],
        ),
      );
      if (ok ?? false) {
        await ref.read(reelDraftsProvider.notifier).delete(draft.id);
        if (context.mounted) showAppSnack(context, l10n.csDraftDeleted);
      }
    }

    Future<void> duplicate() async {
      try {
        await ref.read(reelDraftsProvider.notifier).duplicate(draft.id);
        if (context.mounted) showAppSnack(context, l10n.csDraftDuplicated);
      } on AppFailure {
        if (context.mounted) showAppSnack(context, l10n.rsDraftSaveFailed);
      }
    }

    return Semantics(
      container: true,
      label: l10n.csDraftLabel(
        draft.clipCount,
        length,
        ready ? l10n.csDraftReady : l10n.csDraftNeedsChanges,
      ),
      child: Container(
        padding: const EdgeInsets.all(BlocksSpacing.md),
        decoration: BoxDecoration(
          color: context.scheme.surface,
          borderRadius: BlocksRadius.xlAll,
          border: Border.all(color: context.scheme.outlineVariant),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ClipRRect(
                  borderRadius: BlocksRadius.mdAll,
                  child: SizedBox(
                    width: 72,
                    height: 128,
                    child: DraftCover(draft: draft),
                  ),
                ),
                const SizedBox(width: BlocksSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _Tag(
                        label: ready
                            ? l10n.csDraftReady
                            : l10n.csDraftNeedsChanges,
                        color: ready
                            ? context.blocks.success
                            : context.blocks.warning,
                      ),
                      const SizedBox(height: BlocksSpacing.xs),
                      Text(
                        draft.settings.caption.isEmpty
                            ? l10n.csNoCaption
                            : draft.settings.caption,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: context.text.titleSmall,
                      ),
                      const SizedBox(height: 4),
                      _Meta(
                        icon: Icons.video_library_rounded,
                        text: l10n.csDraftClips(draft.clipCount, length),
                      ),
                      _Meta(
                        icon: Icons.music_note_rounded,
                        text: draft.music?.track.title ?? l10n.rsOriginalAudio,
                      ),
                      _Meta(
                        icon: Icons.schedule_rounded,
                        text: l10n.csDraftEdited(
                          timeAgo(l10n, draft.updatedAt, now: now),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: BlocksSpacing.md),
            Row(
              children: [
                Expanded(
                  child: BlocksButton(
                    label: l10n.csContinueEditing,
                    icon: Icons.edit_rounded,
                    onPressed: () =>
                        context.push(Routes.reelEditor(draftId: draft.id)),
                  ),
                ),
                const SizedBox(width: BlocksSpacing.sm),
                IconButton.filledTonal(
                  tooltip: l10n.rsDuplicate,
                  onPressed: duplicate,
                  icon: const Icon(Icons.copy_rounded),
                ),
                IconButton.filledTonal(
                  tooltip: l10n.rsDelete,
                  onPressed: delete,
                  icon: const Icon(Icons.delete_outline_rounded),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Meta extends StatelessWidget {
  const _Meta({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 2),
    child: Row(
      children: [
        Icon(icon, size: 14, color: context.scheme.onSurfaceVariant),
        const SizedBox(width: 4),
        Expanded(
          child: Text(
            text,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: context.text.bodySmall,
          ),
        ),
      ],
    ),
  );
}
