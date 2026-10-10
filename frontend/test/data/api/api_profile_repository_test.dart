import 'dart:typed_data';

import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/api/api_profile_repository.dart';
import 'package:blocks_app/data/api/api_user_repository.dart';
import 'package:blocks_app/data/api/media_uploader.dart';
import 'package:blocks_app/data/models/profile_models.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fake_api.dart';
import 'fixtures.dart';

Map<String, Object?> _mine({String? gender, String? avatarUrl}) => {
  ...profileView(),
  'gender': gender,
  'city': null,
  'avatarUrl': avatarUrl,
};

ProfileUpdate _update({
  String name = 'Asha K',
  String username = 'asha.k',
  String bio = 'Chai, code, cricket',
  String? website,
  String state = 'Telangana',
  String district = 'Hyderabad',
  Gender? gender,
}) => ProfileUpdate(
  name: name,
  username: username,
  bio: bio,
  website: website,
  country: 'India',
  state: state,
  district: district,
  gender: gender,
);

class _Setup {
  _Setup(
    Future<Reply> Function(SeenRequest) api, {
    Future<Reply> Function(SeenRequest)? storage,
  }) : rig = Rig(api),
       storageFake = FakeApi(
         storage ?? (_) async => const Reply(200, null, {'ETag': '"e"'}),
       ) {
    final uploader = MediaUploader(
      rig.api,
      storage: Dio()..httpClientAdapter = storageFake,
      wait: (_) async {},
    );
    repo = ApiProfileRepository(
      rig.api,
      uploader,
      ApiUserRepository(rig.api, now: () => DateTime.utc(2026, 10, 9, 12)),
    );
  }

  final Rig rig;
  final FakeApi storageFake;
  late final ApiProfileRepository repo;
}

void main() {
  test('the service fixes the username and the date of birth', () {
    final s = _Setup((_) async => Reply.ok({'data': _mine()}));
    expect(s.repo.capabilities.canChangeUsername, isFalse);
    expect(s.repo.capabilities.canEditDateOfBirth, isFalse);
  });

  group('reading', () {
    test(
      'the private part is the gender; the date of birth is never sent back',
      () async {
        final s = _Setup(
          (_) async => Reply.ok({'data': _mine(gender: 'non_binary')}),
        );
        final p = await s.repo.getPrivateProfile();
        expect(p.gender, Gender.nonBinary);
        expect(p.dateOfBirth, isNull);
      },
    );

    test('no gender is no gender', () async {
      final s = _Setup((_) async => Reply.ok({'data': _mine()}));
      expect((await s.repo.getPrivateProfile()).gender, isNull);
    });

    test('only the person\'s own username is available, since it cannot be claimed', () async {
      final s = _Setup((_) async => Reply.ok({'data': _mine()}));
      expect(await s.repo.isUsernameAvailable('@Asha.K'), isTrue);
      expect(await s.repo.isUsernameAvailable('someone.else'), isFalse);
    });
  });

  group('saving', () {
    Future<Reply> serve(SeenRequest r) async {
      if (r.method == 'PATCH') {
        return Reply.ok({'data': _mine(gender: 'female')});
      }
      if (r.path.endsWith('/users/me')) return Reply.ok({'data': meBody()});
      return Reply.ok({'data': _mine()});
    }

    test('sends the editable fields, empty ones as null, and returns the refreshed person', () async {
      final s = _Setup(serve);
      final user = await s.repo.updateProfile(
        _update(
          name: '  Asha Rao  ',
          bio: '  ',
          website: 'example.com',
          gender: Gender.female,
        ),
      );
      final patch = s.rig.fake.requests.firstWhere((r) => r.method == 'PATCH');
      expect(patch.path, '/api/v1/users/me/profile');
      expect(patch.body, {
        'displayName': 'Asha Rao',
        'bio': null,
        'websiteUrl': 'example.com',
        'state': 'Telangana',
        'district': 'Hyderabad',
        'gender': 'female',
      });
      expect(user.username, '@asha.k');
    });

    test(
      'never sends the username, the date of birth or the country',
      () async {
        final s = _Setup(serve);
        await s.repo.updateProfile(_update());
        final body =
            s.rig.fake.requests.firstWhere((r) => r.method == 'PATCH').body!
                as Map;
        expect(body.keys, isNot(contains('username')));
        expect(body.keys, isNot(contains('dateOfBirth')));
        expect(body.keys, isNot(contains('country')));
      },
    );

    test(
      'a different username is refused here without asking the server',
      () async {
        final s = _Setup(serve);
        await expectLater(
          s.repo.updateProfile(_update(username: 'new.name')),
          throwsA(isA<FieldValidationFailure>()),
        );
        expect(s.rig.fake.requests.where((r) => r.method == 'PATCH'), isEmpty);
      },
    );

    test(
      'the server\'s field reasons come back under the form\'s own names',
      () async {
        final s = _Setup((r) async {
          if (r.method == 'PATCH') {
            return Reply.error(
              400,
              'VALIDATION_FAILED',
              details: [
                {
                  'field': 'websiteUrl',
                  'reasons': ['invalid_url'],
                },
                {
                  'field': 'displayName',
                  'reasons': ['required'],
                },
              ],
            );
          }
          return Reply.ok({'data': _mine()});
        });
        await expectLater(
          s.repo.updateProfile(_update()),
          throwsA(
            isA<FieldValidationFailure>().having((f) => f.errors, 'errors', {
              'website': 'websiteInvalid',
              'name': 'required',
            }),
          ),
        );
      },
    );

    test(
      'a refusal the form has no field for is still a failure, never silence',
      () async {
        final s = _Setup((r) async {
          if (r.method == 'PATCH') {
            return Reply.error(
              400,
              'VALIDATION_FAILED',
              details: [
                {
                  'field': 'state',
                  'reasons': ['unknown_state'],
                },
              ],
            );
          }
          return Reply.ok({'data': _mine()});
        });
        await expectLater(
          s.repo.updateProfile(_update(state: 'Atlantis')),
          throwsA(isA<ValidationFailure>()),
        );
      },
    );
  });

  group('the photo', () {
    final photo = PickedPhoto(
      bytes: Uint8List.fromList(List.filled(500, 7)),
      fileName: 'me.png',
      mimeType: 'image/png',
    );

    Future<Reply> serve(SeenRequest r) async {
      if (r.path.endsWith('/media/uploads') && r.method == 'POST') {
        return Reply.ok({
          'data': {
            'assetId': uuidA,
            'sessionId': uuidB,
            'expiresAt': 'x',
            'mode': 'single',
            'upload': {
              'method': 'PUT',
              'url': 'https://storage.example.test/a',
              'headers': {'Content-Type': 'image/png'},
            },
          },
        });
      }
      if (r.path.endsWith('/complete')) return Reply.ok({'data': {}});
      if (r.path.startsWith('/api/v1/media/')) {
        return Reply.ok({
          'data': {
            'id': uuidA,
            'status': 'READY',
            'ready': true,
            'failureCode': null,
            'width': 400,
            'height': 400,
          },
        });
      }
      if (r.method == 'PATCH') {
        return Reply.ok({
          'data': _mine(avatarUrl: 'https://cdn.example.test/new.jpg'),
        });
      }
      return Reply.ok({'data': _mine()});
    }

    test('goes up, is attached to the profile, and ends with the new address; progress only moves forward', () async {
      final s = _Setup(serve);
      final events = await s.repo.uploadProfilePhoto(photo).toList();

      final progress = events
          .whereType<UploadInProgress>()
          .map((e) => e.fraction)
          .toList();
      expect(progress, isNotEmpty);
      expect(progress, orderedEquals([...progress]..sort()));
      expect(
        progress.last,
        lessThan(1),
        reason: 'not done until it is attached',
      );
      final done = events.last as UploadComplete;
      expect(done.avatarUrl, 'https://cdn.example.test/new.jpg');

      final announce = s.rig.fake.requests.first;
      expect(announce.body, {
        'purpose': 'AVATAR',
        'kind': 'IMAGE',
        'contentType': 'image/png',
        'sizeBytes': 500,
      });
      final attach = s.rig.fake.requests.lastWhere((r) => r.method == 'PATCH');
      expect(attach.body, {'avatarMediaId': uuidA});
      expect(s.storageFake.requests.single.body, photo.bytes);
    });

    test(
      'too large and unsupported use the keys the photo screen understands',
      () async {
        Future<Object?> tryWith(int status, String code) async {
          final s = _Setup((_) async => Reply.error(status, code));
          try {
            await s.repo.uploadProfilePhoto(photo).toList();
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

    test(
      'a picture the server looks at and rejects is "unsupported"',
      () async {
        final s = _Setup((r) async {
          if (r.path.endsWith('/media/uploads') && r.method == 'POST') {
            return serve(r);
          }
          if (r.path.endsWith('/complete')) return Reply.ok({'data': {}});
          return Reply.ok({
            'data': {
              'id': uuidA,
              'status': 'REJECTED',
              'ready': false,
              'failureCode': 'MODERATION_REJECTED',
            },
          });
        });
        await expectLater(
          s.repo.uploadProfilePhoto(photo).toList(),
          throwsA(const ValidationFailure('photoUnsupported')),
        );
        expect(s.rig.fake.requests.where((r) => r.method == 'PATCH'), isEmpty);
      },
    );

    test('a lost connection stays a network failure', () async {
      final s = _Setup(
        serve,
        storage: (r) async => throw connectionLost(r.options),
      );
      await expectLater(
        s.repo.uploadProfilePhoto(photo).toList(),
        throwsA(isA<NetworkFailure>()),
      );
    });

    test('removing the photo clears it on the server', () async {
      final s = _Setup((r) async {
        if (r.method == 'PATCH') return Reply.ok({'data': _mine()});
        if (r.path.endsWith('/users/me')) return Reply.ok({'data': meBody()});
        return Reply.ok({'data': _mine()});
      });
      await s.repo.removeProfilePhoto();
      final patch = s.rig.fake.requests.firstWhere((r) => r.method == 'PATCH');
      expect(patch.body, {'avatarMediaId': null});
    });
  });
}
