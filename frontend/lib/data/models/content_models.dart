import 'package:blocks_app/data/models/app_user.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:equatable/equatable.dart';

// ---------------------------------------------------------------- Stories --

class StoryItem extends Equatable {
  const StoryItem({
    required this.id,
    required this.mediaUrl,
    required this.createdAt,
    this.caption,
    this.duration = const Duration(seconds: 5),
  });

  final String id;
  final String mediaUrl;
  final String? caption;
  final DateTime createdAt;
  final Duration duration;

  @override
  List<Object?> get props => [id, mediaUrl, caption, createdAt, duration];
}

class StoryGroup extends Equatable {
  const StoryGroup({
    required this.id,
    required this.user,
    required this.items,
    this.isViewed = false,
    this.isOwn = false,
  });

  final String id;
  final UserSummary user;
  final List<StoryItem> items;
  final bool isViewed;
  final bool isOwn;

  StoryGroup copyWith({bool? isViewed, List<StoryItem>? items}) => StoryGroup(
    id: id,
    user: user,
    items: items ?? this.items,
    isViewed: isViewed ?? this.isViewed,
    isOwn: isOwn,
  );

  @override
  List<Object?> get props => [id, user, items, isViewed, isOwn];
}

// ------------------------------------------------------------------ Reels --

class Reel extends Equatable {
  const Reel({
    required this.id,
    required this.author,
    required this.videoUrl,
    required this.caption,
    required this.musicTitle,
    required this.duration,
    required this.district,
    required this.state,
    required this.stats,
    required this.qualifiedReach,
    this.hashtags = const [],
    this.isLiked = false,
    this.isSaved = false,
  });

  final String id;
  final UserSummary author;

  /// Canonical video URL. The demo uses `demo://reel/<seed>`; production uses
  /// an HLS manifest on the CDN.
  final String videoUrl;
  final String caption;
  final List<String> hashtags;
  final String musicTitle;
  final Duration duration;
  final String district;
  final String state;
  final PostStats stats;
  final int qualifiedReach;
  final bool isLiked;
  final bool isSaved;

  String get location => '$district • $state';

  Reel copyWith({PostStats? stats, bool? isLiked, bool? isSaved}) => Reel(
    id: id,
    author: author,
    videoUrl: videoUrl,
    caption: caption,
    musicTitle: musicTitle,
    duration: duration,
    district: district,
    state: state,
    stats: stats ?? this.stats,
    qualifiedReach: qualifiedReach,
    hashtags: hashtags,
    isLiked: isLiked ?? this.isLiked,
    isSaved: isSaved ?? this.isSaved,
  );

  @override
  List<Object?> get props => [
    id,
    author,
    videoUrl,
    caption,
    hashtags,
    musicTitle,
    duration,
    district,
    state,
    stats,
    qualifiedReach,
    isLiked,
    isSaved,
  ];
}

// ---------------------------------------------------------- Notifications --

enum NotificationCategory {
  like,
  comment,
  follower,
  share,
  reach,
  earnings,
  business,
  safety,

  /// Account-security alerts (suspicious sign-in, password change, new device).
  security,
}

class AppNotification extends Equatable {
  const AppNotification({
    required this.id,
    required this.category,
    required this.title,
    required this.body,
    required this.createdAt,
    this.isRead = false,
    this.actor,
    this.targetId,
  });

  final String id;
  final NotificationCategory category;

  /// Server-localised copy (the real backend renders these per user locale).
  final String title;
  final String body;
  final DateTime createdAt;
  final bool isRead;
  final UserSummary? actor;
  final String? targetId;

  AppNotification copyWith({bool? isRead}) => AppNotification(
    id: id,
    category: category,
    title: title,
    body: body,
    createdAt: createdAt,
    isRead: isRead ?? this.isRead,
    actor: actor,
    targetId: targetId,
  );

  @override
  List<Object?> get props => [
    id,
    category,
    title,
    body,
    createdAt,
    isRead,
    actor,
    targetId,
  ];
}

// --------------------------------------------------------------- Messages --

enum MessageKind { text, image, voice }

class Conversation extends Equatable {
  const Conversation({
    required this.id,
    required this.participant,
    required this.lastMessage,
    required this.lastAt,
    this.unreadCount = 0,
    this.isOnline = false,
  });

  final String id;
  final UserSummary participant;
  final String lastMessage;
  final DateTime lastAt;
  final int unreadCount;
  final bool isOnline;

  @override
  List<Object?> get props => [
    id,
    participant,
    lastMessage,
    lastAt,
    unreadCount,
    isOnline,
  ];
}

class ChatMessage extends Equatable {
  const ChatMessage({
    required this.id,
    required this.conversationId,
    required this.kind,
    required this.sentAt,
    required this.isMine,
    this.text,
    this.mediaUrl,
    this.voiceSeconds,
  });

  final String id;
  final String conversationId;
  final MessageKind kind;
  final String? text;
  final String? mediaUrl;
  final int? voiceSeconds;
  final DateTime sentAt;
  final bool isMine;

  @override
  List<Object?> get props => [
    id,
    conversationId,
    kind,
    text,
    mediaUrl,
    voiceSeconds,
    sentAt,
    isMine,
  ];
}
