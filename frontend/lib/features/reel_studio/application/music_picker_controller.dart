import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/models/music_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class MusicPickerState extends Equatable {
  const MusicPickerState({
    this.query = '',
    this.category,
    this.tracks = const [],
    this.trending = const [],
    this.nextCursor,
    this.isLoading = true,
    this.isLoadingMore = false,
    this.hasError = false,
  });

  final String query;

  /// Null = "All".
  final MusicCategory? category;
  final List<MusicTrack> tracks;
  final List<MusicTrack> trending;
  final String? nextCursor;
  final bool isLoading;
  final bool isLoadingMore;
  final bool hasError;

  bool get hasMore => nextCursor != null;
  bool get isSearching => query.trim().isNotEmpty;

  /// Trending shows up front only when nothing narrows the list.
  bool get showsTrending => !isSearching && category == null;

  MusicPickerState copyWith({
    String? query,
    MusicCategory? category,
    bool clearCategory = false,
    List<MusicTrack>? tracks,
    List<MusicTrack>? trending,
    String? nextCursor,
    bool clearCursor = false,
    bool? isLoading,
    bool? isLoadingMore,
    bool? hasError,
  }) => MusicPickerState(
    query: query ?? this.query,
    category: clearCategory ? null : (category ?? this.category),
    tracks: tracks ?? this.tracks,
    trending: trending ?? this.trending,
    nextCursor: clearCursor ? null : (nextCursor ?? this.nextCursor),
    isLoading: isLoading ?? this.isLoading,
    isLoadingMore: isLoadingMore ?? this.isLoadingMore,
    hasError: hasError ?? this.hasError,
  );

  @override
  List<Object?> get props => [
    query,
    category,
    tracks,
    trending,
    nextCursor,
    isLoading,
    isLoadingMore,
    hasError,
  ];
}

/// Browse, search and page through the music library.
///
/// A request that is overtaken by a newer one (typing fast, switching
/// category) is dropped when it returns, so an old answer can never replace a
/// newer one.
class MusicPickerController extends Notifier<MusicPickerState> {
  int _generation = 0;

  @override
  MusicPickerState build() {
    Future.microtask(_load);
    return const MusicPickerState();
  }

  Future<void> _load() async {
    final gen = ++_generation;
    final repo = ref.read(musicRepositoryProvider);
    state = state.copyWith(isLoading: true, hasError: false);
    try {
      final trending = state.trending.isEmpty
          ? await repo.getTrending()
          : state.trending;
      final page = await repo.browse(
        category: state.category,
        query: state.query,
      );
      if (gen != _generation) return;
      state = state.copyWith(
        trending: trending,
        tracks: page.items,
        nextCursor: page.nextCursor,
        clearCursor: page.nextCursor == null,
        isLoading: false,
      );
    } on AppFailure {
      if (gen != _generation) return;
      state = state.copyWith(isLoading: false, hasError: true);
    }
  }

  void setQuery(String query) {
    if (query == state.query) return;
    state = state.copyWith(query: query);
    _load();
  }

  void setCategory(MusicCategory? category) {
    if (category == state.category) return;
    state = category == null
        ? state.copyWith(clearCategory: true)
        : state.copyWith(category: category);
    _load();
  }

  Future<void> retry() => _load();

  Future<void> loadMore() async {
    final cursor = state.nextCursor;
    if (cursor == null || state.isLoadingMore || state.isLoading) return;
    final gen = _generation;
    state = state.copyWith(isLoadingMore: true);
    try {
      final page = await ref
          .read(musicRepositoryProvider)
          .browse(category: state.category, query: state.query, cursor: cursor);
      if (gen != _generation) return;
      state = state.copyWith(
        tracks: [...state.tracks, ...page.items],
        nextCursor: page.nextCursor,
        clearCursor: page.nextCursor == null,
        isLoadingMore: false,
      );
    } on AppFailure {
      if (gen != _generation) return;
      state = state.copyWith(isLoadingMore: false);
    }
  }
}

final musicPickerProvider =
    NotifierProvider.autoDispose<MusicPickerController, MusicPickerState>(
      MusicPickerController.new,
    );
