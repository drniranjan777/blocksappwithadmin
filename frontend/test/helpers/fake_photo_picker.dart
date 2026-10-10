import 'dart:convert';
import 'dart:typed_data';

import 'package:blocks_app/core/services/photo_picker.dart';
import 'package:blocks_app/data/models/profile_models.dart';

/// A real, decodable 1x1 PNG.
final Uint8List kTinyPng = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA'
  '60e6kgAAAABJRU5ErkJggg==',
);

/// Smallest thing that starts like a JPEG / WebP / HEIC (for type checks).
final Uint8List kJpegBytes = Uint8List.fromList([0xFF, 0xD8, 0xFF, 0xE0, 0, 0]);
final Uint8List kWebpBytes = Uint8List.fromList([
  ...'RIFF'.codeUnits,
  0,
  0,
  0,
  0,
  ...'WEBP'.codeUnits,
]);
final Uint8List kHeicBytes = Uint8List.fromList([
  0,
  0,
  0,
  24,
  ...'ftyp'.codeUnits,
  ...'heic'.codeUnits,
]);

PickedPhoto tinyPngPhoto([String name = 'me.png']) =>
    PickedPhoto(bytes: kTinyPng, fileName: name, mimeType: 'image/png');

/// Scripted picker: returns whatever the test queues, never touches the
/// platform. `null` means "the user backed out".
class FakePhotoPicker implements ProfilePhotoPicker {
  FakePhotoPicker([Iterable<Object?> script = const []])
    : _script = [...script];

  final List<Object?> _script;
  final List<PhotoSource> requested = [];

  /// Queue the next answer: a [PickedPhoto], null, or a [PhotoPickFailure].
  void queue(Object? next) => _script.add(next);

  @override
  Future<PickedPhoto?> pick(PhotoSource source) async {
    requested.add(source);
    final next = _script.isEmpty ? tinyPngPhoto() : _script.removeAt(0);
    if (next is PhotoPickFailure) throw next;
    return next as PickedPhoto?;
  }
}
