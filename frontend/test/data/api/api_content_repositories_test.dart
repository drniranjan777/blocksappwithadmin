import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/api/api_feed_repository.dart';
import 'package:blocks_app/data/api/api_notification_repository.dart';
import 'package:blocks_app/data/api/api_post_repository.dart';
import 'package:blocks_app/data/api/api_reach_repository.dart';
import 'package:blocks_app/data/api/api_reel_repository.dart';
import 'package:blocks_app/data/api/api_user_repository.dart';
import 'package:blocks_app/data/api/media_uploader.dart';
import 'package:blocks_app/data/models/profile_models.dart';
import 'package:dio/dio.dart';

import 'dart:typed_data';

import 'package:blocks_app/data/api/content_kinds.dart';
import 'package:blocks_app/data/models/content_models.dart';
import 'package:blocks_app/data/models/discovery_models.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/data/repositories/reel_repository.dart';
import 'package:blocks_app/features/reach/domain/reach_level.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fake_api.dart';
import 'fixtures.dart';

Future<int Function(ReachLevel)> _floor() async => floorOf;

Reply _page(List<Object?> items, {String? next}) => Reply.ok({
  'data': items,
  'meta': {'nextCursor': next, 'hasMore': next != null},
});

void main() {
  group('the home feed', () {
    test('asks for the stream that belongs to each tab', () {
      expect(feedScopeOf(FeedType.following), 'following');
      expect(feedScopeOf(FeedType.forYou), 'following');
      expect(feedScopeOf(FeedType.nearYou), 'local');
      expect(feedScopeOf(FeedType.rising), 'state');
      expect(feedScopeOf(FeedType.india), 'national');
    });

    test('mixes posts and reels, passes the cursor on, and remembers which are reels', () async {
      final kinds = ContentKinds();
      final rig = Rig(
        (_) async => _page([
          {'kind': 'post', 'post': postView()},
          {'kind': 'reel', 'reel': reelView()},
          {'kind': 'poll', 'poll': <String, Object?>{}},
        ], next: 'cursor-2'),
      );
      final repo = ApiFeedRepository(rig.api, _floor, kinds);

      final page = await repo.getFeed(
        FeedType.nearYou,
        cursor: 'cursor-1',
        limit: 500,
      );

      expect(page.items.map((p) => p.type), [PostType.text, PostType.video]);
      expect(page.nextCursor, 'cursor-2');
      expect(page.hasMore, isTrue);
      expect(kinds.isReel(uuidC), isTrue);
      expect(kinds.isReel(uuidB), isFalse);
      final q = rig.fake.requests.single.query;
      expect(q['scope'], 'local');
      expect(q['cursor'], 'cursor-1');
      expect(
        q['limit'],
        '50',
        reason: 'asking for more than the API allows is capped',
      );
    });

    test('the last page has no cursor', () async {
      final rig = Rig((_) async => _page([]));
      final page = await ApiFeedRepository(
        rig.api,
        _floor,
        ContentKinds(),
      ).getFeed(FeedType.following);
      expect(page.items, isEmpty);
      expect(page.nextCursor, isNull);
    });

    test('a failure reaches the screen as a failure', () async {
      final rig = Rig((_) async => Reply.error(403, 'ACCOUNT_SUSPENDED'));
      await expectLater(
        ApiFeedRepository(
          rig.api,
          _floor,
          ContentKinds(),
        ).getFeed(FeedType.following),
        throwsA(isA<ForbiddenFailure>()),
      );
    });
  });

  group('posts', () {
    ApiPostRepository repoFor(
      Rig rig, [
      ContentKinds? kinds,
      FakeApi? storage,
    ]) => ApiPostRepository(
      rig.api,
      _floor,
      kinds ?? ContentKinds(),
      MediaUploader(
        rig.api,
        storage: Dio()
          ..httpClientAdapter =
              storage ??
              FakeApi((_) async => const Reply(200, null, {'ETag': '"e"'})),
        wait: (_) async {},
      ),
    );

    test('one post is read from /posts/:id', () async {
      final rig = Rig((_) async => Reply.ok({'data': postView()}));
      final p = await repoFor(rig).getPost(uuidB);
      expect(p.id, uuidB);
      expect(rig.fake.requests.single.path, '/api/v1/posts/$uuidB');
    });

    group('the reach count', () {
      Map<String, Object?> authored({String reachLevel = 'STATE'}) => {
        ...postView(reachLevel: reachLevel),
        'viewer': {'liked': false, 'saved': false, 'isAuthor': true},
      };

      test('on your own post is the real one from the server', () async {
        final rig = Rig(
          (r) async => r.path.startsWith('/api/v1/reach/')
              ? Reply.ok({
                  'data': {
                    'kind': 'post',
                    'id': uuidB,
                    'level': 'STATE',
                    'qualifiedReach': 12345,
                  },
                })
              : Reply.ok({'data': authored()}),
        );
        final p = await repoFor(rig).getPost(uuidB);
        expect(p.qualifiedReach, 12345);
        expect(
          rig.fake.requests.last.path,
          '/api/v1/reach/content/post/$uuidB',
        );
      });

      test('on someone else\'s post is not asked for (the server would refuse), and is only the rung\'s floor', () async {
        final rig = Rig(
          (_) async => Reply.ok({'data': postView(reachLevel: 'NATIONAL')}),
        );
        final p = await repoFor(rig).getPost(uuidB);
        expect(p.qualifiedReach, floorOf(ReachLevel.national));
        expect(rig.fake.requests, hasLength(1));
      });

      test('the post still shows if the count cannot be read', () async {
        final rig = Rig(
          (r) async => r.path.startsWith('/api/v1/reach/')
              ? Reply.error(503, 'UNAVAILABLE')
              : Reply.ok({'data': authored(reachLevel: 'STATE')}),
        );
        final p = await repoFor(rig).getPost(uuidB);
        expect(p.qualifiedReach, floorOf(ReachLevel.state));
      });
    });

    test(
      'an id that is a reel is read from /reels/:id when /posts/:id says no',
      () async {
        final kinds = ContentKinds();
        final rig = Rig(
          (r) async => r.path.contains('/posts/')
              ? Reply.error(404, 'NOT_FOUND')
              : Reply.ok({'data': reelView()}),
        );
        final p = await repoFor(rig, kinds).getPost(uuidC);
        expect(p.type, PostType.video);
        expect(kinds.isReel(uuidC), isTrue);
      },
    );

    test('an id is escaped before it goes into a path', () async {
      final rig = Rig((_) async => Reply.ok({'data': postView()}));
      await repoFor(rig).getPost('../admin/users');
      expect(
        rig.fake.requests.single.options.uri.path,
        '/api/v1/posts/..%2Fadmin%2Fusers',
      );
    });

    test('likes, saves and shares go to the post routes', () async {
      final rig = Rig(
        (_) async => Reply.ok({
          'data': {'liked': true},
        }),
      );
      final repo = repoFor(rig);
      await repo.likePost(uuidB);
      await repo.unlikePost(uuidB);
      await repo.savePost(uuidB);
      await repo.unsavePost(uuidB);
      await repo.sharePost(uuidB);
      expect(rig.fake.requests.map((r) => '${r.method} ${r.path}'), [
        'POST /api/v1/posts/$uuidB/like',
        'DELETE /api/v1/posts/$uuidB/like',
        'POST /api/v1/posts/$uuidB/save',
        'DELETE /api/v1/posts/$uuidB/save',
        'POST /api/v1/posts/$uuidB/share',
      ]);
      expect(rig.fake.requests.last.body, {'channel': 'LINK'});
    });

    test(
      'a reel from the feed is liked on the reel route straight away',
      () async {
        final kinds = ContentKinds()..markReel(uuidC);
        final rig = Rig(
          (_) async => Reply.ok({
            'data': {'liked': true},
          }),
        );
        await repoFor(rig, kinds).likePost(uuidC);
        expect(rig.fake.requests.single.path, '/api/v1/reels/$uuidC/like');
      },
    );

    test('an unknown id that turns out to be a reel is retried on the reel route and remembered', () async {
      final kinds = ContentKinds();
      final rig = Rig(
        (r) async => r.path.contains('/posts/')
            ? Reply.error(404, 'NOT_FOUND')
            : Reply.ok({
                'data': {'liked': true},
              }),
      );
      await repoFor(rig, kinds).likePost(uuidC);
      expect(rig.fake.requests.map((r) => r.path), [
        '/api/v1/posts/$uuidC/like',
        '/api/v1/reels/$uuidC/like',
      ]);
      expect(kinds.isReel(uuidC), isTrue);
    });

    test(
      'a refused like is a failure the optimistic UI can roll back',
      () async {
        final rig = Rig((_) async => Reply.error(403, 'ACCOUNT_RESTRICTED'));
        await expectLater(
          repoFor(rig).likePost(uuidB),
          throwsA(isA<ForbiddenFailure>()),
        );
      },
    );

    test(
      'comments are listed and added, with an Idempotency-Key on the add',
      () async {
        final rig = Rig(
          (r) async => r.method == 'GET'
              ? _page([commentView()], next: 'c2')
              : Reply(201, {'data': commentView(id: uuidB, body: 'Thanks')}),
        );
        final repo = repoFor(rig);

        final page = await repo.getComments(uuidB);
        expect(page.items.single.text, 'Nice!');
        expect(page.nextCursor, 'c2');

        final added = await repo.addComment(uuidB, '  Thanks  ');
        expect(added.text, 'Thanks');
        final post = rig.fake.requests.last;
        expect(post.path, '/api/v1/posts/$uuidB/comments');
        expect(post.body, {'body': 'Thanks'});
        expect(
          post.header('idempotency-key'),
          matches(RegExp(r'^[0-9a-f]{32}$')),
        );
      },
    );

    test('an empty comment is refused before anything is sent', () async {
      final rig = Rig((_) async => Reply.ok({'data': commentView()}));
      // A failed Future, not an exception thrown while calling.
      await expectLater(
        repoFor(rig).addComment(uuidB, '   '),
        throwsA(isA<ValidationFailure>()),
      );
      expect(rig.fake.requests, isEmpty);
    });

    group('publishing', () {
      const draft = PostDraft(
        type: PostType.text,
        caption: '  First post!  ',
        district: 'Hyderabad',
        state: 'Telangana',
        audience: PostAudience.followers,
      );

      test('sends only what the person chose, never place or counts', () async {
        final rig = Rig(
          (_) async => Reply(201, {'data': postView(caption: 'First post!')}),
        );
        final post = await repoFor(rig).createPost(draft);
        expect(post.caption, 'First post!');
        final sent = rig.fake.requests.single;
        expect(sent.path, '/api/v1/posts');
        expect(sent.body, {
          'type': 'TEXT',
          'caption': 'First post!',
          'visibility': 'FOLLOWERS',
        });
        expect(sent.header('idempotency-key'), isNotNull);
      });

      test('pressing Post again after a lost answer reuses the key, so it cannot post twice', () async {
        var calls = 0;
        final rig = Rig((r) async {
          calls++;
          if (calls == 1) throw connectionLost(r.options);
          return Reply(201, {'data': postView()});
        });
        final repo = repoFor(rig);

        // The first press: the shared retry also tries again, with the same key.
        final first = await repo.createPost(draft);
        expect(first.id, uuidB);
        final keys = rig.fake.requests
            .map((r) => r.header('idempotency-key'))
            .toSet();
        expect(keys, hasLength(1));
      });

      test('keeps the key across a failed attempt, and drops it after an outright refusal', () async {
        var mode = 'down';
        final rig = Rig((r) async {
          if (mode == 'down') throw connectionLost(r.options);
          if (mode == 'refuse') return Reply.error(403, 'ACCOUNT_RESTRICTED');
          return Reply(201, {'data': postView()});
        });
        final repo = repoFor(rig);

        await expectLater(
          repo.createPost(draft),
          throwsA(isA<NetworkFailure>()),
        );
        final unknownOutcomeKey = rig.fake.requests.last.header(
          'idempotency-key',
        );

        mode = 'ok';
        await repo.createPost(draft);
        expect(
          rig.fake.requests.last.header('idempotency-key'),
          unknownOutcomeKey,
        );

        // A finished post starts the next one fresh.
        await repo.createPost(draft);
        expect(
          rig.fake.requests.last.header('idempotency-key'),
          isNot(unknownOutcomeKey),
        );

        mode = 'refuse';
        await expectLater(
          repo.createPost(draft),
          throwsA(isA<ForbiddenFailure>()),
        );
        final refusedKey = rig.fake.requests.last.header('idempotency-key');
        mode = 'ok';
        await repo.createPost(draft);
        expect(
          rig.fake.requests.last.header('idempotency-key'),
          isNot(refusedKey),
        );
      });

      group('a photo post', () {
        final photo = PickedPhoto(
          bytes: Uint8List.fromList(List.filled(300, 9)),
          fileName: 'p.jpg',
          mimeType: 'image/jpeg',
        );
        PostDraft draft({String caption = 'Sunset'}) => PostDraft(
          type: PostType.image,
          caption: caption,
          district: '',
          state: '',
          photo: photo,
        );

        Future<Reply> serve(SeenRequest r) async {
          if (r.path.endsWith('/media/uploads') && r.method == 'POST') {
            return Reply.ok({
              'data': {
                'assetId': uuidC,
                'sessionId': uuidA,
                'expiresAt': 'x',
                'mode': 'single',
                'upload': {
                  'method': 'PUT',
                  'url': 'https://storage.example.test/p',
                  'headers': {'Content-Type': 'image/jpeg'},
                },
              },
            });
          }
          if (r.path.endsWith('/complete')) return Reply.ok({'data': {}});
          if (r.path.startsWith('/api/v1/media/')) {
            return Reply.ok({
              'data': {
                'id': uuidC,
                'status': 'READY',
                'ready': true,
                'failureCode': null,
              },
            });
          }
          return Reply(201, {
            'data': postView(type: 'PHOTO', media: [mediaView()]),
          });
        }

        test('uploads the picture first, then publishes it by id', () async {
          final rig = Rig(serve);
          final storage = FakeApi(
            (_) async => const Reply(200, null, {'ETag': '"e"'}),
          );
          final post = await repoFor(rig, null, storage).createPost(draft());

          expect(post.type, PostType.image);
          expect(post.mediaUrl, 'https://cdn.example.test/p.jpg');
          expect(storage.requests.single.body, photo.bytes);
          final publish = rig.fake.requests.firstWhere(
            (r) => r.path == '/api/v1/posts',
          );
          expect(publish.body, {
            'type': 'PHOTO',
            'caption': 'Sunset',
            'visibility': 'PUBLIC',
            'mediaIds': [uuidC],
          });
          // The picture is on its way before the post is published.
          final order = rig.fake.requests.map((r) => r.path).toList();
          expect(
            order.indexOf('/api/v1/media/uploads'),
            lessThan(order.indexOf('/api/v1/posts')),
          );
        });

        test(
          'a retry after the post failed does not send the picture again',
          () async {
            var postAttempts = 0;
            final rig = Rig((r) async {
              if (r.path == '/api/v1/posts') {
                postAttempts++;
                if (postAttempts <= 3) throw connectionLost(r.options);
              }
              return serve(r);
            });
            final storage = FakeApi(
              (_) async => const Reply(200, null, {'ETag': '"e"'}),
            );
            final repo = repoFor(rig, null, storage);

            await expectLater(
              repo.createPost(draft()),
              throwsA(isA<NetworkFailure>()),
            );
            await repo.createPost(draft());

            expect(storage.requests, hasLength(1), reason: 'uploaded once');
            final keys = rig.fake.requests
                .where((r) => r.path == '/api/v1/posts')
                .map((r) => r.header('idempotency-key'))
                .toSet();
            expect(
              keys,
              hasLength(1),
              reason: 'and the post carries one key throughout',
            );
          },
        );

        test('an empty caption is fine for a photo', () async {
          final rig = Rig(serve);
          await repoFor(rig).createPost(draft(caption: '  '));
          final publish = rig.fake.requests.firstWhere(
            (r) => r.path == '/api/v1/posts',
          );
          expect((publish.body! as Map)['caption'], '');
        });

        test('a post with no picture, and a video post, are refused before anything is sent', () async {
          final rig = Rig(serve);
          await expectLater(
            repoFor(rig).createPost(
              const PostDraft(
                type: PostType.image,
                caption: 'x',
                district: '',
                state: '',
              ),
            ),
            throwsA(
              isA<ValidationFailure>().having(
                (f) => f.code,
                'code',
                'PHOTO_REQUIRED',
              ),
            ),
          );
          await expectLater(
            repoFor(rig).createPost(
              const PostDraft(
                type: PostType.video,
                caption: 'x',
                district: '',
                state: '',
              ),
            ),
            throwsA(
              isA<ValidationFailure>().having(
                (f) => f.code,
                'code',
                'USE_REELS',
              ),
            ),
          );
          expect(rig.fake.requests, isEmpty);
        });

        test(
          'too large and unsupported use the keys the post screen understands',
          () async {
            Future<Object?> tryWith(int status, String code) async {
              final rig = Rig((_) async => Reply.error(status, code));
              try {
                await repoFor(rig).createPost(draft());
                return null;
              } on Object catch (e) {
                return e;
              }
            }

            expect(
              await tryWith(413, 'PAYLOAD_TOO_LARGE'),
              const ValidationFailure('photoTooLarge'),
            );
            expect(
              await tryWith(415, 'UNSUPPORTED_MEDIA'),
              const ValidationFailure('photoUnsupported'),
            );
          },
        );
      });

      test('an empty caption is refused before anything is sent', () async {
        final rig = Rig((_) async => Reply.ok({'data': postView()}));
        await expectLater(
          repoFor(rig).createPost(
            const PostDraft(
              type: PostType.text,
              caption: '  ',
              district: '',
              state: '',
            ),
          ),
          throwsA(isA<ValidationFailure>()),
        );
        expect(rig.fake.requests, isEmpty);
      });
    });

    test('a person\'s posts are listed from their profile; tagged posts do not exist yet', () async {
      final rig = Rig((_) async => _page([postView()], next: 'p2'));
      final repo = repoFor(rig);
      final page = await repo.getUserPosts(uuidA);
      expect(page.items.single.id, uuidB);
      expect(page.nextCursor, 'p2');
      expect(rig.fake.requests.single.path, '/api/v1/profiles/$uuidA/posts');
      expect((await repo.getTaggedPosts(uuidA)).items, isEmpty);
    });
  });

  group('reels', () {
    test('the player lists reels, leaves out unfinished ones and remembers the ids', () async {
      final kinds = ContentKinds();
      final rig = Rig(
        (_) async => _page([
          {'kind': 'reel', 'reel': reelView()},
          {
            'kind': 'reel',
            'reel': {...reelView(id: uuidB), 'video': null},
          },
        ], next: 'r2'),
      );
      final page = await ApiReelRepository(
        rig.api,
        _floor,
        kinds,
      ).getReels(feed: ReelFeed.following);
      expect(page.items.map((r) => r.id), [uuidC]);
      expect(page.nextCursor, 'r2');
      expect(kinds.isReel(uuidC), isTrue);
      expect(rig.fake.requests.single.path, '/api/v1/feed/reels');
      expect(rig.fake.requests.single.query['scope'], 'following');
    });

    test(
      'a person\'s reels and the engagement calls use the reel routes',
      () async {
        final rig = Rig(
          (r) async =>
              r.method == 'GET' ? _page([reelView()]) : Reply.ok({'data': {}}),
        );
        final repo = ApiReelRepository(rig.api, _floor, ContentKinds());
        expect((await repo.getUserReels(uuidA)).items, hasLength(1));
        await repo.likeReel(uuidC);
        await repo.unlikeReel(uuidC);
        await repo.saveReel(uuidC);
        await repo.unsaveReel(uuidC);
        await repo.shareReel(uuidC);
        expect(rig.fake.requests.map((r) => '${r.method} ${r.path}').skip(1), [
          'POST /api/v1/reels/$uuidC/like',
          'DELETE /api/v1/reels/$uuidC/like',
          'POST /api/v1/reels/$uuidC/save',
          'DELETE /api/v1/reels/$uuidC/save',
          'POST /api/v1/reels/$uuidC/share',
        ]);
      },
    );
  });

  group('notifications', () {
    test('are listed with the cursor, and unread count, read-all and read use their routes', () async {
      final rig = Rig((r) async {
        if (r.path.endsWith('/unread-count')) {
          return Reply.ok({
            'data': {'count': 7},
          });
        }
        if (r.method == 'POST') return const Reply(204);
        return _page([notificationView()], next: 'n2');
      });
      final repo = ApiNotificationRepository(rig.api);

      final page = await repo.getNotifications();
      expect(page.items.single.category, NotificationCategory.like);
      expect(page.nextCursor, 'n2');
      expect(await repo.getUnreadCount(), 7);
      await repo.markAllRead();
      await repo.markRead(uuidA);
      expect(
        rig.fake.requests
            .map((r) => '${r.method} ${r.path}')
            .toList()
            .sublist(1),
        [
          'GET /api/v1/notifications/unread-count',
          'POST /api/v1/notifications/read-all',
          'POST /api/v1/notifications/$uuidA/read',
        ],
      );
    });

    test('a category filter reads on until enough of that kind are found, and loses none', () async {
      var page = 0;
      final rig = Rig((r) async {
        page++;
        return switch (page) {
          1 => _page([
            notificationView(id: uuidA),
            notificationView(id: uuidB, type: 'COMMENT'),
          ], next: 'p2'),
          2 => _page([
            notificationView(id: uuidC, type: 'COMMENT'),
          ], next: 'p3'),
          _ => _page([notificationView(id: 'x')]),
        };
      });
      final result = await ApiNotificationRepository(rig.api)
          .getNotifications(category: NotificationCategory.comment, limit: 2);
      expect(result.items.map((n) => n.id), [uuidB, uuidC]);
      expect(
        result.nextCursor,
        'p3',
        reason: 'the next read continues after the last page read',
      );
      expect(rig.fake.requests, hasLength(2));
    });

    test('a filter that never matches stops after a few pages instead of reading forever', () async {
      final rig = Rig((_) async => _page([notificationView()], next: 'more'));
      final result = await ApiNotificationRepository(rig.api)
          .getNotifications(category: NotificationCategory.earnings);
      expect(result.items, isEmpty);
      expect(result.nextCursor, 'more');
      expect(rig.fake.requests, hasLength(5));
    });
  });

  group('people', () {
    test('the signed-in user combines the profile and the account (two-step sign-in)', () async {
      final rig = Rig(
        (r) async => r.path.endsWith('/profile')
            ? Reply.ok({'data': profileView()})
            : Reply.ok({
                'data': {...meBody(), 'twoFactorEnabled': true},
              }),
      );
      final u = await ApiUserRepository(
        rig.api,
        now: () => DateTime.utc(2026, 10, 9),
      ).getCurrentUser();
      expect(u.id, uuidA);
      expect(u.isTwoFactorEnabled, isTrue);
    });

    test(
      'another person is read by id, and an unknown one is not found',
      () async {
        final rig = Rig((_) async => Reply.error(404, 'NOT_FOUND'));
        await expectLater(
          ApiUserRepository(rig.api).getUser(uuidB),
          throwsA(isA<NotFoundFailure>()),
        );
        expect(rig.fake.requests.single.path, '/api/v1/profiles/$uuidB');
      },
    );

    test('follow and unfollow use the follow route', () async {
      final rig = Rig(
        (_) async => Reply.ok({
          'data': {'state': 'FOLLOWING'},
        }),
      );
      final repo = ApiUserRepository(rig.api);
      await repo.follow(uuidB);
      await repo.unfollow(uuidB);
      expect(rig.fake.requests.map((r) => '${r.method} ${r.path}'), [
        'POST /api/v1/users/$uuidB/follow',
        'DELETE /api/v1/users/$uuidB/follow',
      ]);
    });

    test('who I follow is read page by page from my own profile', () async {
      final rig = Rig((r) async {
        if (r.path.endsWith('/profile')) {
          return Reply.ok({'data': profileView(id: uuidA)});
        }
        if (r.path.endsWith('/users/me')) return Reply.ok({'data': meBody()});
        return r.query['cursor'] == null
            ? _page([userCard(id: uuidB), userCard(id: uuidC)], next: 'f2')
            : _page([userCard(id: 'u-4')]);
      });
      final ids = await ApiUserRepository(rig.api).getFollowingIds();
      expect(ids, {uuidB, uuidC, 'u-4'});
      final following = rig.fake.requests
          .where((r) => r.path.endsWith('/following'))
          .toList();
      expect(following, hasLength(2));
      expect(following.first.path, '/api/v1/profiles/$uuidA/following');
      expect(following.first.query['limit'], '50');
    });

    test('search needs two characters, trims, and caps the count', () async {
      final rig = Rig(
        (_) async => Reply.ok({
          'data': [userCard()],
        }),
      );
      final repo = ApiUserRepository(rig.api);
      expect(await repo.searchUsers('a'), isEmpty);
      expect(rig.fake.requests, isEmpty);
      final found = await repo.searchUsers('  as  ', limit: 100);
      expect(found.single.username, '@asha.k');
      expect(rig.fake.requests.single.query, {'q': 'as', 'limit': '20'});
    });

    test(
      'the demo switch for two-step sign-in does not exist on the server',
      () async {
        final rig = Rig((_) async => Reply.ok({'data': {}}));
        await expectLater(
          ApiUserRepository(rig.api).setTwoFactorEnabled(enabled: true),
          throwsA(isA<ForbiddenFailure>()),
        );
        expect(rig.fake.requests, isEmpty);
      },
    );
  });

  group('the Reach Ladder', () {
    test('is read once, shared by simultaneous callers, and refreshed after it ages', () async {
      var now = DateTime.utc(2026, 10, 9, 12);
      final rig = Rig((_) async => Reply.ok({'data': ladderBody()}));
      final repo = ApiReachRepository(rig.api, now: () => now);

      final both = await Future.wait([repo.getConfig(), repo.getConfig()]);
      expect(both.first.thresholdFor(ReachLevel.state), 10001);
      expect(rig.fake.requests, hasLength(1));

      await repo.getConfig();
      expect(rig.fake.requests, hasLength(1));

      now = now.add(const Duration(minutes: 11));
      await repo.getConfig();
      expect(rig.fake.requests, hasLength(2));
    });

    test(
      'an incomplete ladder is a failure, never a made-up threshold',
      () async {
        final rig = Rig(
          (_) async => Reply.ok({
            'data': {
              'levels': [
                {'key': 'DISTRICT', 'minQualifiedReach': 0},
              ],
            },
          }),
        );
        await expectLater(
          ApiReachRepository(rig.api).getConfig(),
          throwsA(isA<UnknownFailure>()),
        );
      },
    );

    test('a failed read is not cached, so the next call tries again', () async {
      var down = true;
      final rig = Rig(
        (r) async => down
            ? throw connectionLost(r.options)
            : Reply.ok({'data': ladderBody()}),
      );
      final repo = ApiReachRepository(rig.api);
      await expectLater(repo.getConfig(), throwsA(isA<NetworkFailure>()));
      down = false;
      expect((await repo.getConfig()).thresholdFor(ReachLevel.global), 1000001);
    });

    test('boosting a post is not something the live service offers', () async {
      final rig = Rig((_) async => Reply.ok({'data': ladderBody()}));
      await expectLater(
        ApiReachRepository(rig.api).simulateBoost(uuidB),
        throwsA(isA<ForbiddenFailure>()),
      );
    });
  });

  group('content kinds', () {
    test('forget the oldest ids beyond the limit', () {
      final kinds = ContentKinds(capacity: 2)
        ..markReel('a')
        ..markReel('b')
        ..markReel('c');
      expect(kinds.isReel('a'), isFalse);
      expect(kinds.isReel('b'), isTrue);
      expect(kinds.isReel('c'), isTrue);
    });

    test('keep an id that is seen again', () {
      final kinds = ContentKinds(capacity: 2)
        ..markReel('a')
        ..markReel('b')
        ..markReel('a')
        ..markReel('c');
      expect(kinds.isReel('a'), isTrue);
      expect(kinds.isReel('b'), isFalse);
    });
  });
}
