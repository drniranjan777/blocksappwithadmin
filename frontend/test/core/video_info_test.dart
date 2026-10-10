import 'dart:io';
import 'dart:typed_data';

import 'package:blocks_app/core/services/video_info.dart';
import 'package:flutter_test/flutter_test.dart';

Uint8List _u32(int v) =>
    Uint8List(4)..buffer.asByteData().setUint32(0, v & 0xFFFFFFFF);

Uint8List _cat(List<List<int>> parts) =>
    Uint8List.fromList([for (final p in parts) ...p]);

Uint8List _box(String name, List<int> body) =>
    _cat([_u32(8 + body.length), name.codeUnits, body]);

Uint8List _mvhd({
  required int timescale,
  required int duration,
  bool v1 = false,
}) {
  if (v1) {
    return _box(
      'mvhd',
      _cat([
        [1, 0, 0, 0],
        Uint8List(16), // creation + modification (64-bit each)
        _u32(timescale),
        _u32(0), // duration high
        _u32(duration),
        Uint8List(80),
      ]),
    );
  }
  return _box(
    'mvhd',
    _cat([
      [0, 0, 0, 0],
      _u32(0), // creation
      _u32(0), // modification
      _u32(timescale),
      _u32(duration),
      Uint8List(80),
    ]),
  );
}

Uint8List _tkhd({required int w, required int h, bool turned = false}) {
  // 1 (version) + 3 (flags) + creation + modification + id + reserved + duration = 24 bytes,
  // then reserved(8) layer(2) group(2) volume(2) reserved(2) = 16 more, then a 36-byte matrix.
  final matrix = Uint8List(36);
  final bd = matrix.buffer.asByteData();
  if (turned) {
    bd.setUint32(4, 0x00010000); // b = 1.0
    bd.setUint32(12, 0xFFFF0000); // c = -1.0
  } else {
    bd.setUint32(0, 0x00010000); // a = 1.0
    bd.setUint32(16, 0x00010000); // d = 1.0
  }
  return _box(
    'tkhd',
    _cat([Uint8List(24), Uint8List(16), matrix, _u32(w << 16), _u32(h << 16)]),
  );
}

Uint8List _movie(Uint8List mvhd, List<Uint8List> tracks) =>
    _box('moov', _cat([mvhd, for (final t in tracks) _box('trak', t)]));

void main() {
  late Directory dir;

  setUp(() => dir = Directory.systemTemp.createTempSync('video_info_'));
  tearDown(() => dir.deleteSync(recursive: true));

  Future<VideoInfo?> read(List<int> bytes) async {
    final f = File('${dir.path}/clip.mp4')..writeAsBytesSync(bytes);
    return const VideoInfoReader().read(f.path);
  }

  final ftyp = _box('ftyp', 'isom'.codeUnits + Uint8List(8));
  final mdat = _box('mdat', Uint8List(4096));

  test('reads the length and picture size from a movie header', () async {
    final info = await read(
      _cat([
        ftyp,
        _movie(_mvhd(timescale: 1000, duration: 12345), [
          _tkhd(w: 0, h: 0), // an audio track
          _tkhd(w: 1080, h: 1920),
        ]),
        mdat,
      ]),
    );
    expect(info, isNotNull);
    expect(info!.durationMs, 12345);
    expect(info.width, 1080);
    expect(info.height, 1920);
  });

  test('finds a header written after the media, as phone cameras do', () async {
    final info = await read(
      _cat([
        ftyp,
        mdat,
        _movie(_mvhd(timescale: 600, duration: 3600), [
          _tkhd(w: 1920, h: 1080),
        ]),
      ]),
    );
    expect(info!.durationMs, 6000);
    expect(info.width, 1920);
    expect(info.height, 1080);
  });

  test('turns a sideways recording the way people see it', () async {
    final info = await read(
      _cat([
        ftyp,
        _movie(_mvhd(timescale: 1000, duration: 5000), [
          _tkhd(w: 1920, h: 1080, turned: true),
        ]),
        mdat,
      ]),
    );
    expect(info!.width, 1080);
    expect(info.height, 1920);
  });

  test('reads the 64-bit form of the header', () async {
    final info = await read(
      _cat([
        ftyp,
        _movie(_mvhd(timescale: 1000, duration: 90000, v1: true), [
          _tkhd(w: 720, h: 1280),
        ]),
        mdat,
      ]),
    );
    expect(info!.durationMs, 90000);
  });

  test('says nothing about a file it does not understand', () async {
    expect(await read(Uint8List.fromList(List.filled(300, 7))), isNull);
    expect(await read(const <int>[]), isNull);
    expect(await read(_cat([ftyp, mdat])), isNull); // no movie header at all
    expect(
      await const VideoInfoReader().read('${dir.path}/missing.mp4'),
      isNull,
    );
  });

  test(
    'does not follow a box that claims to be bigger than the file',
    () async {
      final liar = _cat([_u32(0x7FFFFFFF), 'moov'.codeUnits, Uint8List(32)]);
      expect(await read(_cat([ftyp, liar])), isNull);
    },
  );
}
