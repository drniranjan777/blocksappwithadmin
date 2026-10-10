import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/utils/number_format.dart';
import 'package:blocks_app/core/utils/time_ago.dart';
import 'package:blocks_app/core/widgets/app_snack.dart';
import 'package:blocks_app/core/widgets/blocks_avatar.dart';
import 'package:blocks_app/core/widgets/blocks_image.dart';
import 'package:blocks_app/data/models/business_models.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/engagement/application/engagement_controllers.dart';
import 'package:blocks_app/features/post/presentation/comments_sheet.dart';
import 'package:blocks_app/features/post/presentation/share_sheet.dart';
import 'package:blocks_app/features/profile/application/user_providers.dart';
import 'package:blocks_app/features/reach/application/reach_providers.dart';
import 'package:blocks_app/features/reach/presentation/widgets/reach_level_badge.dart';
import 'package:blocks_app/features/reach/presentation/widgets/rising_banner.dart';
import 'package:blocks_app/features/safety/presentation/content_actions_sheet.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// A BLOCKS post: author, location, Reach Level, media, caption, actions.
///
/// Reads its like/save/share state from the shared interaction overlay, so
/// the same post looks identical wherever it appears.
class PostCard extends ConsumerStatefulWidget {
  const PostCard({
    required this.post,
    super.key,
    this.showRising = false,
    this.isDetail = false,
  });

  final Post post;

  /// Show the "Rising" banner when the post is close to its next level.
  final bool showRising;

  /// Detail mode: caption fully expanded, media not tappable.
  final bool isDetail;

  @override
  ConsumerState<PostCard> createState() => _PostCardState();
}

class _PostCardState extends ConsumerState<PostCard>
    with SingleTickerProviderStateMixin {
  bool _expanded = false;

  late final AnimationController _burst = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 650),
  );

  @override
  void dispose() {
    _burst.dispose();
    super.dispose();
  }

  void _like(Post p, {required bool fromDoubleTap}) {
    HapticFeedback.selectionClick();
    if (fromDoubleTap) {
      _burst.forward(from: 0);
      if (p.isLiked) return; // double-tap never un-likes
    }
    ref.read(interactionsProvider.notifier).toggleLike(p);
  }

  void _open(Post p) {
    if (!widget.isDetail) context.push(Routes.post(p.id));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final p = widget.post.withInteraction(
      ref.watch(interactionProvider(widget.post.id)),
    );
    final me = ref.watch(currentUserProvider).value;
    final isOwn = me?.id == p.author.id;
    final progress = ref
        .watch(reachCalculatorProvider)
        .evaluate(p.qualifiedReach);
    final now = ref.read(clockProvider)();
    final likeLabel = p.isLiked ? l10n.actionUnlike : l10n.actionLike;

    return Semantics(
      container: true,
      label: l10n.postCardSemantics(p.author.name, p.location),
      child: Container(
        decoration: BoxDecoration(
          color: context.scheme.surface,
          borderRadius: BorderRadius.circular(BlocksRadius.xl),
          border: Border.all(color: context.scheme.outlineVariant),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ------------------------------------------------ header --
            Padding(
              padding: const EdgeInsets.fromLTRB(
                BlocksSpacing.md,
                BlocksSpacing.md,
                BlocksSpacing.xs,
                BlocksSpacing.sm,
              ),
              child: Row(
                children: [
                  Expanded(
                    flex: 3,
                    child: Semantics(
                      button: true,
                      label:
                          '${p.author.name}. ${p.location} · ${timeAgo(l10n, p.createdAt, now: now)}',
                      excludeSemantics: true,
                      child: InkWell(
                        borderRadius: BlocksRadius.mdAll,
                        onTap: () => isOwn
                            ? context.go(Routes.profile)
                            : context.push(Routes.user(p.author.id)),
                        // Keep the whole header a comfortable (>= 48dp) target.
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(
                            minHeight: BlocksSpacing.touchTarget,
                          ),
                          child: Row(
                            children: [
                              BlocksAvatar(
                                name: p.author.name,
                                imageUrl: p.author.avatarUrl,
                                size: 42,
                                decorative: true,
                              ),
                              const SizedBox(width: BlocksSpacing.md),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Flexible(
                                          child: Text(
                                            p.author.name,
                                            style: context.text.titleSmall,
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                        ),
                                        if (p.author.isVerified) ...[
                                          const SizedBox(width: 4),
                                          Icon(
                                            Icons.verified_rounded,
                                            size: 16,
                                            color: context.blocks.reachState,
                                          ),
                                        ],
                                      ],
                                    ),
                                    Text(
                                      '${p.location} · ${timeAgo(l10n, p.createdAt, now: now)}',
                                      style: context.text.bodySmall,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: BlocksSpacing.sm),
                  // Shrinks (instead of squeezing the author block) on a narrow
                  // phone with a large system font.
                  Flexible(
                    flex: 2,
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      child: ReachLevelBadge(
                        level: progress.current,
                        dense: true,
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: l10n.postMoreOptions,
                    icon: const Icon(Icons.more_horiz_rounded),
                    onPressed: () => showContentActionsSheet(
                      context,
                      author: p.author,
                      contentId: p.id,
                      targetType: ReportTargetType.post,
                      isOwn: isOwn,
                    ),
                  ),
                ],
              ),
            ),

            // -------------------------------------------------- media --
            if (p.type == PostType.text)
              _TextMedia(post: p, onTap: () => _open(p))
            else
              _Media(
                post: p,
                burst: _burst,
                onTap: () => _open(p),
                onDoubleTap: () => _like(p, fromDoubleTap: true),
              ),

            if (widget.showRising && RisingBanner.shouldShow(progress))
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  BlocksSpacing.md,
                  BlocksSpacing.md,
                  BlocksSpacing.md,
                  0,
                ),
                child: RisingBanner(progress: progress, isOwnPost: isOwn),
              ),

            // ----------------------------------------------- actions --
            Padding(
              padding: const EdgeInsets.fromLTRB(
                BlocksSpacing.sm,
                BlocksSpacing.xs,
                BlocksSpacing.sm,
                0,
              ),
              child: Row(
                children: [
                  // The three counted actions scale down together on very
                  // narrow screens / large text instead of overflowing.
                  Expanded(
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: AlignmentDirectional.centerStart,
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          _ActionButton(
                            icon: p.isLiked
                                ? Icons.favorite_rounded
                                : Icons.favorite_border_rounded,
                            color: p.isLiked
                                ? context.blocks.reachGlobal
                                : null,
                            label: compactCount(p.stats.likes),
                            semantics: l10n.likeSemantics(
                              likeLabel,
                              compactCount(p.stats.likes),
                            ),
                            onTap: () => _like(p, fromDoubleTap: false),
                          ),
                          _ActionButton(
                            icon: Icons.mode_comment_outlined,
                            label: compactCount(p.stats.comments),
                            semantics: l10n.commentSemantics(
                              compactCount(p.stats.comments),
                            ),
                            onTap: () => showCommentsSheet(context, p.ref),
                          ),
                          _ActionButton(
                            icon: Icons.ios_share_rounded,
                            label: compactCount(p.stats.shares),
                            semantics: l10n.shareSemantics(
                              compactCount(p.stats.shares),
                            ),
                            onTap: () => showShareSheet(context, p.ref),
                          ),
                        ],
                      ),
                    ),
                  ),
                  _ActionButton(
                    icon: p.isSaved
                        ? Icons.bookmark_rounded
                        : Icons.bookmark_border_rounded,
                    color: p.isSaved ? context.scheme.primary : null,
                    semantics: p.isSaved ? l10n.actionUnsave : l10n.actionSave,
                    onTap: () {
                      ref.read(interactionsProvider.notifier).toggleSave(p);
                      showAppSnack(
                        context,
                        p.isSaved ? l10n.postUnsaved : l10n.postSaved,
                      );
                    },
                  ),
                ],
              ),
            ),

            // ----------------------------------------------- caption --
            if (p.type != PostType.text || p.hashtags.isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  BlocksSpacing.md + 2,
                  BlocksSpacing.xs,
                  BlocksSpacing.md + 2,
                  BlocksSpacing.md + 2,
                ),
                child: _Caption(
                  post: p,
                  expanded: _expanded || widget.isDetail,
                  onToggle: () => setState(() => _expanded = !_expanded),
                ),
              )
            else
              const SizedBox(height: BlocksSpacing.md),
          ],
        ),
      ),
    );
  }
}

class _Media extends StatelessWidget {
  const _Media({
    required this.post,
    required this.burst,
    required this.onTap,
    required this.onDoubleTap,
  });

  final Post post;
  final Animation<double> burst;
  final VoidCallback onTap;
  final VoidCallback onDoubleTap;

  @override
  Widget build(BuildContext context) {
    final isVideo = post.type == PostType.video;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: BlocksSpacing.sm),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(BlocksRadius.lg),
        child: AspectRatio(
          aspectRatio: 4 / 5,
          child: GestureDetector(
            onTap: onTap,
            onDoubleTap: onDoubleTap,
            child: Stack(
              fit: StackFit.expand,
              children: [
                BlocksImage(
                  url: post.mediaUrl ?? '',
                  variant: ImageVariant.medium,
                  semanticLabel: post.caption,
                ),
                if (isVideo)
                  Center(
                    child: Container(
                      width: 62,
                      height: 62,
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.35),
                        borderRadius: BorderRadius.circular(22),
                      ),
                      child: const Icon(
                        Icons.play_arrow_rounded,
                        color: Colors.white,
                        size: 40,
                      ),
                    ),
                  ),
                if (isVideo && post.durationSeconds != null)
                  Positioned(
                    right: BlocksSpacing.md,
                    bottom: BlocksSpacing.md,
                    child: _Pill(
                      icon: Icons.videocam_rounded,
                      text: _duration(post.durationSeconds!),
                    ),
                  ),
                Center(
                  child: IgnorePointer(
                    child: AnimatedBuilder(
                      animation: burst,
                      builder: (_, _) {
                        final t = burst.value;
                        if (t == 0 || t == 1) return const SizedBox.shrink();
                        final scale = Curves.elasticOut.transform(
                          t.clamp(0, 0.6) / 0.6,
                        );
                        return Opacity(
                          opacity: t < 0.7 ? 1 : (1 - t) / 0.3,
                          child: Transform.scale(
                            scale: scale,
                            child: const Icon(
                              Icons.favorite_rounded,
                              color: Colors.white,
                              size: 104,
                              shadows: [
                                Shadow(blurRadius: 24, color: Colors.black38),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  static String _duration(int s) =>
      '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';
}

class _TextMedia extends StatelessWidget {
  const _TextMedia({required this.post, required this.onTap});

  final Post post;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: BlocksSpacing.sm),
      child: Material(
        color: context.scheme.primaryContainer,
        borderRadius: BorderRadius.circular(BlocksRadius.lg),
        child: InkWell(
          borderRadius: BorderRadius.circular(BlocksRadius.lg),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(BlocksSpacing.xl),
            child: Text(
              post.caption,
              style: context.text.titleLarge?.copyWith(
                color: context.scheme.onPrimaryContainer,
                height: 1.35,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(BlocksRadius.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: Colors.white),
          const SizedBox(width: 4),
          Text(
            text,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 11,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.icon,
    required this.semantics,
    required this.onTap,
    this.label,
    this.color,
  });

  final IconData icon;
  final String? label;
  final String semantics;
  final Color? color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final fg = color ?? context.scheme.onSurface;
    return Semantics(
      button: true,
      label: semantics,
      excludeSemantics: true,
      child: InkResponse(
        onTap: onTap,
        radius: 28,
        child: ConstrainedBox(
          constraints: const BoxConstraints(
            minHeight: BlocksSpacing.touchTarget,
            minWidth: BlocksSpacing.touchTarget,
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: BlocksSpacing.sm + 2,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 24, color: fg),
                if (label != null) ...[
                  const SizedBox(width: 5),
                  Text(
                    label!,
                    style: context.text.labelMedium?.copyWith(
                      color: fg,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Caption extends StatelessWidget {
  const _Caption({
    required this.post,
    required this.expanded,
    required this.onToggle,
  });

  final Post post;
  final bool expanded;
  final VoidCallback onToggle;

  static const _collapsedLimit = 110;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final isLong = post.caption.length > _collapsedLimit;
    final showCaption = post.type != PostType.text;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (showCaption)
          Text(
            post.caption,
            style: context.text.bodyMedium,
            maxLines: expanded ? null : 3,
            overflow: expanded ? TextOverflow.visible : TextOverflow.ellipsis,
          ),
        if (showCaption && isLong)
          InkWell(
            onTap: onToggle,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Text(
                expanded ? l10n.captionLess : l10n.captionMore,
                style: context.text.labelMedium?.copyWith(
                  color: context.scheme.onSurfaceVariant,
                ),
              ),
            ),
          ),
        if (post.hashtags.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(
              post.hashtags.join('  '),
              style: context.text.bodyMedium?.copyWith(
                color: context.scheme.primary,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
      ],
    );
  }
}

/// Lightweight placeholder shown while the first page loads.
class PostCardSkeleton extends StatelessWidget {
  const PostCardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    final muted = context.blocks.surfaceMuted;
    Widget bar(double w, double h) => Container(
      width: w,
      height: h,
      decoration: BoxDecoration(
        color: muted,
        borderRadius: BorderRadius.circular(6),
      ),
    );
    return ExcludeSemantics(
      child: Container(
        padding: const EdgeInsets.all(BlocksSpacing.md),
        decoration: BoxDecoration(
          color: context.scheme.surface,
          borderRadius: BorderRadius.circular(BlocksRadius.xl),
          border: Border.all(color: context.scheme.outlineVariant),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: muted,
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                const SizedBox(width: BlocksSpacing.md),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    bar(120, 12),
                    const SizedBox(height: 6),
                    bar(180, 10),
                  ],
                ),
              ],
            ),
            const SizedBox(height: BlocksSpacing.md),
            AspectRatio(
              aspectRatio: 4 / 5,
              child: Container(
                decoration: BoxDecoration(
                  color: muted,
                  borderRadius: BorderRadius.circular(BlocksRadius.lg),
                ),
              ),
            ),
            const SizedBox(height: BlocksSpacing.md),
            bar(220, 12),
          ],
        ),
      ),
    );
  }
}
