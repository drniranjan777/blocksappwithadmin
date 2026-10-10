import 'package:blocks_app/data/models/app_user.dart';
import 'package:blocks_app/data/models/profile_models.dart';
import 'package:equatable/equatable.dart';

enum PostType { image, video, text }

enum PostAudience { everyone, followers, closeFriends, private }

class PostStats extends Equatable {
  const PostStats({
    this.likes = 0,
    this.comments = 0,
    this.shares = 0,
    this.saves = 0,
    this.views = 0,
  });

  final int likes;
  final int comments;
  final int shares;
  final int saves;
  final int views;

  PostStats copyWith({
    int? likes,
    int? comments,
    int? shares,
    int? saves,
    int? views,
  }) {
    return PostStats(
      likes: likes ?? this.likes,
      comments: comments ?? this.comments,
      shares: shares ?? this.shares,
      saves: saves ?? this.saves,
      views: views ?? this.views,
    );
  }

  @override
  List<Object?> get props => [likes, comments, shares, saves, views];
}

class Post extends Equatable {
  const Post({
    required this.id,
    required this.author,
    required this.type,
    required this.caption,
    required this.district,
    required this.state,
    required this.createdAt,
    required this.stats,
    required this.qualifiedReach,
    this.mediaUrl,
    this.hashtags = const [],
    this.isLiked = false,
    this.isSaved = false,
    this.durationSeconds,
    this.isBusinessPost = false,
  });

  final String id;
  final UserSummary author;
  final PostType type;

  /// Canonical media URL; the UI resolves renditions via `BlocksImage`.
  final String? mediaUrl;
  final String caption;
  final List<String> hashtags;
  final String district;
  final String state;
  final DateTime createdAt;
  final PostStats stats;

  /// Qualified (bot-filtered) reach. The Reach Level is derived from this by
  /// `ReachCalculator`, never stored on the client.
  final int qualifiedReach;
  final bool isLiked;
  final bool isSaved;
  final int? durationSeconds;
  final bool isBusinessPost;

  String get location => '$district • $state';

  Post copyWith({
    PostStats? stats,
    bool? isLiked,
    bool? isSaved,
    int? qualifiedReach,
  }) {
    return Post(
      id: id,
      author: author,
      type: type,
      caption: caption,
      district: district,
      state: state,
      createdAt: createdAt,
      stats: stats ?? this.stats,
      qualifiedReach: qualifiedReach ?? this.qualifiedReach,
      mediaUrl: mediaUrl,
      hashtags: hashtags,
      isLiked: isLiked ?? this.isLiked,
      isSaved: isSaved ?? this.isSaved,
      durationSeconds: durationSeconds,
      isBusinessPost: isBusinessPost,
    );
  }

  @override
  List<Object?> get props => [
    id,
    author,
    type,
    mediaUrl,
    caption,
    hashtags,
    district,
    state,
    createdAt,
    stats,
    qualifiedReach,
    isLiked,
    isSaved,
    durationSeconds,
    isBusinessPost,
  ];
}

class Comment extends Equatable {
  const Comment({
    required this.id,
    required this.author,
    required this.text,
    required this.createdAt,
    this.likes = 0,
  });

  final String id;
  final UserSummary author;
  final String text;
  final DateTime createdAt;
  final int likes;

  @override
  List<Object?> get props => [id, author, text, createdAt, likes];
}

/// What the Create Post flow submits.
class PostDraft extends Equatable {
  const PostDraft({
    required this.type,
    required this.caption,
    required this.district,
    required this.state,
    this.mediaUrl,
    this.photo,
    this.audience = PostAudience.everyone,
  });

  final PostType type;

  /// The demo gallery's picture. With the live service the picture is [photo].
  final String? mediaUrl;

  /// A photo chosen on the device, to be uploaded when the post is published.
  final PickedPhoto? photo;
  final String caption;
  final String district;
  final String state;
  final PostAudience audience;

  @override
  List<Object?> get props => [
    type,
    mediaUrl,
    photo,
    caption,
    district,
    state,
    audience,
  ];
}
