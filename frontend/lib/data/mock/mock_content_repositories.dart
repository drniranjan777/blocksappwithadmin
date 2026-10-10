import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/mock/mock_catalog.dart';
import 'package:blocks_app/data/mock/mock_factory.dart' show stableHash;
import 'package:blocks_app/data/mock/mock_paging.dart';
import 'package:blocks_app/data/mock/mock_world.dart';
import 'package:blocks_app/data/models/content_models.dart';
import 'package:blocks_app/data/models/discovery_models.dart';
import 'package:blocks_app/data/models/paged_result.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/data/repositories/feed_repository.dart';
import 'package:blocks_app/data/repositories/misc_repositories.dart';
import 'package:blocks_app/data/repositories/post_repository.dart';
import 'package:blocks_app/data/repositories/reel_repository.dart';
import 'package:blocks_app/data/repositories/story_repository.dart';
import 'package:blocks_app/features/create/domain/post_draft_validator.dart';

const _feedLength = 400;

class MockFeedRepository implements FeedRepository {
  MockFeedRepository(this._w);
  final MockWorld _w;

  @override
  Future<PagedResult<Post>> getFeed(
    FeedType type, {
    String? cursor,
    int limit = 20,
  }) async {
    await _w.pause();
    final hidden = _w.hiddenUserIds;
    final page = pageByIndex<Post>(
      cursor: cursor,
      limit: limit,
      total: _feedLength,
      build: (i) => _w.factory.tryPost('p~feed~${type.name}~$i'),
      keep: (p) => !hidden.contains(p.author.id),
    );
    if (cursor != null) return page;

    // The user's own new posts lead the personal feeds.
    final own = switch (type) {
      FeedType.forYou || FeedType.following || FeedType.nearYou =>
        _w.createdPosts.reversed.map((p) => _w.factory.post(p.id)).toList(),
      _ => <Post>[],
    };
    return PagedResult(
      items: [...own, ...page.items],
      nextCursor: page.nextCursor,
    );
  }
}

class MockPostRepository implements PostRepository {
  MockPostRepository(this._w);
  final MockWorld _w;

  /// Comments are shared by posts and reels.
  void _ensureContent(String id) {
    if (_w.factory.tryPost(id) == null && _w.factory.tryReel(id) == null) {
      throw NotFoundFailure('Content $id not found');
    }
  }

  @override
  Future<Post> getPost(String id) async {
    await _w.pause();
    return _w.factory.post(id);
  }

  @override
  Future<void> likePost(String id) async {
    _w.factory.post(id); // throws NotFoundFailure for unknown ids
    _w.liked.add(id);
  }

  @override
  Future<void> unlikePost(String id) async => _w.liked.remove(id);

  @override
  Future<void> savePost(String id) async {
    _w.factory.post(id);
    _w.saved.add(id);
  }

  @override
  Future<void> unsavePost(String id) async => _w.saved.remove(id);

  @override
  Future<void> sharePost(String id) async {
    _w.factory.post(id);
    _w.shareBumps.update(id, (v) => v + 1, ifAbsent: () => 1);
  }

  @override
  Future<PagedResult<Comment>> getComments(
    String postId, {
    String? cursor,
    int limit = 20,
  }) async {
    await _w.pause();
    _ensureContent(postId);
    final page = pageByIndex<Comment>(
      cursor: cursor,
      limit: limit,
      total: 40,
      build: (i) => _w.factory.comment(postId, i),
      keep: (c) => !_w.hiddenUserIds.contains(c.author.id),
    );
    if (cursor != null) return page;
    final mine = _w.myComments[postId] ?? const <Comment>[];
    return PagedResult(
      items: [...mine.reversed, ...page.items],
      nextCursor: page.nextCursor,
    );
  }

  @override
  Future<Comment> addComment(String postId, String text) async {
    await _w.pause();
    _ensureContent(postId);
    final trimmed = text.trim();
    if (trimmed.isEmpty) throw const ValidationFailure('commentEmpty');
    final c = Comment(
      id: _w.nextId('c~mine'),
      author: _w.me.summary,
      text: trimmed,
      createdAt: _w.now(),
    );
    _w.myComments.putIfAbsent(postId, () => []).add(c);
    return c;
  }

  @override
  Future<Post> createPost(PostDraft draft) async {
    await _w.pause();
    PostDraftValidator.ensureValid(draft);
    final id = _w.nextId('p~mine');
    final caption = draft.caption.trim();
    final post = Post(
      id: id,
      author: _w.me.summary,
      type: draft.type,
      mediaUrl: draft.mediaUrl,
      caption: caption,
      hashtags: extractHashtags(caption),
      district: draft.district,
      state: draft.state,
      createdAt: _w.now(),
      stats: const PostStats(),
      qualifiedReach: 0,
      durationSeconds: draft.type == PostType.video ? 30 : null,
    );
    _w.createdPosts.add(post);
    _w.me = _w.me.copyWith(postsCount: _w.me.postsCount + 1);
    return post;
  }

  @override
  Future<PagedResult<Post>> getUserPosts(
    String userId, {
    String? cursor,
    int limit = 18,
  }) async {
    await _w.pause();
    if (userId != meId) seedById(userId); // throws NotFoundFailure
    final page = pageByIndex<Post>(
      cursor: cursor,
      limit: limit,
      total: 64,
      build: (i) => _w.factory.tryPost('p~user~$userId~$i'),
    );
    if (cursor != null || userId != meId) return page;
    final own = _w.createdPosts.reversed.map((p) => _w.factory.post(p.id));
    return PagedResult(
      items: [...own, ...page.items],
      nextCursor: page.nextCursor,
    );
  }

  @override
  Future<PagedResult<Post>> getTaggedPosts(
    String userId, {
    String? cursor,
    int limit = 18,
  }) async {
    await _w.pause();
    if (userId != meId) seedById(userId);
    // Deterministic per user: a different slice of the district feed.
    final offset = stableHash(userId) % 40;
    final hidden = _w.hiddenUserIds;
    return pageByIndex<Post>(
      cursor: cursor,
      limit: limit,
      total: 30,
      build: (i) => _w.factory.tryPost('p~explore~india~all~${i + offset}'),
      keep: (p) => !hidden.contains(p.author.id) && p.author.id != userId,
    );
  }
}

class MockStoryRepository implements StoryRepository {
  MockStoryRepository(this._w);
  final MockWorld _w;

  @override
  Future<List<StoryGroup>> getStoryGroups() async {
    await _w.pause();
    final hidden = _w.hiddenUserIds;
    return _w.factory
        .storyGroups()
        .where((g) => g.isOwn || !hidden.contains(g.user.id))
        .toList();
  }

  @override
  Future<void> markViewed(String groupId) async =>
      _w.viewedStories.add(groupId);

  @override
  Future<StoryItem> addStory({
    required String mediaUrl,
    String? caption,
  }) async {
    await _w.pause();
    final item = StoryItem(
      id: _w.nextId('s~mine'),
      mediaUrl: mediaUrl,
      caption: caption?.trim().isEmpty ?? true ? null : caption!.trim(),
      createdAt: _w.now(),
    );
    _w.myStories.insert(0, item);
    return item;
  }
}

class MockReelRepository implements ReelRepository {
  MockReelRepository(this._w);
  final MockWorld _w;

  @override
  Future<PagedResult<Reel>> getReels({
    String? cursor,
    int limit = 8,
    ReelFeed feed = ReelFeed.forYou,
  }) async {
    await _w.pause();
    final hidden = _w.hiddenUserIds;
    final following = feed == ReelFeed.following;
    final page = pageByIndex<Reel>(
      cursor: cursor,
      limit: limit,
      total: 120,
      build: (i) => _w.factory.tryReel('r~feed~$i'),
      keep: (r) =>
          !hidden.contains(r.author.id) &&
          (!following || _w.following.contains(r.author.id)),
    );
    // Your own new reels lead For You; they are not "people you follow".
    if (cursor != null || following) return page;
    final own = _w.createdReels.reversed.map((r) => _w.factory.tryReel(r.id)!);
    return PagedResult(
      items: [...own, ...page.items],
      nextCursor: page.nextCursor,
    );
  }

  @override
  Future<PagedResult<Reel>> getUserReels(
    String userId, {
    String? cursor,
    int limit = 18,
  }) async {
    await _w.pause();
    final page = pageByIndex<Reel>(
      cursor: cursor,
      limit: limit,
      total: 24,
      build: (i) => _w.factory.tryReel('r~user~$userId~$i'),
    );
    if (cursor != null || userId != meId) return page;
    final own = _w.createdReels.reversed.map((r) => _w.factory.tryReel(r.id)!);
    return PagedResult(
      items: [...own, ...page.items],
      nextCursor: page.nextCursor,
    );
  }

  Reel _require(String id) =>
      _w.factory.tryReel(id) ?? (throw NotFoundFailure('Reel $id not found'));

  @override
  Future<void> likeReel(String id) async {
    _require(id);
    _w.liked.add(id);
  }

  @override
  Future<void> unlikeReel(String id) async => _w.liked.remove(id);

  @override
  Future<void> saveReel(String id) async {
    _require(id);
    _w.saved.add(id);
  }

  @override
  Future<void> unsaveReel(String id) async => _w.saved.remove(id);

  @override
  Future<void> shareReel(String id) async {
    _require(id);
    _w.shareBumps.update(id, (v) => v + 1, ifAbsent: () => 1);
  }
}

class MockExploreRepository implements ExploreRepository {
  MockExploreRepository(this._w);
  final MockWorld _w;

  @override
  Future<List<TrendingTopic>> getTrending(ExploreScope scope) async {
    await _w.pause();
    final titles = switch (scope) {
      ExploreScope.district => const [
        'Hyderabad Food Festival',
        'Local Business Expo',
        'Hyderabad Tech Meetup',
        'Ganesh Festival',
        'Charminar Night Walk',
      ],
      ExploreScope.state => const [
        'Bathukamma Celebrations',
        'Telangana Handloom Fest',
        'T-Hub Startup Week',
        'Godavari Floods Relief',
        'Kakatiya Heritage Walk',
      ],
      ExploreScope.india => const [
        'Diwali Preparations',
        'Asia Cup Final',
        'Digital India Hackathon',
        'Monsoon Travel Diaries',
        'Millet Recipes',
      ],
      ExploreScope.global => const [
        'Indian Diaspora Stories',
        'Yoga Day Worldwide',
        'Cricket World Cup Fans',
        'Street Food Around the World',
        'Bollywood Dance Challenge',
      ],
    };
    return [
      for (var i = 0; i < titles.length; i++)
        TrendingTopic(
          id: '${scope.name}~$i',
          title: titles[i],
          postCount: (48000 - i * 7300) ~/ (scope.index + 1) + 900,
          scope: scope,
        ),
    ];
  }

  @override
  Future<PagedResult<Post>> getExplorePosts({
    required ExploreScope scope,
    ExploreCategory? category,
    String? cursor,
    int limit = 18,
  }) async {
    await _w.pause();
    final hidden = _w.hiddenUserIds;
    return pageByIndex<Post>(
      cursor: cursor,
      limit: limit,
      total: 240,
      build: (i) => _w.factory.tryPost(
        'p~explore~${scope.name}~${category?.name ?? 'all'}~$i',
      ),
      keep: (p) => !hidden.contains(p.author.id),
    );
  }

  @override
  Future<SearchResults> search(String query) async {
    await _w.pause();
    final q = query.trim().toLowerCase().replaceFirst('#', '');
    if (q.isEmpty) return const SearchResults();

    final users = kUserSeeds
        .where(
          (u) =>
              u.name.toLowerCase().contains(q) ||
              u.handle.toLowerCase().contains(q),
        )
        .take(8)
        .map((u) => _w.factory.summaryOf(u.id))
        .toList();

    final tags = <String>{};
    for (final t in kThemes) {
      for (final tag in t.tags) {
        if (tag.contains('{d}')) continue;
        if (tag.toLowerCase().contains(q)) tags.add(tag);
      }
    }

    final posts = <Post>[];
    for (var i = 0; i < 80 && posts.length < 6; i++) {
      final p = _w.factory.tryPost('p~explore~india~all~$i');
      if (p != null && p.caption.toLowerCase().contains(q)) posts.add(p);
    }
    return SearchResults(
      users: users,
      hashtags: tags.take(6).toList(),
      posts: posts,
    );
  }
}
