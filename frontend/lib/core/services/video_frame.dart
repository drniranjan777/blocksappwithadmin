import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// A picture of one moment of a video, saved as an image file; null when none can be made.
///
/// It is only for showing the person their footage on the timeline. Failing to make one is
/// never an error: the editor shows a plain tile instead.
typedef VideoFrameReader = Future<String?> Function(String videoPath);

/// The platform's own frame grabber (Android's `MediaMetadataRetriever`, through a small bridge
/// in `MainActivity`). Other platforms answer "no picture" until they have a bridge of their own.
class PlatformVideoFrames {
  PlatformVideoFrames({MethodChannel? channel, Directory? folder})
    : _channel = channel ?? const MethodChannel('in.blocks/video_frame'),
      _folder =
          folder ?? Directory('${Directory.systemTemp.path}/blocks_frames');

  final MethodChannel _channel;
  final Directory _folder;
  int _n = 0;

  Future<String?> frameOf(String videoPath) async {
    if (!Platform.isAndroid) return null;
    try {
      final out =
          '${_folder.path}/f${DateTime.now().microsecondsSinceEpoch}_${_n++}.jpg';
      final path = await _channel.invokeMethod<String>('frame', {
        'path': videoPath,
        'out': out,
        'atMs': 0,
      });
      return path != null && File(path).existsSync() ? path : null;
    } on Object {
      return null;
    }
  }
}

final videoFrameReaderProvider = Provider<VideoFrameReader>(
  (ref) => PlatformVideoFrames().frameOf,
);
