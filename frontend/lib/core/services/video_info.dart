import 'dart:io';
import 'dart:typed_data';

/// What a video file says about itself.
class VideoInfo {
  const VideoInfo({
    required this.durationMs,
    required this.width,
    required this.height,
  });

  final int durationMs;
  final int width;
  final int height;
}

/// Reads the length and picture size of an MP4 / MOV / 3GP file from its own header.
///
/// These formats are a sequence of "boxes" (size, name, contents). The `moov` box holds the
/// movie header (`mvhd`: timescale and duration) and, per track, `tkhd` (picture size). Phone
/// cameras often write `moov` at the *end* of the file, so the file is walked box by box with
/// seeks instead of being read whole: a 200 MB video costs a few dozen small reads.
///
/// This only ever **describes** a file so the editor can lay it on a timeline. It is not a trust
/// boundary: the server re-inspects the real file and decides.
class VideoInfoReader {
  const VideoInfoReader();

  /// Null when [path] is not a file this reader understands (a WebM, a damaged file, ...).
  Future<VideoInfo?> read(String path) async {
    final file = File(path);
    if (!file.existsSync()) return null;
    final raf = await file.open();
    try {
      final length = await raf.length();
      final moov = await _find(raf, 0, length, 'moov');
      if (moov == null) return null;
      return await _movie(raf, moov.$1, moov.$2);
    } on Object {
      return null;
    } finally {
      await raf.close();
    }
  }

  /// The movie header and the largest track's picture size.
  Future<VideoInfo?> _movie(RandomAccessFile raf, int start, int end) async {
    var durationMs = 0;
    var width = 0;
    var height = 0;
    var seen = false;

    var at = start;
    while (at + 8 <= end) {
      final box = await _header(raf, at, end);
      if (box == null) break;
      if (box.name == 'mvhd') {
        final data = await _read(raf, box.bodyStart, 32);
        final version = data[0];
        final int timescale;
        final int duration;
        if (version == 1) {
          timescale = _u32(data, 20);
          duration = _u64(data, 24);
        } else {
          timescale = _u32(data, 12);
          duration = _u32(data, 16);
        }
        if (timescale > 0) {
          durationMs = (duration * 1000 / timescale).round();
          seen = true;
        }
      } else if (box.name == 'trak') {
        final tkhd = await _find(raf, box.bodyStart, box.end, 'tkhd');
        if (tkhd != null) {
          final data = await _read(raf, tkhd.$1, tkhd.$2 - tkhd.$1);
          final version = data.isEmpty ? 0 : data[0];
          // Width and height are the last two 16.16 fixed-point numbers of the box.
          final base = version == 1 ? 88 : 76;
          if (data.length >= base + 8) {
            var w = _u32(data, base) >> 16;
            var h = _u32(data, base + 4) >> 16;
            // A phone held upright often records 1920x1080 and a 90 degree turn in the matrix
            // (a and d are zero); people see it as 1080x1920.
            final m = base - 36;
            final turned =
                _u32(data, m) == 0 &&
                _u32(data, m + 16) == 0 &&
                (_u32(data, m + 4) != 0 || _u32(data, m + 12) != 0);
            if (turned) {
              final t = w;
              w = h;
              h = t;
            }
            // Audio tracks have 0x0; the picture track is the one with a size.
            if (w * h > width * height) {
              width = w;
              height = h;
            }
          }
        }
      }
      at = box.end;
    }
    if (!seen) return null;
    return VideoInfo(durationMs: durationMs, width: width, height: height);
  }

  /// The body range of the first box named [name] at this level of [start]..[end].
  Future<(int, int)?> _find(
    RandomAccessFile raf,
    int start,
    int end,
    String name,
  ) async {
    var at = start;
    while (at + 8 <= end) {
      final box = await _header(raf, at, end);
      if (box == null) return null;
      if (box.name == name) return (box.bodyStart, box.end);
      at = box.end;
    }
    return null;
  }

  Future<_Box?> _header(RandomAccessFile raf, int at, int limit) async {
    final h = await _read(raf, at, 16);
    if (h.length < 8) return null;
    var size = _u32(h, 0);
    final name = String.fromCharCodes(h.sublist(4, 8));
    var bodyStart = at + 8;
    if (size == 1) {
      // A 64-bit size follows the name.
      if (h.length < 16) return null;
      size = _u64(h, 8);
      bodyStart = at + 16;
    } else if (size == 0) {
      size = limit - at; // "to the end of the file"
    }
    if (size < bodyStart - at || at + size > limit) return null;
    return _Box(name, bodyStart, at + size);
  }

  Future<Uint8List> _read(RandomAccessFile raf, int at, int count) async {
    await raf.setPosition(at);
    return raf.read(count);
  }

  int _u32(Uint8List d, int o) =>
      (d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3];

  int _u64(Uint8List d, int o) => (_u32(d, o) << 32) | _u32(d, o + 4);
}

class _Box {
  const _Box(this.name, this.bodyStart, this.end);

  final String name;
  final int bodyStart;
  final int end;
}
