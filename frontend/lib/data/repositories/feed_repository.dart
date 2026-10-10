import 'package:blocks_app/data/models/discovery_models.dart';
import 'package:blocks_app/data/models/paged_result.dart';
import 'package:blocks_app/data/models/post.dart';

abstract interface class FeedRepository {
  /// Cursor-paginated home feed. Pass the previous `nextCursor` (null for
  /// the first page). Implementations must cap [limit].
  Future<PagedResult<Post>> getFeed(
    FeedType type, {
    String? cursor,
    int limit = 20,
  });
}
