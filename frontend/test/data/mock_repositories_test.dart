import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/mock/mock_account_repositories.dart';
import 'package:blocks_app/data/mock/mock_catalog.dart';
import 'package:blocks_app/data/mock/mock_content_repositories.dart';
import 'package:blocks_app/data/mock/mock_world.dart';
import 'package:blocks_app/data/models/app_user.dart';
import 'package:blocks_app/data/models/business_models.dart';
import 'package:blocks_app/data/models/content_models.dart';
import 'package:blocks_app/data/models/discovery_models.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/features/reach/domain/reach_config.dart';
import 'package:blocks_app/features/reach/domain/reach_progress.dart';
import 'package:flutter_test/flutter_test.dart';

MockWorld _world() => MockWorld(clock: () => DateTime(2026, 10, 8, 12));

void main() {
  group('feeds (cursor pagination)', () {
    test('pages without overlap and ends with a null cursor', () async {
      final repo = MockFeedRepository(_world());
      final first = await repo.getFeed(FeedType.forYou, limit: 20);
      expect(first.items, hasLength(20));
      expect(first.nextCursor, isNotNull);

      final second = await repo.getFeed(
        FeedType.forYou,
        cursor: first.nextCursor,
        limit: 20,
      );
      final firstIds = first.items.map((p) => p.id).toSet();
      expect(second.items.any((p) => firstIds.contains(p.id)), isFalse);
    });

    test('limit is capped so a client cannot request everything', () async {
      final page = await MockFeedRepository(_world())
          .getFeed(FeedType.forYou, limit: 100000);
      expect(page.items.length, lessThanOrEqualTo(50));
    });

    test('feed is deterministic for the same cursor', () async {
      final a = await MockFeedRepository(_world()).getFeed(FeedType.india);
      final b = await MockFeedRepository(_world()).getFeed(FeedType.india);
      expect(a.items.map((p) => p.id), b.items.map((p) => p.id));
    });

    test('Near You is district-level (Hyderabad), never GPS', () async {
      final page = await MockFeedRepository(_world())
          .getFeed(FeedType.nearYou, limit: 20);
      expect(page.items.every((p) => p.district == 'Hyderabad'), isTrue);
    });

    test('Rising posts are all close to their next level', () async {
      final page = await MockFeedRepository(_world())
          .getFeed(FeedType.rising, limit: 30);
      expect(page.items, isNotEmpty);
      const calc = ReachCalculator(ReachConfig.demo());
      for (final p in page.items) {
        final progress = calc.evaluate(p.qualifiedReach);
        expect(progress.next, isNotNull, reason: p.id);
        expect(
          progress.fractionToNext,
          greaterThanOrEqualTo(0.5),
          reason: p.id,
        );
      }
    });

    test('blocked authors disappear from feeds', () async {
      final w = _world();
      final feed = MockFeedRepository(w);
      final before = await feed.getFeed(FeedType.following, limit: 40);
      final author = before.items.first.author.id;

      await MockModerationRepository(w).blockUser(author);
      final after = await feed.getFeed(FeedType.following, limit: 40);
      expect(after.items.any((p) => p.author.id == author), isFalse);
    });
  });

  group('posts', () {
    test('like / unlike updates the flag and the count', () async {
      final w = _world();
      final repo = MockPostRepository(w);
      final id = (await MockFeedRepository(w).getFeed(FeedType.forYou))
          .items
          .first
          .id;
      final base = await repo.getPost(id);

      await repo.likePost(id);
      final liked = await repo.getPost(id);
      expect(liked.isLiked, isTrue);
      expect(liked.stats.likes, base.stats.likes + 1);

      await repo.unlikePost(id);
      final unliked = await repo.getPost(id);
      expect(unliked.isLiked, isFalse);
      expect(unliked.stats.likes, base.stats.likes);
    });

    test('liking twice does not double count', () async {
      final w = _world();
      final repo = MockPostRepository(w);
      const id = 'p~feed~forYou~3';
      final base = (await repo.getPost(id)).stats.likes;
      await repo.likePost(id);
      await repo.likePost(id);
      expect((await repo.getPost(id)).stats.likes, base + 1);
    });

    test('unknown post id throws NotFoundFailure', () {
      expect(
        MockPostRepository(_world()).getPost('p~nope~1'),
        throwsA(isA<NotFoundFailure>()),
      );
      expect(
        MockPostRepository(_world()).likePost('garbage'),
        throwsA(isA<NotFoundFailure>()),
      );
    });

    test('share increments the share count', () async {
      final repo = MockPostRepository(_world());
      const id = 'p~feed~forYou~5';
      final before = (await repo.getPost(id)).stats.shares;
      await repo.sharePost(id);
      expect((await repo.getPost(id)).stats.shares, before + 1);
    });

    test(
      'createPost publishes at the top of the feed starting at zero reach',
      () async {
        final w = _world();
        final posts = MockPostRepository(w);
        final created = await posts.createPost(
          const PostDraft(
            type: PostType.text,
            caption: 'Hello #Hyderabad #BLOCKS',
            district: 'Hyderabad',
            state: 'Telangana',
          ),
        );
        expect(created.qualifiedReach, 0);
        expect(created.hashtags, ['#Hyderabad', '#BLOCKS']);

        final feed = await MockFeedRepository(w).getFeed(FeedType.forYou);
        expect(feed.items.first.id, created.id);
        expect(w.me.postsCount, 129);
      },
    );

    test('invalid post data is rejected', () async {
      final repo = MockPostRepository(_world());
      Future<void> create(PostDraft d) => repo.createPost(d);

      // Text post without text.
      await expectLater(
        create(
          const PostDraft(
            type: PostType.text,
            caption: '  ',
            district: 'Hyderabad',
            state: 'Telangana',
          ),
        ),
        throwsA(isA<ValidationFailure>()),
      );
      // Image post without media.
      await expectLater(
        create(
          const PostDraft(
            type: PostType.image,
            caption: 'x',
            district: 'Hyderabad',
            state: 'Telangana',
          ),
        ),
        throwsA(isA<ValidationFailure>()),
      );
      // Caption over the limit.
      await expectLater(
        create(
          PostDraft(
            type: PostType.text,
            caption: 'a' * 2201,
            district: 'Hyderabad',
            state: 'Telangana',
          ),
        ),
        throwsA(isA<ValidationFailure>()),
      );
      // Missing location.
      await expectLater(
        create(
          const PostDraft(
            type: PostType.text,
            caption: 'ok',
            district: '',
            state: '',
          ),
        ),
        throwsA(isA<ValidationFailure>()),
      );
    });

    test('comments paginate and new comments appear first', () async {
      final repo = MockPostRepository(_world());
      const id = 'p~feed~forYou~1';
      final first = await repo.getComments(id, limit: 15);
      expect(first.items, hasLength(15));
      expect(first.nextCursor, isNotNull);

      await repo.addComment(id, '  Great one!  ');
      final again = await repo.getComments(id, limit: 15);
      expect(again.items.first.text, 'Great one!');
      expect(
        () => repo.addComment(id, '   '),
        throwsA(isA<ValidationFailure>()),
      );
    });
  });

  group('follow / unfollow', () {
    test('follow and unfollow update following set and counts', () async {
      final w = _world();
      final repo = MockUserRepository(w);
      final startCount = w.me.followingCount;

      await repo.follow('u10');
      expect(await repo.getFollowingIds(), contains('u10'));
      expect(w.me.followingCount, startCount + 1);

      await repo.unfollow('u10');
      expect(await repo.getFollowingIds(), isNot(contains('u10')));
      expect(w.me.followingCount, startCount);
    });

    test('following twice is idempotent', () async {
      final w = _world();
      final repo = MockUserRepository(w);
      await repo.follow('u10');
      await repo.follow('u10');
      expect(w.me.followingCount, 643);
    });

    test('cannot follow yourself or an unknown user', () async {
      final repo = MockUserRepository(_world());
      expect(() => repo.follow(meId), throwsA(isA<ValidationFailure>()));
      expect(() => repo.follow('nobody'), throwsA(isA<NotFoundFailure>()));
    });

    test('demo user matches the product brief', () async {
      final me = await MockUserRepository(_world()).getCurrentUser();
      expect(me.name, 'Aarav Kumar');
      expect(me.username, '@aarav.blocks');
      expect(me.district, 'Hyderabad');
      expect(me.followersCount, 18450);
      expect(me.followingCount, 642);
      expect(me.isVerified, isTrue);
    });
  });

  group('reach', () {
    test('simulated boost can lift a post to the next level', () async {
      final w = _world();
      final reach = MockReachRepository(w);
      // Own post sitting at 82% towards State (8,200 qualified reach).
      final result = await reach.simulateBoost('p~user~me~1', amount: 3000);
      expect(result.before.current.code, 'D1');
      expect(result.after.current.code, 'S1');
      expect(result.didLevelUp, isTrue);
    });

    test('small boost does not change level', () async {
      final result = await MockReachRepository(_world())
          .simulateBoost('p~user~me~2', amount: 100);
      expect(result.didLevelUp, isFalse);
    });
  });

  group('trust & safety', () {
    test('report is recorded; mute and block hide, unblock restores', () async {
      final w = _world();
      final mod = MockModerationRepository(w);

      await mod.report(
        const ReportRequest(
          targetType: ReportTargetType.post,
          targetId: 'p~feed~forYou~0',
          reason: ReportReason.spam,
        ),
      );
      expect(w.reports, hasLength(1));

      await mod.muteUser('u3');
      expect(await mod.getHiddenUserIds(), contains('u3'));
      await mod.blockUser('u3');
      expect(await mod.getMutedUsers(), isEmpty);
      expect((await mod.getBlockedUsers()).single.id, 'u3');
      await mod.unblockUser('u3');
      expect(await mod.getHiddenUserIds(), isEmpty);
    });

    test('blocking someone you follow also unfollows them', () async {
      final w = _world();
      await MockModerationRepository(w).blockUser('u1');
      expect(w.following, isNot(contains('u1')));
    });

    test('cannot block yourself', () {
      expect(
        () => MockModerationRepository(_world()).blockUser(meId),
        throwsA(isA<ValidationFailure>()),
      );
    });
  });

  group('verification & business', () {
    test('request -> pending -> demo approval -> verified', () async {
      final w = _world();
      final repo = MockVerificationRepository(w);
      expect(
        (await repo.submit(VerificationType.business)).state,
        VerificationState.pending,
      );
      final done = await repo.approveForDemo();
      expect(done.state, VerificationState.verified);
      expect(done.type, VerificationType.business);
      expect(w.me.verificationType, VerificationType.business);
    });

    test(
      'campaign requires post, goal and location, then simulates reach',
      () async {
        final repo = MockAdRepository(_world());
        expect(
          () => repo.createCampaign(const CampaignDraft()),
          throwsA(isA<ValidationFailure>()),
        );
        final c = await repo.createCampaign(
          const CampaignDraft(
            postId: 'p~biz~biz_me~0',
            goal: AdGoal.reach,
            locations: {'Hyderabad'},
            dailyBudgetRupees: 500,
            days: 5,
          ),
        );
        expect(c.status, CampaignStatus.demo);
        expect(c.estimatedReachMax, greaterThan(c.estimatedReachMin));
      },
    );
  });

  group('notifications & messages', () {
    test('unread count drops to zero after mark-all-read', () async {
      final repo = MockNotificationRepository(_world());
      expect(await repo.getUnreadCount(), 12);
      await repo.markAllRead();
      expect(await repo.getUnreadCount(), 0);
    });

    test('category filter only returns that category', () async {
      final page = await MockNotificationRepository(_world())
          .getNotifications(category: NotificationCategory.reach);
      expect(page.items, isNotEmpty);
      expect(
        page.items.every((n) => n.category == NotificationCategory.reach),
        isTrue,
      );
    });

    test('sending a message appends it and updates the conversation', () async {
      final w = _world();
      final repo = MockMessageRepository(w);
      await repo.sendMessage('cv~u1', 'See you Saturday');
      final page = await repo.getMessages('cv~u1');
      expect(page.items.first.text, 'See you Saturday');
      expect(page.items.first.isMine, isTrue);
      expect(
        (await repo.getConversation('cv~u1')).lastMessage,
        'See you Saturday',
      );
      expect(
        () => repo.sendMessage('cv~u1', ' '),
        throwsA(isA<ValidationFailure>()),
      );
    });
  });

  group('explore', () {
    test(
      'search matches users and hashtags, empty query returns nothing',
      () async {
        final repo = MockExploreRepository(_world());
        expect((await repo.search('meera')).users.single.name, 'Meera Reddy');
        expect((await repo.search('#food')).hashtags, isNotEmpty);
        expect((await repo.search('   ')).isEmpty, isTrue);
      },
    );

    test('category filter returns posts for that category', () async {
      final page = await MockExploreRepository(_world()).getExplorePosts(
        scope: ExploreScope.india,
        category: ExploreCategory.food,
      );
      expect(page.items, isNotEmpty);
    });
  });
}
