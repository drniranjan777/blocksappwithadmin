import 'package:blocks_app/data/models/profile_models.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

enum PhotoSource { camera, gallery }

/// The user could not be given a photo (permission denied, no camera, ...).
class PhotoPickFailure implements Exception {
  const PhotoPickFailure([this.reason]);

  final String? reason;
}

/// Chooses a photo from the camera or the gallery. Behind an interface so
/// tests (and desktop builds without a camera) never touch the platform.
abstract interface class ProfilePhotoPicker {
  /// Returns null when the user backs out without choosing anything.
  /// Throws [PhotoPickFailure] when the platform cannot provide one.
  Future<PickedPhoto?> pick(PhotoSource source);
}

/// Uses the platform camera / photo picker. The OS shows its own permission
/// prompt only when needed, and the app only receives the single photo the
/// user picked (no broad storage access).
class ImagePickerPhotoPicker implements ProfilePhotoPicker {
  ImagePickerPhotoPicker([ImagePicker? picker])
    : _picker = picker ?? ImagePicker();

  final ImagePicker _picker;

  /// Profile photos are shown small; there is no point sending more pixels.
  static const _maxEdge = 1080.0;
  static const _quality = 85;

  static const _mimeByExtension = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'webp': 'image/webp',
    'heic': 'image/heic',
  };

  @override
  Future<PickedPhoto?> pick(PhotoSource source) async {
    try {
      final file = await _picker.pickImage(
        source: source == PhotoSource.camera
            ? ImageSource.camera
            : ImageSource.gallery,
        maxWidth: _maxEdge,
        maxHeight: _maxEdge,
        imageQuality: _quality,
        requestFullMetadata: false,
      );
      if (file == null) return null;
      final bytes = await file.readAsBytes();
      final name = file.name.isEmpty ? 'photo.jpg' : file.name;
      final dot = name.lastIndexOf('.');
      final ext = dot < 0 ? '' : name.substring(dot + 1).toLowerCase();
      return PickedPhoto(
        bytes: bytes,
        fileName: name,
        mimeType: file.mimeType ?? _mimeByExtension[ext] ?? 'image/jpeg',
      );
    } on Object catch (e) {
      throw PhotoPickFailure(e.toString());
    }
  }
}

final profilePhotoPickerProvider = Provider<ProfilePhotoPicker>(
  (ref) => ImagePickerPhotoPicker(),
);
