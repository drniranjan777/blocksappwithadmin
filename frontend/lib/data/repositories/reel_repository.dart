import 'package:blocks_app/data/models/content_models.dart';
import 'package:blocks_app/data/models/paged_result.dart';

/// Which reels feed to load. `forYou` is the recommendation feed (production:
/// served by the recommendation service); `following` only has creators the
/// signed-in user follows.
enum ReelFeed { forYou, following }

abstract interface class ReelRepository {
  Future<PagedResult<Reel>> getReels({
    String? cursor,
    int limit = 8,
    ReelFeed feed = ReelFeed.forYou,
  });
  Future<PagedResult<Reel>> getUserReels(
    String userId, {
    String? cursor,
    int limit = 18,
  });
  Future<void> likeReel(String id);
  Future<void> unlikeReel(String id);
  Future<void> saveReel(String id);
  Future<void> unsaveReel(String id);
  Future<void> shareReel(String id);
}
