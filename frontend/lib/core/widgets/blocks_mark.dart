import 'package:blocks_app/app/theme/blocks_colors.dart';
import 'package:flutter/material.dart';

/// The BLOCKS logo mark: four rising blocks — the Reach Ladder in miniature
/// (District, State, National, Global).
///
/// [progress] (0..1) staggers the blocks growing upward; pass 1 for the
/// static mark. Painted with a [CustomPainter] so it is resolution
/// independent and costs nothing to ship as an asset.
class BlocksMark extends StatelessWidget {
  const BlocksMark({super.key, this.size = 56, this.progress = 1, this.colors});

  final double size;
  final double progress;

  /// Override the four block colours (defaults to the theme's reach colours).
  final List<Color>? colors;

  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).extension<BlocksColors>();
    final resolved =
        colors ??
        [
          palette?.reachDistrict ?? BlocksPalette.district,
          palette?.reachState ?? BlocksPalette.state,
          palette?.reachNational ?? BlocksPalette.national,
          palette?.reachGlobal ?? BlocksPalette.global,
        ];
    return ExcludeSemantics(
      child: SizedBox.square(
        dimension: size,
        child: CustomPaint(
          painter: _BlocksMarkPainter(progress: progress, colors: resolved),
        ),
      ),
    );
  }
}

class _BlocksMarkPainter extends CustomPainter {
  _BlocksMarkPainter({required this.progress, required this.colors});

  final double progress;
  final List<Color> colors;

  static const _heights = [0.38, 0.58, 0.78, 1.0];

  @override
  void paint(Canvas canvas, Size size) {
    final barWidth = size.width * 0.19;
    final gap = size.width * 0.08;
    final radius = Radius.circular(barWidth * 0.3);

    for (var i = 0; i < 4; i++) {
      final stagger = Interval(
        i * 0.14,
        (i * 0.14 + 0.58).clamp(0.0, 1.0),
        curve: Curves.easeOutBack,
      ).transform(progress.clamp(0.0, 1.0));
      final height = size.height * _heights[i] * stagger.clamp(0.0, 1.2);
      final left = i * (barWidth + gap);
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(left, size.height - height, barWidth, height),
          radius,
        ),
        Paint()..color = colors[i],
      );
    }
  }

  @override
  bool shouldRepaint(_BlocksMarkPainter old) =>
      old.progress != progress || old.colors != colors;
}

/// Mark + "BLOCKS" wordmark, for app bars and headers.
class BlocksLogo extends StatelessWidget {
  const BlocksLogo({super.key, this.markSize = 28, this.color});

  final double markSize;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final style = Theme.of(context).textTheme.titleLarge?.copyWith(
      fontWeight: FontWeight.w900,
      letterSpacing: 1.2,
      color: color,
    );
    return Semantics(
      label: 'BLOCKS',
      excludeSemantics: true,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          BlocksMark(size: markSize),
          SizedBox(width: markSize * 0.35),
          Text('BLOCKS', style: style),
        ],
      ),
    );
  }
}
