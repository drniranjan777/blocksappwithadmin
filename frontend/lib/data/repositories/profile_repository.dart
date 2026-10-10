import 'package:blocks_app/data/models/app_user.dart';
import 'package:blocks_app/data/models/profile_models.dart';

/// Editing the signed-in user's own profile.
///
/// Photo upload, in production:
///
/// ```text
/// Flutter app
///    -> asks the API for a short-lived, single-use signed upload URL
///    -> uploads the file straight to PRIVATE object storage with it
///    -> API validates MIME type, extension and size, checks the real content,
///       re-encodes the image (strips metadata), scans it, renames it, stores
///       it, and returns a signed CDN URL
///    -> CDN serves the picture
/// ```
///
/// The app never receives storage credentials or API keys. This interface is
/// the only thing the UI sees, so the whole pipeline can change behind it.
abstract interface class ProfileRepository {
  /// Which parts of the profile the service lets a person change.
  ProfileCapabilities get capabilities;

  /// Date of birth and gender: visible to the owner only.
  Future<PrivateProfile> getPrivateProfile();

  /// Whether [username] (without "@") is free. Advisory: [updateProfile]
  /// decides, and is the only thing that can reserve a name.
  Future<bool> isUsernameAvailable(String username);

  /// Throws `FieldValidationFailure` listing every refused field.
  Future<AppUser> updateProfile(ProfileUpdate update);

  /// Streams progress, then [UploadComplete]. Throws `ValidationFailure`
  /// (`photoUnsupported`, `photoTooLarge`) for a refused file and
  /// `NetworkFailure` for a failed transfer.
  Stream<UploadProgress> uploadProfilePhoto(PickedPhoto photo);

  Future<AppUser> removeProfilePhoto();
}
