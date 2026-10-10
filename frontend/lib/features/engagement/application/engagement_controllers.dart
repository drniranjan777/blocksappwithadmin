import 'package:blocks_app/data/models/content_models.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/profile/application/user_providers.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// The user's own interaction with one piece of content. Every card for the
/// same post/reel reads this overlay, so a like on Explore shows on Home
/// instantly — without refetching or mutating the paged lists.
class ContentInteraction extends Equatable {
  const ContentInteraction({
    required this.isLiked,
    required this.isSaved,
    required this.likes,
    required this.saves,
    required this.shares,
    required this.comments,
  });

  final bool isLiked;
  final bool isSaved;
  final int likes;
  final int saves;
  final int shares;
  final int comments;

  ContentInteraction copyWith({
    bool? isLiked,
    bool? isSaved,
    int? likes,
    int? saves,
    int? shares,
    int? comments,
  }) {
    return ContentInteraction(
      isLiked: isLiked ?? this.isLiked,
      isSaved: isSaved ?? this.isSaved,
      likes: likes ?? this.likes,
      saves: saves ?? this.saves,
      shares: shares ?? this.shares,
      comments: comments ?? this.comments,
    );
  }

  @override
  List<Object?> get props => [isLiked, isSaved, likes, saves, shares, comments];
}

/// What a comments/share sheet needs to know about the content it acts on —
/// identical for posts and reels.
class ContentRef {
  const ContentRef({
    required this.id,
    required this.interaction,
    this.isReel = false,
  });

  final String id;
  final ContentInteraction interaction;
  final bool isReel;
}

extension PostContentRef on Post {
  ContentRef get ref => ContentRef(id: id, interaction: asInteraction);
}

extension ReelContentRef on Reel {
  ContentRef get ref =>
      ContentRef(id: id, interaction: asInteraction, isReel: true);
}

extension PostInteractionOverlay on Post {
  Post withInteraction(ContentInteraction? i) {
    if (i == null) return this;
    return copyWith(
      isLiked: i.isLiked,
      isSaved: i.isSaved,
      stats: stats.copyWith(
        likes: i.likes,
        saves: i.saves,
        shares: i.shares,
        comments: i.comments,
      ),
    );
  }

  ContentInteraction get asInteraction => ContentInteraction(
    isLiked: isLiked,
    isSaved: isSaved,
    likes: stats.likes,
    saves: stats.saves,
    shares: stats.shares,
    comments: stats.comments,
  );
}

extension ReelInteractionOverlay on Reel {
  Reel withInteraction(ContentInteraction? i) {
    if (i == null) return this;
    return copyWith(
      isLiked: i.isLiked,
      isSaved: i.isSaved,
      stats: stats.copyWith(
        likes: i.likes,
        saves: i.saves,
        shares: i.shares,
        comments: i.comments,
      ),
    );
  }

  ContentInteraction get asInteraction => ContentInteraction(
    isLiked: isLiked,
    isSaved: isSaved,
    likes: stats.likes,
    saves: stats.saves,
    shares: stats.shares,
    comments: stats.comments,
  );
}

/// Optimistic like/save/share for posts AND reels (ids are globally unique).
/// UI updates immediately; the repository call follows, and a failure rolls
/// the change back.
class InteractionsController extends Notifier<Map<String, ContentInteraction>> {
  @override
  Map<String, ContentInteraction> build() => const {};

  ContentInteraction? of(String id) => state[id];

  Future<void> toggleLike(Post post) => _toggle(
    id: post.id,
    current: post.asInteraction,
    change: (c) =>
        c.copyWith(isLiked: !c.isLiked, likes: c.likes + (c.isLiked ? -1 : 1)),
    remote: (liked) => liked
        ? ref.read(postRepositoryProvider).likePost(post.id)
        : ref.read(postRepositoryProvider).unlikePost(post.id),
    flag: (c) => c.isLiked,
  );

  Future<void> toggleLikeReel(Reel reel) => _toggle(
    id: reel.id,
    current: reel.asInteraction,
    change: (c) =>
        c.copyWith(isLiked: !c.isLiked, likes: c.likes + (c.isLiked ? -1 : 1)),
    remote: (liked) => liked
        ? ref.read(reelRepositoryProvider).likeReel(reel.id)
        : ref.read(reelRepositoryProvider).unlikeReel(reel.id),
    flag: (c) => c.isLiked,
  );

  Future<void> toggleSave(Post post) => _toggle(
    id: post.id,
    current: post.asInteraction,
    change: (c) =>
        c.copyWith(isSaved: !c.isSaved, saves: c.saves + (c.isSaved ? -1 : 1)),
    remote: (saved) => saved
        ? ref.read(postRepositoryProvider).savePost(post.id)
        : ref.read(postRepositoryProvider).unsavePost(post.id),
    flag: (c) => c.isSaved,
  );

  Future<void> toggleSaveReel(Reel reel) => _toggle(
    id: reel.id,
    current: reel.asInteraction,
    change: (c) =>
        c.copyWith(isSaved: !c.isSaved, saves: c.saves + (c.isSaved ? -1 : 1)),
    remote: (saved) => saved
        ? ref.read(reelRepositoryProvider).saveReel(reel.id)
        : ref.read(reelRepositoryProvider).unsaveReel(reel.id),
    flag: (c) => c.isSaved,
  );

  Future<void> share(ContentRef content) async {
    final current = state[content.id] ?? content.interaction;
    state = {
      ...state,
      content.id: current.copyWith(shares: current.shares + 1),
    };
    try {
      content.isReel
          ? await ref.read(reelRepositoryProvider).shareReel(content.id)
          : await ref.read(postRepositoryProvider).sharePost(content.id);
    } on Object {
      state = {...state, content.id: current};
    }
  }

  /// Reflects a freshly added comment in every card showing [content].
  void commentAdded(ContentRef content) {
    final current = state[content.id] ?? content.interaction;
    state = {
      ...state,
      content.id: current.copyWith(comments: current.comments + 1),
    };
  }

  Future<void> _toggle({
    required String id,
    required ContentInteraction current,
    required ContentInteraction Function(ContentInteraction) change,
    required Future<void> Function(bool nowOn) remote,
    required bool Function(ContentInteraction) flag,
  }) async {
    final before = state[id] ?? current;
    final after = change(before);
    state = {...state, id: after};
    try {
      await remote(flag(after));
    } on Object {
      state = {...state, id: before};
    }
  }
}

final interactionsProvider =
    NotifierProvider<InteractionsController, Map<String, ContentInteraction>>(
      InteractionsController.new,
    );

/// Watch-friendly selector for one item's overlay.
final interactionProvider = Provider.family<ContentInteraction?, String>(
  (ref, id) => ref.watch(interactionsProvider.select((m) => m[id])),
);

/// Who the signed-in user follows. Optimistic toggle with rollback.
class FollowingController extends AsyncNotifier<Set<String>> {
  @override
  Future<Set<String>> build() =>
      ref.read(userRepositoryProvider).getFollowingIds();

  Future<void> toggle(String userId) async {
    final before = state.value ?? <String>{};
    final nowFollowing = !before.contains(userId);
    state = AsyncData(
      nowFollowing ? {...before, userId} : ({...before}..remove(userId)),
    );
    try {
      final repo = ref.read(userRepositoryProvider);
      nowFollowing ? await repo.follow(userId) : await repo.unfollow(userId);
      ref.invalidate(currentUserProvider);
    } on Object {
      state = AsyncData(before);
    }
  }
}

final followingProvider =
    AsyncNotifierProvider<FollowingController, Set<String>>(
      FollowingController.new,
    );

final isFollowingProvider = Provider.family<bool, String>(
  (ref, userId) => ref.watch(
    followingProvider.select((v) => v.value?.contains(userId) ?? false),
  ),
);
