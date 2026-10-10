import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/app_theme.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/utils/number_format.dart';
import 'package:blocks_app/core/widgets/blocks_avatar.dart';
import 'package:blocks_app/core/widgets/blocks_image.dart';
import 'package:blocks_app/core/widgets/blocks_mark.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:blocks_app/data/models/business_models.dart';
import 'package:blocks_app/data/models/content_models.dart';
import 'package:blocks_app/data/repositories/reel_repository.dart';
import 'package:blocks_app/features/engagement/application/engagement_controllers.dart';
import 'package:blocks_app/features/engagement/presentation/follow_button.dart';
import 'package:blocks_app/features/post/presentation/comments_sheet.dart';
import 'package:blocks_app/features/post/presentation/share_sheet.dart';
import 'package:blocks_app/features/profile/application/user_providers.dart';
import 'package:blocks_app/features/reach/application/reach_providers.dart';
import 'package:blocks_app/features/reach/presentation/widgets/reach_level_badge.dart';
import 'package:blocks_app/features/reels/application/reels_controller.dart';
import 'package:blocks_app/features/reels/domain/reel_playback.dart';
import 'package:blocks_app/features/safety/presentation/content_actions_sheet.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Full-screen vertical reels.
///
/// Performance contract: a [ReelPlayerPool] keeps at most three players alive
/// (previous / current / next). Players scrolled away are disposed, and
/// playback pauses entirely while another tab is showing.
class ReelsScreen extends ConsumerStatefulWidget {
  const ReelsScreen({super.key});

  @override
  ConsumerState<ReelsScreen> createState() => _ReelsScreenState();
}

class _ReelsScreenState extends ConsumerState<ReelsScreen>
    with TickerProviderStateMixin, WidgetsBindingObserver {
  late final ReelPlayerPool _pool;

  // keepPage: false so a new feed (For You <-> Following) always starts on
  // its first reel instead of restoring the previous feed's position.
  final PageController _page = PageController(keepPage: false);
  int _index = 0;

  /// This screen is the visible tab/route (tickers are off while another tab
  /// or a full-screen route covers it).
  bool _visible = true;

  /// The app is in the foreground. False while backgrounded, locked, in a
  /// phone call, or otherwise inactive.
  bool _foreground = true;

  bool get _shouldPlay => _visible && _foreground;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final lifecycle = WidgetsBinding.instance.lifecycleState;
    _foreground = lifecycle == null || lifecycle == AppLifecycleState.resumed;

    _pool = ReelPlayerPool(
      factory: (reel) => ref.read(reelPlaybackBuilderProvider)(reel, this),
    )..muted = ref.read(reelsMutedProvider);

    ref
      ..listenManual(reelsControllerProvider, (prev, next) {
        final items = next.value?.items;
        if (items == null || items.isEmpty) return;
        if (_shouldPlay) _pool.focus(items, _index);
        if (prev != null && mounted) setState(() {});
      }, fireImmediately: true)
      // Sound only ever changes because the user tapped the sound button.
      ..listenManual(reelsMutedProvider, (_, muted) => _pool.muted = muted)
      ..listenManual(reelsFeedProvider, (_, _) {
        _index = 0;
        if (_page.hasClients) _page.jumpToPage(0);
      });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Offstage tabs / covered routes have tickers disabled; mirror that in
    // the pool so nothing "plays" while the user is elsewhere.
    final on = TickerMode.valuesOf(context).enabled;
    if (on == _visible) return;
    _visible = on;
    _syncPlayback();
  }

  /// Backgrounded, locked, interrupted by a call, or switched away: pause.
  /// Coming back resumes the current reel but never changes the mute state.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final foreground = state == AppLifecycleState.resumed;
    if (foreground == _foreground) return;
    _foreground = foreground;
    _syncPlayback();
  }

  void _syncPlayback() {
    if (!_shouldPlay) {
      _pool.pauseAll();
      return;
    }
    final items = ref.read(reelsControllerProvider).value?.items;
    if (items != null && items.isNotEmpty) _pool.focus(items, _index);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _pool.dispose();
    _page.dispose();
    super.dispose();
  }

  void _onPageChanged(int i, List<Reel> items) {
    _index = i;
    if (_shouldPlay) _pool.focus(items, i);
    setState(() {});
    if (i >= items.length - 3) {
      ref.read(reelsControllerProvider.notifier).loadMore();
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(reelsControllerProvider);
    final feed = ref.watch(reelsFeedProvider);
    final data = async.value;

    // This screen is always black, so the messages on it use the dark theme: with the light one
    // their titles are dark indigo on black and cannot be read.
    Widget onBlack(Widget w) => Theme(data: AppTheme.dark(), child: w);

    final Widget body;
    if (async.isLoading || (data == null && !async.hasError)) {
      body = onBlack(const LoadingView());
    } else if (data == null) {
      body = onBlack(
        ErrorView(
          error: async.error,
          onRetry: () => ref.invalidate(reelsControllerProvider),
        ),
      );
    } else if (data.items.isEmpty) {
      body = onBlack(
        feed == ReelFeed.following
            ? EmptyView(
                icon: Icons.people_outline_rounded,
                title: context.l10n.reelsFollowingEmptyTitle,
                body: context.l10n.reelsFollowingEmptyBody,
              )
            : const EmptyView(),
      );
    } else {
      final items = data.items;
      body = PageView.builder(
        key: ValueKey(feed),
        scrollDirection: Axis.vertical,
        controller: _page,
        itemCount: items.length,
        onPageChanged: (i) => _onPageChanged(i, items),
        itemBuilder: (context, i) => _ReelPage(
          key: ValueKey(items[i].id),
          reel: items[i],
          playback: _pool.playbackFor(items[i].id),
        ),
      );
    }

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: Colors.black,
        body: Stack(
          fit: StackFit.expand,
          children: [
            body,
            // The tabs stay reachable in every state, including empty
            // Following, so the user can always go back to For You.
            // Positioned: only the top strip takes touches, never the video.
            const Positioned(top: 0, left: 0, right: 0, child: _ReelsTopBar()),
          ],
        ),
      ),
    );
  }
}

/// BLOCKS mark + wordmark, the For You / Following switch, and the create
/// button. Shrinks instead of overflowing on narrow phones / large text.
class _ReelsTopBar extends ConsumerWidget {
  const _ReelsTopBar();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final feed = ref.watch(reelsFeedProvider);
    final select = ref.read(reelsFeedProvider.notifier).select;

    return SafeArea(
      child: Align(
        alignment: Alignment.topCenter,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            BlocksSpacing.lg,
            BlocksSpacing.xs,
            BlocksSpacing.xs,
            0,
          ),
          child: Row(
            children: [
              Flexible(
                flex: 2,
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: AlignmentDirectional.centerStart,
                  child: ExcludeSemantics(
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const BlocksMark(size: 22),
                        const SizedBox(width: BlocksSpacing.sm),
                        Text(
                          l10n.appName,
                          style: context.text.titleMedium?.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1.4,
                            shadows: const [
                              Shadow(blurRadius: 8, color: Colors.black54),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              Expanded(
                flex: 3,
                child: Semantics(
                  container: true,
                  label: l10n.reelsFeedSemantics,
                  child: Center(
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          _FeedTab(
                            label: l10n.reelsTabForYou,
                            selected: feed == ReelFeed.forYou,
                            onTap: () => select(ReelFeed.forYou),
                          ),
                          _FeedTab(
                            label: l10n.reelsTabFollowing,
                            selected: feed == ReelFeed.following,
                            onTap: () => select(ReelFeed.following),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              IconButton(
                tooltip: l10n.reelCreate,
                color: Colors.white,
                icon: const Icon(Icons.video_call_rounded, size: 28),
                onPressed: () => context.push(Routes.createReel),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FeedTab extends StatelessWidget {
  const _FeedTab({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BlocksRadius.mdAll,
        child: ConstrainedBox(
          constraints: const BoxConstraints(
            minHeight: BlocksSpacing.touchTarget,
            minWidth: BlocksSpacing.touchTarget,
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: BlocksSpacing.md),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  label,
                  style: context.text.titleSmall?.copyWith(
                    color: selected ? Colors.white : Colors.white70,
                    fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                    shadows: const [
                      Shadow(blurRadius: 8, color: Colors.black54),
                    ],
                  ),
                ),
                const SizedBox(height: 3),
                AnimatedContainer(
                  duration: BlocksDurations.fast,
                  height: 3,
                  width: selected ? 22 : 0,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ReelPage extends ConsumerWidget {
  const _ReelPage({required this.reel, required this.playback, super.key});

  final Reel reel;
  final ReelPlayback? playback;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final r = reel.withInteraction(ref.watch(interactionProvider(reel.id)));
    final interactions = ref.read(interactionsProvider.notifier);
    final muted = ref.watch(reelsMutedProvider);
    final isOwn = ref.watch(currentUserProvider).value?.id == r.author.id;
    final level = ref
        .watch(reachCalculatorProvider)
        .evaluate(r.qualifiedReach)
        .current;
    final liked = r.isLiked;

    return Stack(
      fit: StackFit.expand,
      children: [
        // ------------------------------------------------------- video --
        Semantics(
          button: true,
          label: l10n.reelVideoSemantics(r.author.name),
          excludeSemantics: true,
          onTap: () {
            final p = playback;
            if (p == null) return;
            p.isPlaying.value ? p.pause() : p.play();
          },
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () {
              final p = playback;
              if (p == null) return;
              p.isPlaying.value ? p.pause() : p.play();
            },
            onDoubleTap: () {
              HapticFeedback.selectionClick();
              if (!liked) interactions.toggleLikeReel(r);
            },
            child:
                playback?.buildView(context) ??
                BlocksImage(url: r.videoUrl, variant: ImageVariant.large),
          ),
        ),
        const IgnorePointer(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Color(0x80000000),
                  Color(0x00000000),
                  Color(0x00000000),
                  Color(0xB3000000),
                ],
                stops: [0, 0.2, 0.55, 1],
              ),
            ),
          ),
        ),
        if (playback != null)
          IgnorePointer(
            child: Center(
              child: ValueListenableBuilder<bool>(
                valueListenable: playback!.isPlaying,
                builder: (_, playing, _) => AnimatedOpacity(
                  duration: BlocksDurations.fast,
                  opacity: playing ? 0 : 1,
                  child: Container(
                    width: 76,
                    height: 76,
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.4),
                      borderRadius: BorderRadius.circular(26),
                    ),
                    child: const Icon(
                      Icons.play_arrow_rounded,
                      color: Colors.white,
                      size: 48,
                    ),
                  ),
                ),
              ),
            ),
          ),

        // ------------------------------------------------- bottom info --
        Positioned(
          left: BlocksSpacing.lg,
          right: 84,
          bottom: BlocksSpacing.xl,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  InkWell(
                    onTap: () => isOwn
                        ? context.go(Routes.profile)
                        : context.push(Routes.user(r.author.id)),
                    borderRadius: BlocksRadius.mdAll,
                    // 40 dp avatar inside a 48 dp touch target.
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(
                        minWidth: BlocksSpacing.touchTarget,
                        minHeight: BlocksSpacing.touchTarget,
                      ),
                      child: Center(
                        child: BlocksAvatar(
                          name: r.author.name,
                          imageUrl: r.author.avatarUrl,
                          size: 40,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: BlocksSpacing.sm + 2),
                  Flexible(
                    child: Text(
                      r.author.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: context.text.titleSmall?.copyWith(
                        color: Colors.white,
                      ),
                    ),
                  ),
                  if (r.author.isVerified) ...[
                    const SizedBox(width: 4),
                    Icon(
                      Icons.verified_rounded,
                      size: 16,
                      color: context.blocks.reachState,
                    ),
                  ],
                  if (!isOwn) ...[
                    const SizedBox(width: BlocksSpacing.sm + 2),
                    FollowButton(userId: r.author.id, onDark: true),
                  ],
                ],
              ),
              const SizedBox(height: BlocksSpacing.md),
              Text(
                r.caption,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: context.text.bodyMedium?.copyWith(color: Colors.white),
              ),
              if (r.hashtags.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(
                    r.hashtags.join('  '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: context.text.bodySmall?.copyWith(
                      color: Colors.white70,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              const SizedBox(height: BlocksSpacing.sm),
              Row(
                children: [
                  const Icon(
                    Icons.music_note_rounded,
                    size: 16,
                    color: Colors.white,
                  ),
                  const SizedBox(width: 4),
                  Flexible(
                    child: Text(
                      l10n.reelMusic(r.musicTitle),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: context.text.bodySmall?.copyWith(
                        color: Colors.white,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: BlocksSpacing.sm),
              Row(
                children: [
                  Flexible(
                    flex: 3,
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: AlignmentDirectional.centerStart,
                      child: ReachLevelBadge(level: level, dense: true),
                    ),
                  ),
                  const SizedBox(width: BlocksSpacing.sm),
                  const Icon(
                    Icons.location_on_rounded,
                    size: 14,
                    color: Colors.white70,
                  ),
                  const SizedBox(width: 2),
                  Flexible(
                    child: Text(
                      r.location,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: context.text.bodySmall?.copyWith(
                        color: Colors.white70,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),

        // -------------------------------------------------- action rail --
        Positioned(
          right: BlocksSpacing.sm,
          bottom: BlocksSpacing.xl,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _RailButton(
                icon: liked
                    ? Icons.favorite_rounded
                    : Icons.favorite_border_rounded,
                color: liked ? context.blocks.reachGlobal : Colors.white,
                label: compactCount(r.stats.likes),
                semantics: l10n.likeSemantics(
                  liked ? l10n.actionUnlike : l10n.actionLike,
                  compactCount(r.stats.likes),
                ),
                onTap: () => interactions.toggleLikeReel(r),
              ),
              _RailButton(
                icon: Icons.mode_comment_outlined,
                label: compactCount(r.stats.comments),
                semantics: l10n.commentSemantics(
                  compactCount(r.stats.comments),
                ),
                onTap: () => showCommentsSheet(context, r.ref),
              ),
              _RailButton(
                icon: Icons.ios_share_rounded,
                label: compactCount(r.stats.shares),
                semantics: l10n.shareSemantics(compactCount(r.stats.shares)),
                onTap: () => showShareSheet(context, r.ref),
              ),
              _RailButton(
                icon: r.isSaved
                    ? Icons.bookmark_rounded
                    : Icons.bookmark_border_rounded,
                semantics: r.isSaved ? l10n.actionUnsave : l10n.actionSave,
                onTap: () => interactions.toggleSaveReel(r),
              ),
              _RailButton(
                icon: muted
                    ? Icons.volume_off_rounded
                    : Icons.volume_up_rounded,
                semantics: muted ? l10n.reelUnmute : l10n.reelMute,
                onTap: () => ref.read(reelsMutedProvider.notifier).toggleMute(),
              ),
              _RailButton(
                icon: Icons.more_horiz_rounded,
                semantics: l10n.postMoreOptions,
                onTap: () => showContentActionsSheet(
                  context,
                  author: r.author,
                  contentId: r.id,
                  targetType: ReportTargetType.reel,
                  isOwn: isOwn,
                ),
              ),
            ],
          ),
        ),

        // --------------------------------------------------- progress --
        Positioned(
          left: 0,
          right: 0,
          bottom: 0,
          child: playback == null
              ? const SizedBox(height: 3)
              : ValueListenableBuilder<double>(
                  valueListenable: playback!.progress,
                  builder: (_, value, _) => LinearProgressIndicator(
                    value: value,
                    minHeight: 3,
                    color: Colors.white,
                    backgroundColor: Colors.white24,
                  ),
                ),
        ),
      ],
    );
  }
}

class _RailButton extends StatelessWidget {
  const _RailButton({
    required this.icon,
    required this.semantics,
    required this.onTap,
    this.label,
    this.color = Colors.white,
  });

  final IconData icon;
  final String? label;
  final String semantics;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: semantics,
      excludeSemantics: true,
      child: InkResponse(
        onTap: onTap,
        radius: 30,
        child: SizedBox(
          width: 56,
          height: 60,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                icon,
                color: color,
                size: 29,
                shadows: const [Shadow(blurRadius: 8, color: Colors.black54)],
              ),
              if (label != null)
                FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Text(
                    label!,
                    maxLines: 1,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 11.5,
                      fontWeight: FontWeight.w700,
                      shadows: [Shadow(blurRadius: 6, color: Colors.black54)],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
