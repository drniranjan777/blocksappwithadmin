import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/api/api_moderation_repository.dart';
import 'package:blocks_app/data/models/business_models.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fake_api.dart';
import 'fixtures.dart';

Reply _page(List<Object?> items, {String? next}) => Reply.ok({
  'data': items,
  'meta': {'nextCursor': next, 'hasMore': next != null},
});

Map<String, Object?> _card(String id, String username) => {
  'id': id,
  'username': username,
  'displayName': username,
  'avatarUrl': null,
  'badge': 'NONE',
  'isPrivate': false,
  'since': '2026-10-01T10:00:00.000Z',
};

void main() {
  group('reporting', () {
    test('sends the target, the category and what the person wrote', () async {
      final rig = Rig(
        (_) async => const Reply(201, {
          'data': {'id': uuidA, 'status': 'RECEIVED', 'duplicate': false},
        }),
      );
      await ApiModerationRepository(rig.api).report(
        const ReportRequest(
          targetType: ReportTargetType.post,
          targetId: uuidB,
          reason: ReportReason.harassment,
          details: '  Keeps tagging me  ',
        ),
      );
      final sent = rig.fake.requests.single;
      expect(sent.method, 'POST');
      expect(sent.path, '/api/v1/reports');
      expect(sent.body, {
        'targetType': 'POST',
        'targetId': uuidB,
        'category': 'HARASSMENT',
        'description': 'Keeps tagging me',
      });
    });

    test('leaves the description out when there is none', () async {
      final rig = Rig(
        (_) async => const Reply(201, {
          'data': {'id': uuidA, 'status': 'RECEIVED', 'duplicate': false},
        }),
      );
      await ApiModerationRepository(rig.api).report(
        const ReportRequest(
          targetType: ReportTargetType.user,
          targetId: uuidB,
          reason: ReportReason.other,
          details: '   ',
        ),
      );
      expect(rig.fake.requests.single.body, {
        'targetType': 'USER',
        'targetId': uuidB,
        'category': 'OTHER',
      });
    });

    test(
      'maps every reason and kind the app offers to one the server knows',
      () async {
        final rig = Rig(
          (_) async => const Reply(201, {
            'data': {'id': uuidA, 'status': 'RECEIVED', 'duplicate': false},
          }),
        );
        final repo = ApiModerationRepository(rig.api);
        for (final reason in ReportReason.values) {
          await repo.report(
            ReportRequest(
              targetType: ReportTargetType.reel,
              targetId: uuidB,
              reason: reason,
            ),
          );
        }
        for (final type in ReportTargetType.values) {
          await repo.report(
            ReportRequest(
              targetType: type,
              targetId: uuidB,
              reason: ReportReason.spam,
            ),
          );
        }
        final categories = rig.fake.requests
            .map((r) => (r.body! as Map)['category'])
            .toSet();
        expect(categories, {
          'SPAM',
          'HARASSMENT',
          'NUDITY',
          'VIOLENCE',
          'SELF_HARM',
          'MISINFORMATION',
          'FRAUD',
          'OTHER',
        });
        final types = rig.fake.requests
            .map((r) => (r.body! as Map)['targetType'])
            .toSet();
        expect(types, {'POST', 'REEL', 'COMMENT', 'USER'});
      },
    );

    test(
      'says so when the server refuses (for example a report of yourself)',
      () async {
        final rig = Rig(
          (_) async => Reply.error(
            400,
            'VALIDATION_FAILED',
            details: [
              {
                'field': 'targetId',
                'reasons': ['cannot_report_yourself'],
              },
            ],
          ),
        );
        await expectLater(
          ApiModerationRepository(rig.api).report(
            const ReportRequest(
              targetType: ReportTargetType.post,
              targetId: uuidB,
              reason: ReportReason.spam,
            ),
          ),
          throwsA(isA<AppFailure>()),
        );
      },
    );

    test('says so when the rate limit is reached', () async {
      final rig = Rig(
        (_) async =>
            Reply.error(429, 'RATE_LIMITED', headers: {'retry-after': '3600'}),
      );
      await expectLater(
        ApiModerationRepository(rig.api).report(
          const ReportRequest(
            targetType: ReportTargetType.post,
            targetId: uuidB,
            reason: ReportReason.spam,
          ),
        ),
        throwsA(isA<AppFailure>()),
      );
    });
  });

  group('blocking and muting', () {
    test('blocks, unblocks, mutes and unmutes with the right calls', () async {
      final rig = Rig(
        (r) async =>
            r.method == 'DELETE' ? const Reply(204) : Reply.ok({'data': {}}),
      );
      final repo = ApiModerationRepository(rig.api);
      await repo.blockUser(uuidA);
      await repo.unblockUser(uuidA);
      await repo.muteUser(uuidA);
      await repo.unmuteUser(uuidA);
      expect(rig.fake.requests.map((r) => '${r.method} ${r.path}'), [
        'POST /api/v1/users/$uuidA/block',
        'DELETE /api/v1/users/$uuidA/block',
        'POST /api/v1/users/$uuidA/mute',
        'DELETE /api/v1/users/$uuidA/mute',
      ]);
    });

    test('reads the people blocked, across pages', () async {
      final rig = Rig((r) async {
        expect(r.query['kind'], 'BLOCK');
        return r.query['cursor'] == null
            ? _page([_card(uuidA, 'asha')], next: 'c2')
            : _page([_card(uuidB, 'ravi')]);
      });
      final people = await ApiModerationRepository(rig.api).getBlockedUsers();
      expect(people.map((u) => u.username), ['@asha', '@ravi']);
      expect(rig.fake.requests, hasLength(2));
    });

    test('reads the people muted with kind MUTE', () async {
      final rig = Rig((r) async {
        expect(r.query['kind'], 'MUTE');
        return _page([_card(uuidA, 'asha')]);
      });
      final people = await ApiModerationRepository(rig.api).getMutedUsers();
      expect(people.single.username, '@asha');
    });

    test('hides both the blocked and the muted from feeds', () async {
      final rig = Rig(
        (r) async => r.query['kind'] == 'BLOCK'
            ? _page([_card(uuidA, 'asha')])
            : _page([_card(uuidB, 'ravi')]),
      );
      expect(await ApiModerationRepository(rig.api).getHiddenUserIds(), {
        uuidA,
        uuidB,
      });
    });

    test(
      'does not pretend to offer "restrict", which the server does not have',
      () async {
        final rig = Rig((_) async => Reply.ok({'data': {}}));
        await expectLater(
          ApiModerationRepository(rig.api).restrictUser(uuidA),
          throwsA(isA<ForbiddenFailure>()),
        );
        expect(rig.fake.requests, isEmpty);
      },
    );
  });
}
