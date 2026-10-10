import 'dart:typed_data';

import 'package:blocks_app/data/models/profile_models.dart';

enum PhotoError { empty, unsupportedType, tooLarge, contentMismatch }

/// Rules for a profile photo.
///
/// The app runs [validate] for instant feedback only. A real backend must
/// repeat all of it, plus: re-encode the image (dropping anything that is not
/// pixels), strip metadata such as GPS, scan for malware, generate its own
/// object name, store it in a *private* bucket and serve it through signed CDN
/// URLs. None of that is the app's job, and the app never holds storage keys.
abstract final class PhotoRules {
  static const maxBytes = 5 * 1024 * 1024;

  static const allowedMimeTypes = {
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
  };

  static const allowedExtensions = {'jpg', 'jpeg', 'png', 'webp', 'heic'};

  static String _extension(String fileName) {
    final dot = fileName.lastIndexOf('.');
    return dot < 0 ? '' : fileName.substring(dot + 1).toLowerCase();
  }

  /// Declared type, extension and size. `null` = acceptable.
  static PhotoError? validate(PickedPhoto photo) {
    if (photo.bytes.isEmpty) return PhotoError.empty;
    if (photo.sizeBytes > maxBytes) return PhotoError.tooLarge;
    if (!allowedMimeTypes.contains(photo.mimeType.toLowerCase()) ||
        !allowedExtensions.contains(_extension(photo.fileName))) {
      return PhotoError.unsupportedType;
    }
    return null;
  }

  /// What the bytes really are, from their magic numbers, or null if it is
  /// not an accepted image. A file name or MIME header can say anything; only
  /// the content tells the truth.
  static String? sniffMimeType(Uint8List b) {
    if (b.length >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF) {
      return 'image/jpeg';
    }
    if (b.length >= 8 &&
        b[0] == 0x89 &&
        b[1] == 0x50 &&
        b[2] == 0x4E &&
        b[3] == 0x47 &&
        b[4] == 0x0D &&
        b[5] == 0x0A &&
        b[6] == 0x1A &&
        b[7] == 0x0A) {
      return 'image/png';
    }
    if (b.length >= 12 &&
        String.fromCharCodes(b.sublist(0, 4)) == 'RIFF' &&
        String.fromCharCodes(b.sublist(8, 12)) == 'WEBP') {
      return 'image/webp';
    }
    if (b.length >= 12 &&
        String.fromCharCodes(b.sublist(4, 8)) == 'ftyp' &&
        const {
          'heic',
          'heix',
          'mif1',
          'heif',
        }.contains(String.fromCharCodes(b.sublist(8, 12)))) {
      return 'image/heic';
    }
    return null;
  }

  /// Server-side check: declared rules AND the content must be a real,
  /// accepted image whose type matches what was declared.
  static PhotoError? validateContent(PickedPhoto photo) {
    final basic = validate(photo);
    if (basic != null) return basic;
    final real = sniffMimeType(photo.bytes);
    if (real == null) return PhotoError.unsupportedType;
    if (real != photo.mimeType.toLowerCase()) return PhotoError.contentMismatch;
    return null;
  }
}
