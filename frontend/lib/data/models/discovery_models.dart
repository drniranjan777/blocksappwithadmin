import 'package:blocks_app/data/models/app_user.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:equatable/equatable.dart';

enum FeedType { following, forYou, rising, nearYou, india }

enum ExploreScope { district, state, india, global }

enum ExploreCategory {
  news,
  entertainment,
  education,
  business,
  food,
  travel,
  technology,
  sports,
  agriculture,
  fashion,
  local,
  jobs,
  events,
}

class TrendingTopic extends Equatable {
  const TrendingTopic({
    required this.id,
    required this.title,
    required this.postCount,
    required this.scope,
  });

  final String id;
  final String title;
  final int postCount;
  final ExploreScope scope;

  @override
  List<Object?> get props => [id, title, postCount, scope];
}

class SearchResults extends Equatable {
  const SearchResults({
    this.users = const [],
    this.hashtags = const [],
    this.posts = const [],
  });

  final List<UserSummary> users;
  final List<String> hashtags;
  final List<Post> posts;

  bool get isEmpty => users.isEmpty && hashtags.isEmpty && posts.isEmpty;

  @override
  List<Object?> get props => [users, hashtags, posts];
}
