import 'package:blocks_app/core/pagination/content_epoch.dart';
import 'package:blocks_app/data/models/paged_result.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class PagedState<T> extends Equatable {
  const PagedState({
    required this.items,
    required this.nextCursor,
    this.isLoadingMore = false,
    this.loadMoreFailed = false,
  });

  final List<T> items;
  final String? nextCursor;
  final bool isLoadingMore;
  final bool loadMoreFailed;

  bool get hasMore => nextCursor != null;
  bool get isEmpty => items.isEmpty;

  PagedState<T> copyWith({
    List<T>? items,
    String? nextCursor,
    bool clearCursor = false,
    bool? isLoadingMore,
    bool? loadMoreFailed,
  }) {
    return PagedState<T>(
      items: items ?? this.items,
      nextCursor: clearCursor ? null : (nextCursor ?? this.nextCursor),
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      loadMoreFailed: loadMoreFailed ?? this.loadMoreFailed,
    );
  }

  @override
  List<Object?> get props => [items, nextCursor, isLoadingMore, loadMoreFailed];
}

/// Base for every cursor-paginated list in the app (feeds, grids, comments,
/// notifications...). Subclasses only say how to fetch a page; this class
/// owns first-load, load-more (de-duplicated), refresh and error state, so
/// lists never hold more than what the user has scrolled through.
abstract class PagedNotifier<T> extends AsyncNotifier<PagedState<T>> {
  /// Fetches one page. [cursor] is null for the first page.
  Future<PagedResult<T>> fetchPage(String? cursor);

  @override
  Future<PagedState<T>> build() async {
    // Re-fetch automatically when visibility rules change (block/mute...).
    ref.watch(contentEpochProvider);
    final page = await fetchPage(null);
    return PagedState(items: page.items, nextCursor: page.nextCursor);
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || !current.hasMore || current.isLoadingMore) return;

    state = AsyncData(
      current.copyWith(isLoadingMore: true, loadMoreFailed: false),
    );
    try {
      final page = await fetchPage(current.nextCursor);
      final latest = state.value ?? current;
      state = AsyncData(
        latest.copyWith(
          items: [...latest.items, ...page.items],
          nextCursor: page.nextCursor,
          clearCursor: page.nextCursor == null,
          isLoadingMore: false,
        ),
      );
    } on Object {
      final latest = state.value ?? current;
      state = AsyncData(
        latest.copyWith(isLoadingMore: false, loadMoreFailed: true),
      );
    }
  }

  Future<void> refresh() async {
    ref.invalidateSelf();
    await future;
  }

  /// Inserts an item at the top without refetching (e.g. a just-created post).
  void prepend(T item) {
    final current = state.value;
    if (current == null) return;
    state = AsyncData(current.copyWith(items: [item, ...current.items]));
  }
}
