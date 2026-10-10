import 'package:blocks_app/data/api/api_client.dart';
import 'package:blocks_app/data/api/api_feed_repository.dart';
import 'package:blocks_app/data/api/content_kinds.dart';
import 'package:blocks_app/data/api/mappers.dart';
import 'package:blocks_app/data/models/content_models.dart';
import 'package:blocks_app/data/models/discovery_models.dart';
import 'package:blocks_app/data/models/paged_result.dart';
import 'package:blocks_app/data/repositories/reel_repository.dart';

/// Reels for the full-screen player, and engagement with them.
///
/// A reel that is still being processed has no playable video yet and is left
/// out of a list rather than shown broken.
class ApiReelRepository implements ReelRepository {
  ApiReelRepository(this._api, this._floor, this._kinds);

  final ApiClient _api;
  final Future<ReachFloor> Function() _floor;
  final ContentKinds _kinds;

  // "For You" has no stream of its own on the server yet: see [feedScopeOf].
  static String _scope(ReelFeed feed) => feedScopeOf(
    feed == ReelFeed.following ? FeedType.following : FeedType.forYou,
  );

  @override
  Future<PagedResult<Reel>> getReels({
    String? cursor,
    int limit = 8,
    ReelFeed feed = ReelFeed.forYou,
  }) async {
    final answer = await _api.get(
      '/feed/reels',
      query: {
        'scope': _scope(feed),
        'cursor': cursor,
        'limit': clampPage(limit),
      },
    );
    final floor = await _floor();
    final reels = <Reel>[];
    for (final item in answer.objects()) {
      if (item.string('kind') != 'reel') continue;
      final reel = reelFromView(item.object('reel'), floor: floor);
      if (reel == null) continue;
      _kinds.markReel(reel.id);
      reels.add(reel);
    }
    return PagedResult(
      items: reels,
      nextCursor: answer.hasMore ? answer.nextCursor : null,
    );
  }

  @override
  Future<PagedResult<Reel>> getUserReels(
    String userId, {
    String? cursor,
    int limit = 18,
  }) async {
    final answer = await _api.get(
      '/profiles/${seg(userId)}/reels',
      query: {'cursor': cursor, 'limit': clampPage(limit)},
    );
    final floor = await _floor();
    final reels = <Reel>[];
    for (final view in answer.objects()) {
      final reel = reelFromView(view, floor: floor);
      if (reel == null) continue;
      _kinds.markReel(reel.id);
      reels.add(reel);
    }
    return PagedResult(
      items: reels,
      nextCursor: answer.hasMore ? answer.nextCursor : null,
    );
  }

  @override
  Future<void> likeReel(String id) async {
    await _api.post('/reels/${seg(id)}/like');
  }

  @override
  Future<void> unlikeReel(String id) async {
    await _api.delete('/reels/${seg(id)}/like');
  }

  @override
  Future<void> saveReel(String id) async {
    await _api.post('/reels/${seg(id)}/save');
  }

  @override
  Future<void> unsaveReel(String id) async {
    await _api.delete('/reels/${seg(id)}/save');
  }

  @override
  Future<void> shareReel(String id) async {
    await _api.post('/reels/${seg(id)}/share', body: {'channel': 'LINK'});
  }
}
