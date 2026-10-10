import 'package:blocks_app/core/pagination/paged_notifier.dart';
import 'package:blocks_app/data/models/content_models.dart';
import 'package:blocks_app/data/models/paged_result.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class UserPostsController extends PagedNotifier<Post> {
  UserPostsController(this.userId);

  final String userId;

  @override
  Future<PagedResult<Post>> fetchPage(String? cursor) => ref
      .read(postRepositoryProvider)
      .getUserPosts(userId, cursor: cursor, limit: 18);
}

final userPostsProvider =
    AsyncNotifierProvider.family<UserPostsController, PagedState<Post>, String>(
      UserPostsController.new,
    );

class UserReelsController extends PagedNotifier<Reel> {
  UserReelsController(this.userId);

  final String userId;

  @override
  Future<PagedResult<Reel>> fetchPage(String? cursor) => ref
      .read(reelRepositoryProvider)
      .getUserReels(userId, cursor: cursor, limit: 18);
}

final userReelsProvider =
    AsyncNotifierProvider.family<UserReelsController, PagedState<Reel>, String>(
      UserReelsController.new,
    );

class TaggedPostsController extends PagedNotifier<Post> {
  TaggedPostsController(this.userId);

  final String userId;

  @override
  Future<PagedResult<Post>> fetchPage(String? cursor) => ref
      .read(postRepositoryProvider)
      .getTaggedPosts(userId, cursor: cursor, limit: 18);
}

final taggedPostsProvider =
    AsyncNotifierProvider.family<
      TaggedPostsController,
      PagedState<Post>,
      String
    >(TaggedPostsController.new);
