import 'dart:math';
import 'dart:typed_data';

/// Loudest sample the demo will ever produce (0..1). Deliberately modest:
/// the app must never surprise anyone with loud audio.
const double kReelPeakAmplitude = 0.35;

/// Builds a short, seamless, gentle musical loop as a mono 16-bit PCM WAV.
///
/// The demo has no licensed music and no network, so each reel gets its own
/// deterministic pentatonic "pluck + bass + pad" loop generated from its seed.
/// Production plays the real audio track of the video instead; nothing outside
/// `reel_sound_engine.dart` knows this exists.
///
/// Pure function: same [seed] -> byte-identical output, which keeps it
/// unit-testable without any audio hardware.
Uint8List synthesizeReelLoop({
  required int seed,
  int sampleRate = 22050,
  int beats = 16,
}) {
  final rnd = Random(seed & 0x7fffffff);

  final bpm = 84 + rnd.nextInt(5) * 8; // 84 .. 116
  final samplesPerBeat = (sampleRate * 60 / bpm).round();
  final total = samplesPerBeat * beats;
  final mix = Float64List(total);

  // Major or minor pentatonic over a root between G3 and C4.
  const roots = [196.0, 220.0, 246.94, 261.63];
  final root = roots[rnd.nextInt(roots.length)];
  final minor = rnd.nextBool();
  final scale = minor ? const [0, 3, 5, 7, 10] : const [0, 2, 4, 7, 9];
  double freq(int degree, {int octave = 0}) {
    final oct = degree ~/ scale.length;
    final semis = scale[degree % scale.length] + 12 * (oct + octave);
    return root * pow(2, semis / 12);
  }

  // Adds a decaying tone; the tail wraps around so the loop has no seam.
  void tone(
    int start,
    double hz,
    double seconds,
    double gain, {
    double decay = 6,
  }) {
    final n = (seconds * sampleRate).round();
    final attack = (0.006 * sampleRate).round();
    for (var i = 0; i < n; i++) {
      final t = i / sampleRate;
      final env = (i < attack ? i / attack : 1.0) * exp(-decay * t);
      final w = 2 * pi * hz * t;
      final s = sin(w) + 0.3 * sin(2 * w) + 0.1 * sin(3 * w);
      mix[(start + i) % total] += gain * env * s;
    }
  }

  // Melody: a random walk over the scale, one note per eighth, some rests.
  var degree = 5 + rnd.nextInt(3);
  for (var step = 0; step < beats * 2; step++) {
    if (rnd.nextDouble() < 0.22) continue;
    degree = (degree + rnd.nextInt(5) - 2).clamp(2, 9);
    tone(step * samplesPerBeat ~/ 2, freq(degree), 0.55, 0.30);
  }

  // Bass on every other beat.
  for (var beat = 0; beat < beats; beat += 2) {
    final d = (beat ~/ 4) % 2 == 0 ? 0 : 2;
    tone(beat * samplesPerBeat, freq(d, octave: -1), 0.9, 0.34, decay: 3);
  }

  // Soft pad: root + fifth with a slow swell.
  for (var i = 0; i < total; i++) {
    final t = i / sampleRate;
    final swell = 0.5 + 0.5 * sin(2 * pi * i / total);
    mix[i] +=
        0.06 *
        swell *
        (sin(2 * pi * root * t) + sin(2 * pi * root * 1.5 * t + 0.4));
  }

  // Normalise to a safe peak and write 16-bit PCM.
  var peak = 0.0;
  for (final v in mix) {
    if (v.abs() > peak) peak = v.abs();
  }
  final scaleBy = peak == 0 ? 0.0 : kReelPeakAmplitude / peak;

  final data = ByteData(44 + total * 2);
  void ascii(int offset, String s) {
    for (var i = 0; i < s.length; i++) {
      data.setUint8(offset + i, s.codeUnitAt(i));
    }
  }

  ascii(0, 'RIFF');
  data.setUint32(4, 36 + total * 2, Endian.little);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  data.setUint32(16, 16, Endian.little);
  data.setUint16(20, 1, Endian.little); // PCM
  data.setUint16(22, 1, Endian.little); // mono
  data.setUint32(24, sampleRate, Endian.little);
  data.setUint32(28, sampleRate * 2, Endian.little);
  data.setUint16(32, 2, Endian.little);
  data.setUint16(34, 16, Endian.little);
  ascii(36, 'data');
  data.setUint32(40, total * 2, Endian.little);
  for (var i = 0; i < total; i++) {
    final v = (mix[i] * scaleBy * 32767).round().clamp(-32768, 32767);
    data.setInt16(44 + i * 2, v, Endian.little);
  }
  return data.buffer.asUint8List();
}
