/// Response bodies shaped exactly like the backend's (see `post-view.ts`,
/// `reel-view.ts`, `user-card.ts`, `profiles.service.ts`, `auth.types.ts`).
library;

import 'package:blocks_app/features/reach/domain/reach_level.dart';

const uuidA = '01990000-aaaa-7bbb-8ccc-000000000001';
const uuidB = '01990000-aaaa-7bbb-8ccc-000000000002';
const uuidC = '01990000-aaaa-7bbb-8ccc-000000000003';

Map<String, Object?> userCard({
  String id = uuidA,
  String username = 'asha.k',
  String displayName = 'Asha K',
  String badge = 'NONE',
  String? avatarUrl = 'https://cdn.example.test/a.jpg',
}) => {
  'id': id,
  'username': username,
  'displayName': displayName,
  'avatarUrl': avatarUrl,
  'badge': badge,
  'isPrivate': false,
};

Map<String, Object?> postView({
  String id = uuidB,
  String type = 'TEXT',
  String caption = 'Hello Hyderabad #blocks',
  String reachLevel = 'DISTRICT',
  List<Map<String, Object?>> media = const [],
  bool liked = false,
  bool saved = false,
  Map<String, Object?>? author,
}) => {
  'id': id,
  'type': type,
  'caption': caption,
  'visibility': 'PUBLIC',
  'label': 'ORIGINAL',
  'hashtags': ['blocks'],
  'author': author ?? userCard(),
  'media': media,
  'location': {'country': 'IN', 'state': 'Telangana', 'district': 'Hyderabad'},
  'counts': {'likes': 4, 'comments': 2, 'shares': 1, 'saves': 3, 'views': 90},
  'viewer': {'liked': liked, 'saved': saved, 'isAuthor': false},
  'allowComments': true,
  'allowSharing': true,
  'reachLevel': reachLevel,
  'publishedAt': '2026-10-09T10:00:00.000Z',
  'editedAt': null,
};

Map<String, Object?> mediaView({
  String url = 'https://cdn.example.test/p.jpg',
  String? thumbnailUrl = 'https://cdn.example.test/p-thumb.jpg',
}) => {
  'id': uuidC,
  'kind': 'IMAGE',
  'url': url,
  'thumbnailUrl': thumbnailUrl,
  'posterUrl': null,
  'width': 1080,
  'height': 1350,
  'durationMs': null,
  'variants': <Object?>[],
};

Map<String, Object?> reelView({
  String id = uuidC,
  Map<String, Object?>? video,
  String reachLevel = 'STATE',
}) => {
  'id': id,
  'caption': 'Biryani time',
  'visibility': 'PUBLIC',
  'label': 'ORIGINAL',
  'hashtags': ['food'],
  'author': userCard(id: uuidB, username: 'ravi', displayName: 'Ravi'),
  'video':
      video ??
      {
        'id': uuidA,
        'kind': 'VIDEO',
        'url': 'https://cdn.example.test/r.m3u8',
        'thumbnailUrl': 'https://cdn.example.test/r-thumb.jpg',
        'posterUrl': 'https://cdn.example.test/r-poster.jpg',
        'width': 1080,
        'height': 1920,
        'durationMs': 12500,
        'variants': <Object?>[],
      },
  'coverUrl': 'https://cdn.example.test/r-cover.jpg',
  'durationMs': 12500,
  'clipCount': 2,
  'music': {
    'id': uuidA,
    'title': 'Sunrise',
    'artist': 'Band',
    'coverUrl': null,
    'previewUrl': null,
  },
  'originalAudio': null,
  'reusedAudio': null,
  'overlays': <Object?>[],
  'location': {'country': 'IN', 'state': 'Telangana', 'district': 'Hyderabad'},
  'counts': {'likes': 10, 'comments': 0, 'shares': 0, 'saves': 1, 'views': 300},
  'viewer': {'liked': true, 'saved': false, 'isAuthor': false},
  'allowComments': true,
  'allowRemix': true,
  'allowSharing': true,
  'reachLevel': reachLevel,
  'publishedAt': '2026-10-09T11:00:00.000Z',
  'createdAt': '2026-10-09T10:55:00.000Z',
};

Map<String, Object?> commentView({String id = uuidA, String body = 'Nice!'}) =>
    {
      'id': id,
      'body': body,
      'author': userCard(id: uuidC, username: 'meera', displayName: 'Meera'),
      'parentId': null,
      'likesCount': 2,
      'repliesCount': 0,
      'viewer': {'liked': false, 'isAuthor': false},
      'createdAt': '2026-10-09T10:30:00.000Z',
    };

Map<String, Object?> profileView({
  String id = uuidA,
  String username = 'asha.k',
  String badge = 'IDENTITY',
}) => {
  'id': id,
  'username': username,
  'displayName': 'Asha K',
  'bio': 'Chai, code, cricket',
  'websiteUrl': 'https://asha.example.test',
  'avatarUrl': 'https://cdn.example.test/a.jpg',
  'badge': badge,
  'isPrivate': false,
  'accountType': 'PERSONAL',
  'location': {'country': 'IN', 'state': 'Telangana', 'district': 'Hyderabad'},
  'counts': {'followers': 120, 'following': 80, 'posts': 33},
  'joinedAt': '2026-09-09T10:00:00.000Z',
};

Map<String, Object?> notificationView({
  String id = uuidA,
  String type = 'LIKE',
  bool read = false,
  Map<String, Object?> data = const {'postId': uuidB, 'userId': uuidC},
}) => {
  'id': id,
  'type': type,
  'title': 'Meera liked your post',
  'body': 'Open it to see.',
  'data': data,
  'read': read,
  'createdAt': '2026-10-09T09:00:00.000Z',
};

Map<String, Object?> tokensBody() => {
  'accessToken': 'access-new',
  'refreshToken': 'refresh-new',
  'tokenType': 'Bearer',
  'expiresIn': 900,
  'expiresAt': '2026-10-09T12:15:00.000Z',
};

Map<String, Object?> meBody() => {
  'id': uuidA,
  'username': 'asha.k',
  'displayName': 'Asha K',
  'email': 'a***@example.com',
  'emailVerified': true,
  'phone': null,
  'phoneVerified': false,
  'twoFactorEnabled': false,
  'accountType': 'PERSONAL',
  'status': 'ACTIVE',
  'language': 'en',
  'createdAt': '2026-09-09T10:00:00.000Z',
};

Map<String, Object?> verificationBody({String id = uuidA}) => {
  'challengeId': id,
  'channel': 'EMAIL',
  'destinationMasked': 'a***@example.com',
  'expiresAt': '2026-10-09T12:10:00.000Z',
  'resendAvailableAt': '2026-10-09T12:01:00.000Z',
};

/// The ladder as `GET /reach/ladder` answers.
Map<String, Object?> ladderBody() => {
  'version': 3,
  'levels': [
    {'key': 'DISTRICT', 'minQualifiedReach': 0},
    {'key': 'STATE', 'minQualifiedReach': 10001},
    {'key': 'NATIONAL', 'minQualifiedReach': 100001},
    {'key': 'GLOBAL', 'minQualifiedReach': 1000001},
  ],
};

/// A floor function over the fixture ladder.
int floorOf(ReachLevel level) => switch (level) {
  ReachLevel.district => 0,
  ReachLevel.state => 10001,
  ReachLevel.national => 100001,
  ReachLevel.global => 1000001,
};
