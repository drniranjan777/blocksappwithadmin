import 'package:blocks_app/data/models/content_models.dart';
import 'package:blocks_app/features/reels/domain/reel_playback.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

/// Records which players were created/disposed so tests can assert the pool's
/// memory guarantees without real tickers.
class PlaybackLog {
  final List<String> created = [];
  final List<String> disposed = [];
  final Map<String, FakePlayback> alive = {};

  int get aliveCount => alive.length;
  int get maxAlive => _max;
  int _max = 0;

  void onCreate(FakePlayback p) {
    created.add(p.reel.id);
    alive[p.reel.id] = p;
    if (alive.length > _max) _max = alive.length;
  }

  void onDispose(FakePlayback p) {
    disposed.add(p.reel.id);
    alive.remove(p.reel.id);
  }

  List<String> get playingIds => [
    for (final e in alive.entries)
      if (e.value.isPlaying.value) e.key,
  ];
}

class FakePlayback implements ReelPlayback {
  FakePlayback(this.reel, this.log) {
    log.onCreate(this);
  }

  final Reel reel;
  final PlaybackLog log;

  final ValueNotifier<double> _progress = ValueNotifier(0);
  final ValueNotifier<bool> _playing = ValueNotifier(false);
  bool isMuted = true;
  bool initialized = false;

  @override
  ValueListenable<double> get progress => _progress;

  @override
  ValueListenable<bool> get isPlaying => _playing;

  @override
  set muted(bool value) => isMuted = value;

  @override
  Future<void> initialize() async => initialized = true;

  @override
  void play() => _playing.value = true;

  @override
  void pause() => _playing.value = false;

  @override
  void restart() => _progress.value = 0;

  @override
  Widget buildView(BuildContext context) =>
      const ColoredBox(color: Color(0xFF222222));

  @override
  void dispose() {
    log.onDispose(this);
    _progress.dispose();
    _playing.dispose();
  }
}
