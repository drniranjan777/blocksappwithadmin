import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/api/json_reader.dart';
import 'package:blocks_app/data/api/mappers.dart';
import 'package:blocks_app/data/models/app_user.dart';
import 'package:blocks_app/data/models/content_models.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/features/reach/domain/reach_config.dart';
import 'package:blocks_app/features/reach/domain/reach_level.dart';
import 'package:blocks_app/features/reach/domain/reach_progress.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fixtures.dart';

JsonObject _j(Map<String, Object?> m) => JsonObject.of(m);

void main() {
  group('a person', () {
    test(
      'gets an @ handle, a verified flag from the badge, and keeps the avatar',
      () {
        final u = userSummaryFromCard(_j(userCard(badge: 'IDENTITY')));
        expect(u.username, '@asha.k');
        expect(u.name, 'Asha K');
        expect(u.isVerified, isTrue);
        expect(u.avatarUrl, 'https://cdn.example.test/a.jpg');
        expect(userSummaryFromCard(_j(userCard())).isVerified, isFalse);
      },
    );

    test(
      'a profile fills the model, with neutral values where the API has none',
      () {
        final now = DateTime.utc(2026, 10, 9, 10);
        final u = appUserFromProfile(
          _j(profileView()),
          now: now,
          twoFactorEnabled: true,
        );
        expect(u.username, '@asha.k');
        expect(u.followersCount, 120);
        expect(u.postsCount, 33);
        expect(u.district, 'Hyderabad');
        expect(u.state, 'Telangana');
        expect(u.country, 'India');
        expect(u.website, 'https://asha.example.test');
        expect(u.verificationType, VerificationType.identity);
        expect(u.accountAgeDays, 30);
        expect(u.isTwoFactorEnabled, isTrue);
        // Not sent by the API: nothing is granted by default.
        expect(u.reachLevel, ReachLevel.district);
        expect(u.hasMajorViolation, isFalse);
      },
    );

    test('a profile without a place or counts still maps', () {
      final u = appUserFromProfile(
        _j({'id': uuidA, 'username': 'x', 'badge': 'NONE'}),
        now: DateTime.utc(2026, 10, 9),
      );
      expect(u.district, '');
      expect(u.followersCount, 0);
      expect(u.name, 'x');
    });

    test('maps each badge to a verification type', () {
      expect(
        verificationFromBadge('OFFICIAL_BUSINESS'),
        VerificationType.business,
      );
      expect(
        verificationFromBadge('VERIFIED_PUBLISHER'),
        VerificationType.publisher,
      );
      expect(verificationFromBadge('NONE'), isNull);
    });
  });

  group('a post', () {
    test('maps text, counts, place, time, viewer state and hashtags', () {
      final p = postFromView(_j(postView(liked: true)), floor: floorOf);
      expect(p.id, uuidB);
      expect(p.type, PostType.text);
      expect(p.caption, 'Hello Hyderabad #blocks');
      expect(p.hashtags, ['blocks']);
      expect(p.district, 'Hyderabad');
      expect(p.state, 'Telangana');
      expect(p.createdAt, DateTime.utc(2026, 10, 9, 10));
      expect(p.stats.likes, 4);
      expect(p.stats.saves, 3);
      expect(p.isLiked, isTrue);
      expect(p.isSaved, isFalse);
      expect(p.mediaUrl, isNull);
    });

    test('a photo shows its first picture', () {
      final p = postFromView(
        _j(
          postView(
            type: 'PHOTO',
            media: [
              mediaView(),
              mediaView(url: 'https://x/2.jpg'),
            ],
          ),
        ),
        floor: floorOf,
      );
      expect(p.type, PostType.image);
      expect(p.mediaUrl, 'https://cdn.example.test/p.jpg');
    });

    test('the rung the server decided is the rung the app works out, for every rung', () {
      const calculator = ReachCalculator(
        ReachConfig(
          unlockAt: {
            ReachLevel.district: 0,
            ReachLevel.state: 10001,
            ReachLevel.national: 100001,
            ReachLevel.global: 1000001,
          },
        ),
      );
      const rungs = {
        'DISTRICT': ReachLevel.district,
        'STATE': ReachLevel.state,
        'NATIONAL': ReachLevel.national,
        'GLOBAL': ReachLevel.global,
      };
      for (final MapEntry(:key, :value) in rungs.entries) {
        final p = postFromView(_j(postView(reachLevel: key)), floor: floorOf);
        expect(
          calculator.evaluate(p.qualifiedReach).current,
          value,
          reason: key,
        );
      }
    });

    test(
      'an unknown rung is the lowest, never higher than the server said',
      () {
        expect(reachLevelFromApi('SOMETHING_NEW'), ReachLevel.district);
        expect(reachLevelFromApi(null), ReachLevel.district);
      },
    );

    test('a post without an id or time is the server\'s mistake, reported as a failure', () {
      expect(
        () => postFromView(_j({...postView(), 'id': null}), floor: floorOf),
        throwsA(isA<UnknownFailure>()),
      );
      expect(
        () => postFromView(
          _j({...postView(), 'publishedAt': 'nope'}),
          floor: floorOf,
        ),
        throwsA(isA<UnknownFailure>()),
      );
    });
  });

  group('a reel', () {
    test(
      'in the feed is a video post with the cover and a whole-second length',
      () {
        final p = postFromReelView(_j(reelView()), floor: floorOf);
        expect(p.type, PostType.video);
        expect(p.mediaUrl, 'https://cdn.example.test/r-cover.jpg');
        expect(p.durationSeconds, 13);
        expect(p.isLiked, isTrue);
        expect(p.stats.views, 300);
      },
    );

    test('in the player has the video, music and length', () {
      final r = reelFromView(_j(reelView()), floor: floorOf)!;
      expect(r.videoUrl, 'https://cdn.example.test/r.m3u8');
      expect(r.musicTitle, 'Sunrise');
      expect(r.duration, const Duration(milliseconds: 12500));
      expect(r.author.username, '@ravi');
    });

    test('is left out of the player while it has no video yet', () {
      expect(
        reelFromView(_j({...reelView(), 'video': null}), floor: floorOf),
        isNull,
      );
    });
  });

  test('a comment keeps its text, author and like count', () {
    final c = commentFromView(_j(commentView(body: 'Great reel')));
    expect(c.text, 'Great reel');
    expect(c.author.username, '@meera');
    expect(c.likes, 2);
    expect(c.createdAt, DateTime.utc(2026, 10, 9, 10, 30));
  });

  group('a notification', () {
    test('keeps the server-written text and points at what it is about', () {
      final n = notificationFromView(_j(notificationView()));
      expect(n.title, 'Meera liked your post');
      expect(n.category, NotificationCategory.like);
      expect(n.isRead, isFalse);
      expect(n.targetId, uuidB);
    });

    test('maps every server type to a category', () {
      const expected = {
        'NEW_FOLLOWER': NotificationCategory.follower,
        'FOLLOW_REQUEST': NotificationCategory.follower,
        'LIKE': NotificationCategory.like,
        'COMMENT': NotificationCategory.comment,
        'MENTION': NotificationCategory.comment,
        'REACH_MILESTONE': NotificationCategory.reach,
        'EARNINGS': NotificationCategory.earnings,
        'KYC_STATUS': NotificationCategory.earnings,
        'PAYOUT_STATUS': NotificationCategory.earnings,
        'SECURITY_ALERT': NotificationCategory.security,
        'PASSWORD_CHANGED': NotificationCategory.security,
        'NEW_DEVICE_LOGIN': NotificationCategory.security,
        'MODERATION_DECISION': NotificationCategory.safety,
        'CAMPAIGN_STATUS': NotificationCategory.business,
        'SYSTEM': NotificationCategory.safety,
      };
      for (final MapEntry(:key, :value) in expected.entries) {
        expect(notificationCategoryOf(key), value, reason: key);
      }
    });

    test('a security alert has no target', () {
      final n = notificationFromView(
        _j(notificationView(type: 'SECURITY_ALERT', data: const {})),
      );
      expect(n.targetId, isNull);
    });
  });
}
