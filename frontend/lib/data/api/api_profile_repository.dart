import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/api/api_client.dart';
import 'package:blocks_app/data/api/api_user_repository.dart';
import 'package:blocks_app/data/api/json_reader.dart';
import 'package:blocks_app/data/api/media_uploader.dart';
import 'package:blocks_app/data/models/app_user.dart';
import 'package:blocks_app/data/models/profile_models.dart';
import 'package:blocks_app/data/repositories/profile_repository.dart';
import 'package:blocks_app/features/profile/domain/profile_validator.dart';

/// Editing the signed-in person's own profile, and their photo, against the real
/// API.
///
/// What the server decides differently from the demo, and how that shows here:
///  * the username is chosen at sign-up and cannot be changed
///    ([ProfileCapabilities.canChangeUsername] is false);
///  * the date of birth is fixed at sign-up (it is what the age check used) and is
///    never sent back, even to its owner ([ProfileCapabilities.canEditDateOfBirth]
///    is false);
///  * the country is always India for now: [ProfileUpdate.country] is not sent.
class ApiProfileRepository implements ProfileRepository {
  ApiProfileRepository(this._api, this._uploader, this._users);

  final ApiClient _api;
  final MediaUploader _uploader;
  final ApiUserRepository _users;

  @override
  ProfileCapabilities get capabilities => const ProfileCapabilities(
    canChangeUsername: false,
    canEditDateOfBirth: false,
  );

  static const _genders = {
    Gender.female: 'female',
    Gender.male: 'male',
    Gender.nonBinary: 'non_binary',
    Gender.preferNotToSay: 'prefer_not_to_say',
  };

  Future<JsonObject> _mine() async =>
      JsonObject.of((await _api.get('/users/me/profile')).data);

  @override
  Future<PrivateProfile> getPrivateProfile() async {
    final wire = (await _mine()).stringOrNull('gender');
    final gender = _genders.entries
        .where((e) => e.value == wire)
        .map((e) => e.key)
        .firstOrNull;
    return PrivateProfile(gender: gender);
  }

  /// Only the person's own username is "free": there is nothing to claim.
  @override
  Future<bool> isUsernameAvailable(String username) async =>
      normalizeUsername(username) ==
      normalizeUsername((await _mine()).string('username'));

  @override
  Future<AppUser> updateProfile(ProfileUpdate update) async {
    final mine = await _mine();
    if (normalizeUsername(update.username) !=
        normalizeUsername(mine.string('username'))) {
      throw const FieldValidationFailure({'username': 'usernameTaken'});
    }
    String? orNull(String v) => v.trim().isEmpty ? null : v.trim();
    try {
      await _api.patch(
        '/users/me/profile',
        body: {
          'displayName': update.name.trim(),
          'bio': orNull(update.bio),
          'websiteUrl': orNull(update.website ?? ''),
          'state': orNull(update.state),
          'district': orNull(update.district),
          'gender': update.gender == null ? null : _genders[update.gender],
        },
      );
    } on FieldValidationFailure catch (e) {
      throw _profileErrors(e);
    }
    return _users.getCurrentUser();
  }

  /// The server's field names and reasons as the form's. A refusal the form has
  /// no place to show (an unknown state, say) becomes a plain failure, so the
  /// person is told the save did not happen rather than seeing nothing.
  AppFailure _profileErrors(FieldValidationFailure e) {
    final mapped = <String, String>{};
    e.errors.forEach((field, reason) {
      switch (field) {
        case 'displayName':
          mapped['name'] = reason == 'required' ? 'required' : 'nameTooLong';
        case 'websiteUrl':
          mapped['website'] = 'websiteInvalid';
        case 'bio':
          mapped['bio'] = 'bioTooLong';
      }
    });
    return mapped.isEmpty
        ? const ValidationFailure('rejected')
        : FieldValidationFailure(mapped);
  }

  @override
  Stream<UploadProgress> uploadProfilePhoto(PickedPhoto photo) async* {
    try {
      await for (final event in _uploader.upload(
        purpose: MediaPurpose.avatar,
        kind: MediaKind.image,
        contentType: photo.mimeType,
        source: UploadSource.bytes(photo.bytes),
      )) {
        switch (event) {
          case MediaSending(:final fraction):
            yield UploadInProgress(fraction * 0.9);
          case MediaProcessing():
            yield const UploadInProgress(0.95);
          case MediaReady(:final media):
            final profile = JsonObject.of(
              (await _api.patch(
                '/users/me/profile',
                body: {'avatarMediaId': media.id},
              )).data,
            );
            yield UploadComplete(profile.stringOr('avatarUrl', ''));
        }
      }
    } on AppFailure catch (e) {
      // The keys the photo screen understands.
      if (e.code == 'PAYLOAD_TOO_LARGE') {
        throw const ValidationFailure('photoTooLarge');
      }
      if (e.code == 'UNSUPPORTED_MEDIA' || e.message == 'mediaRejected') {
        throw const ValidationFailure('photoUnsupported');
      }
      rethrow;
    }
  }

  @override
  Future<AppUser> removeProfilePhoto() async {
    await _api.patch('/users/me/profile', body: {'avatarMediaId': null});
    return _users.getCurrentUser();
  }
}
