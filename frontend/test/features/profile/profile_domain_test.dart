import 'dart:typed_data';

import 'package:blocks_app/core/services/local_media_store.dart';
import 'package:blocks_app/data/models/profile_models.dart';
import 'package:blocks_app/features/profile/domain/photo_rules.dart';
import 'package:blocks_app/features/profile/domain/profile_validator.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/fake_photo_picker.dart';

final _now = DateTime(2026, 10, 9);

Map<ProfileField, ProfileError> _check({
  String name = 'Aarav Kumar',
  String username = 'aarav.blocks',
  String bio = 'Hello',
  String website = '',
  DateTime? dob,
}) => ProfileValidator.validate(
  name: name,
  username: username,
  bio: bio,
  website: website,
  dateOfBirth: dob,
  now: _now,
);

void main() {
  group('ProfileValidator', () {
    test('a normal profile has no errors', () {
      expect(_check(), isEmpty);
    });

    test('name: required, length', () {
      expect(_check(name: '  ')[ProfileField.name], ProfileError.required);
      expect(_check(name: 'A')[ProfileField.name], ProfileError.nameTooShort);
      expect(
        _check(name: 'A' * 51)[ProfileField.name],
        ProfileError.nameTooLong,
      );
      expect(_check(name: 'Jo')[ProfileField.name], isNull);
      expect(_check(name: 'A' * 50)[ProfileField.name], isNull);
      // Leading / trailing spaces do not count.
      expect(_check(name: ' A ')[ProfileField.name], ProfileError.nameTooShort);
    });

    test('username: normalised before checking', () {
      expect(normalizeUsername('  @Aarav.Blocks '), 'aarav.blocks');
      expect(normalizeUsername('@@x'), 'x');
      expect(_check(username: '@Aarav.Blocks')[ProfileField.username], isNull);
    });

    test('username: length and characters', () {
      expect(
        _check(username: '')[ProfileField.username],
        ProfileError.required,
      );
      expect(
        _check(username: 'ab')[ProfileField.username],
        ProfileError.usernameTooShort,
      );
      expect(
        _check(username: 'a' * 31)[ProfileField.username],
        ProfileError.usernameTooLong,
      );
      for (final bad in [
        'has space',
        'sym!bol',
        'emoji😀',
        '.dot',
        'dot.',
        'a..b',
      ]) {
        expect(
          _check(username: bad)[ProfileField.username],
          ProfileError.usernameChars,
          reason: bad,
        );
      }
      for (final ok in ['a.b', 'a_b', 'abc123', 'a.b_c.9', '_x_']) {
        expect(_check(username: ok)[ProfileField.username], isNull, reason: ok);
      }
    });

    test('username: reserved names cannot be taken', () {
      for (final r in ['admin', 'Blocks', '@support', 'OFFICIAL']) {
        expect(
          _check(username: r)[ProfileField.username],
          ProfileError.usernameReserved,
          reason: r,
        );
      }
    });

    test('bio: at most 150 characters (trimmed)', () {
      expect(_check(bio: 'a' * 150)[ProfileField.bio], isNull);
      expect(_check(bio: 'a' * 151)[ProfileField.bio], ProfileError.bioTooLong);
      expect(_check(bio: '${' ' * 40}${'a' * 150}')[ProfileField.bio], isNull);
    });

    group('website', () {
      test('is optional and normalised', () {
        expect(normalizeWebsite(''), isNull);
        expect(normalizeWebsite('   '), isNull);
        expect(normalizeWebsite('example.com'), 'https://example.com');
        expect(
          normalizeWebsite('  Example.COM/Path '),
          'https://example.com/Path',
        );
        expect(normalizeWebsite('http://blocks.in'), 'http://blocks.in');
        expect(
          normalizeWebsite('https://sub.domain.example.co.in/x?y=1'),
          'https://sub.domain.example.co.in/x?y=1',
        );
      });

      test('rejects anything that is not a plain web address', () {
        for (final bad in [
          'javascript:alert(1)',
          'ftp://files.example.com',
          'file:///etc/passwd',
          'localhost',
          'no spaces.com',
          'http://user:pw@example.com',
          'a' * 120,
          '.com',
          'example..com',
        ]) {
          expect(
            _check(website: bad)[ProfileField.website],
            ProfileError.websiteInvalid,
            reason: bad,
          );
        }
      });

      test('valid ones pass', () {
        for (final ok in ['example.com', 'https://blocks.in/me', 'a.co']) {
          expect(_check(website: ok)[ProfileField.website], isNull, reason: ok);
        }
      });
    });

    group('date of birth', () {
      test('is optional', () {
        expect(_check()[ProfileField.dateOfBirth], isNull);
      });

      test('cannot be in the future', () {
        expect(
          _check(dob: DateTime(2026, 10, 10))[ProfileField.dateOfBirth],
          ProfileError.dobFuture,
        );
      });

      test('must be at least 13 (to the day)', () {
        expect(
          _check(dob: DateTime(2013, 10, 9))[ProfileField.dateOfBirth],
          isNull,
          reason: '13th birthday is today',
        );
        expect(
          _check(dob: DateTime(2013, 10, 10))[ProfileField.dateOfBirth],
          ProfileError.dobUnderAge,
          reason: '13th birthday is tomorrow',
        );
        expect(
          _check(dob: DateTime(2020, 1, 1))[ProfileField.dateOfBirth],
          ProfileError.dobUnderAge,
        );
      });

      test('must be plausible', () {
        expect(
          _check(dob: DateTime(1900, 1, 1))[ProfileField.dateOfBirth],
          ProfileError.dobInvalid,
        );
        expect(
          _check(dob: DateTime(1906, 10, 9))[ProfileField.dateOfBirth],
          isNull,
          reason: 'exactly 120',
        );
      });

      test('ageOn handles birthdays correctly', () {
        expect(ageOn(DateTime(2000, 10, 9), _now), 26);
        expect(ageOn(DateTime(2000, 10, 10), _now), 25);
        expect(ageOn(DateTime(2000, 12, 31), _now), 25);
        expect(ageOn(DateTime(2000, 1, 1), _now), 26);
      });
    });

    test('reports every problem at once', () {
      final e = _check(
        name: '',
        username: 'x',
        bio: 'a' * 200,
        website: 'nope',
        dob: DateTime(2030),
      );
      expect(e.keys, containsAll(ProfileField.values));
    });
  });

  group('PhotoRules', () {
    PickedPhoto photo({
      Uint8List? bytes,
      String name = 'a.png',
      String mime = 'image/png',
    }) => PickedPhoto(bytes: bytes ?? kTinyPng, fileName: name, mimeType: mime);

    test('accepts the supported image types', () {
      for (final (n, m) in [
        ('a.jpg', 'image/jpeg'),
        ('a.JPEG', 'image/jpeg'),
        ('a.png', 'image/png'),
        ('a.webp', 'image/webp'),
        ('a.heic', 'image/heic'),
        ('A.PNG', 'IMAGE/PNG'),
      ]) {
        expect(
          PhotoRules.validate(photo(name: n, mime: m)),
          isNull,
          reason: n,
        );
      }
    });

    test('rejects empty, unsupported and executable-looking files', () {
      expect(PhotoRules.validate(photo(bytes: Uint8List(0))), PhotoError.empty);
      for (final (n, m) in [
        ('a.gif', 'image/gif'),
        ('a.svg', 'image/svg+xml'),
        ('a.pdf', 'application/pdf'),
        ('a.exe', 'application/octet-stream'),
        ('a.png.exe', 'image/png'),
        ('noextension', 'image/png'),
        ('a.png', 'text/html'),
      ]) {
        expect(
          PhotoRules.validate(photo(name: n, mime: m)),
          PhotoError.unsupportedType,
          reason: '$n $m',
        );
      }
    });

    test('size limit is 5 MB', () {
      final exactly = Uint8List(PhotoRules.maxBytes)..setAll(0, kTinyPng);
      final over = Uint8List(PhotoRules.maxBytes + 1);
      expect(PhotoRules.validate(photo(bytes: exactly)), isNull);
      expect(PhotoRules.validate(photo(bytes: over)), PhotoError.tooLarge);
    });

    test('sniffs the real type from the content', () {
      expect(PhotoRules.sniffMimeType(kTinyPng), 'image/png');
      expect(PhotoRules.sniffMimeType(kJpegBytes), 'image/jpeg');
      expect(PhotoRules.sniffMimeType(kWebpBytes), 'image/webp');
      expect(PhotoRules.sniffMimeType(kHeicBytes), 'image/heic');
      expect(
        PhotoRules.sniffMimeType(Uint8List.fromList('<html>'.codeUnits)),
        isNull,
      );
      expect(PhotoRules.sniffMimeType(Uint8List(0)), isNull);
      expect(
        PhotoRules.sniffMimeType(Uint8List.fromList([0xFF, 0xD8])),
        isNull,
      );
    });

    test('content must match what was declared', () {
      expect(PhotoRules.validateContent(photo()), isNull);
      // A PNG pretending to be a JPEG.
      expect(
        PhotoRules.validateContent(photo(name: 'a.jpg', mime: 'image/jpeg')),
        PhotoError.contentMismatch,
      );
      // Not an image at all, but named and typed like one.
      expect(
        PhotoRules.validateContent(
          photo(bytes: Uint8List.fromList('<script>x</script>'.codeUnits)),
        ),
        PhotoError.unsupportedType,
      );
    });
  });

  group('LocalMediaStore', () {
    test('stores bytes under a local URL and gives them back', () {
      final store = LocalMediaStore();
      final url = store.put(kTinyPng);
      expect(LocalMediaStore.isLocal(url), isTrue);
      expect(LocalMediaStore.isLocal('https://cdn.example/x.jpg'), isFalse);
      expect(store.get(url), kTinyPng);
    });

    test('is bounded: the oldest image goes first', () {
      final store = LocalMediaStore(capacity: 3);
      final urls = [for (var i = 0; i < 5; i++) store.put(kTinyPng)];
      expect(store.length, 3);
      expect(store.get(urls[0]), isNull);
      expect(store.get(urls[1]), isNull);
      expect(store.get(urls[4]), isNotNull);
    });

    test('remove and clear', () {
      final store = LocalMediaStore();
      final a = store.put(kTinyPng)..toString();
      store.remove(a);
      expect(store.get(a), isNull);
      store.put(kTinyPng);
      store.clear();
      expect(store.length, 0);
    });

    test('unknown or foreign URLs are simply absent', () {
      expect(LocalMediaStore().get('local://photo/999'), isNull);
    });
  });
}
