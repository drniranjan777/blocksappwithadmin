import 'dart:io';
import 'dart:ui' as ui;

import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/core/services/media_picker.dart';
import 'package:blocks_app/core/services/video_frame.dart';
import 'package:blocks_app/core/services/video_info.dart';
import 'package:blocks_app/data/models/reel_models.dart';
import 'package:blocks_app/data/repositories/media_repositories.dart';

/// The width and height of a photo file, or null when it cannot be read.
typedef PhotoSizeReader = Future<({int width, int height})?> Function(String);

/// The person's own phone as the reel studio's media library.
///
/// Photos and videos are chosen with the system picker (or recorded with the camera), so the app
/// only ever sees the files the person picked. What was chosen in this session is what
/// [getLibrary] lists, so a clip can be tapped again and reordered without opening the picker.
class DeviceMediaLibraryRepository implements MediaLibraryRepository {
  DeviceMediaLibraryRepository(
    this._picker, {
    VideoInfoReader videoInfo = const VideoInfoReader(),
    PhotoSizeReader? photoSize,
    this.frame,
    DateTime Function()? now,
  }) : _video = videoInfo,
       _photoSize = photoSize ?? _readPhotoSize,
       _now = now ?? DateTime.now;

  final DeviceMediaPicker _picker;
  final VideoInfoReader _video;
  final PhotoSizeReader _photoSize;

  /// Makes a picture of a video's first moment for the timeline; absent means plain tiles.
  final VideoFrameReader? frame;
  final DateTime Function() _now;

  /// Newest last.
  final List<MediaAsset> _session = [];
  int _counter = 0;

  @override
  bool get picksFromDevice => true;

  @override
  Future<List<MediaAsset>> getLibrary() async => _session.reversed.toList();

  @override
  Future<List<MediaAsset>> pickFromDevice({required int limit}) async {
    final List<PickedMediaFile> files;
    try {
      files = await _picker.pickMedia(limit: limit);
    } on MediaPickFailure {
      throw const UnknownFailure('The gallery could not be opened');
    }
    if (files.isEmpty) return const [];
    final assets = <MediaAsset>[];
    var skipped = 0;
    for (final f in files) {
      final asset = await _describe(f);
      if (asset == null) {
        skipped++;
        continue;
      }
      assets.add(_remember(asset));
    }
    if (assets.isEmpty && skipped > 0) {
      throw const ValidationFailure('unsupportedFile');
    }
    return assets;
  }

  @override
  Future<MediaAsset> record() async {
    final PickedMediaFile? file;
    try {
      file = await _picker.recordVideo();
    } on MediaPickFailure {
      throw const UnknownFailure('The camera could not be opened');
    }
    if (file == null) {
      throw const UnknownFailure('Nothing was recorded');
    }
    final asset = await _describe(file);
    if (asset == null) throw const ValidationFailure('unsupportedFile');
    return _remember(asset);
  }

  /// Keeps an asset in the session list once (picking the same file twice is one entry).
  MediaAsset _remember(MediaAsset asset) {
    final i = _session.indexWhere((m) => m.localPath == asset.localPath);
    if (i >= 0) return _session[i];
    _session.add(asset);
    return asset;
  }

  Future<MediaAsset?> _describe(PickedMediaFile f) async {
    final id =
        'dev~${_now().microsecondsSinceEpoch.toRadixString(36)}${_counter++}';
    if (f.isVideo) {
      final info = await _video.read(f.path);
      // A video whose length cannot be read cannot be laid on a timeline.
      if (info == null || info.durationMs <= 0) return null;
      return MediaAsset(
        id: id,
        type: MediaType.video,
        origin: MediaOrigin.device,
        localPath: f.path,
        thumbnailPath: await _frameOf(f.path),
        originalSizeBytes: f.sizeBytes,
        durationMs: info.durationMs,
        width: info.width,
        height: info.height,
        name: f.name,
      );
    }
    final size = await _photoSize(f.path);
    if (size == null) return null;
    return MediaAsset(
      id: id,
      type: MediaType.photo,
      origin: MediaOrigin.device,
      localPath: f.path,
      thumbnailPath: f.path,
      originalSizeBytes: f.sizeBytes,
      durationMs: 0,
      width: size.width,
      height: size.height,
      name: f.name,
    );
  }

  /// A picture of the video's first moment, or null. Never an error: it only decorates the tile.
  Future<String?> _frameOf(String path) async {
    try {
      return await frame?.call(path);
    } on Object {
      return null;
    }
  }

  static Future<({int width, int height})?> _readPhotoSize(String path) async {
    try {
      final buffer = await ui.ImmutableBuffer.fromUint8List(
        await File(path).readAsBytes(),
      );
      final descriptor = await ui.ImageDescriptor.encoded(buffer);
      final size = (width: descriptor.width, height: descriptor.height);
      descriptor.dispose();
      buffer.dispose();
      return size;
    } on Object {
      return null;
    }
  }
}
