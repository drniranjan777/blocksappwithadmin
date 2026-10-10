import 'dart:math';

import 'package:flutter/material.dart';

/// Parses `demo://art/<seed>` / `demo://reel/<seed>` into a seed, or null if
/// [url] is a normal network URL.
int? demoSeedOf(String url) {
  if (!url.startsWith('demo://')) return null;
  final seed = int.tryParse(url.split('/').last);
  return seed ?? url.hashCode;
}

/// Procedurally generated artwork (gradient, sun and a block skyline) used as
/// the demo's photos, video frames and covers. It keeps the demo fully
/// offline, copyright-free, and visually on-brand. Real builds swap these for
/// CDN images via `BlocksImage` with no screen changes.
class DemoArt extends StatelessWidget {
  const DemoArt({required this.seed, super.key, this.child});

  final int seed;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    return RepaintBoundary(
      child: CustomPaint(
        painter: _DemoArtPainter(seed),
        isComplex: true,
        willChange: false,
        child: child ?? const SizedBox.expand(),
      ),
    );
  }
}

const _palettes = <(Color, Color)>[
  (Color(0xFFFF7A45), Color(0xFFC2185B)),
  (Color(0xFF2F6BFF), Color(0xFF6A1FD0)),
  (Color(0xFF0FA39A), Color(0xFF0B4F8A)),
  (Color(0xFFF5A623), Color(0xFFD6246E)),
  (Color(0xFF3A3DD8), Color(0xFF0B0D1E)),
  (Color(0xFF12945A), Color(0xFF0B3D5C)),
  (Color(0xFFE8505B), Color(0xFF5B2A86)),
  (Color(0xFF00B4D8), Color(0xFF3A3DD8)),
  (Color(0xFFFFB347), Color(0xFF8E3A59)),
  (Color(0xFF4ECDC4), Color(0xFF556270)),
];

class _DemoArtPainter extends CustomPainter {
  _DemoArtPainter(this.seed);

  final int seed;

  @override
  void paint(Canvas canvas, Size size) {
    if (size.isEmpty) return;
    final r = Random(seed);
    final (a, b) = _palettes[r.nextInt(_palettes.length)];
    final rect = Offset.zero & size;

    // Sky.
    final flip = r.nextBool();
    canvas.drawRect(
      rect,
      Paint()
        ..shader = LinearGradient(
          begin: flip ? Alignment.topLeft : Alignment.topRight,
          end: flip ? Alignment.bottomRight : Alignment.bottomLeft,
          colors: [a, b],
        ).createShader(rect),
    );

    // Sun / orb.
    final center = Offset(
      size.width * (0.2 + r.nextDouble() * 0.6),
      size.height * (0.14 + r.nextDouble() * 0.28),
    );
    final radius = size.shortestSide * (0.16 + r.nextDouble() * 0.14);
    canvas.drawCircle(
      center,
      radius,
      Paint()
        ..shader = RadialGradient(
          colors: [
            Colors.white.withValues(alpha: 0.55),
            Colors.white.withValues(alpha: 0),
          ],
        ).createShader(Rect.fromCircle(center: center, radius: radius * 1.7)),
    );

    // Two layers of block "skyline" — echoes the BLOCKS logo.
    for (var layer = 0; layer < 2; layer++) {
      final count = 4 + r.nextInt(4);
      final gap = size.width * 0.012;
      final w = (size.width - gap * (count + 1)) / count;
      final alpha = layer == 0 ? 0.14 : 0.26;
      for (var i = 0; i < count; i++) {
        final h =
            size.height * (0.10 + r.nextDouble() * (layer == 0 ? 0.42 : 0.30));
        canvas.drawRRect(
          RRect.fromRectAndCorners(
            Rect.fromLTWH(gap + i * (w + gap), size.height - h, w, h),
            topLeft: Radius.circular(w * 0.22),
            topRight: Radius.circular(w * 0.22),
          ),
          Paint()..color = Colors.black.withValues(alpha: alpha),
        );
      }
    }

    // Faint grid for texture.
    final grid = Paint()
      ..color = Colors.white.withValues(alpha: 0.05)
      ..strokeWidth = 1;
    final cell = size.shortestSide / 8;
    for (var x = 0.0; x < size.width; x += cell) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), grid);
    }
    for (var y = 0.0; y < size.height; y += cell) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), grid);
    }
  }

  @override
  bool shouldRepaint(_DemoArtPainter old) => old.seed != seed;
}
