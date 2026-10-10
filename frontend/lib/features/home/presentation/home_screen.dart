import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/pagination/paged_notifier.dart';
import 'package:blocks_app/core/widgets/blocks_avatar.dart';
import 'package:blocks_app/core/widgets/blocks_chip.dart';
import 'package:blocks_app/core/widgets/blocks_mark.dart';
import 'package:blocks_app/core/widgets/load_more_footer.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:blocks_app/data/models/discovery_models.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/features/explore/application/search_focus.dart';
import 'package:blocks_app/features/home/application/feed_controller.dart';
import 'package:blocks_app/features/notifications/application/notification_providers.dart';
import 'package:blocks_app/features/post/presentation/post_card.dart';
import 'package:blocks_app/features/profile/application/user_providers.dart';
import 'package:blocks_app/features/stories/application/story_controller.dart';
import 'package:blocks_app/features/stories/presentation/story_strip.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final type = ref.watch(selectedFeedProvider);
    final feed = ref.watch(feedControllerProvider(type));
    final controller = ref.read(feedControllerProvider(type).notifier);

    Future<void> refresh() async {
      ref.invalidate(storyControllerProvider);
      ref.invalidate(unreadNotificationsProvider);
      await controller.refresh();
    }

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: ResponsiveCenter(
          maxWidth: 640,
          child: NotificationListener<ScrollNotification>(
            // Fetch the next page well before the user reaches the end.
            onNotification: (n) {
              if (n.metrics.axis == Axis.vertical &&
                  n.metrics.extentAfter < 900) {
                controller.loadMore();
              }
              return false;
            },
            child: RefreshIndicator(
              onRefresh: refresh,
              child: CustomScrollView(
                slivers: [
                  const _HomeHeader(),
                  const SliverToBoxAdapter(child: StoryStrip()),
                  SliverPersistentHeader(
                    pinned: true,
                    delegate: _FeedTabsDelegate(
                      background: context.theme.scaffoldBackgroundColor,
                    ),
                  ),
                  ..._feedSlivers(context, ref, type, feed),
                  const SliverToBoxAdapter(
                    child: SizedBox(height: BlocksSpacing.xl),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _feedSlivers(
    BuildContext context,
    WidgetRef ref,
    FeedType type,
    AsyncValue<PagedState<Post>> feed,
  ) {
    final data = feed.value;

    if (data == null) {
      if (feed.hasError) {
        return [
          SliverFillRemaining(
            hasScrollBody: false,
            child: ErrorView(
              onRetry: () => ref.invalidate(feedControllerProvider(type)),
            ),
          ),
        ];
      }
      return [
        SliverList.separated(
          itemCount: 3,
          separatorBuilder: (_, _) => const SizedBox(height: BlocksSpacing.lg),
          itemBuilder: (_, _) => const Padding(
            padding: EdgeInsets.symmetric(horizontal: BlocksSpacing.lg),
            child: PostCardSkeleton(),
          ),
        ),
      ];
    }

    if (data.items.isEmpty) {
      return [
        const SliverFillRemaining(hasScrollBody: false, child: EmptyView()),
      ];
    }

    final showRising = type == FeedType.rising;
    return [
      SliverList.builder(
        itemCount: data.items.length + 1,
        findChildIndexCallback: (key) {
          if (key is! ValueKey<String>) return null;
          final i = data.items.indexWhere((p) => p.id == key.value);
          return i < 0 ? null : i;
        },
        itemBuilder: (context, i) {
          if (i == data.items.length) {
            return LoadMoreFooter(
              state: data,
              onLoadMore: () =>
                  ref.read(feedControllerProvider(type).notifier).loadMore(),
            );
          }
          final post = data.items[i];
          return Padding(
            key: ValueKey(post.id),
            padding: const EdgeInsets.fromLTRB(
              BlocksSpacing.lg,
              0,
              BlocksSpacing.lg,
              BlocksSpacing.lg,
            ),
            child: PostCard(post: post, showRising: showRising),
          );
        },
      ),
    ];
  }
}

class _HomeHeader extends ConsumerWidget {
  const _HomeHeader();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final unread = ref.watch(unreadNotificationsProvider).value ?? 0;
    final me = ref.watch(currentUserProvider).value;

    return SliverAppBar(
      floating: true,
      snap: true,
      titleSpacing: BlocksSpacing.lg,
      toolbarHeight: 60,
      title: Row(
        children: [
          const BlocksMark(size: 30),
          const SizedBox(width: BlocksSpacing.sm + 2),
          // The wordmark shrinks rather than overflowing next to the action
          // icons on a narrow phone with a large system font.
          Flexible(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: AlignmentDirectional.centerStart,
              child: Text(
                l10n.appName,
                style: context.text.titleLarge?.copyWith(
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1.6,
                ),
              ),
            ),
          ),
        ],
      ),
      actions: [
        IconButton(
          tooltip: l10n.searchTooltip,
          icon: const Icon(Icons.search_rounded),
          onPressed: () {
            ref.read(searchFocusRequestProvider.notifier).request();
            context.go(Routes.explore);
          },
        ),
        IconButton(
          tooltip: l10n.notificationsTooltip,
          icon: Badge(
            isLabelVisible: unread > 0,
            label: Text('$unread'),
            child: const Icon(Icons.notifications_none_rounded),
          ),
          onPressed: () => context.push(Routes.notifications),
        ),
        Padding(
          padding: const EdgeInsets.only(
            right: BlocksSpacing.md,
            left: BlocksSpacing.xs,
          ),
          child: Semantics(
            button: true,
            label: l10n.profileTooltip,
            excludeSemantics: true,
            child: InkResponse(
              onTap: () => context.go(Routes.profile),
              radius: 26,
              child: ConstrainedBox(
                constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
                child: Center(
                  child: BlocksAvatar(
                    name: me?.name ?? l10n.appName,
                    imageUrl: me?.avatarUrl,
                    size: 34,
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _FeedTabsDelegate extends SliverPersistentHeaderDelegate {
  _FeedTabsDelegate({required this.background});

  final Color background;

  @override
  double get minExtent => 56;
  @override
  double get maxExtent => 56;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    return ColoredBox(color: background, child: const _FeedTabs());
  }

  @override
  bool shouldRebuild(_FeedTabsDelegate old) => old.background != background;
}

class _FeedTabs extends ConsumerWidget {
  const _FeedTabs();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final selected = ref.watch(selectedFeedProvider);
    final labels = {
      FeedType.following: l10n.feedFollowing,
      FeedType.forYou: l10n.feedForYou,
      FeedType.rising: l10n.feedRising,
      FeedType.nearYou: l10n.feedNearYou,
      FeedType.india: l10n.feedIndia,
    };

    return ListView.separated(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(
        horizontal: BlocksSpacing.lg,
        vertical: BlocksSpacing.sm + 2,
      ),
      itemCount: FeedType.values.length,
      separatorBuilder: (_, _) => const SizedBox(width: BlocksSpacing.sm),
      itemBuilder: (context, i) {
        final type = FeedType.values[i];
        return BlocksChip(
          label: labels[type]!,
          icon: type == FeedType.rising
              ? Icons.local_fire_department_rounded
              : null,
          selected: type == selected,
          onSelected: () =>
              ref.read(selectedFeedProvider.notifier).select(type),
        );
      },
    );
  }
}
