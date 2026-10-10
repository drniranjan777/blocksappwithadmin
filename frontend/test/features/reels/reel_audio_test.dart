import 'dart:typed_data';

import 'package:blocks_app/features/reels/audio/reel_sound_engine.dart';
import 'package:blocks_app/features/reels/audio/reel_synth.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeSink implements ReelAudioSink {
  final List<String> calls = [];
  final List<Uint8List> loaded = [];
  bool failOnResume = false;
  bool disposed = false;

  @override
  Future<void> load(Uint8List wav) async {
    calls.add('load');
    loaded.add(wav);
  }

  @override
  Future<void> resume() async {
    if (failOnResume) throw StateError('no audio device');
    calls.add('resume');
  }

  @override
  Future<void> pause() async => calls.add('pause');

  @override
  Future<void> dispose() async => disposed = true;
}

int _i16(Uint8List b, int sampleIndex) =>
    ByteData.sublistView(b).getInt16(44 + sampleIndex * 2, Endian.little);

void main() {
  group('synthesizeReelLoop', () {
    test('produces a valid mono 16-bit PCM WAV', () {
      final wav = synthesizeReelLoop(seed: 7);
      final d = ByteData.sublistView(wav);
      String tag(int o) => String.fromCharCodes(wav.sublist(o, o + 4));

      expect(tag(0), 'RIFF');
      expect(tag(8), 'WAVE');
      expect(tag(12), 'fmt ');
      expect(tag(36), 'data');
      expect(d.getUint16(20, Endian.little), 1); // PCM
      expect(d.getUint16(22, Endian.little), 1); // mono
      expect(d.getUint32(24, Endian.little), 22050);
      expect(d.getUint16(34, Endian.little), 16);
      expect(d.getUint32(4, Endian.little), wav.length - 8);
      expect(d.getUint32(40, Endian.little), wav.length - 44);
    });

    test('is deterministic per seed and different across seeds', () {
      expect(synthesizeReelLoop(seed: 11), synthesizeReelLoop(seed: 11));
      expect(
        synthesizeReelLoop(seed: 11),
        isNot(equals(synthesizeReelLoop(seed: 12))),
      );
    });

    test('is audible but never loud', () {
      for (final seed in [1, 2, 3, 99, 12345]) {
        final wav = synthesizeReelLoop(seed: seed);
        var peak = 0;
        for (var i = 0; i < (wav.length - 44) ~/ 2; i++) {
          final v = _i16(wav, i).abs();
          if (v > peak) peak = v;
        }
        expect(peak, greaterThan(0.2 * 32767), reason: 'seed $seed is silent');
        expect(
          peak,
          lessThanOrEqualTo((kReelPeakAmplitude * 32767).ceil()),
          reason: 'seed $seed exceeds the amplitude cap',
        );
      }
    });

    test('loops without a click at the seam', () {
      final wav = synthesizeReelLoop(seed: 5);
      final n = (wav.length - 44) ~/ 2;
      expect((_i16(wav, 0) - _i16(wav, n - 1)).abs(), lessThan(4000));
    });
  });

  group('ReelSoundEngine', () {
    late _FakeSink sink;
    late ReelSoundEngine engine;

    setUp(() {
      sink = _FakeSink();
      engine = ReelSoundEngine(sink: sink);
    });

    test(
      'a muted reel never produces sound (nothing is even loaded)',
      () async {
        final c = engine.channelFor(1); // channels start muted
        c.play();
        await engine.idle;

        expect(sink.calls, isEmpty);
        expect(engine.isAudible, isFalse);
      },
    );

    test('unmuting the playing reel starts audio; muting stops it', () async {
      final c = engine.channelFor(1)..play();
      await engine.idle;

      c.muted = false;
      await engine.idle;
      expect(sink.calls, ['load', 'resume']);
      expect(engine.isAudible, isTrue);

      c.muted = true;
      await engine.idle;
      expect(sink.calls.last, 'pause');
      expect(engine.isAudible, isFalse);
    });

    test('an unmuted reel that is not playing stays silent', () async {
      final c = engine.channelFor(1)..muted = false;
      await engine.idle;
      expect(sink.calls, isEmpty);

      c.play();
      await engine.idle;
      expect(engine.isAudible, isTrue);
    });

    test('a neighbour pausing never stops the current reel', () async {
      final current = engine.channelFor(1)
        ..muted = false
        ..play();
      final neighbour = engine.channelFor(2)..muted = false;
      await engine.idle;

      neighbour.pause();
      await engine.idle;
      expect(engine.isAudible, isTrue);
      expect(current.isMuted, isFalse);
    });

    test('moving to the next reel switches the loop', () async {
      final a = engine.channelFor(1)
        ..muted = false
        ..play();
      await engine.idle;
      final b = engine.channelFor(2)..muted = false;

      b.play(); // the pool calls play() on the new current...
      a.pause(); // ...and pause() on the old one, in either order
      await engine.idle;

      expect(sink.loaded, hasLength(2));
      expect(sink.loaded[0], isNot(equals(sink.loaded[1])));
      expect(engine.isAudible, isTrue);
    });

    test('resuming the same reel does not reload it', () async {
      final a = engine.channelFor(1)
        ..muted = false
        ..play();
      await engine.idle;

      a.pause(); // e.g. app backgrounded
      await engine.idle;
      expect(engine.isAudible, isFalse);

      a.play(); // returns
      await engine.idle;
      expect(sink.calls.where((c) => c == 'load'), hasLength(1));
      expect(engine.isAudible, isTrue);
    });

    test('audio failures never throw into the UI', () async {
      sink.failOnResume = true;
      engine.channelFor(1)
        ..muted = false
        ..play();
      await engine.idle;
      expect(engine.isAudible, isFalse);
    });

    test('dispose releases the platform player', () async {
      engine.channelFor(1)
        ..muted = false
        ..play();
      await engine.dispose();
      expect(sink.disposed, isTrue);
    });
  });
}
