import 'dart:math';

import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/mock/mock_catalog.dart';
import 'package:blocks_app/data/mock/mock_world.dart';
import 'package:blocks_app/data/models/app_user.dart';
import 'package:blocks_app/data/models/business_models.dart';
import 'package:blocks_app/data/models/content_models.dart';
import 'package:blocks_app/data/models/discovery_models.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/features/reach/domain/reach_level.dart';

/// Stable (cross-run, cross-platform) string hash — FNV-1a, 31-bit.
int stableHash(String s) {
  var h = 0x811C9DC5;
  for (final c in s.codeUnits) {
    h ^= c;
    h = (h * 0x01000193) & 0x7FFFFFFF;
  }
  return h;
}

enum _ReachPolicy {
  any,
  rising,
  nearYou,
  following,
  india,
  district,
  state,
  global,
}

/// Generates demo content lazily from ids. A post id fully describes how to
/// rebuild the post, so lists never need to be stored — only the user's own
/// interactions live in [MockWorld].
class MockFactory {
  MockFactory(this.world);

  final MockWorld world;

  // --------------------------------------------------------------- Users --

  AppUser get me => world.me;

  UserSummary summaryOf(String userId) {
    if (userId == meId) return world.me.summary;
    if (userId == myBusinessId) return business(myBusinessId).summary;
    final seed = seedById(userId);
    return UserSummary(
      id: seed.id,
      name: seed.name,
      username: seed.handle,
      isVerified: seed.verified,
    );
  }

  AppUser user(String id) {
    if (id == meId) return world.me;
    final matches = kUserSeeds.where((u) => u.id == id);
    if (matches.isEmpty) throw NotFoundFailure('User $id not found');
    final s = matches.first;
    final d = districtNamed(s.district);
    final r = Random(stableHash(id));
    return AppUser(
      id: s.id,
      name: s.name,
      username: s.handle,
      bio: s.bio,
      district: d.name,
      state: d.state,
      followersCount: s.followers,
      followingCount: 80 + r.nextInt(600),
      postsCount: 40 + r.nextInt(300),
      reachLevel: s.level,
      bestPostReach: _bestReachFor(s.level, r),
      isVerified: s.verified,
      verificationType: s.verificationType,
      accountAgeDays: 60 + r.nextInt(900),
      isTwoFactorEnabled: true,
      businessId: s.isBusiness ? 'biz_${s.id}' : null,
    );
  }

  /// A best-post reach consistent with [level], somewhere inside it.
  int _bestReachFor(ReachLevel level, Random r) {
    final floor = world.reachConfig.thresholdFor(level);
    final next = level.next;
    final ceil = next == null
        ? floor * 3
        : world.reachConfig.thresholdFor(next) - 1;
    return floor + ((ceil - floor) * (0.15 + r.nextDouble() * 0.7)).round();
  }

  // ------------------------------------------------------------ Business --

  BusinessProfile business(String id) {
    if (id == myBusinessId) {
      return const BusinessProfile(
        id: myBusinessId,
        name: 'Nexonweb Solutions',
        handle: '@nexonweb',
        category: 'Software & IT Services',
        about: 'We build fast, accessible websites and apps for local businesses across Telangana. From first idea to launch in four weeks.',
        district: 'Hyderabad',
        state: 'Telangana',
        followersCount: 18200,
        isVerified: true,
        phone: '+91 40 5555 0100',
        whatsapp: '+91 98480 55501',
        website: 'nexonweb.example.in',
        hours: 'Mon–Sat · 10:00–19:00',
        ownerId: meId,
      );
    }
    final seed = kUserSeeds.where((u) => 'biz_${u.id}' == id && u.isBusiness);
    if (seed.isEmpty) throw NotFoundFailure('Business $id not found');
    final s = seed.first;
    final d = districtNamed(s.district);
    return BusinessProfile(
      id: id,
      name: s.name,
      handle: s.handle,
      category: s.id == 'u25' ? 'Jewellery & Pearls' : 'Spices & Groceries',
      about: s.bio,
      district: d.name,
      state: d.state,
      followersCount: s.followers,
      isVerified: s.verified,
      phone: '+91 40 5555 0${100 + stableHash(id) % 800}',
      whatsapp: '+91 98480 5${1000 + stableHash(id) % 8000}',
      website: '${s.handle.substring(1).replaceAll('.', '')}.example.in',
      hours: 'Mon–Sun · 09:00–21:00',
      ownerId: s.id,
    );
  }

  List<Offer> offers(String businessId) {
    final now = world.now();
    return [
      Offer(
        id: '$businessId~o1',
        title: 'Festive launch: 20% off',
        description: 'Show this code at checkout or mention it on WhatsApp.',
        code: 'BLOCKS20',
        validUntil: now.add(const Duration(days: 12)),
        artSeed: stableHash('$businessId~o1'),
      ),
      Offer(
        id: '$businessId~o2',
        title: 'Free consultation',
        description: 'A 30-minute call to plan your next project.',
        code: 'HELLOHYD',
        validUntil: now.add(const Duration(days: 30)),
        artSeed: stableHash('$businessId~o2'),
      ),
      Offer(
        id: '$businessId~o3',
        title: 'Refer a friend',
        description: 'Both of you get a month of free support.',
        code: 'FRIEND1',
        validUntil: now.add(const Duration(days: 45)),
        artSeed: stableHash('$businessId~o3'),
      ),
    ];
  }

  // --------------------------------------------------------------- Posts --

  /// Id formats (`~`-separated):
  /// `p~feed~FEEDTYPE~i`, `p~user~USERID~i`, `p~explore~SCOPE~CATEGORY|all~i`,
  /// `p~biz~BUSINESSID~i`, and `p~mine~n` for user-created posts, which are the
  /// only ones stored in the world.
  Post? tryPost(String id) {
    final parts = id.split('~');
    if (parts.length < 3 || parts.first != 'p') return null;
    try {
      switch (parts[1]) {
        case 'mine':
          final match = world.createdPosts.where((p) => p.id == id);
          return match.isEmpty ? null : _apply(match.first);
        case 'feed':
          final type = FeedType.values.byName(parts[2]);
          return _apply(_feedPost(type, int.parse(parts[3])));
        case 'user':
          return _apply(_userPost(parts[2], int.parse(parts[3])));
        case 'explore':
          final scope = ExploreScope.values.byName(parts[2]);
          final cat = parts[3] == 'all'
              ? null
              : ExploreCategory.values.byName(parts[3]);
          return _apply(_explorePost(scope, cat, int.parse(parts[4])));
        case 'biz':
          return _apply(_businessPost(parts[2], int.parse(parts[3])));
      }
    } on Object {
      return null;
    }
    return null;
  }

  Post post(String id) =>
      tryPost(id) ?? (throw NotFoundFailure('Post $id not found'));

  /// Layers the user's own interactions (likes, saves, shares, boosts) on top
  /// of the deterministic base post.
  Post _apply(Post base) {
    final liked = world.liked.contains(base.id);
    final saved = world.saved.contains(base.id);
    final boost = world.reachBoost[base.id] ?? 0;
    final shares = world.shareBumps[base.id] ?? 0;
    return base.copyWith(
      isLiked: liked,
      isSaved: saved,
      qualifiedReach: base.qualifiedReach + boost,
      stats: base.stats.copyWith(
        likes: base.stats.likes + (liked ? 1 : 0),
        saves: base.stats.saves + (saved ? 1 : 0),
        shares: base.stats.shares + shares,
        views: base.stats.views + boost,
      ),
    );
  }

  List<UserSeed> _pool(_ReachPolicy policy, {String? district}) {
    switch (policy) {
      case _ReachPolicy.following:
        return kUserSeeds.where((u) => u.following).toList();
      case _ReachPolicy.nearYou:
        return kUserSeeds.where((u) => u.district == 'Hyderabad').toList();
      case _ReachPolicy.india:
        return kUserSeeds
            .where((u) => u.level.isAtLeast(ReachLevel.national))
            .toList();
      case _ReachPolicy.district:
        return kUserSeeds
            .where((u) => u.district == (district ?? 'Hyderabad'))
            .toList();
      case _ReachPolicy.state:
        return kUserSeeds
            .where((u) => districtNamed(u.district).state == 'Telangana')
            .toList();
      case _ReachPolicy.global:
        return kUserSeeds
            .where((u) => u.level.isAtLeast(ReachLevel.state))
            .toList();
      case _ReachPolicy.any:
      case _ReachPolicy.rising:
        return kUserSeeds;
    }
  }

  int _reachFor(Random r, _ReachPolicy policy) {
    int logUniform(int lo, int hi) =>
        (lo * exp(r.nextDouble() * log(hi / lo))).round();
    switch (policy) {
      case _ReachPolicy.rising:
        // 55-97% of the way through a ladder level.
        final cfg = world.reachConfig;
        final level = ReachLevel.values[r.nextInt(3)];
        final floor = cfg.thresholdFor(level);
        final ceil = cfg.thresholdFor(level.next!);
        return floor +
            ((ceil - floor) * (0.55 + r.nextDouble() * 0.42)).round();
      case _ReachPolicy.nearYou:
        return logUniform(800, 60000);
      case _ReachPolicy.following:
        return logUniform(2000, 400000);
      case _ReachPolicy.india:
        return logUniform(100500, 900000);
      case _ReachPolicy.district:
        return logUniform(500, 40000);
      case _ReachPolicy.state:
        return logUniform(5000, 120000);
      case _ReachPolicy.global:
        return logUniform(500000, 4000000);
      case _ReachPolicy.any:
        return logUniform(300, 3000000);
    }
  }

  Post _feedPost(FeedType type, int index) {
    final policy = switch (type) {
      FeedType.following => _ReachPolicy.following,
      FeedType.forYou => _ReachPolicy.any,
      FeedType.rising => _ReachPolicy.rising,
      FeedType.nearYou => _ReachPolicy.nearYou,
      FeedType.india => _ReachPolicy.india,
    };
    final id = 'p~feed~${type.name}~$index';
    final r = Random(stableHash(id));
    final pool = _pool(policy);

    // In Rising, roughly every 6th card is one of the demo user's own posts
    // so the "your post is 82% toward State" experience is always present.
    if (type == FeedType.rising && index % 6 == 0) {
      final mine = _userPost(meId, (index ~/ 6) % 8);
      return Post(
        id: id,
        author: mine.author,
        type: mine.type,
        mediaUrl: mine.mediaUrl,
        caption: mine.caption,
        hashtags: mine.hashtags,
        district: mine.district,
        state: mine.state,
        createdAt: mine.createdAt,
        stats: mine.stats,
        qualifiedReach: _risingOwnReach[(index ~/ 6) % _risingOwnReach.length],
        durationSeconds: mine.durationSeconds,
      );
    }
    final seed = pool[r.nextInt(pool.length)];
    return _compose(
      id: id,
      r: r,
      author: summaryOf(seed.id),
      district: type == FeedType.nearYou ? 'Hyderabad' : seed.district,
      reach: _reachFor(r, policy),
      ageMinutes: index * 41 + r.nextInt(30),
      business: seed.isBusiness,
    );
  }

  static const _risingOwnReach = <int>[8250, 71201, 92500, 9100];

  Post _userPost(String userId, int index) {
    final id = 'p~user~$userId~$index';
    final r = Random(stableHash(id));
    final author = summaryOf(userId);
    final district = userId == meId
        ? 'Hyderabad'
        : districtNamed(seedById(userId).district).name;
    final int reach;
    if (userId == meId) {
      // Best post (index 0) sits at 68% towards National — see creator dashboard.
      const mine = [71201, 8250, 3400, 45000, 21000, 9100, 15000, 26000];
      reach = index < mine.length ? mine[index] : 400 + r.nextInt(30000);
    } else {
      reach = _reachFor(r, _ReachPolicy.any);
    }
    return _compose(
      id: id,
      r: r,
      author: author,
      district: district,
      reach: reach,
      ageMinutes: 60 + index * 1300 + r.nextInt(300),
      forcedTheme: userId == meId && index == 0 ? 6 : null,
      captionOverride: userId == meId && index == 0
          ? 'Hyderabad evenings, golden hour over the Musi.'
          : null,
    );
  }

  Post _explorePost(ExploreScope scope, ExploreCategory? cat, int index) {
    final id = 'p~explore~${scope.name}~${cat?.name ?? 'all'}~$index';
    final r = Random(stableHash(id));
    final policy = switch (scope) {
      ExploreScope.district => _ReachPolicy.district,
      ExploreScope.state => _ReachPolicy.state,
      ExploreScope.india => _ReachPolicy.india,
      ExploreScope.global => _ReachPolicy.global,
    };
    final pool = _pool(policy);
    final seed = pool[r.nextInt(pool.length)];
    return _compose(
      id: id,
      r: r,
      author: summaryOf(seed.id),
      district: seed.district,
      reach: _reachFor(r, policy),
      ageMinutes: index * 55 + r.nextInt(50),
      forcedCategory: cat,
      business: seed.isBusiness,
    );
  }

  Post _businessPost(String businessId, int index) {
    final id = 'p~biz~$businessId~$index';
    final r = Random(stableHash(id));
    final b = business(businessId);
    final captions = businessId == myBusinessId
        ? const [
            'We just launched a booking site for a Banjara Hills salon — live in 9 days.',
            'Hiring a Flutter developer in Hyderabad. DM to apply.',
            'Free website audit for small businesses this month.',
            'How we cut a client\'s page load from 6s to 1.2s.',
          ]
        : const [
            'New stock just arrived. Visit us or order on WhatsApp.',
            'Behind the counter: how we source directly from growers.',
            'Thank you for 10,000 followers!',
          ];
    return Post(
      id: id,
      author: b.summary,
      type: index % 3 == 1 ? PostType.video : PostType.image,
      mediaUrl: 'demo://art/${stableHash(id)}',
      caption: captions[index % captions.length],
      hashtags: const ['#SmallBusiness', '#LocalFirst'],
      district: b.district,
      state: b.state,
      createdAt: world.now().subtract(Duration(hours: 6 + index * 30)),
      stats: _statsFor(r, 2000 + r.nextInt(30000)),
      qualifiedReach: 2000 + r.nextInt(30000),
      durationSeconds: index % 3 == 1 ? 24 : null,
      isBusinessPost: true,
    );
  }

  Post _compose({
    required String id,
    required Random r,
    required UserSummary author,
    required String district,
    required int reach,
    required int ageMinutes,
    int? forcedTheme,
    ExploreCategory? forcedCategory,
    String? captionOverride,
    bool business = false,
  }) {
    final themeIndex = forcedCategory != null
        ? kThemes.indexWhere((t) => t.category == forcedCategory)
        : forcedTheme ?? r.nextInt(kThemes.length);
    final theme = kThemes[themeIndex];
    final d = districtNamed(district);
    final tagName = d.name.replaceAll(' ', '');
    final caption =
        captionOverride ??
        theme.captions[r.nextInt(theme.captions.length)].replaceAll(
          '{d}',
          d.name,
        );
    // A hand-written caption brings its own hashtags rather than the
    // theme's, so the two never disagree.
    final tags = captionOverride != null
        ? ['#$tagName', '#GoldenHour', '#BLOCKS']
        : theme.tags
              .map((t) => t.replaceAll('{d}', tagName))
              .toList(growable: false);
    final roll = r.nextDouble();
    final type = roll < 0.55
        ? PostType.image
        : roll < 0.85
        ? PostType.video
        : PostType.text;
    return Post(
      id: id,
      author: author,
      type: type,
      mediaUrl: type == PostType.text ? null : 'demo://art/${stableHash(id)}',
      caption: caption,
      hashtags: tags,
      district: d.name,
      state: d.state,
      createdAt: world.now().subtract(Duration(minutes: ageMinutes)),
      stats: _statsFor(r, reach),
      qualifiedReach: reach,
      durationSeconds: type == PostType.video ? 12 + r.nextInt(45) : null,
      isBusinessPost: business,
    );
  }

  PostStats _statsFor(Random r, int reach) {
    final views = (reach * (1.6 + r.nextDouble() * 1.2)).round();
    final likes = (reach * (0.05 + r.nextDouble() * 0.07)).round();
    return PostStats(
      views: views,
      likes: likes,
      comments: (likes * (0.04 + r.nextDouble() * 0.05)).round(),
      shares: (likes * (0.03 + r.nextDouble() * 0.05)).round(),
      saves: (likes * (0.08 + r.nextDouble() * 0.08)).round(),
    );
  }

  // ------------------------------------------------------------- Comments --

  Comment comment(String postId, int i) {
    final post = tryPost(postId);
    final r = Random(stableHash('c~$postId~$i'));
    final seed = kUserSeeds[r.nextInt(kUserSeeds.length)];
    final created = (post?.createdAt ?? world.now()).add(
      Duration(minutes: 4 + i * 7),
    );
    return Comment(
      id: 'c~$postId~$i',
      author: summaryOf(seed.id),
      text: kCommentTexts[r.nextInt(kCommentTexts.length)],
      createdAt: created.isAfter(world.now()) ? world.now() : created,
      likes: r.nextInt(120),
    );
  }

  // ---------------------------------------------------------------- Reels --

  Reel? tryReel(String id) {
    final parts = id.split('~');
    if (parts.length < 3 || parts.first != 'r') return null;
    try {
      switch (parts[1]) {
        case 'mine':
          final m = world.createdReels.where((e) => e.id == id);
          return m.isEmpty ? null : _applyReel(m.first);
        case 'feed':
          return _applyReel(_reel(id, 'feed', int.parse(parts[2]), null));
        case 'user':
          return _applyReel(_reel(id, 'user', int.parse(parts[3]), parts[2]));
      }
    } on Object {
      return null;
    }
    return null;
  }

  Reel _applyReel(Reel base) {
    final liked = world.liked.contains(base.id);
    final saved = world.saved.contains(base.id);
    return base.copyWith(
      isLiked: liked,
      isSaved: saved,
      stats: base.stats.copyWith(
        likes: base.stats.likes + (liked ? 1 : 0),
        saves: base.stats.saves + (saved ? 1 : 0),
        shares: base.stats.shares + (world.shareBumps[base.id] ?? 0),
      ),
    );
  }

  Reel _reel(String id, String kind, int index, String? userId) {
    final r = Random(stableHash(id));
    final creators = kUserSeeds
        .where((u) => !u.isBusiness && !u.isPublisher)
        .toList();
    final isBusiness = userId != null && userId.startsWith('biz_');
    final seed = userId == null
        ? creators[r.nextInt(creators.length)]
        : (userId == meId || isBusiness ? null : seedById(userId));
    final biz = isBusiness ? business(userId) : null;
    final author =
        biz?.summary ?? (seed == null ? me.summary : summaryOf(seed.id));
    final d = districtNamed(biz?.district ?? seed?.district ?? 'Hyderabad');
    final theme = kThemes[r.nextInt(kThemes.length)];
    final reach = _reachFor(r, _ReachPolicy.any);
    final tagName = d.name.replaceAll(' ', '');
    return Reel(
      id: id,
      author: author,
      videoUrl: 'demo://reel/${stableHash(id)}',
      caption: theme.captions[r.nextInt(theme.captions.length)].replaceAll(
        '{d}',
        d.name,
      ),
      hashtags: theme.tags.map((t) => t.replaceAll('{d}', tagName)).toList(),
      musicTitle: kMusicTitles[r.nextInt(kMusicTitles.length)],
      duration: Duration(seconds: 12 + r.nextInt(28)),
      district: d.name,
      state: d.state,
      stats: _statsFor(r, reach),
      qualifiedReach: reach,
    );
  }

  // -------------------------------------------------------------- Stories --

  List<StoryGroup> storyGroups() {
    final now = world.now();
    final own = StoryGroup(
      id: 'sg~me',
      user: me.summary,
      items: world.myStories,
      isOwn: true,
    );
    final others = <StoryGroup>[];
    for (var i = 0; i < 10; i++) {
      final seed = kUserSeeds[i];
      final gid = 'sg~${seed.id}';
      final r = Random(stableHash(gid));
      final count = 2 + r.nextInt(3);
      others.add(
        StoryGroup(
          id: gid,
          user: summaryOf(seed.id),
          isViewed: world.viewedStories.contains(gid),
          items: [
            for (var j = 0; j < count; j++)
              StoryItem(
                id: '$gid~$j',
                mediaUrl: 'demo://art/${stableHash('$gid~$j')}',
                caption: j == 0
                    ? kThemes[r.nextInt(kThemes.length)].captions[0].replaceAll(
                        '{d}',
                        districtNamed(seed.district).name,
                      )
                    : null,
                createdAt: now.subtract(Duration(hours: 1 + j * 3 + i)),
              ),
          ],
        ),
      );
    }
    // Unviewed first, like a real ring order.
    others.sort((a, b) => (a.isViewed ? 1 : 0).compareTo(b.isViewed ? 1 : 0));
    return [own, ...others];
  }

  // -------------------------------------------------------- Notifications --

  AppNotification notification(int i) {
    final now = world.now();
    final id = 'n~$i';
    // Only the newest handful start unread; older ones are already seen.
    final isRead = i >= unreadSeedCount || world.readNotifications.contains(id);
    final r = Random(stableHash(id));
    final actorSeed = kUserSeeds[r.nextInt(kUserSeeds.length)];
    final actor = summaryOf(actorSeed.id);
    final at = now.subtract(Duration(minutes: 8 + i * 53));

    AppNotification make(
      NotificationCategory c,
      String title,
      String body, {
      UserSummary? who,
      String? target,
    }) => AppNotification(
      id: id,
      category: c,
      title: title,
      body: body,
      createdAt: at,
      isRead: isRead,
      actor: who,
      targetId: target,
    );

    switch (i) {
      case 0:
        return make(
          NotificationCategory.reach,
          'Your post reached STATE level!',
          'Your content is now eligible for State discovery.',
          target: 'p~user~$meId~0',
        );
      case 1:
        return make(
          NotificationCategory.reach,
          'Almost there: 82% toward State',
          'Your post needs about 1,800 more qualified interactions to reach State level.',
          target: 'p~user~$meId~1',
        );
      case 2:
        return make(
          NotificationCategory.earnings,
          'Estimated earnings updated',
          'Your estimated creator earnings this cycle are ₹18,420.',
        );
      case 3:
        return make(
          NotificationCategory.safety,
          'New sign-in to your account',
          'A new device signed in from Hyderabad. If this was not you, secure your account.',
        );
      case 4:
        return make(
          NotificationCategory.business,
          'Your business page is growing',
          'Nexonweb Solutions had 120 profile visits this week.',
          target: myBusinessId,
        );
    }
    final kind = i % 6;
    switch (kind) {
      case 0:
        return make(
          NotificationCategory.like,
          '${actor.name} liked your post',
          'Hyderabad evenings, golden hour over the Musi.',
          who: actor,
          target: 'p~user~$meId~0',
        );
      case 1:
        return make(
          NotificationCategory.comment,
          '${actor.name} commented',
          '"${kCommentTexts[r.nextInt(kCommentTexts.length)]}"',
          who: actor,
          target: 'p~user~$meId~0',
        );
      case 2:
        return make(
          NotificationCategory.follower,
          '${actor.name} started following you',
          'Say hello and follow back.',
          who: actor,
          target: actor.id,
        );
      case 3:
        return make(
          NotificationCategory.share,
          '${actor.name} shared your post',
          'Shared to ${3 + r.nextInt(40)} people.',
          who: actor,
          target: 'p~user~$meId~2',
        );
      case 4:
        return make(
          NotificationCategory.reach,
          'Reach milestone',
          'One of your posts crossed ${(2 + r.nextInt(9)) * 1000} qualified reach.',
          target: 'p~user~$meId~3',
        );
      default:
        return make(
          NotificationCategory.business,
          'Offer redeemed',
          'A customer used code BLOCKS20 at ${business(myBusinessId).name}.',
          target: myBusinessId,
        );
    }
  }

  static const notificationCount = 90;
  static const unreadSeedCount = 12;

  // ------------------------------------------------------------- Messages --

  List<Conversation> seedConversations() {
    final now = world.now();
    final scripts = <(String, bool, List<(bool, String)>)>[
      (
        'u1',
        true,
        [
          (false, 'Loved your Charminar reel! Collab on a food walk?'),
          (true, 'Absolutely. Next Saturday?'),
          (false, 'Perfect. I\'ll bring the camera.'),
        ],
      ),
      (
        'u2',
        false,
        [
          (false, 'Sent you the raw shots from yesterday.'),
          (true, 'Got them, the light is unreal.'),
        ],
      ),
      (
        'u3',
        true,
        [
          (true, 'Your Kathakali series is brilliant.'),
          (false, 'Thank you! More chapters coming.'),
        ],
      ),
      (
        'u7',
        false,
        [
          (false, 'Are you coming to the Hyderabad Tech Meetup?'),
          (true, 'Yes, speaking at 5 PM.'),
          (false, 'Great, see you there.'),
        ],
      ),
      (
        'u4',
        false,
        [(false, 'Your post is close to State level — keep going!')],
      ),
      (
        'u23',
        false,
        [(false, 'We would like to feature your district story.')],
      ),
    ];
    final out = <Conversation>[];
    for (var i = 0; i < scripts.length; i++) {
      final (uid, online, msgs) = scripts[i];
      final convId = 'cv~$uid';
      final list = <ChatMessage>[];
      for (var j = 0; j < msgs.length; j++) {
        list.add(
          ChatMessage(
            id: '$convId~$j',
            conversationId: convId,
            kind: MessageKind.text,
            text: msgs[j].$2,
            isMine: msgs[j].$1,
            sentAt: now.subtract(
              Duration(minutes: (i * 70) + (msgs.length - j) * 6),
            ),
          ),
        );
      }
      if (uid == 'u2') {
        list.insert(
          1,
          ChatMessage(
            id: '$convId~img',
            conversationId: convId,
            kind: MessageKind.image,
            mediaUrl: 'demo://art/${stableHash('$convId~img')}',
            isMine: false,
            sentAt: now.subtract(const Duration(minutes: 80)),
          ),
        );
      }
      if (uid == 'u3') {
        list.add(
          ChatMessage(
            id: '$convId~voice',
            conversationId: convId,
            kind: MessageKind.voice,
            voiceSeconds: 17,
            isMine: false,
            sentAt: now.subtract(const Duration(minutes: 150)),
          ),
        );
      }
      world.messages[convId] = list;
      final last = list.reduce((a, b) => a.sentAt.isAfter(b.sentAt) ? a : b);
      out.add(
        Conversation(
          id: convId,
          participant: summaryOf(uid),
          lastMessage: last.kind == MessageKind.text
              ? last.text!
              : last.kind == MessageKind.image
              ? 'Photo'
              : 'Voice message',
          lastAt: last.sentAt,
          unreadCount: (!last.isMine && i % 2 == 0) ? 1 + i % 3 : 0,
          isOnline: online,
        ),
      );
    }
    return out;
  }
}
