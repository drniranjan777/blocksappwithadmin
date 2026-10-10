import 'package:blocks_app/data/api/json_reader.dart';
import 'package:blocks_app/data/models/app_user.dart';
import 'package:blocks_app/data/models/content_models.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/features/reach/domain/reach_level.dart';

// What the app shows, built from what the API sends. Nothing here invents a
// value the server did not give, except where a model needs a field the API has
// no equivalent for (each such case is named in its doc comment).

/// The lowest qualified reach at which [level] unlocks, from the server's ladder.
typedef ReachFloor = int Function(ReachLevel level);

ReachLevel reachLevelFromApi(String? value) => switch (value) {
  'STATE' => ReachLevel.state,
  'NATIONAL' => ReachLevel.national,
  'GLOBAL' => ReachLevel.global,
  _ => ReachLevel.district,
};

VerificationType? verificationFromBadge(String? badge) => switch (badge) {
  'IDENTITY' => VerificationType.identity,
  'OFFICIAL_BUSINESS' => VerificationType.business,
  'VERIFIED_PUBLISHER' => VerificationType.publisher,
  _ => null,
};

/// The app writes handles with a leading "@"; the API sends them bare.
String handleOf(String username) => '@$username';

/// A person on a card, in a list, or next to a comment.
UserSummary userSummaryFromCard(JsonObject card) => UserSummary(
  id: card.string('id'),
  name: card.stringOr('displayName', card.stringOr('username', '')),
  username: handleOf(card.string('username')),
  avatarUrl: card.stringOrNull('avatarUrl'),
  isVerified: card.stringOr('badge', 'NONE') != 'NONE',
);

String _countryName(String code) => switch (code) {
  'IN' => 'India',
  _ => code,
};

/// A profile (`GET /profiles/:ref` or `GET /users/me/profile`).
///
/// The API has no per-person reach figure yet, so [AppUser.reachLevel] starts at
/// the bottom rung and [AppUser.bestPostReach] at zero. Trust and age checks that
/// the server enforces (`hasMajorViolation`, `isAgeEligible`) are not sent to the
/// app, so they keep their neutral defaults: nothing here ever grants access.
AppUser appUserFromProfile(
  JsonObject profile, {
  required DateTime now,
  bool twoFactorEnabled = false,
}) {
  final location = profile.objectOrNull('location');
  final counts = profile.objectOrNull('counts');
  final joined = profile.dateOrNull('joinedAt');
  return AppUser(
    id: profile.string('id'),
    name: profile.stringOr('displayName', profile.string('username')),
    username: handleOf(profile.string('username')),
    bio: profile.stringOr('bio', ''),
    avatarUrl: profile.stringOrNull('avatarUrl'),
    district: location?.stringOrNull('district') ?? '',
    state: location?.stringOrNull('state') ?? '',
    country: _countryName(location?.stringOr('country', 'IN') ?? 'IN'),
    followersCount: counts?.integer('followers') ?? 0,
    followingCount: counts?.integer('following') ?? 0,
    postsCount: counts?.integer('posts') ?? 0,
    reachLevel: ReachLevel.district,
    isVerified: profile.stringOr('badge', 'NONE') != 'NONE',
    verificationType: verificationFromBadge(profile.stringOrNull('badge')),
    accountAgeDays: joined == null ? 0 : now.difference(joined).inDays,
    isTwoFactorEnabled: twoFactorEnabled,
    website: profile.stringOrNull('websiteUrl'),
  );
}

PostStats _statsOf(JsonObject view) {
  final c = view.objectOrNull('counts');
  return PostStats(
    likes: c?.integer('likes') ?? 0,
    comments: c?.integer('comments') ?? 0,
    shares: c?.integer('shares') ?? 0,
    saves: c?.integer('saves') ?? 0,
    views: c?.integer('views') ?? 0,
  );
}

/// A post.
///
/// The API decides each post's rung on the Reach Ladder (`reachLevel`) and shows
/// the qualified-reach count only to the author. The app works out the rung from
/// a count, so [Post.qualifiedReach] is set to the lowest count that unlocks the
/// server's rung: the badge then always agrees with the server, and the app never
/// claims a higher level than it was given. The number itself is therefore not a
/// real count and must not be shown as one for other people's posts. For the
/// author's own post the real count is available from the server; pass it as
/// [qualifiedReach] to use it instead.
Post postFromView(
  JsonObject view, {
  required ReachFloor floor,
  int? qualifiedReach,
}) {
  final location = view.objectOrNull('location');
  final viewer = view.objectOrNull('viewer');
  final media = view.objects('media');
  final first = media.isEmpty ? null : media.first;
  return Post(
    id: view.string('id'),
    author: userSummaryFromCard(view.object('author')),
    type: view.stringOr('type', 'TEXT') == 'PHOTO'
        ? PostType.image
        : PostType.text,
    caption: view.stringOr('caption', ''),
    hashtags: view.strings('hashtags'),
    district: location?.stringOrNull('district') ?? '',
    state: location?.stringOrNull('state') ?? '',
    createdAt: view.date('publishedAt'),
    stats: _statsOf(view),
    qualifiedReach:
        qualifiedReach ??
        floor(reachLevelFromApi(view.stringOrNull('reachLevel'))),
    mediaUrl: first?.stringOrNull('url') ?? first?.stringOrNull('thumbnailUrl'),
    isLiked: viewer?.boolean('liked') ?? false,
    isSaved: viewer?.boolean('saved') ?? false,
  );
}

/// A reel shown among posts (the home feed mixes the two). It is a video post
/// whose picture is the reel's cover. See [postFromView] for [qualifiedReach].
Post postFromReelView(
  JsonObject view, {
  required ReachFloor floor,
  int? qualifiedReach,
}) {
  final location = view.objectOrNull('location');
  final viewer = view.objectOrNull('viewer');
  return Post(
    id: view.string('id'),
    author: userSummaryFromCard(view.object('author')),
    type: PostType.video,
    caption: view.stringOr('caption', ''),
    hashtags: view.strings('hashtags'),
    district: location?.stringOrNull('district') ?? '',
    state: location?.stringOrNull('state') ?? '',
    createdAt: view.dateOrNull('publishedAt') ?? view.date('createdAt'),
    stats: _statsOf(view),
    qualifiedReach:
        qualifiedReach ??
        floor(reachLevelFromApi(view.stringOrNull('reachLevel'))),
    mediaUrl: view.stringOrNull('coverUrl'),
    durationSeconds: (view.integer('durationMs') / 1000).round(),
    isLiked: viewer?.boolean('liked') ?? false,
    isSaved: viewer?.boolean('saved') ?? false,
  );
}

/// A reel for the full-screen player, or null while it has no playable video.
Reel? reelFromView(JsonObject view, {required ReachFloor floor}) {
  final video = view.objectOrNull('video');
  final url = video?.stringOrNull('url');
  if (url == null) return null;
  final location = view.objectOrNull('location');
  final viewer = view.objectOrNull('viewer');
  final music = view.objectOrNull('music');
  final original = view.objectOrNull('originalAudio');
  return Reel(
    id: view.string('id'),
    author: userSummaryFromCard(view.object('author')),
    videoUrl: url,
    caption: view.stringOr('caption', ''),
    hashtags: view.strings('hashtags'),
    musicTitle:
        music?.stringOrNull('title') ?? original?.stringOrNull('title') ?? '',
    duration: Duration(milliseconds: view.integer('durationMs')),
    district: location?.stringOrNull('district') ?? '',
    state: location?.stringOrNull('state') ?? '',
    stats: _statsOf(view),
    qualifiedReach: floor(reachLevelFromApi(view.stringOrNull('reachLevel'))),
    isLiked: viewer?.boolean('liked') ?? false,
    isSaved: viewer?.boolean('saved') ?? false,
  );
}

Comment commentFromView(JsonObject view) => Comment(
  id: view.string('id'),
  author: userSummaryFromCard(view.object('author')),
  text: view.stringOr('body', ''),
  createdAt: view.date('createdAt'),
  likes: view.integer('likesCount'),
);

NotificationCategory notificationCategoryOf(String type) => switch (type) {
  'LIKE' => NotificationCategory.like,
  'COMMENT' || 'MENTION' => NotificationCategory.comment,
  'NEW_FOLLOWER' || 'FOLLOW_REQUEST' => NotificationCategory.follower,
  'REACH_MILESTONE' => NotificationCategory.reach,
  'EARNINGS' ||
  'KYC_STATUS' ||
  'PAYOUT_STATUS' => NotificationCategory.earnings,
  'CAMPAIGN_STATUS' => NotificationCategory.business,
  'SECURITY_ALERT' ||
  'PASSWORD_CHANGED' ||
  'NEW_DEVICE_LOGIN' => NotificationCategory.security,
  _ => NotificationCategory.safety,
};

/// A notification. The server writes the title and text in the person's language
/// and sends only ids for what it is about, so [AppNotification.actor] stays
/// empty and [AppNotification.targetId] is the post, reel or person it names.
AppNotification notificationFromView(JsonObject view) {
  final data = view.objectOrNull('data');
  return AppNotification(
    id: view.string('id'),
    category: notificationCategoryOf(view.stringOr('type', 'SYSTEM')),
    title: view.stringOr('title', ''),
    body: view.stringOr('body', ''),
    createdAt: view.date('createdAt'),
    isRead: view.boolean('read'),
    targetId:
        data?.stringOrNull('postId') ??
        data?.stringOrNull('reelId') ??
        data?.stringOrNull('userId'),
  );
}
