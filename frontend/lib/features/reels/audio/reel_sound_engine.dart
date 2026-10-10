import 'dart:async';
import 'dart:collection';
import 'dart:typed_data';

import 'package:audioplayers/audioplayers.dart';
import 'package:blocks_app/features/reels/audio/reel_synth.dart';
import 'package:flutter/foundation.dart' show visibleForTesting;
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// The one thing that actually talks to the platform audio stack. Swapped for
/// a fake in tests, so no test needs audio hardware.
abstract interface class ReelAudioSink {
  /// Prepares [wav] for looping playback (does not start it).
  Future<void> load(Uint8List wav);
  Future<void> resume();
  Future<void> pause();
  Future<void> dispose();
}

/// Real implementation. The native player is created lazily, so an app that
/// never unmutes never allocates one.
class AudioplayersSink implements ReelAudioSink {
  AudioPlayer? _player;

  Future<AudioPlayer> _ensure() async {
    final existing = _player;
    if (existing != null) return existing;
    final player = AudioPlayer();
    await player.setReleaseMode(ReleaseMode.loop);
    await player.setVolume(0.8);
    return _player = player;
  }

  @override
  Future<void> load(Uint8List wav) async {
    final p = await _ensure();
    await p.setSource(BytesSource(wav, mimeType: 'audio/wav'));
  }

  @override
  Future<void> resume() async => (await _ensure()).resume();

  @override
  Future<void> pause() async => _player?.pause();

  @override
  Future<void> dispose() async {
    final p = _player;
    _player = null;
    await p?.dispose();
  }
}

/// One reel's sound, as seen by its playback object.
class ReelSoundChannel {
  ReelSoundChannel._(this._engine, this.seed);

  final ReelSoundEngine _engine;
  final int seed;
  bool _muted = true;

  bool get isMuted => _muted;

  set muted(bool value) {
    if (_muted == value) return;
    _muted = value;
    _engine._channelMuteChanged(this);
  }

  void play() => _engine._play(this);
  void pause() => _engine._pause(this);
  void dispose() => _engine._release(this);
}

/// Shared audio for the Reels screen: **one** native player for the whole
/// feed, however many reels are pre-warmed.
///
/// Rules (the "never surprising" contract):
/// * a muted channel never starts audio, not even for a moment;
/// * only the channel that is playing *and* unmuted is audible;
/// * every failure is swallowed — sound is never worth crashing a reel.
class ReelSoundEngine {
  ReelSoundEngine({ReelAudioSink? sink, this.cacheSize = 3})
    : _sink = sink ?? AudioplayersSink();

  final ReelAudioSink _sink;

  /// How many synthesised loops to keep (matches the 3-player pool).
  final int cacheSize;

  /// Small LRU so swiping back to a reel does not re-synthesise it.
  final LinkedHashMap<int, Uint8List> _cache = LinkedHashMap();

  ReelSoundChannel? _active; // the channel currently asked to play
  int? _loadedSeed;
  bool _audible = false;
  Future<void> _queue = Future<void>.value();
  bool _disposed = false;

  /// Whether sound is currently being produced. Exposed for tests/diagnostics.
  bool get isAudible => _audible;

  /// Completes once every queued audio operation has finished.
  @visibleForTesting
  Future<void> get idle => _queue;

  ReelSoundChannel channelFor(int seed) => ReelSoundChannel._(this, seed);

  void _play(ReelSoundChannel c) {
    _active = c;
    _reconcile();
  }

  void _pause(ReelSoundChannel c) {
    if (_active != c) return; // a neighbour pausing must not stop the current
    _active = null;
    _reconcile();
  }

  void _release(ReelSoundChannel c) => _pause(c);

  void _channelMuteChanged(ReelSoundChannel c) {
    if (_active == c) _reconcile();
  }

  /// Makes the sink match the desired state: audible only when the active
  /// channel exists and is unmuted. Serialised so calls never interleave.
  void _reconcile() {
    if (_disposed) return;
    final wantAudible = _active != null && !_active!.isMuted;
    final seed = _active?.seed;
    _queue = _queue.then((_) async {
      try {
        if (!wantAudible) {
          if (_audible) {
            await _sink.pause();
            _audible = false;
          }
          return;
        }
        if (_loadedSeed != seed) {
          await _sink.load(_wavFor(seed!));
          _loadedSeed = seed;
        }
        // The desired state may have changed while loading.
        if (_active != null && !_active!.isMuted && _active!.seed == seed) {
          await _sink.resume();
          _audible = true;
        }
      } on Object {
        _audible = false;
      }
    });
  }

  Uint8List _wavFor(int seed) {
    final hit = _cache.remove(seed);
    if (hit != null) {
      _cache[seed] = hit;
      return hit;
    }
    final wav = synthesizeReelLoop(seed: seed);
    _cache[seed] = wav;
    while (_cache.length > cacheSize) {
      _cache.remove(_cache.keys.first);
    }
    return wav;
  }

  Future<void> dispose() async {
    _disposed = true;
    _active = null;
    _cache.clear();
    await _queue;
    try {
      await _sink.dispose();
    } on Object {
      // Nothing useful to do.
    }
  }
}

final reelSoundEngineProvider = Provider<ReelSoundEngine>((ref) {
  final engine = ReelSoundEngine();
  ref.onDispose(() => unawaited(engine.dispose()));
  return engine;
});
