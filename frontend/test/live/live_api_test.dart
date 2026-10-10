// Runs the app's real repositories against a RUNNING backend, to prove the
// request and response shapes the mappers were written for are the shapes the
// server sends. It needs a development server (the dev outbox supplies the
// one-time codes), so it is skipped unless you point it at one:
//
//   cd backend && npm run db:up        # in one terminal
//   cd backend && npx nest start       # in another (DATABASE_URL from db:up)
//   cd frontend
//   BLOCKS_LIVE_API=http://127.0.0.1:4000 flutter test test/live
//
// Each run creates fresh, throwaway accounts (qa<random>@example.test) and posts
// to whichever database the server is using: never point it at a real one.
@TestOn('vm')
library;

import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:blocks_app/app/config/app_config.dart';
import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/core/services/local_store.dart';
import 'package:blocks_app/data/api/api_auth_repository.dart';
import 'package:blocks_app/data/api/api_client.dart';
import 'package:blocks_app/data/api/api_creator_repository.dart';
import 'package:blocks_app/data/api/api_feed_repository.dart';
import 'package:blocks_app/data/api/api_moderation_repository.dart';
import 'package:blocks_app/data/api/api_notification_repository.dart';
import 'package:blocks_app/data/api/api_password_repositories.dart';
import 'package:blocks_app/data/api/api_post_repository.dart';
import 'package:blocks_app/data/api/api_profile_repository.dart';
import 'package:blocks_app/data/api/media_uploader.dart';
import 'package:blocks_app/data/api/api_reach_repository.dart';
import 'package:blocks_app/data/api/api_reel_repository.dart';
import 'package:blocks_app/data/api/api_security_repository.dart';
import 'package:blocks_app/data/api/api_session_repository.dart';
import 'package:blocks_app/data/api/api_user_repository.dart';
import 'package:blocks_app/data/api/content_kinds.dart';
import 'package:blocks_app/data/api/device_identity.dart';
import 'package:blocks_app/data/api/token_store.dart';
import 'package:blocks_app/data/models/auth_models.dart';
import 'package:blocks_app/data/models/creator_models.dart';
import 'package:blocks_app/features/reach/domain/reach_level.dart';
import 'package:blocks_app/data/models/business_models.dart';
import 'package:blocks_app/data/models/content_models.dart';
import 'package:blocks_app/data/models/discovery_models.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/data/models/profile_models.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show TargetPlatform;
import 'package:flutter_test/flutter_test.dart';

import '../helpers/png.dart';

final String? _server = Platform.environment['BLOCKS_LIVE_API'];

const _password = 'Tr0ub4dor&3xample';

/// One signed-in (or not yet signed-in) person, wired like the app wires them.
class _Person {
  _Person(String origin, this.username) {
    final config = AppConfig(
      environment: AppEnvironment.staging,
      useMockData: false,
      apiBaseUrl: origin,
      enableLogging: false,
    );
    api = ApiClient(
      createApiDio(
        baseUri: config.apiBaseUri,
        tokens: tokens,
        onSessionEnded: () => sessionsEnded++,
      ),
    );
    auth = ApiAuthRepository(
      api: api,
      tokens: tokens,
      store: InMemoryLocalStore(),
      device: DeviceIdentity.describe(
        randomDeviceId(),
        isWeb: false,
        platform: TargetPlatform.android,
      ),
    );
    final reach = ApiReachRepository(api);
    final kinds = ContentKinds();
    users = ApiUserRepository(api);
    posts = ApiPostRepository(api, reach.floors, kinds, MediaUploader(api));
    feed = ApiFeedRepository(api, reach.floors, kinds);
    reels = ApiReelRepository(api, reach.floors, kinds);
    notifications = ApiNotificationRepository(api);
    sessions = ApiSessionRepository(api);
    profile = ApiProfileRepository(api, MediaUploader(api), users);
    password = ApiPasswordRepository(api);
    reset = ApiPasswordResetRepository(api);
    security = ApiSecurityRepository(api);
    moderation = ApiModerationRepository(api);
    creator = ApiCreatorRepository(api);
    insights = ApiCreatorInsightsRepository(api);
    this.reach = reach;
  }

  final String username;
  final tokens = MemoryTokenStore();
  int sessionsEnded = 0;
  late final ApiClient api;
  late final ApiAuthRepository auth;
  late final ApiUserRepository users;
  late final ApiPostRepository posts;
  late final ApiFeedRepository feed;
  late final ApiReelRepository reels;
  late final ApiNotificationRepository notifications;
  late final ApiSessionRepository sessions;
  late final ApiProfileRepository profile;
  late final ApiPasswordRepository password;
  late final ApiPasswordResetRepository reset;
  late final ApiSecurityRepository security;
  late final ApiModerationRepository moderation;
  late final ApiCreatorRepository creator;
  late final ApiCreatorInsightsRepository insights;
  late final ApiReachRepository reach;

  String get email => '$username@example.test';

  /// Signs in with [password] on this "device" (each [_Person] is its own).
  Future<LoginResult> signIn(String password, {String? identifier}) =>
      auth.signInWithPassword(
        identifier: identifier ?? username,
        password: password,
      );

  /// Creates the account and confirms it with the code from the dev outbox.
  Future<void> signUp(String origin, {String displayName = 'QA Person'}) async {
    final challenge = await auth.register(
      RegistrationRequest(
        username: username,
        displayName: displayName,
        password: _password,
        dateOfBirth: DateTime(1998, 4, 12),
        email: email,
      ),
    );
    expect(challenge.kind, CodeChallengeKind.contactVerification);
    expect(challenge.destinationMasked, isNotNull);
    expect(challenge.resendAvailableAt, isNotNull);
    final code = await _codeSentTo(origin, email);
    final result = await auth.submitCode(challenge, code);
    expect(result, isA<LoginSucceeded>());
  }
}

/// The newest 6-digit code the dev outbox "sent" to [address].
Future<String> _codeSentTo(String origin, String address) async {
  final dio = Dio(BaseOptions(baseUrl: origin));
  final res = await dio.get<Map<String, dynamic>>(
    '/api/v1/dev/outbox',
    queryParameters: {'to': address},
  );
  final data = (res.data!['data'] as List).cast<Map<String, dynamic>>();
  expect(data, isNotEmpty, reason: 'nothing was sent to $address');
  final match = RegExp(r'\b(\d{6})\b').firstMatch(data.first['body'] as String);
  return match!.group(1)!;
}

/// Polls [read] until it returns something non-null, for work the server does
/// just after answering (notifications are written a moment later).
Future<T> _eventually<T>(Future<T?> Function() read) async {
  for (var i = 0; i < 20; i++) {
    final v = await read();
    if (v != null) return v;
    await Future<void>.delayed(const Duration(milliseconds: 250));
  }
  fail('did not appear within 5 seconds');
}

void main() {
  final origin = _server;
  final run = origin != null && origin.isNotEmpty;
  const skip = 'set BLOCKS_LIVE_API=http://127.0.0.1:4000 to run (see header)';

  group('the app against the running API', skip: run ? false : skip, () {
    final suffix = Random().nextInt(900000) + 100000;
    late final _Person asha;
    late final _Person ravi;
    late final String postId;

    setUpAll(() {
      asha = _Person(origin!, 'qa.asha$suffix');
      ravi = _Person(origin, 'qa.ravi$suffix');
    });

    test(
      'creating accounts: the server\'s refusals arrive as field errors',
      () async {
        final p = _Person(origin!, 'x');
        await expectLater(
          p.auth.register(
            RegistrationRequest(
              username: '!!',
              displayName: 'X',
              password: 'short',
              dateOfBirth: DateTime.now().subtract(
                const Duration(days: 365 * 5),
              ),
              email: 'nobody@example.test',
            ),
          ),
          throwsA(
            isA<FieldValidationFailure>().having(
              (f) => f.errors.keys,
              'fields',
              containsAll(['username', 'password', 'dateOfBirth']),
            ),
          ),
        );
      },
    );

    test('creating accounts: sign-up, code, and a session', () async {
      await asha.signUp(origin!, displayName: 'Asha Live');
      await ravi.signUp(origin, displayName: 'Ravi Live');
      expect(asha.auth.isSignedIn, isTrue);
      expect(
        asha.tokens.current!.expiresAt.isAfter(DateTime.now().toUtc()),
        isTrue,
      );

      // The same username cannot be taken twice.
      await expectLater(
        _Person(origin, asha.username).auth.register(
          RegistrationRequest(
            username: asha.username,
            displayName: 'Copy',
            password: _password,
            dateOfBirth: DateTime(1998),
            email: 'other-${asha.email}',
          ),
        ),
        throwsA(
          isA<ConflictFailure>().having(
            (f) => f.code,
            'code',
            'USERNAME_TAKEN',
          ),
        ),
      );
    });

    test('a wrong password is a rejection with the real tries left', () async {
      final r = await _Person(origin!, asha.username).auth.signInWithPassword(
        identifier: asha.username,
        password: 'not-the-password',
      );
      expect(r, isA<LoginRejected>());
      expect((r as LoginRejected).attemptsRemaining, inInclusiveRange(1, 4));
    });

    test('profile: the signed-in user and another person\'s profile', () async {
      final me = await asha.users.getCurrentUser();
      expect(me.username, '@${asha.username}');
      expect(me.name, 'Asha Live');
      expect(me.isTwoFactorEnabled, isFalse);
      expect(me.followersCount, 0);

      final seenByRavi = await ravi.users.getUser(me.id);
      expect(seenByRavi.username, me.username);

      await expectLater(
        ravi.users.getUser('00000000-0000-4000-8000-000000000000'),
        throwsA(isA<NotFoundFailure>()),
      );
    });

    test('the reach ladder comes from the server', () async {
      final config = await asha.reach.getConfig();
      expect(config.unlockAt.length, 4);
      expect(
        config.unlockAt.values.toList()..sort(),
        config.unlockAt.values.toList(),
      );
    });

    test('posting: publish, read back, like, save, comment', () async {
      final created = await asha.posts.createPost(
        const PostDraft(
          type: PostType.text,
          caption: 'Live contract test #blockslive',
          district: '',
          state: '',
          audience: PostAudience.everyone,
        ),
      );
      postId = created.id;
      expect(created.caption, 'Live contract test #blockslive');
      expect(created.hashtags, contains('blockslive'));
      expect(created.author.username, '@${asha.username}');

      // Another person reads it, likes it, saves it and comments.
      final read = await ravi.posts.getPost(postId);
      expect(read.isLiked, isFalse);
      await ravi.posts.likePost(postId);
      await ravi.posts.likePost(postId); // twice is the same as once
      await ravi.posts.savePost(postId);
      final after = await ravi.posts.getPost(postId);
      expect(after.isLiked, isTrue);
      expect(after.isSaved, isTrue);
      expect(after.stats.likes, 1);

      final comment = await ravi.posts.addComment(postId, 'Nice one!');
      expect(comment.text, 'Nice one!');
      final comments = await asha.posts.getComments(postId);
      expect(comments.items.map((c) => c.text), contains('Nice one!'));

      await ravi.posts.unlikePost(postId);
      expect((await ravi.posts.getPost(postId)).stats.likes, 0);

      await expectLater(
        asha.posts.addComment(postId, '   '),
        throwsA(isA<ValidationFailure>()),
      );
    });

    test('a refused post does not publish: an empty caption', () async {
      await expectLater(
        asha.posts.createPost(
          const PostDraft(
            type: PostType.text,
            caption: '  ',
            district: '',
            state: '',
          ),
        ),
        throwsA(isA<ValidationFailure>()),
      );
    });

    test('following, then the home feed shows the post', () async {
      final asMe = await asha.users.getCurrentUser();
      await ravi.users.follow(asMe.id);
      expect(await ravi.users.getFollowingIds(), contains(asMe.id));
      expect((await asha.users.getCurrentUser()).followersCount, 1);

      for (final tab in [FeedType.following, FeedType.forYou]) {
        final page = await ravi.feed.getFeed(tab);
        expect(page.items.map((p) => p.id), contains(postId), reason: '$tab');
      }
      // Tabs backed by streams that nothing has reached yet are empty, not errors.
      expect((await ravi.feed.getFeed(FeedType.india)).items, isEmpty);

      final profilePosts = await ravi.posts.getUserPosts(asMe.id);
      expect(profilePosts.items.map((p) => p.id), contains(postId));

      // The post's rung agrees with the server's ladder.
      final post = (await ravi.feed.getFeed(FeedType.following)).items
          .firstWhere((p) => p.id == postId);
      expect(post.qualifiedReach, 0);
    });

    test('notifications: follower, like and comment arrive, can be read, and the count follows', () async {
      Future<AppNotification?> find(NotificationCategory c) async {
        final page = await asha.notifications.getNotifications();
        for (final n in page.items) {
          if (n.category == c) return n;
        }
        return null;
      }

      // A like to notice (earlier test took it back, so like again).
      await ravi.posts.likePost(postId);
      final follower = await _eventually(
        () => find(NotificationCategory.follower),
      );
      final comment = await _eventually(
        () => find(NotificationCategory.comment),
      );
      final like = await _eventually(() => find(NotificationCategory.like));
      expect(follower.title, isNotEmpty);
      expect(comment.targetId, postId);
      expect(like.targetId, postId);
      expect(like.isRead, isFalse);

      final unread = await asha.notifications.getUnreadCount();
      expect(unread, greaterThanOrEqualTo(3));

      await asha.notifications.markRead(like.id);
      expect(await asha.notifications.getUnreadCount(), unread - 1);

      final onlyLikes = await asha.notifications.getNotifications(
        category: NotificationCategory.like,
      );
      expect(onlyLikes.items, isNotEmpty);
      expect(
        onlyLikes.items.every((n) => n.category == NotificationCategory.like),
        isTrue,
      );

      await asha.notifications.markAllRead();
      expect(await asha.notifications.getUnreadCount(), 0);
    });

    test('people search finds a person by part of their username', () async {
      final found = await ravi.users.searchUsers('qa.asha$suffix');
      expect(found.map((u) => u.username), contains('@${asha.username}'));
      expect(await ravi.users.searchUsers('q'), isEmpty);
    });

    test('reels: an empty player is an empty page, not an error', () async {
      final page = await ravi.reels.getReels();
      expect(page.items, isA<List<Reel>>());
    });

    test('unfollowing', () async {
      final asMe = await asha.users.getCurrentUser();
      await ravi.users.unfollow(asMe.id);
      expect(await ravi.users.getFollowingIds(), isNot(contains(asMe.id)));
    });

    test('an expiring session is renewed on its own, once, and the rotated token cannot be reused', () async {
      final before = asha.tokens.current!;
      // Say the access token is about to expire: the next call must renew first.
      await asha.tokens.save(
        AuthTokens(
          accessToken: before.accessToken,
          refreshToken: before.refreshToken,
          expiresAt: DateTime.now().toUtc().add(const Duration(seconds: 5)),
        ),
      );
      final me = await asha.users.getCurrentUser();
      expect(me.username, '@${asha.username}');
      final after = asha.tokens.current!;
      expect(after.refreshToken, isNot(before.refreshToken));
      expect(after.accessToken, isNot(before.accessToken));
      expect(asha.sessionsEnded, 0);

      // Several calls at once after another expiry still renew only once.
      await asha.tokens.save(
        AuthTokens(
          accessToken: after.accessToken,
          refreshToken: after.refreshToken,
          expiresAt: DateTime.now().toUtc().add(const Duration(seconds: 5)),
        ),
      );
      await Future.wait([
        asha.users.getCurrentUser(),
        asha.notifications.getUnreadCount(),
        asha.feed.getFeed(FeedType.following),
        asha.users.getFollowingIds(),
      ]);
      expect(
        asha.sessionsEnded,
        0,
        reason: 'a second renewal would have been seen as theft',
      );
      final third = asha.tokens.current!;
      expect(third.refreshToken, isNot(after.refreshToken));

      // A refresh token from two renewals ago proves nothing (the server only
      // remembers the last one it replaced): it is refused, and the real owner is
      // not signed out by someone presenting it.
      final plain = Dio(BaseOptions(baseUrl: '$origin/api/v1'));
      Matcher refused() => throwsA(
        isA<DioException>().having(
          (e) => e.response?.statusCode,
          'status',
          401,
        ),
      );
      await expectLater(
        plain.post<Object?>(
          '/auth/refresh',
          data: {'refreshToken': before.refreshToken},
        ),
        refused(),
      );
      expect((await asha.users.getCurrentUser()).username, '@${asha.username}');
      expect(asha.sessionsEnded, 0);

      // The token just replaced works for a few seconds (a response may have
      // been lost on the way). Presented after that, it means someone else has a
      // copy: the whole session is ended, for the thief and the owner alike.
      await Future<void>.delayed(const Duration(seconds: 11));
      await expectLater(
        plain.post<Object?>(
          '/auth/refresh',
          data: {'refreshToken': after.refreshToken},
        ),
        refused(),
      );
      await expectLater(
        asha.users.getCurrentUser(),
        throwsA(isA<UnauthorizedFailure>()),
      );
      expect(asha.sessionsEnded, greaterThanOrEqualTo(1));
      expect(asha.tokens.current, isNull);
    });

    test(
      'signing in again, and signing out ends the session on the server too',
      () async {
        final again = _Person(origin!, asha.username);
        final result = await again.auth.signInWithPassword(
          identifier: asha.email,
          password: _password,
        );
        expect(result, isA<LoginSucceeded>());
        expect(again.auth.isSignedIn, isTrue);
        expect(
          (await again.users.getCurrentUser()).username,
          '@${asha.username}',
        );

        final oldAccess = again.tokens.current!.accessToken;
        await again.auth.signOut();
        expect(again.tokens.current, isNull);

        // The access token that was just signed out no longer works anywhere.
        final dio = Dio(
          BaseOptions(baseUrl: '$origin/api/v1', validateStatus: (_) => true),
        );
        final res = await dio.get<Object?>(
          '/users/me',
          options: Options(headers: {'Authorization': 'Bearer $oldAccess'}),
        );
        expect(res.statusCode, 401);
      },
    );

    test('a request without a session is refused, and says so', () async {
      final nobody = _Person(origin!, 'nobody');
      await expectLater(
        nobody.users.getCurrentUser(),
        throwsA(isA<UnauthorizedFailure>()),
      );
      await expectLater(
        nobody.feed.getFeed(FeedType.following),
        throwsA(isA<UnauthorizedFailure>()),
      );
    });
  });

  group('account security against the running API', skip: run ? false : skip, () {
    final suffix = Random().nextInt(900000) + 100000;
    late final _Person mira;
    const newPassword = 'Monsoon#Rain-4417';

    setUpAll(() async {
      mira = _Person(origin!, 'qa.mira$suffix');
      await mira.signUp(origin, displayName: 'Mira Live');
    });

    test('the rules shown are the rules the server enforces', () async {
      final policy = await mira.security.getPolicy();
      expect(policy.password.minLength, 10);
      expect(policy.password.requireSpecial, isTrue);
      expect(policy.maxFailedAttempts, 5);
      expect(policy.otpLength, 6);
      expect(policy.otpResendCooldown, const Duration(seconds: 30));
      // And they really are enforced: a password that breaks them is refused.
      await expectLater(
        mira.password.changePassword(
          currentPassword: _password,
          newPassword: 'short1!',
        ),
        throwsA(const ValidationFailure('weakPassword')),
      );
    });

    test(
      'devices: a second phone appears, and signing it out ends its session',
      () async {
        final second = _Person(origin!, mira.username);
        expect(await second.signIn(_password), isA<LoginSucceeded>());

        final seen = await mira.sessions.getSessions();
        expect(seen, hasLength(2));
        expect(seen.first.isCurrent, isTrue);
        expect(seen.where((s) => s.isCurrent), hasLength(1));
        expect(seen.last.platform, 'Android');
        expect(seen.last.appOrBrowser, startsWith('BLOCKS app'));

        // This device cannot be signed out from the list.
        await expectLater(
          mira.sessions.revokeSession(seen.first.id),
          throwsA(isA<ValidationFailure>()),
        );
        await mira.sessions.revokeSession(seen.last.id);
        expect(await mira.sessions.getSessions(), hasLength(1));

        // The other phone finds out the next time it asks.
        await expectLater(
          second.users.getCurrentUser(),
          throwsA(isA<UnauthorizedFailure>()),
        );
        expect(second.sessionsEnded, 1);
        expect(second.tokens.current, isNull);

        // Signing out "everything else" works too, and returns nothing to show.
        final third = _Person(origin, mira.username);
        await third.signIn(_password);
        await mira.sessions.revokeAllOtherSessions();
        await expectLater(
          third.users.getCurrentUser(),
          throwsA(isA<UnauthorizedFailure>()),
        );
        expect(await mira.sessions.getSessions(), hasLength(1));
      },
    );

    test('changing the password: each wrong way gets its own reason, the right way signs other devices out', () async {
      await expectLater(
        mira.password.changePassword(
          currentPassword: 'Not-My-Password1!',
          newPassword: newPassword,
        ),
        throwsA(const ValidationFailure('wrongCurrentPassword')),
      );
      await expectLater(
        mira.password.changePassword(
          currentPassword: _password,
          newPassword: _password,
        ),
        throwsA(const ValidationFailure('samePassword')),
      );

      final other = _Person(origin!, mira.username);
      await other.signIn(_password);
      await mira.password.changePassword(
        currentPassword: _password,
        newPassword: newPassword,
      );
      await expectLater(
        other.users.getCurrentUser(),
        throwsA(isA<UnauthorizedFailure>()),
      );
      // This device carries on; the old password is gone, the new one works.
      expect((await mira.users.getCurrentUser()).username, '@${mira.username}');
      final old = await _Person(origin, mira.username).signIn(_password);
      expect(old, isA<LoginRejected>());
      expect(
        await _Person(origin, mira.username).signIn(newPassword),
        isA<LoginSucceeded>(),
      );
    });

    test('login activity and the alert e-mails record the change', () async {
      final events = await mira.security.getEvents();
      final types = events.map((e) => e.type).toSet();
      expect(
        types,
        containsAll([
          SecurityEventType.loginSuccess,
          SecurityEventType.passwordChanged,
        ]),
      );
      expect(
        events.first.timestamp.isAfter(
          DateTime.now().subtract(const Duration(hours: 1)),
        ),
        isTrue,
      );

      final failed = await mira.security.getEvents(
        filter: SecurityEventFilter.failed,
      );
      expect(
        failed.every((e) => e.status == SecurityEventStatus.failed),
        isTrue,
      );
      expect(
        failed,
        isNotEmpty,
        reason: 'the wrong password above was recorded',
      );

      final one = events.firstWhere(
        (e) => e.type == SecurityEventType.passwordChanged,
      );
      expect((await mira.security.getEvent(one.id)).id, one.id);
      expect(
        (await mira.security.acknowledgeEvent(one.id)).acknowledged,
        isTrue,
      );

      final sent = await mira.security.getSentAlerts();
      expect(
        sent.map((s) => s.type),
        contains(SecurityEventType.passwordChanged),
      );
      expect(sent.first.maskedTo, contains('***'));
    });

    test('alert options can be read and changed', () async {
      final before = await mira.security.getAlertPreferences();
      expect(before.emailCopies, isTrue);
      final changed = await mira.security.setAlertPreferences(
        before.copyWith(emailCopies: false, newDeviceAlerts: false),
      );
      expect(changed.emailCopies, isFalse);
      expect(changed.newDeviceAlerts, isFalse);
      expect((await mira.security.getAlertPreferences()).emailCopies, isFalse);
    });

    test('two-step sign-in: off for now, and turning it on is honestly not offered yet', () async {
      final tf = await mira.security.getTwoFactor();
      expect(tf.enabled, isFalse);
      await expectLater(
        mira.security.startTwoFactorSetup(TwoFactorMethod.sms),
        throwsA(isA<ForbiddenFailure>()),
      );
    });

    test('changing the e-mail: password, then a code at the new address, applied at once', () async {
      final contacts = await mira.security.getContacts();
      expect(contacts.maskedEmail, contains('***'));
      expect(contacts.maskedPhone, '');

      final newEmail = 'qa.new$suffix@example.test';
      await expectLater(
        mira.security.startContactChange(
          channel: OtpChannel.email,
          newValue: newEmail,
          currentPassword: 'Not-My-Password1!',
        ),
        throwsA(const ValidationFailure('wrongPassword')),
      );
      await expectLater(
        mira.security.startContactChange(
          channel: OtpChannel.email,
          newValue: 'not an address',
          currentPassword: newPassword,
        ),
        throwsA(const ValidationFailure('invalidEmail')),
      );

      final challenge = await mira.security.startContactChange(
        channel: OtpChannel.email,
        newValue: newEmail,
        currentPassword: newPassword,
      );
      expect(challenge.maskedDestination, contains('***'));

      final wrong = await mira.security.verifyContactChange(
        challengeId: challenge.id,
        code: '000000',
      );
      expect(wrong, isA<OtpIncorrect>());
      expect((wrong as OtpIncorrect).attemptsRemaining, inInclusiveRange(1, 4));

      final right = await mira.security.verifyContactChange(
        challengeId: challenge.id,
        code: await _codeSentTo(origin!, newEmail),
      );
      expect(right, isA<OtpVerified>());
      expect((right as OtpVerified).applied, isTrue);

      // The new address now signs in; the old one no longer does.
      expect(
        await _Person(
          origin,
          mira.username,
        ).signIn(newPassword, identifier: newEmail),
        isA<LoginSucceeded>(),
      );
      expect(
        await _Person(
          origin,
          mira.username,
        ).signIn(newPassword, identifier: mira.email),
        isA<LoginRejected>(),
      );
      expect((await mira.security.getContacts()).maskedEmail, startsWith('q'));
    });

    test(
      'forgot password: code, token, new password, everything signed out',
      () async {
        final person = _Person(origin!, 'qa.zoe$suffix');
        await person.signUp(origin, displayName: 'Zoe Live');
        final signedIn = _Person(origin, person.username);
        await signedIn.signIn(_password);

        final challenge = await person.reset.startReset(
          channel: OtpChannel.email,
          destination: person.email,
        );
        expect(challenge.maskedDestination, contains('***'));

        final wrong = await person.reset.verifyCode(
          challengeId: challenge.id,
          code: '000000',
        );
        expect(wrong, isA<OtpIncorrect>());

        final verified = await person.reset.verifyCode(
          challengeId: challenge.id,
          code: await _codeSentTo(origin, person.email),
        );
        expect(verified, isA<OtpVerified>());
        final token = (verified as OtpVerified).token;
        expect(verified.applied, isFalse);

        await expectLater(
          person.reset.completeReset(token: token, newPassword: 'weak'),
          throwsA(const ValidationFailure('weakPassword')),
        );
        await person.reset.completeReset(
          token: token,
          newPassword: newPassword,
        );

        // A spent token cannot be used again.
        await expectLater(
          person.reset.completeReset(token: token, newPassword: newPassword),
          throwsA(isA<UnauthorizedFailure>()),
        );
        // Every device was signed out; the new password signs in.
        await expectLater(
          person.users.getCurrentUser(),
          throwsA(isA<UnauthorizedFailure>()),
        );
        await expectLater(
          signedIn.users.getCurrentUser(),
          throwsA(isA<UnauthorizedFailure>()),
        );
        expect(
          await _Person(origin, person.username).signIn(newPassword),
          isA<LoginSucceeded>(),
        );
      },
    );

    test(
      'forgot password looks the same for an account that does not exist',
      () async {
        final real = await mira.reset.startReset(
          channel: OtpChannel.email,
          destination: 'qa.new$suffix@example.test',
        );
        final ghost = await mira.reset.startReset(
          channel: OtpChannel.email,
          destination: 'nobody.$suffix@example.test',
        );
        expect(ghost.length, real.length);
        expect(ghost.channel, real.channel);
        expect(ghost.maskedDestination, isNotEmpty);
        final guess = await mira.reset.verifyCode(
          challengeId: ghost.id,
          code: '123456',
        );
        expect(
          guess,
          isA<OtpIncorrect>(),
          reason: 'a decoy is refused like any wrong code',
        );
      },
    );
  });

  group('profile and photo against the running API', skip: run ? false : skip, () {
    final suffix = Random().nextInt(900000) + 100000;
    late final _Person nina;

    setUpAll(() async {
      nina = _Person(origin!, 'qa.nina$suffix');
      await nina.signUp(origin, displayName: 'Nina Live');
    });

    test('editing saves what was sent and nothing else', () async {
      final saved = await nina.profile.updateProfile(
        ProfileUpdate(
          name: '  Nina Rao  ',
          username: nina.username,
          bio: 'Cricket and chai',
          website: 'example.com/nina',
          country: 'India',
          state: 'Telangana',
          district: 'Hyderabad',
          gender: Gender.female,
        ),
      );
      expect(saved.name, 'Nina Rao');
      expect(saved.bio, 'Cricket and chai');
      expect(saved.website, 'https://example.com/nina');
      expect(saved.state, 'Telangana');
      expect(saved.district, 'Hyderabad');
      expect(saved.username, '@${nina.username}');

      expect((await nina.profile.getPrivateProfile()).gender, Gender.female);
      // What the server holds is what the app now reads.
      expect((await nina.users.getCurrentUser()).bio, 'Cricket and chai');
    });

    test('the server\'s refusals reach the form as field reasons', () async {
      ProfileUpdate with_({String website = '', String state = 'Telangana'}) =>
          ProfileUpdate(
            name: 'Nina',
            username: nina.username,
            bio: '',
            website: website.isEmpty ? null : website,
            country: 'India',
            state: state,
            district: '',
          );

      await expectLater(
        nina.profile.updateProfile(with_(website: 'javascript:alert(1)')),
        throwsA(
          isA<FieldValidationFailure>().having(
            (f) => f.errors['website'],
            'website',
            'websiteInvalid',
          ),
        ),
      );
      // A state that does not exist has no field on the form: still a failure.
      await expectLater(
        nina.profile.updateProfile(with_(state: 'Atlantis')),
        throwsA(isA<ValidationFailure>()),
      );
    });

    test(
      'the username cannot be changed, and nobody else\'s is "available"',
      () async {
        await expectLater(
          nina.profile.updateProfile(
            const ProfileUpdate(
              name: 'Nina',
              username: 'someone.else',
              bio: '',
              country: 'India',
              state: 'Telangana',
              district: '',
            ),
          ),
          throwsA(isA<FieldValidationFailure>()),
        );
        expect(await nina.profile.isUsernameAvailable(nina.username), isTrue);
        expect(await nina.profile.isUsernameAvailable('someone.else'), isFalse);
      },
    );

    test(
      'a real picture is uploaded, checked, re-encoded and becomes the avatar',
      () async {
        final png = solidPng(256, 256);
        final events = await nina.profile
            .uploadProfilePhoto(
              PickedPhoto(
                bytes: png,
                fileName: 'me.png',
                mimeType: 'image/png',
              ),
            )
            .toList();

        final fractions = events
            .whereType<UploadInProgress>()
            .map((e) => e.fraction)
            .toList();
        expect(fractions, isNotEmpty);
        expect(fractions, orderedEquals([...fractions]..sort()));
        final done = events.last as UploadComplete;
        expect(done.avatarUrl, startsWith('http'));

        final me = await nina.users.getCurrentUser();
        expect(me.avatarUrl, done.avatarUrl);

        // The address really serves a picture (the processed copy, not our bytes).
        final res = await Dio().get<List<int>>(
          done.avatarUrl,
          options: Options(responseType: ResponseType.bytes),
        );
        expect(res.statusCode, 200);
        expect(res.headers.value('content-type'), startsWith('image/'));
        expect(res.data, isNotEmpty);
      },
    );

    test('something that is not a picture is rejected after the server looks at it', () async {
      final fake = PickedPhoto(
        bytes: Uint8List.fromList(utf8.encode('this is not an image at all')),
        fileName: 'me.png',
        mimeType: 'image/png',
      );
      await expectLater(
        nina.profile.uploadProfilePhoto(fake).toList(),
        throwsA(const ValidationFailure('photoUnsupported')),
      );
      // The avatar from before is untouched.
      expect((await nina.users.getCurrentUser()).avatarUrl, isNotNull);
    });

    test('a file over the limit is refused before it is sent', () async {
      final big = PickedPhoto(
        bytes: Uint8List(6 * 1024 * 1024),
        fileName: 'big.png',
        mimeType: 'image/png',
      );
      await expectLater(
        nina.profile.uploadProfilePhoto(big).toList(),
        throwsA(const ValidationFailure('photoTooLarge')),
      );
    });

    test('an unsupported type is refused before it is sent', () async {
      final gif = PickedPhoto(
        bytes: Uint8List.fromList([71, 73, 70, 56, 57, 97]),
        fileName: 'x.gif',
        mimeType: 'image/gif',
      );
      await expectLater(
        nina.profile.uploadProfilePhoto(gif).toList(),
        throwsA(const ValidationFailure('photoUnsupported')),
      );
    });

    test('a photo post: the picture is uploaded, checked and shown in the post and the feed', () async {
      final png = solidPng(320, 240, r: 20, g: 120, b: 200);
      final post = await nina.posts.createPost(
        PostDraft(
          type: PostType.image,
          caption: 'Blue wall #blockslive',
          district: '',
          state: '',
          photo: PickedPhoto(
            bytes: png,
            fileName: 'wall.png',
            mimeType: 'image/png',
          ),
        ),
      );
      expect(post.type, PostType.image);
      expect(post.mediaUrl, startsWith('http'));
      expect(post.caption, 'Blue wall #blockslive');

      // The address serves a real picture.
      final res = await Dio().get<List<int>>(
        post.mediaUrl!,
        options: Options(responseType: ResponseType.bytes),
      );
      expect(res.statusCode, 200);
      expect(res.headers.value('content-type'), startsWith('image/'));
      expect(res.data!.length, greaterThan(100));

      // Read back by id, and in the home feed and the profile grid.
      expect((await nina.posts.getPost(post.id)).mediaUrl, startsWith('http'));
      final feed = await nina.feed.getFeed(FeedType.following);
      expect(feed.items.map((p) => p.id), contains(post.id));
      final me = await nina.users.getCurrentUser();
      final grid = await nina.posts.getUserPosts(me.id);
      expect(
        grid.items.firstWhere((p) => p.id == post.id).mediaUrl,
        startsWith('http'),
      );
    });

    test('a photo post with something that is not a picture is refused, and nothing is posted', () async {
      final before = (await nina.users.getCurrentUser()).postsCount;
      await expectLater(
        nina.posts.createPost(
          PostDraft(
            type: PostType.image,
            caption: 'fake',
            district: '',
            state: '',
            photo: PickedPhoto(
              bytes: Uint8List.fromList(utf8.encode('definitely not a png')),
              fileName: 'x.png',
              mimeType: 'image/png',
            ),
          ),
        ),
        throwsA(const ValidationFailure('photoUnsupported')),
      );
      expect((await nina.users.getCurrentUser()).postsCount, before);
    });

    test('removing the photo clears it', () async {
      final me = await nina.profile.removeProfilePhoto();
      expect(me.avatarUrl, isNull);
      expect((await nina.users.getCurrentUser()).avatarUrl, isNull);
    });
  });

  group('Creator Studio against the running API', skip: run ? false : skip, () {
    final suffix = Random().nextInt(900000) + 100000;
    late final _Person creator;

    setUpAll(() async {
      creator = _Person(origin!, 'qa.creator$suffix');
      await creator.signUp(origin, displayName: 'Creator Live');
    });

    test('a new creator has a dashboard of zeros, not an error', () async {
      final d = await creator.creator.getDashboard();
      expect(d.followers, 0);
      expect(d.qualifiedReach30d, 0);
      expect(d.bestPostQualifiedReach, 0);
      expect(d.reachLevel, ReachLevel.district);
      expect(d.coverage.values, everyElement(0));
    });

    test('earnings start at nothing, with six months to chart', () async {
      final e = await creator.insights.getEarnings();
      expect(e.estimatedTotal, 0);
      expect(e.available, 0);
      expect(e.pending, 0);
      expect(e.paid, 0);
      expect(e.thisMonth, 0);
      expect(e.months, hasLength(6));
      expect(e.months.every((m) => m.amount == 0), isTrue);
      expect(e.metrics.qualifiedViews, 0);
      expect(e.metrics.engagementRate, 0);
      expect(e.rewardPool.isEstimate, isFalse);
    });

    test('a post puts the item on the first rung', () async {
      await creator.posts.createPost(
        const PostDraft(
          type: PostType.text,
          caption: 'First post for the studio',
          district: '',
          state: '',
          audience: PostAudience.everyone,
        ),
      );
      final d = await creator.creator.getDashboard();
      expect(d.coverage[ReachLevel.district], 1);
      expect(d.coverage[ReachLevel.state], 0);
    });

    test('analytics say plainly they are not available yet', () async {
      await expectLater(
        creator.insights.getAnalytics(AnalyticsRange.days28),
        throwsA(
          isA<AppFailure>().having((f) => f.code, 'code', 'NOT_AVAILABLE'),
        ),
      );
    });

    test('nothing is shown without signing in', () async {
      final stranger = _Person(origin!, 'qa.stranger$suffix');
      await expectLater(
        stranger.creator.getDashboard(),
        throwsA(isA<UnauthorizedFailure>()),
      );
    });
  });

  group(
    'reporting, blocking and muting against the running API',
    skip: run ? false : skip,
    () {
      final suffix = Random().nextInt(900000) + 100000;
      late final _Person author;
      late final _Person reporter;
      late final String postId;

      setUpAll(() async {
        author = _Person(origin!, 'qa.author$suffix');
        reporter = _Person(origin, 'qa.reporter$suffix');
        await author.signUp(origin, displayName: 'Author Live');
        await reporter.signUp(origin, displayName: 'Reporter Live');
        postId = (await author.posts.createPost(
          const PostDraft(
            type: PostType.text,
            caption: 'Something somebody will report',
            district: '',
            state: '',
            audience: PostAudience.everyone,
          ),
        )).id;
      });

      test(
        'a report is received, and the same report twice is harmless',
        () async {
          const request = ReportRequest(
            targetType: ReportTargetType.post,
            targetId: 'placeholder',
            reason: ReportReason.harassment,
            details: 'Keeps tagging me',
          );
          final real = ReportRequest(
            targetType: request.targetType,
            targetId: postId,
            reason: request.reason,
            details: request.details,
          );
          await reporter.moderation.report(real);
          await reporter.moderation.report(real);
        },
      );

      test('you cannot report yourself, and the refusal says why', () async {
        await expectLater(
          author.moderation.report(
            ReportRequest(
              targetType: ReportTargetType.post,
              targetId: postId,
              reason: ReportReason.spam,
            ),
          ),
          throwsA(isA<FieldValidationFailure>()),
        );
      });

      test('something that does not exist is not found', () async {
        await expectLater(
          reporter.moderation.report(
            const ReportRequest(
              targetType: ReportTargetType.post,
              targetId: '01990000-0000-7000-8000-000000000001',
              reason: ReportReason.spam,
            ),
          ),
          throwsA(isA<NotFoundFailure>()),
        );
      });

      test('blocking hides the person both ways, and unblocking brings them back', () async {
        await reporter.moderation.blockUser(await _idOf(reporter, author));
        expect(
          (await reporter.moderation.getBlockedUsers()).map((u) => u.username),
          ['@${author.username}'],
        );
        expect(await reporter.moderation.getHiddenUserIds(), hasLength(1));
        // The blocked person's post is no longer there for the one who blocked.
        await expectLater(
          reporter.posts.getPost(postId),
          throwsA(isA<NotFoundFailure>()),
        );
        await reporter.moderation.unblockUser(await _idOf(reporter, author));
        expect(await reporter.moderation.getBlockedUsers(), isEmpty);
        expect((await reporter.posts.getPost(postId)).id, postId);
      });

      test('muting is a separate list from blocking', () async {
        final id = await _idOf(reporter, author);
        await reporter.moderation.muteUser(id);
        expect(
          (await reporter.moderation.getMutedUsers()).map((u) => u.username),
          ['@${author.username}'],
        );
        expect(await reporter.moderation.getBlockedUsers(), isEmpty);
        await reporter.moderation.unmuteUser(id);
        expect(await reporter.moderation.getMutedUsers(), isEmpty);
      });
    },
  );
}

/// The server's id for [other] (they know it themselves).
Future<String> _idOf(_Person viewer, _Person other) async =>
    (await other.users.getCurrentUser()).id;
