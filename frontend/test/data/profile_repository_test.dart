import 'dart:typed_data';

import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/core/services/local_media_store.dart';
import 'package:blocks_app/data/mock/mock_profile_repository.dart';
import 'package:blocks_app/data/mock/mock_world.dart';
import 'package:blocks_app/data/models/profile_models.dart';
import 'package:blocks_app/features/profile/domain/photo_rules.dart';
import 'package:flutter_test/flutter_test.dart';

import '../helpers/fake_photo_picker.dart';

ProfileUpdate _update({
  String name = 'Aarav K',
  String username = 'aarav.blocks',
  String bio = 'New bio',
  String? website,
  String country = 'India',
  String state = 'Telangana',
  String district = 'Hyderabad',
  DateTime? dob,
  Gender? gender,
}) => ProfileUpdate(
  name: name,
  username: username,
  bio: bio,
  website: website,
  country: country,
  state: state,
  district: district,
  dateOfBirth: dob,
  gender: gender,
);

Matcher _fieldErrors(Map<String, String> expected) =>
    isA<FieldValidationFailure>().having((f) => f.errors, 'errors', expected);

void main() {
  late MockWorld world;
  late LocalMediaStore media;
  late MockProfileRepository repo;

  setUp(() {
    world = MockWorld(clock: () => DateTime(2026, 10, 9));
    media = LocalMediaStore();
    repo = MockProfileRepository(world, media);
  });

  group('updateProfile', () {
    test('saves the public profile and applies it everywhere', () async {
      final me = await repo.updateProfile(
        _update(
          name: '  Aarav Kumar Reddy ',
          username: '@Aarav.Reddy',
          bio: ' Storyteller ',
          website: 'blocks.in/aarav',
          district: 'Warangal',
        ),
      );

      expect(me.name, 'Aarav Kumar Reddy');
      expect(me.username, '@aarav.reddy');
      expect(me.bio, 'Storyteller');
      expect(me.website, 'https://blocks.in/aarav');
      expect(me.district, 'Warangal');
      // The world (and so every screen reading it) sees the same person.
      expect(world.me, me);
      expect(world.factory.summaryOf('me').name, 'Aarav Kumar Reddy');
      // Untouched facts are untouched.
      expect(me.followersCount, 18450);
      expect(me.isVerified, isTrue);
    });

    test('an empty website clears it', () async {
      await repo.updateProfile(_update(website: 'example.com'));
      expect(world.me.website, 'https://example.com');
      final me = await repo.updateProfile(_update());
      expect(me.website, isNull);
    });

    test('private details are stored apart from the public profile', () async {
      await repo.updateProfile(
        _update(dob: DateTime(1990, 5, 20), gender: Gender.female),
      );
      final p = await repo.getPrivateProfile();
      expect(p.dateOfBirth, DateTime(1990, 5, 20));
      expect(p.gender, Gender.female);
      // Nothing private is on the public user.
      expect(world.me.props.whereType<DateTime>(), isEmpty);
    });

    test(
      'the server re-validates every field, whatever the client did',
      () async {
        await expectLater(
          repo.updateProfile(
            _update(
              name: '',
              username: 'a b',
              bio: 'x' * 400,
              website: 'javascript:alert(1)',
              dob: DateTime(2030),
            ),
          ),
          throwsA(
            _fieldErrors({
              'name': 'required',
              'username': 'usernameChars',
              'bio': 'bioTooLong',
              'website': 'websiteInvalid',
              'dateOfBirth': 'dobFuture',
            }),
          ),
        );
        // Nothing was applied.
        expect(world.me.name, 'Aarav Kumar');
      },
    );

    test('rejects a username that belongs to someone else', () async {
      await expectLater(
        repo.updateProfile(_update(username: 'meera.eats')),
        throwsA(_fieldErrors({'username': 'usernameTaken'})),
      );
      await expectLater(
        repo.updateProfile(_update(username: '@Meera.Eats')),
        throwsA(_fieldErrors({'username': 'usernameTaken'})),
      );
    });

    test('rejects reserved names, but keeping your own name is fine', () async {
      await expectLater(
        repo.updateProfile(_update(username: 'support')),
        throwsA(_fieldErrors({'username': 'usernameReserved'})),
      );
      final me = await repo.updateProfile(_update());
      expect(me.username, '@aarav.blocks');
    });

    test('must be old enough', () async {
      await expectLater(
        repo.updateProfile(_update(dob: DateTime(2020, 1, 1))),
        throwsA(_fieldErrors({'dateOfBirth': 'dobUnderAge'})),
      );
    });
  });

  group('isUsernameAvailable', () {
    test('false for taken and reserved, true for free or your own', () async {
      expect(await repo.isUsernameAvailable('meera.eats'), isFalse);
      expect(await repo.isUsernameAvailable('@MEERA.eats'), isFalse);
      expect(await repo.isUsernameAvailable('admin'), isFalse);
      expect(await repo.isUsernameAvailable('fresh.name'), isTrue);
      expect(await repo.isUsernameAvailable('aarav.blocks'), isTrue);
    });
  });

  group('photo upload', () {
    Future<(List<UploadProgress>, Object?)> run(PickedPhoto p) async {
      final seen = <UploadProgress>[];
      Object? error;
      try {
        await for (final e in repo.uploadProfilePhoto(p)) {
          seen.add(e);
        }
      } on Object catch (e) {
        error = e;
      }
      return (seen, error);
    }

    test('streams rising progress, then the new picture', () async {
      final (events, error) = await run(tinyPngPhoto());
      expect(error, isNull);

      final fractions = events
          .whereType<UploadInProgress>()
          .map((e) => e.fraction)
          .toList();
      expect(fractions, isNotEmpty);
      for (var i = 1; i < fractions.length; i++) {
        expect(fractions[i], greaterThan(fractions[i - 1]));
      }
      expect(fractions.every((f) => f > 0 && f < 1), isTrue);
      expect(events.last, isA<UploadComplete>());

      final url = (events.last as UploadComplete).avatarUrl;
      expect(LocalMediaStore.isLocal(url), isTrue);
      expect(world.me.avatarUrl, url);
      expect(media.get(url), kTinyPng);
    });

    test('replacing the photo frees the previous one', () async {
      final (first, _) = await run(tinyPngPhoto());
      final firstUrl = (first.last as UploadComplete).avatarUrl;
      final (second, _) = await run(tinyPngPhoto('b.png'));
      final secondUrl = (second.last as UploadComplete).avatarUrl;

      expect(secondUrl, isNot(firstUrl));
      expect(media.get(firstUrl), isNull);
      expect(media.get(secondUrl), isNotNull);
    });

    test('the server checks the file, not the client', () async {
      // Wrong type.
      final (_, gif) = await run(
        PickedPhoto(bytes: kTinyPng, fileName: 'a.gif', mimeType: 'image/gif'),
      );
      expect(gif, isA<ValidationFailure>());
      expect((gif! as ValidationFailure).message, 'photoUnsupported');

      // Too big.
      final big = Uint8List(PhotoRules.maxBytes + 1)..setAll(0, kTinyPng);
      final (_, large) = await run(
        PickedPhoto(bytes: big, fileName: 'a.png', mimeType: 'image/png'),
      );
      expect((large! as ValidationFailure).message, 'photoTooLarge');

      // Not an image despite a friendly name and declared type.
      final (_, fake) = await run(
        PickedPhoto(
          bytes: Uint8List.fromList('<html></html>'.codeUnits),
          fileName: 'a.png',
          mimeType: 'image/png',
        ),
      );
      expect((fake! as ValidationFailure).message, 'photoUnsupported');

      // A PNG claiming to be a JPEG.
      final (_, liar) = await run(
        PickedPhoto(bytes: kTinyPng, fileName: 'a.jpg', mimeType: 'image/jpeg'),
      );
      expect((liar! as ValidationFailure).message, 'photoUnsupported');

      // None of that changed the profile or stored anything.
      expect(world.me.avatarUrl, isNull);
      expect(media.length, 0);
    });

    test('the demo failure interrupts once, then uploads work again', () async {
      world.security.failNextPhotoUpload = true;
      final (events, error) = await run(tinyPngPhoto());

      expect(error, isA<NetworkFailure>());
      expect(events, isNotEmpty); // it got part-way
      expect(events.any((e) => e is UploadComplete), isFalse);
      expect(world.me.avatarUrl, isNull);
      expect(world.security.failNextPhotoUpload, isFalse);

      final (retry, retryError) = await run(tinyPngPhoto());
      expect(retryError, isNull);
      expect(retry.last, isA<UploadComplete>());
    });

    test('removing the photo clears it and frees the memory', () async {
      final (events, _) = await run(tinyPngPhoto());
      final url = (events.last as UploadComplete).avatarUrl;

      final me = await repo.removeProfilePhoto();
      expect(me.avatarUrl, isNull);
      expect(media.get(url), isNull);
      // Removing again is harmless.
      expect((await repo.removeProfilePhoto()).avatarUrl, isNull);
    });
  });
}
