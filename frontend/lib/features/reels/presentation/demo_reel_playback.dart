import 'dart:math';

import 'package:blocks_app/core/widgets/demo_art.dart';
import 'package:blocks_app/data/models/content_models.dart';
import 'package:blocks_app/features/reels/audio/reel_sound_engine.dart';
import 'package:blocks_app/features/reels/domain/reel_playback.dart';
import 'package:flutter/foundation.dart' show ValueListenable, ValueNotifier;
import 'package:flutter/widgets.dart';

/// Demo playback: slow "camera move" over procedural artwork, with real
/// loop progress. Needs no network, codec or copyrighted footage.
class DemoReelPlayback implements ReelPlayback {
  DemoReelPlayback(Reel reel, TickerProvider vsync, {ReelSoundEngine? sound})
    : _seed = demoSeedOf(reel.videoUrl) ?? reel.id.hashCode,
      _controller = AnimationController(vsync: vsync, duration: reel.duration) {
    _controller.addListener(() => _progress.value = _controller.value);
    _sound = sound?.channelFor(_seed);
  }

  final int _seed;
  final AnimationController _controller;

  /// Null in tests / when no engine is supplied: the reel is then silent.
  late final ReelSoundChannel? _sound;
  final ValueNotifier<double> _progress = ValueNotifier(0);
  final ValueNotifier<bool> _playing = ValueNotifier(false);
  bool _disposed = false;

  @override
  ValueListenable<double> get progress => _progress;

  @override
  ValueListenable<bool> get isPlaying => _playing;

  @override
  set muted(bool value) => _sound?.muted = value;

  @override
  Future<void> initialize() async {}

  @override
  void play() {
    if (_disposed) return;
    _controller.repeat();
    _playing.value = true;
    _sound?.play();
  }

  @override
  void pause() {
    if (_disposed) return;
    _controller.stop();
    _playing.value = false;
    _sound?.pause();
  }

  @override
  void restart() {
    if (_disposed) return;
    _controller.value = 0;
  }

  @override
  Widget buildView(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (_, _) {
        final t = _controller.value * 2 * pi;
        return Transform.scale(
          scale: 1.08 + 0.05 * sin(t),
          child: Transform.translate(
            offset: Offset(8 * cos(t), 6 * sin(t * 2)),
            child: DemoArt(seed: _seed),
          ),
        );
      },
    );
  }

  @override
  void dispose() {
    if (_disposed) return;
    _disposed = true;
    _sound?.dispose();
    _controller.dispose();
    _progress.dispose();
    _playing.dispose();
  }
}
