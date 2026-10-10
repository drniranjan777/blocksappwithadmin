import 'dart:async';

import 'package:blocks_app/data/models/content_models.dart';
import 'package:flutter/foundation.dart' show ValueListenable;
import 'package:flutter/widgets.dart';

/// One playable reel. The demo draws procedural frames; production wraps a
/// `video_player` / HLS controller behind this same interface, so nothing in
/// the UI or the pool changes.
abstract interface class ReelPlayback {
  /// 0..1 progress through the current loop.
  ValueListenable<double> get progress;
  ValueListenable<bool> get isPlaying;

  set muted(bool value);

  Future<void> initialize();
  void play();
  void pause();
  void restart();

  /// The video surface (fills its parent).
  Widget buildView(BuildContext context);

  void dispose();
}

typedef ReelPlaybackFactory = ReelPlayback Function(Reel reel);

/// Keeps only the current reel and its immediate neighbours alive.
///
/// Decoders are the scarcest resource on a phone: initialising one player per
/// reel in a long feed would exhaust memory and hardware decoders. The pool
/// guarantees `activeCount <= maxActive` and disposes players that scroll
/// away, while the previous/next reels are pre-warmed for instant swipes.
class ReelPlayerPool {
  ReelPlayerPool({required this.factory, this.maxActive = 3})
    : assert(maxActive >= 3, 'need current + previous + next');

  final ReelPlaybackFactory factory;
  final int maxActive;

  final Map<String, ReelPlayback> _players = {};
  bool _muted = true;
  bool _disposed = false;

  int get activeCount => _players.length;
  Iterable<String> get activeIds => _players.keys;

  ReelPlayback? playbackFor(String reelId) => _players[reelId];

  set muted(bool value) {
    _muted = value;
    for (final p in _players.values) {
      p.muted = value;
    }
  }

  /// Make [currentIndex] the playing reel; pre-warm neighbours; dispose rest.
  void focus(List<Reel> reels, int currentIndex) {
    if (_disposed || reels.isEmpty) return;
    final current = currentIndex.clamp(0, reels.length - 1);

    final wanted = <String, Reel>{};
    for (var i = current - 1; i <= current + 1; i++) {
      if (i >= 0 && i < reels.length) wanted[reels[i].id] = reels[i];
    }

    for (final id
        in _players.keys.where((id) => !wanted.containsKey(id)).toList()) {
      _players.remove(id)!.dispose();
    }

    for (final entry in wanted.entries) {
      _players.putIfAbsent(entry.key, () {
        final player = factory(entry.value)..muted = _muted;
        unawaited(player.initialize());
        return player;
      });
    }

    final currentId = reels[current].id;
    for (final entry in _players.entries) {
      if (entry.key == currentId) {
        entry.value.play();
      } else {
        entry.value
          ..pause()
          ..restart();
      }
    }
    assert(_players.length <= maxActive);
  }

  void pauseAll() {
    for (final p in _players.values) {
      p.pause();
    }
  }

  void dispose() {
    _disposed = true;
    for (final p in _players.values) {
      p.dispose();
    }
    _players.clear();
  }
}
