import 'package:blocks_app/data/api/api_client.dart';
import 'package:blocks_app/data/api/content_kinds.dart';
import 'package:blocks_app/data/api/mappers.dart';
import 'package:blocks_app/data/models/discovery_models.dart';
import 'package:blocks_app/data/models/paged_result.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/data/repositories/feed_repository.dart';

/// Which of the API's feeds each home tab shows.
///
/// The API has five streams, all newest-first: `following` (people you follow,
/// and you), `local` (your district), `state`, and `national` / `global` (only
/// what has earned that rung of the Reach Ladder). It has no ranking model yet,
/// so two tabs have no stream of their own and are honest stand-ins:
///
///  * **For You** shows the `following` stream (the same as Following).
///  * **Rising** shows the `state` stream.
///
/// Both change here, in one place, when the server grows them.
String feedScopeOf(FeedType type) => switch (type) {
  FeedType.following || FeedType.forYou => 'following',
  FeedType.nearYou => 'local',
  FeedType.rising => 'state',
  FeedType.india => 'national',
};

/// The home feed against the real API: posts and reels in one stream.
class ApiFeedRepository implements FeedRepository {
  ApiFeedRepository(this._api, this._floor, this._kinds);

  final ApiClient _api;
  final Future<ReachFloor> Function() _floor;
  final ContentKinds _kinds;

  @override
  Future<PagedResult<Post>> getFeed(
    FeedType type, {
    String? cursor,
    int limit = 20,
  }) async {
    final answer = await _api.get(
      '/feed',
      query: {
        'scope': feedScopeOf(type),
        'cursor': cursor,
        'limit': clampPage(limit),
      },
    );
    final floor = await _floor();
    final posts = <Post>[];
    for (final item in answer.objects()) {
      switch (item.string('kind')) {
        case 'post':
          posts.add(postFromView(item.object('post'), floor: floor));
        case 'reel':
          final reel = item.object('reel');
          _kinds.markReel(reel.string('id'));
          posts.add(postFromReelView(reel, floor: floor));
        // A kind this app version does not know is left out, not an error.
      }
    }
    return PagedResult(
      items: posts,
      nextCursor: answer.hasMore ? answer.nextCursor : null,
    );
  }
}
