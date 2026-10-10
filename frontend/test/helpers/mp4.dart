import 'dart:io';
import 'dart:typed_data';

Uint8List _u32(int v) =>
    Uint8List(4)..buffer.asByteData().setUint32(0, v & 0xFFFFFFFF);

Uint8List _cat(List<List<int>> parts) =>
    Uint8List.fromList([for (final p in parts) ...p]);

Uint8List _box(String name, List<int> body) =>
    _cat([_u32(8 + body.length), name.codeUnits, body]);

/// The smallest MP4 the app's header reader accepts: a movie header and one picture track, with
/// `moov` after the media as phone cameras write it. It is not playable, only readable.
Uint8List buildMp4({
  int durationMs = 4000,
  int width = 1080,
  int height = 1920,
}) {
  final matrix = Uint8List(36);
  matrix.buffer.asByteData()
    ..setUint32(0, 0x00010000)
    ..setUint32(16, 0x00010000);
  final tkhd = _box(
    'tkhd',
    _cat([
      Uint8List(24),
      Uint8List(16),
      matrix,
      _u32(width << 16),
      _u32(height << 16),
    ]),
  );
  final mvhd = _box(
    'mvhd',
    _cat([
      [0, 0, 0, 0],
      _u32(0),
      _u32(0),
      _u32(1000),
      _u32(durationMs),
      Uint8List(80),
    ]),
  );
  return _cat([
    _box('ftyp', 'isom'.codeUnits + Uint8List(8)),
    _box('mdat', Uint8List(2048)),
    _box('moov', _cat([mvhd, _box('trak', tkhd)])),
  ]);
}

/// Writes a readable test clip into [dir] and returns its path.
String writeTestMp4(
  Directory dir,
  String name, {
  int durationMs = 4000,
  int width = 1080,
  int height = 1920,
}) {
  final f = File('${dir.path}/$name')
    ..writeAsBytesSync(
      buildMp4(durationMs: durationMs, width: width, height: height),
    );
  return f.path;
}
