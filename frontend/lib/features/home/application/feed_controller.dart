import 'package:blocks_app/core/pagination/paged_notifier.dart';
import 'package:blocks_app/data/models/discovery_models.dart';
import 'package:blocks_app/data/models/paged_result.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Which home tab is selected (kept in a provider so it survives rebuilds).
class SelectedFeed extends Notifier<FeedType> {
  @override
  FeedType build() => FeedType.forYou;

  void select(FeedType type) => state = type;
}

final selectedFeedProvider = NotifierProvider<SelectedFeed, FeedType>(
  SelectedFeed.new,
);

/// One independently paginated controller per feed tab.
class FeedController extends PagedNotifier<Post> {
  FeedController(this.type);

  final FeedType type;

  @override
  Future<PagedResult<Post>> fetchPage(String? cursor) =>
      ref.read(feedRepositoryProvider).getFeed(type, cursor: cursor, limit: 12);
}

final feedControllerProvider =
    AsyncNotifierProvider.family<FeedController, PagedState<Post>, FeedType>(
      FeedController.new,
    );
