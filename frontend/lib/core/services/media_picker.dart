import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

/// A photo or video the person chose on their phone.
class PickedMediaFile {
  const PickedMediaFile({
    required this.path,
    required this.name,
    required this.sizeBytes,
    required this.isVideo,
    this.mimeType,
  });

  /// A file the app can read.
  final String path;
  final String name;
  final int sizeBytes;
  final bool isVideo;

  /// What the system said it is, when it said.
  final String? mimeType;
}

/// The person could not be given a file (permission refused, no camera, ...).
class MediaPickFailure implements Exception {
  const MediaPickFailure([this.reason]);

  final String? reason;

  @override
  String toString() => 'MediaPickFailure($reason)';
}

/// Chooses photos and videos from the phone. Behind an interface so tests (and desktop builds
/// without a camera) never touch the platform.
abstract interface class DeviceMediaPicker {
  /// The files chosen, in the order they were chosen; empty when the person backs out.
  Future<List<PickedMediaFile>> pickMedia({required int limit});

  /// Records a clip with the camera; null when the person backs out.
  Future<PickedMediaFile?> recordVideo({Duration? maxDuration});
}

/// Uses the system photo picker and camera. The app receives only what the person chose, with no
/// broad access to their storage, and Android or iOS shows any permission prompt itself.
class ImagePickerDeviceMediaPicker implements DeviceMediaPicker {
  ImagePickerDeviceMediaPicker([ImagePicker? picker])
    : _picker = picker ?? ImagePicker();

  final ImagePicker _picker;

  static const _videoExtensions = {
    'mp4',
    'mov',
    'm4v',
    '3gp',
    '3gpp',
    'webm',
    'mkv',
    'avi',
  };

  /// Whether a file name or type says "video".
  static bool looksLikeVideo(String name, String? mimeType) {
    if (mimeType != null && mimeType.startsWith('video/')) return true;
    if (mimeType != null && mimeType.startsWith('image/')) return false;
    final dot = name.lastIndexOf('.');
    final ext = dot < 0 ? '' : name.substring(dot + 1).toLowerCase();
    return _videoExtensions.contains(ext);
  }

  Future<PickedMediaFile> _describe(XFile file) async {
    final name = file.name.isEmpty ? file.path.split('/').last : file.name;
    return PickedMediaFile(
      path: file.path,
      name: name,
      sizeBytes: await File(file.path).length(),
      isVideo: looksLikeVideo(name, file.mimeType),
      mimeType: file.mimeType,
    );
  }

  @override
  Future<List<PickedMediaFile>> pickMedia({required int limit}) async {
    try {
      final files = await _picker.pickMultipleMedia(
        limit: limit < 2 ? null : limit,
        requestFullMetadata: false,
      );
      return [for (final f in files) await _describe(f)];
    } on Object catch (e) {
      throw MediaPickFailure(e.toString());
    }
  }

  @override
  Future<PickedMediaFile?> recordVideo({Duration? maxDuration}) async {
    try {
      final file = await _picker.pickVideo(
        source: ImageSource.camera,
        maxDuration: maxDuration,
      );
      return file == null ? null : await _describe(file);
    } on Object catch (e) {
      throw MediaPickFailure(e.toString());
    }
  }
}

final deviceMediaPickerProvider = Provider<DeviceMediaPicker>(
  (ref) => ImagePickerDeviceMediaPicker(),
);
