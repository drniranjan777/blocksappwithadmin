import 'package:blocks_app/core/pagination/paged_notifier.dart';
import 'package:blocks_app/data/models/discovery_models.dart';
import 'package:blocks_app/data/models/paged_result.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class ExploreScopeSelection extends Notifier<ExploreScope> {
  @override
  ExploreScope build() => ExploreScope.district;

  void select(ExploreScope scope) => state = scope;
}

final exploreScopeProvider =
    NotifierProvider<ExploreScopeSelection, ExploreScope>(
      ExploreScopeSelection.new,
    );

/// null means "All categories".
class ExploreCategorySelection extends Notifier<ExploreCategory?> {
  @override
  ExploreCategory? build() => null;

  void select(ExploreCategory? category) => state = category;
}

final exploreCategoryProvider =
    NotifierProvider<ExploreCategorySelection, ExploreCategory?>(
      ExploreCategorySelection.new,
    );

/// Debounced search text, set by the Explore screen.
class SearchQuery extends Notifier<String> {
  @override
  String build() => '';

  void set(String value) => state = value.trim();
}

final searchQueryProvider = NotifierProvider<SearchQuery, String>(
  SearchQuery.new,
);

class ExploreFilter extends Equatable {
  const ExploreFilter({required this.scope, this.category});

  final ExploreScope scope;
  final ExploreCategory? category;

  @override
  List<Object?> get props => [scope, category];
}

final exploreFilterProvider = Provider<ExploreFilter>(
  (ref) => ExploreFilter(
    scope: ref.watch(exploreScopeProvider),
    category: ref.watch(exploreCategoryProvider),
  ),
);

/// One paginated grid per (scope, category) pair, so switching back to a
/// filter you already browsed is instant.
class ExploreGridController extends PagedNotifier<Post> {
  ExploreGridController(this.filter);

  final ExploreFilter filter;

  @override
  Future<PagedResult<Post>> fetchPage(String? cursor) => ref
      .read(exploreRepositoryProvider)
      .getExplorePosts(
        scope: filter.scope,
        category: filter.category,
        cursor: cursor,
        limit: 18,
      );
}

final exploreGridProvider =
    AsyncNotifierProvider.family<
      ExploreGridController,
      PagedState<Post>,
      ExploreFilter
    >(ExploreGridController.new);

final trendingProvider =
    FutureProvider.family<List<TrendingTopic>, ExploreScope>(
      (ref, scope) => ref.watch(exploreRepositoryProvider).getTrending(scope),
    );

final searchResultsProvider = FutureProvider.autoDispose
    .family<SearchResults, String>(
      (ref, query) => ref.watch(exploreRepositoryProvider).search(query),
    );
