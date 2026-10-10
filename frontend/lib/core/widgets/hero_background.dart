import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:flutter/material.dart';

/// Deep-indigo gradient with a faint block grid — the BLOCKS "hero" surface
/// used by splash, onboarding and sign-in.
class HeroBackground extends StatelessWidget {
  const HeroBackground({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = context.blocks;
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [colors.heroTop, colors.heroBottom],
        ),
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          // Static decoration: isolate so it never repaints with the content.
          const RepaintBoundary(
            child: CustomPaint(painter: _BlockGridPainter()),
          ),
          child,
        ],
      ),
    );
  }
}

class _BlockGridPainter extends CustomPainter {
  const _BlockGridPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white.withValues(alpha: 0.045)
      ..strokeWidth = 1;
    const cell = 44.0;
    for (var x = 0.0; x <= size.width; x += cell) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
    for (var y = 0.0; y <= size.height; y += cell) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
  }

  @override
  bool shouldRepaint(_BlockGridPainter old) => false;
}
