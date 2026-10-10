import 'package:blocks_app/core/pagination/paged_notifier.dart';
import 'package:blocks_app/data/models/paged_result.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// A single post (detail screen). Invalidate after changing its reach.
final postProvider = FutureProvider.family<Post, String>(
  (ref, id) => ref.watch(postRepositoryProvider).getPost(id),
);

class CommentsController extends PagedNotifier<Comment> {
  CommentsController(this.postId);

  final String postId;

  @override
  Future<PagedResult<Comment>> fetchPage(String? cursor) => ref
      .read(postRepositoryProvider)
      .getComments(postId, cursor: cursor, limit: 15);

  Future<void> add(String text) async {
    final comment = await ref
        .read(postRepositoryProvider)
        .addComment(postId, text);
    prepend(comment);
  }
}

final commentsControllerProvider =
    AsyncNotifierProvider.family<
      CommentsController,
      PagedState<Comment>,
      String
    >(CommentsController.new);
