import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/pagination/paged_notifier.dart';
import 'package:blocks_app/core/utils/debouncer.dart';
import 'package:blocks_app/core/utils/number_format.dart';
import 'package:blocks_app/core/widgets/blocks_avatar.dart';
import 'package:blocks_app/core/widgets/blocks_chip.dart';
import 'package:blocks_app/core/widgets/load_more_footer.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:blocks_app/data/models/app_user.dart';
import 'package:blocks_app/data/models/discovery_models.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/features/engagement/presentation/follow_button.dart';
import 'package:blocks_app/features/explore/application/explore_controllers.dart';
import 'package:blocks_app/features/explore/application/search_focus.dart';
import 'package:blocks_app/features/explore/presentation/explore_labels.dart';
import 'package:blocks_app/features/post/presentation/post_tile.dart';
import 'package:blocks_app/features/profile/application/user_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class ExploreScreen extends ConsumerStatefulWidget {
  const ExploreScreen({super.key});

  @override
  ConsumerState<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends ConsumerState<ExploreScreen> {
  final _text = TextEditingController();
  final _focus = FocusNode();
  final _debounce = Debouncer();

  @override
  void initState() {
    super.initState();
    // The Home search icon may have asked for focus before this tab existed.
    WidgetsBinding.instance.addPostFrameCallback((_) => _consumeFocusRequest());
  }

  void _consumeFocusRequest() {
    if (!mounted || !ref.read(searchFocusRequestProvider)) return;
    _focus.requestFocus();
    ref.read(searchFocusRequestProvider.notifier).consume();
  }

  @override
  void dispose() {
    _debounce.dispose();
    _text.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _search(String value) {
    _debounce.run(() {
      if (mounted) ref.read(searchQueryProvider.notifier).set(value);
    });
  }

  void _setQuery(String value) {
    _text.text = value;
    _text.selection = TextSelection.collapsed(offset: value.length);
    ref.read(searchQueryProvider.notifier).set(value);
    _focus.unfocus();
  }

  void _clear() {
    _text.clear();
    ref.read(searchQueryProvider.notifier).set('');
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(searchFocusRequestProvider, (_, pending) {
      if (pending) _consumeFocusRequest();
    });
    final query = ref.watch(searchQueryProvider);
    final filter = ref.watch(exploreFilterProvider);
    final isSearching = query.isNotEmpty;

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: ResponsiveCenter(
          maxWidth: 720,
          child: NotificationListener<ScrollNotification>(
            onNotification: (n) {
              if (!isSearching &&
                  n.metrics.axis == Axis.vertical &&
                  n.metrics.extentAfter < 700) {
                ref.read(exploreGridProvider(filter).notifier).loadMore();
              }
              return false;
            },
            child: CustomScrollView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              slivers: [
                SliverToBoxAdapter(
                  child: _SearchHeader(
                    controller: _text,
                    focusNode: _focus,
                    onChanged: _search,
                    onClear: _clear,
                  ),
                ),
                if (isSearching)
                  ..._searchSlivers(query)
                else
                  ..._discoverSlivers(filter),
                const SliverToBoxAdapter(
                  child: SizedBox(height: BlocksSpacing.xl),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ----------------------------------------------------------- Discover --

  List<Widget> _discoverSlivers(ExploreFilter filter) {
    final l10n = context.l10n;
    final me = ref.watch(currentUserProvider).value;
    final place = switch (filter.scope) {
      ExploreScope.district => me?.district ?? '',
      ExploreScope.state => me?.state ?? '',
      ExploreScope.india => l10n.feedIndia,
      ExploreScope.global => l10n.placeWorld,
    };
    final trending = ref.watch(trendingProvider(filter.scope));
    final grid = ref.watch(exploreGridProvider(filter));

    return [
      SliverToBoxAdapter(child: _ScopeSelector(selected: filter.scope)),
      SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            BlocksSpacing.lg,
            BlocksSpacing.sm,
            BlocksSpacing.lg,
            BlocksSpacing.lg,
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                Icons.shield_outlined,
                size: 16,
                color: context.scheme.onSurfaceVariant,
              ),
              const SizedBox(width: BlocksSpacing.sm),
              Expanded(
                child: Text(
                  l10n.exploreLocationNote(place),
                  style: context.text.bodySmall,
                ),
              ),
            ],
          ),
        ),
      ),
      _sectionHeader(l10n.exploreTrendingIn(place)),
      if (trending.value != null)
        SliverList.builder(
          itemCount: trending.value!.length,
          itemBuilder: (context, i) => _TrendingRow(
            rank: i + 1,
            topic: trending.value![i],
            onTap: () => _setQuery(trending.value![i].title),
          ),
        )
      else
        const SliverToBoxAdapter(
          child: SizedBox(height: 120, child: LoadingView()),
        ),
      _sectionHeader(l10n.exploreCategories),
      SliverToBoxAdapter(child: _CategoryRow(selected: filter.category)),
      const SliverToBoxAdapter(child: SizedBox(height: BlocksSpacing.md)),
      ..._gridSlivers(grid, filter),
    ];
  }

  Widget _sectionHeader(String text) => SliverToBoxAdapter(
    child: Padding(
      padding: const EdgeInsets.fromLTRB(
        BlocksSpacing.lg,
        BlocksSpacing.md,
        BlocksSpacing.lg,
        BlocksSpacing.sm,
      ),
      child: Semantics(
        header: true,
        child: Text(text, style: context.text.titleMedium),
      ),
    ),
  );

  List<Widget> _gridSlivers(
    AsyncValue<PagedState<Post>> grid,
    ExploreFilter filter,
  ) {
    final data = grid.value;
    if (data == null) {
      if (grid.hasError) {
        return [
          SliverToBoxAdapter(
            child: SizedBox(
              height: 280,
              child: ErrorView(
                error: grid.error,
                onRetry: () => ref.invalidate(exploreGridProvider(filter)),
              ),
            ),
          ),
        ];
      }
      return [_postGrid(const [], skeletonCount: 9)];
    }
    if (data.items.isEmpty) {
      return [
        const SliverToBoxAdapter(
          child: SizedBox(height: 280, child: EmptyView()),
        ),
      ];
    }
    return [
      _postGrid(data.items),
      SliverToBoxAdapter(
        child: LoadMoreFooter(
          state: data,
          onLoadMore: () =>
              ref.read(exploreGridProvider(filter).notifier).loadMore(),
        ),
      ),
    ];
  }

  Widget _postGrid(List<Post> posts, {int skeletonCount = 0}) {
    final columns = MediaQuery.sizeOf(context).width >= 600 ? 4 : 3;
    final count = posts.isEmpty ? skeletonCount : posts.length;
    return SliverPadding(
      padding: const EdgeInsets.symmetric(horizontal: BlocksSpacing.lg),
      sliver: SliverGrid.builder(
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: columns,
          mainAxisSpacing: 4,
          crossAxisSpacing: 4,
          childAspectRatio: 0.8,
        ),
        itemCount: count,
        findChildIndexCallback: posts.isEmpty
            ? null
            : (key) {
                if (key is! ValueKey<String>) return null;
                final i = posts.indexWhere((p) => p.id == key.value);
                return i < 0 ? null : i;
              },
        itemBuilder: (context, i) {
          if (posts.isEmpty) {
            return DecoratedBox(
              decoration: BoxDecoration(
                color: context.blocks.surfaceMuted,
                borderRadius: BorderRadius.circular(BlocksRadius.md),
              ),
            );
          }
          return PostTile(key: ValueKey(posts[i].id), post: posts[i]);
        },
      ),
    );
  }

  // ------------------------------------------------------------- Search --

  List<Widget> _searchSlivers(String query) {
    final l10n = context.l10n;
    final results = ref.watch(searchResultsProvider(query));
    final data = results.value;

    if (data == null) {
      return [
        SliverToBoxAdapter(
          child: SizedBox(
            height: 280,
            child: results.hasError
                ? ErrorView(
                    error: results.error,
                    onRetry: () => ref.invalidate(searchResultsProvider(query)),
                  )
                : const LoadingView(),
          ),
        ),
      ];
    }
    if (data.isEmpty) {
      return [
        SliverToBoxAdapter(
          child: SizedBox(
            height: 320,
            child: EmptyView(
              icon: Icons.search_off_rounded,
              title: l10n.exploreNoResults(query),
              body: l10n.exploreNoResultsBody,
            ),
          ),
        ),
      ];
    }

    return [
      if (data.users.isNotEmpty) ...[
        _sectionHeader(l10n.exploreResultsPeople),
        SliverList.builder(
          itemCount: data.users.length,
          itemBuilder: (context, i) => _UserResultTile(user: data.users[i]),
        ),
      ],
      if (data.hashtags.isNotEmpty) ...[
        _sectionHeader(l10n.exploreResultsHashtags),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: BlocksSpacing.lg),
            child: Wrap(
              spacing: BlocksSpacing.sm,
              runSpacing: BlocksSpacing.sm,
              children: [
                for (final tag in data.hashtags)
                  BlocksChip(
                    label: tag,
                    selected: false,
                    onSelected: () => _setQuery(tag),
                  ),
              ],
            ),
          ),
        ),
      ],
      if (data.posts.isNotEmpty) ...[
        _sectionHeader(l10n.exploreResultsPosts),
        _postGrid(data.posts),
      ],
    ];
  }
}

class _SearchHeader extends StatelessWidget {
  const _SearchHeader({
    required this.controller,
    required this.focusNode,
    required this.onChanged,
    required this.onClear,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final ValueChanged<String> onChanged;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        BlocksSpacing.lg,
        BlocksSpacing.md,
        BlocksSpacing.lg,
        BlocksSpacing.md,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
            header: true,
            child: Text(l10n.exploreTitle, style: context.text.headlineSmall),
          ),
          const SizedBox(height: BlocksSpacing.md),
          TextField(
            controller: controller,
            focusNode: focusNode,
            onChanged: onChanged,
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              hintText: l10n.exploreSearchHint,
              prefixIcon: const Icon(Icons.search_rounded),
              suffixIcon: ValueListenableBuilder<TextEditingValue>(
                valueListenable: controller,
                builder: (context, value, _) => value.text.isEmpty
                    ? const SizedBox.shrink()
                    : IconButton(
                        tooltip: l10n.exploreClearSearch,
                        icon: const Icon(Icons.close_rounded),
                        onPressed: onClear,
                      ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ScopeSelector extends ConsumerWidget {
  const _ScopeSelector({required this.selected});

  final ExploreScope selected;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    // Wrap, not a scrolling row: all four scopes stay visible and reachable,
    // and they flow onto a second line on narrow screens or large text.
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: BlocksSpacing.lg),
      child: Wrap(
        spacing: BlocksSpacing.sm,
        runSpacing: BlocksSpacing.sm,
        children: [
          for (final scope in ExploreScope.values)
            BlocksChip(
              label: scope.label(l10n),
              icon: scope.icon,
              selected: scope == selected,
              onSelected: () =>
                  ref.read(exploreScopeProvider.notifier).select(scope),
            ),
        ],
      ),
    );
  }
}

class _CategoryRow extends ConsumerWidget {
  const _CategoryRow({required this.selected});

  final ExploreCategory? selected;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final notifier = ref.read(exploreCategoryProvider.notifier);
    return SizedBox(
      height: 44,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: BlocksSpacing.lg),
        children: [
          BlocksChip(
            label: l10n.exploreAll,
            selected: selected == null,
            onSelected: () => notifier.select(null),
          ),
          for (final c in ExploreCategory.values) ...[
            const SizedBox(width: BlocksSpacing.sm),
            BlocksChip(
              label: c.label(l10n),
              selected: c == selected,
              onSelected: () => notifier.select(c),
            ),
          ],
        ],
      ),
    );
  }
}

class _TrendingRow extends StatelessWidget {
  const _TrendingRow({
    required this.rank,
    required this.topic,
    required this.onTap,
  });

  final int rank;
  final TrendingTopic topic;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: BlocksSpacing.lg,
          vertical: BlocksSpacing.md - 2,
        ),
        child: Row(
          children: [
            SizedBox(
              width: 24,
              child: Text(
                '$rank',
                style: context.text.titleSmall?.copyWith(
                  color: context.scheme.onSurfaceVariant,
                ),
              ),
            ),
            Icon(
              Icons.local_fire_department_rounded,
              color: context.blocks.accent,
              size: 20,
            ),
            const SizedBox(width: BlocksSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    topic.title,
                    style: context.text.titleSmall,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  Text(
                    l10n.exploreTrendPosts(compactCount(topic.postCount)),
                    style: context.text.bodySmall,
                  ),
                ],
              ),
            ),
            Icon(
              Icons.chevron_right_rounded,
              color: context.scheme.onSurfaceVariant,
            ),
          ],
        ),
      ),
    );
  }
}

class _UserResultTile extends StatelessWidget {
  const _UserResultTile({required this.user});

  final UserSummary user;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: BlocksSpacing.lg),
      onTap: () => context.push(Routes.user(user.id)),
      leading: BlocksAvatar(
        name: user.name,
        imageUrl: user.avatarUrl,
        size: 44,
      ),
      title: Row(
        children: [
          Flexible(
            child: Text(
              user.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (user.isVerified) ...[
            const SizedBox(width: 4),
            Icon(
              Icons.verified_rounded,
              size: 16,
              color: context.blocks.reachState,
            ),
          ],
        ],
      ),
      subtitle: Text(user.username),
      trailing: FollowButton(userId: user.id),
    );
  }
}
