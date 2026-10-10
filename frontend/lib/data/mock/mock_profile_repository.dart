import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/core/services/local_media_store.dart';
import 'package:blocks_app/data/mock/mock_catalog.dart';
import 'package:blocks_app/data/mock/mock_world.dart';
import 'package:blocks_app/data/models/app_user.dart';
import 'package:blocks_app/data/models/profile_models.dart';
import 'package:blocks_app/data/repositories/profile_repository.dart';
import 'package:blocks_app/features/profile/domain/photo_rules.dart';
import 'package:blocks_app/features/profile/domain/profile_validator.dart';

/// The mock "profile server". It re-validates everything the form already
/// checked (a client can always be bypassed) and checks the real content of an
/// uploaded photo instead of trusting its name or declared type.
class MockProfileRepository implements ProfileRepository {
  MockProfileRepository(this._w, this._media);

  final MockWorld _w;
  final LocalMediaStore _media;

  @override
  ProfileCapabilities get capabilities => const ProfileCapabilities();

  /// Names already in use by other (seeded) accounts.
  bool _takenByOthers(String username) {
    final mine = normalizeUsername(_w.me.username);
    if (username == mine) return false;
    return kUserSeeds.any((u) => normalizeUsername(u.handle) == username);
  }

  @override
  Future<PrivateProfile> getPrivateProfile() async {
    await _w.pause();
    return _w.privateProfile;
  }

  @override
  Future<bool> isUsernameAvailable(String username) async {
    await _w.pause();
    final u = normalizeUsername(username);
    return !ProfileRules.reservedUsernames.contains(u) && !_takenByOthers(u);
  }

  @override
  Future<AppUser> updateProfile(ProfileUpdate update) async {
    await _w.pause();

    final errors = ProfileValidator.validate(
      name: update.name,
      username: update.username,
      bio: update.bio,
      website: update.website ?? '',
      dateOfBirth: update.dateOfBirth,
      now: _w.now(),
    );
    final username = normalizeUsername(update.username);
    if (!errors.containsKey(ProfileField.username) &&
        _takenByOthers(username)) {
      errors[ProfileField.username] = ProfileError.usernameTaken;
    }
    if (errors.isNotEmpty) {
      throw FieldValidationFailure({
        for (final e in errors.entries) e.key.name: e.value.name,
      });
    }

    final website = normalizeWebsite(update.website ?? '');
    _w.me = _w.me.withProfile(
      name: update.name.trim(),
      username: '@$username',
      bio: update.bio.trim(),
      website: website,
      clearWebsite: website == null,
      country: update.country.trim().isEmpty ? null : update.country.trim(),
      state: update.state.trim().isEmpty ? null : update.state.trim(),
      district: update.district.trim().isEmpty ? null : update.district.trim(),
    );
    _w.privateProfile = PrivateProfile(
      dateOfBirth: update.dateOfBirth,
      gender: update.gender,
    );
    return _w.me;
  }

  @override
  Stream<UploadProgress> uploadProfilePhoto(PickedPhoto photo) async* {
    // Server-side checks come first, exactly as a real upload endpoint would.
    final problem = PhotoRules.validateContent(photo);
    if (problem != null) {
      throw ValidationFailure(
        problem == PhotoError.tooLarge ? 'photoTooLarge' : 'photoUnsupported',
      );
    }

    // Demo lab scenario H: the transfer fails once.
    final failing = _w.security.failNextPhotoUpload;
    const steps = 5;
    final stepDelay = _w.latency == Duration.zero
        ? Duration.zero
        : _w.latency ~/ 2;
    for (var i = 1; i <= steps; i++) {
      if (stepDelay != Duration.zero) await Future<void>.delayed(stepDelay);
      yield UploadInProgress(i / (steps + 1));
      if (failing && i == 3) {
        _w.security.failNextPhotoUpload = false;
        throw const NetworkFailure('Upload interrupted');
      }
    }

    // "Scan, re-encode, store privately, sign a CDN URL" happens here in
    // production. The demo keeps the bytes in memory and serves them locally.
    final previous = _w.me.avatarUrl;
    final url = _media.put(photo.bytes);
    _w.me = _w.me.withProfile(avatarUrl: url);
    if (previous != null && LocalMediaStore.isLocal(previous)) {
      _media.remove(previous);
    }
    yield UploadComplete(url);
  }

  @override
  Future<AppUser> removeProfilePhoto() async {
    await _w.pause();
    final previous = _w.me.avatarUrl;
    if (previous != null && LocalMediaStore.isLocal(previous)) {
      _media.remove(previous);
    }
    _w.me = _w.me.withProfile(clearAvatar: true);
    return _w.me;
  }
}
