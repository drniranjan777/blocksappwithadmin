import 'dart:collection';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Holds the bytes of images that exist only on this device so far (a photo
/// the user just picked), addressed by a `local://photo/<n>` URL.
///
/// It lets the new picture appear everywhere immediately. In production the
/// URL becomes a CDN URL once the upload is finished, and this store can be
/// emptied. It is **bounded** (a few images), so it can never grow.
class LocalMediaStore {
  LocalMediaStore({this.capacity = 3});

  static const scheme = 'local://photo/';

  final int capacity;
  final LinkedHashMap<String, Uint8List> _images = LinkedHashMap();
  int _seq = 0;

  int get length => _images.length;

  static bool isLocal(String url) => url.startsWith(scheme);

  /// Stores [bytes] and returns the URL that refers to them.
  String put(Uint8List bytes) {
    final url = '$scheme${++_seq}';
    _images[url] = bytes;
    while (_images.length > capacity) {
      _images.remove(_images.keys.first);
    }
    return url;
  }

  Uint8List? get(String url) => _images[url];

  void remove(String url) => _images.remove(url);

  void clear() => _images.clear();
}

final localMediaStoreProvider = Provider<LocalMediaStore>(
  (ref) => LocalMediaStore(),
);
