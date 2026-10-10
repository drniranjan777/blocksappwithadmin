import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

/// A valid PNG of one flat colour, made without any image package, for tests
/// that need a real picture (the server re-encodes and checks what it is sent).
Uint8List solidPng(
  int width,
  int height, {
  int r = 200,
  int g = 80,
  int b = 40,
}) {
  final raw = BytesBuilder();
  for (var y = 0; y < height; y++) {
    raw.addByte(0); // no filter on this row
    for (var x = 0; x < width; x++) {
      raw
        ..addByte(r)
        ..addByte(g)
        ..addByte(b);
    }
  }
  final out = BytesBuilder()
    ..add(const [137, 80, 78, 71, 13, 10, 26, 10])
    ..add(
      _chunk(
        'IHDR',
        (ByteData(13)
              ..setUint32(0, width)
              ..setUint32(4, height)
              ..setUint8(8, 8) // bits per channel
              ..setUint8(9, 2) // truecolour
              ..setUint8(10, 0)
              ..setUint8(11, 0)
              ..setUint8(12, 0))
            .buffer
            .asUint8List(),
      ),
    )
    ..add(_chunk('IDAT', Uint8List.fromList(ZLibCodec().encode(raw.toBytes()))))
    ..add(_chunk('IEND', Uint8List(0)));
  return out.toBytes();
}

Uint8List _chunk(String type, Uint8List data) {
  final typeBytes = ascii.encode(type);
  final body = BytesBuilder()
    ..add(typeBytes)
    ..add(data);
  final bytes = body.toBytes();
  final out = BytesBuilder()
    ..add((ByteData(4)..setUint32(0, data.length)).buffer.asUint8List())
    ..add(bytes)
    ..add((ByteData(4)..setUint32(0, _crc32(bytes))).buffer.asUint8List());
  return out.toBytes();
}

final List<int> _table = List.generate(256, (n) {
  var c = n;
  for (var k = 0; k < 8; k++) {
    c = (c & 1) != 0 ? 0xEDB88320 ^ (c >> 1) : c >> 1;
  }
  return c;
});

int _crc32(List<int> bytes) {
  var c = 0xFFFFFFFF;
  for (final b in bytes) {
    c = _table[(c ^ b) & 0xFF] ^ (c >> 8);
  }
  return c ^ 0xFFFFFFFF;
}
