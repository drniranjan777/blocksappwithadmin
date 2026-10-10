import 'package:blocks_app/data/models/reel_models.dart';

/// 4x5 colour matrices in Flutter's `ColorFilter.matrix` layout: four rows
/// (R, G, B, A), each `[r, g, b, a, offset]`, with offsets on a 0..255 scale.
///
/// Everything here is plain arithmetic, so the same maths can run in the
/// preview (cheap, GPU-side) and be handed to the server's transcoder as
/// parameters. A matrix preview is an approximation; the final render is the
/// server's job.
abstract final class ColorMatrices {
  static const List<double> identity = [
    1, 0, 0, 0, 0, //
    0, 1, 0, 0, 0, //
    0, 0, 1, 0, 0, //
    0, 0, 0, 1, 0,
  ];

  /// Applies [first], then [second].
  static List<double> compose(List<double> first, List<double> second) {
    final out = List<double>.filled(20, 0);
    for (var row = 0; row < 4; row++) {
      for (var col = 0; col < 5; col++) {
        var sum = 0.0;
        for (var k = 0; k < 4; k++) {
          sum += second[row * 5 + k] * first[k * 5 + col];
        }
        if (col == 4) sum += second[row * 5 + 4];
        out[row * 5 + col] = sum;
      }
    }
    return out;
  }

  /// Applies each matrix in order (empty = identity).
  static List<double> chain(Iterable<List<double>> steps) {
    var m = identity;
    for (final s in steps) {
      m = compose(m, s);
    }
    return m;
  }

  /// Blends [a] -> [b]; [t] 0 = a, 1 = b.
  static List<double> lerp(List<double> a, List<double> b, double t) => [
    for (var i = 0; i < 20; i++) a[i] + (b[i] - a[i]) * t,
  ];

  static bool isIdentity(List<double> m) {
    for (var i = 0; i < 20; i++) {
      if ((m[i] - identity[i]).abs() > 1e-9) return false;
    }
    return true;
  }

  /// [v] -1..1.
  static List<double> brightness(double v) {
    final o = v * 255 * 0.5;
    return [1, 0, 0, 0, o, 0, 1, 0, 0, o, 0, 0, 1, 0, o, 0, 0, 0, 1, 0];
  }

  /// [v] -1..1 (0 = unchanged); pivots around mid-grey.
  static List<double> contrast(double v) {
    final c = 1 + v;
    final o = 128 * (1 - c);
    return [c, 0, 0, 0, o, 0, c, 0, 0, o, 0, 0, c, 0, o, 0, 0, 0, 1, 0];
  }

  /// [v] -1..1: -1 is greyscale, 0 unchanged, 1 doubled.
  static List<double> saturation(double v) {
    final s = (1 + v).clamp(0.0, 2.0);
    const lr = 0.2126;
    const lg = 0.7152;
    const lb = 0.0722;
    final inv = 1 - s;
    return [
      lr * inv + s, lg * inv, lb * inv, 0, 0, //
      lr * inv, lg * inv + s, lb * inv, 0, 0, //
      lr * inv, lg * inv, lb * inv + s, 0, 0, //
      0, 0, 0, 1, 0,
    ];
  }

  /// [v] -1..1: positive is warmer (more red, less blue).
  static List<double> temperature(double v) {
    final r = 1 + 0.18 * v;
    final b = 1 - 0.18 * v;
    final g = 1 + 0.04 * v;
    return [r, 0, 0, 0, 0, 0, g, 0, 0, 0, 0, 0, b, 0, 0, 0, 0, 0, 1, 0];
  }

  /// [v] -1..1: lifts (+) or deepens (-) the dark tones.
  static List<double> shadows(double v) {
    final o = 28 * v;
    final s = 1 - 0.08 * v.abs();
    return [s, 0, 0, 0, o, 0, s, 0, 0, o, 0, 0, s, 0, o, 0, 0, 0, 1, 0];
  }

  /// [v] -1..1: recovers (-) or boosts (+) the bright tones.
  static List<double> highlights(double v) {
    final g = 1 + 0.14 * v;
    final o = -12 * v;
    return [g, 0, 0, 0, o, 0, g, 0, 0, o, 0, 0, g, 0, o, 0, 0, 0, 1, 0];
  }

  /// [f] 0..1: matte look (blacks lifted, contrast softened).
  static List<double> fade(double f) {
    final s = 1 - 0.28 * f;
    final o = 255 * 0.28 * f * 0.55;
    return [s, 0, 0, 0, o, 0, s, 0, 0, o, 0, 0, s, 0, o, 0, 0, 0, 1, 0];
  }
}

/// A named look. Parameters, not pixels: each filter is a handful of numbers,
/// so the catalogue is tiny, cheap to preview and easy for a backend to extend.
class ReelFilter {
  const ReelFilter(
    this.id, {
    this.brightness = 0,
    this.contrast = 0,
    this.saturation = 0,
    this.temperature = 0,
    this.fade = 0,
  });

  final String id;
  final double brightness;
  final double contrast;
  final double saturation;
  final double temperature;
  final double fade;

  /// The matrix at full strength.
  List<double> get matrix => ColorMatrices.chain([
    if (saturation != 0) ColorMatrices.saturation(saturation),
    if (temperature != 0) ColorMatrices.temperature(temperature),
    if (contrast != 0) ColorMatrices.contrast(contrast),
    if (brightness != 0) ColorMatrices.brightness(brightness),
    if (fade != 0) ColorMatrices.fade(fade),
  ]);

  bool get isOriginal => id == ReelFilters.originalId;
}

/// The BLOCKS filter set (own names and own tunings).
abstract final class ReelFilters {
  static const originalId = 'original';

  static const catalog = <ReelFilter>[
    ReelFilter(originalId),
    ReelFilter('vivid', contrast: 0.15, saturation: 0.45, brightness: 0.03),
    ReelFilter('warm', temperature: 0.5, saturation: 0.1),
    ReelFilter('cool', temperature: -0.5, saturation: 0.05),
    ReelFilter(
      'cinematic',
      contrast: 0.25,
      saturation: -0.15,
      temperature: -0.15,
      fade: 0.15,
      brightness: -0.05,
    ),
    ReelFilter(
      'portrait',
      brightness: 0.06,
      contrast: -0.08,
      saturation: -0.05,
      temperature: 0.15,
    ),
    ReelFilter(
      'vintage',
      saturation: -0.3,
      temperature: 0.35,
      fade: 0.35,
      contrast: -0.1,
    ),
    ReelFilter('bw', saturation: -1, contrast: 0.15),
    ReelFilter('golden', temperature: 0.7, brightness: 0.05, saturation: 0.2),
    ReelFilter('india', saturation: 0.5, contrast: 0.2, temperature: 0.25),
    ReelFilter('urban', contrast: 0.3, saturation: -0.2, temperature: -0.2),
    ReelFilter(
      'food',
      saturation: 0.35,
      temperature: 0.3,
      brightness: 0.05,
      contrast: 0.1,
    ),
    ReelFilter(
      'travel',
      saturation: 0.3,
      contrast: 0.12,
      temperature: -0.1,
      brightness: 0.03,
    ),
    ReelFilter(
      'night',
      brightness: -0.18,
      contrast: 0.22,
      temperature: -0.3,
      saturation: 0.1,
    ),
  ];

  static ReelFilter? byId(String? id) {
    if (id == null) return null;
    for (final f in catalog) {
      if (f.id == id) return f;
    }
    return null;
  }
}

/// The final look of a clip: its filter (at its intensity) followed by the
/// manual adjustments.
abstract final class ReelLook {
  static List<double> adjustmentMatrix(ReelAdjustments a) =>
      ColorMatrices.chain([
        if (a.saturation != 0) ColorMatrices.saturation(a.saturation),
        if (a.temperature != 0) ColorMatrices.temperature(a.temperature),
        if (a.shadows != 0) ColorMatrices.shadows(a.shadows),
        if (a.highlights != 0) ColorMatrices.highlights(a.highlights),
        if (a.contrast != 0) ColorMatrices.contrast(a.contrast),
        if (a.brightness != 0) ColorMatrices.brightness(a.brightness),
        if (a.fade != 0) ColorMatrices.fade(a.fade),
      ]);

  /// Matrix for [clip], or null when it has no visible effect (so the preview
  /// can skip the colour-filter layer entirely).
  static List<double>? matrixFor(ReelClip clip) {
    final filter = ReelFilters.byId(clip.filterId);
    var m = ColorMatrices.identity;
    if (filter != null && !filter.isOriginal) {
      m = ColorMatrices.lerp(
        ColorMatrices.identity,
        filter.matrix,
        clip.filterIntensity.clamp(0.0, 1.0),
      );
    }
    if (!clip.adjustments.isNeutral) {
      m = ColorMatrices.compose(m, adjustmentMatrix(clip.adjustments));
    }
    return ColorMatrices.isIdentity(m) ? null : m;
  }
}
