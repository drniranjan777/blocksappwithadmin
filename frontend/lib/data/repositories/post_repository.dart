import 'package:blocks_app/data/models/paged_result.dart';
import 'package:blocks_app/data/models/post.dart';

abstract interface class PostRepository {
  /// Throws `NotFoundFailure` for an unknown id.
  Future<Post> getPost(String id);

  Future<void> likePost(String id);
  Future<void> unlikePost(String id);
  Future<void> savePost(String id);
  Future<void> unsavePost(String id);
  Future<void> sharePost(String id);

  Future<PagedResult<Comment>> getComments(
    String postId, {
    String? cursor,
    int limit = 20,
  });
  Future<Comment> addComment(String postId, String text);

  /// Validates the draft (throws `ValidationFailure`) and publishes it.
  Future<Post> createPost(PostDraft draft);

  Future<PagedResult<Post>> getUserPosts(
    String userId, {
    String? cursor,
    int limit = 18,
  });

  /// Posts other people tagged [userId] in.
  Future<PagedResult<Post>> getTaggedPosts(
    String userId, {
    String? cursor,
    int limit = 18,
  });
}
