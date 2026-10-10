import 'dart:math' as math;

import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/utils/number_format.dart';
import 'package:flutter/material.dart';

/// A rounded card with a title: the building block of the creator screens.
class StudioCard extends StatelessWidget {
  const StudioCard({
    required this.title,
    required this.child,
    super.key,
    this.subtitle,
    this.trailing,
  });

  final String title;
  final String? subtitle;
  final Widget? trailing;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(BlocksSpacing.lg),
      decoration: BoxDecoration(
        color: context.scheme.surface,
        borderRadius: BorderRadius.circular(BlocksRadius.xl),
        border: Border.all(color: context.scheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(title, style: context.text.titleMedium),
                ),
              ),
              ?trailing,
            ],
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 2),
            Text(subtitle!, style: context.text.bodySmall),
          ],
          const SizedBox(height: BlocksSpacing.lg),
          child,
        ],
      ),
    );
  }
}

/// A number with a label: "842K · Qualified views".
class MetricTile extends StatelessWidget {
  const MetricTile({
    required this.icon,
    required this.label,
    required this.value,
    super.key,
    this.color,
    this.caption,
  });

  final IconData icon;
  final String label;
  final String value;
  final String? caption;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = color ?? context.scheme.primary;
    return Semantics(
      container: true,
      label: '$label: $value${caption == null ? '' : ', $caption'}',
      excludeSemantics: true,
      child: Container(
        padding: const EdgeInsets.all(BlocksSpacing.md),
        decoration: BoxDecoration(
          color: context.scheme.surface,
          borderRadius: BorderRadius.circular(BlocksRadius.lg),
          border: Border.all(color: context.scheme.outlineVariant),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: c.withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(BlocksRadius.sm),
              ),
              child: Icon(icon, color: c, size: 18),
            ),
            const SizedBox(height: BlocksSpacing.sm),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: AlignmentDirectional.centerStart,
              child: Text(value, style: context.text.titleLarge),
            ),
            Text(
              label,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: context.text.bodySmall,
            ),
            if (caption != null) Text(caption!, style: context.text.labelSmall),
          ],
        ),
      ),
    );
  }
}

/// Lays [children] out two per row.
class MetricGrid extends StatelessWidget {
  const MetricGrid({required this.children, super.key});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, c) {
        final w = (c.maxWidth - BlocksSpacing.md) / 2;
        return Wrap(
          spacing: BlocksSpacing.md,
          runSpacing: BlocksSpacing.md,
          children: [
            for (final child in children) SizedBox(width: w, child: child),
          ],
        );
      },
    );
  }
}

/// Vertical bars, one per value (views per day).
class BarsChart extends StatelessWidget {
  const BarsChart({
    required this.values,
    required this.semanticLabel,
    super.key,
    this.height = 120,
  });

  final List<int> values;
  final String semanticLabel;
  final double height;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      image: true,
      label: semanticLabel,
      child: SizedBox(
        height: height,
        width: double.infinity,
        child: CustomPaint(
          painter: _BarsPainter(
            values: values,
            color: context.scheme.primary,
            accent: context.blocks.accent,
            baseline: context.scheme.outlineVariant,
          ),
        ),
      ),
    );
  }
}

class _BarsPainter extends CustomPainter {
  _BarsPainter({
    required this.values,
    required this.color,
    required this.accent,
    required this.baseline,
  });

  final List<int> values;
  final Color color;
  final Color accent;
  final Color baseline;

  @override
  void paint(Canvas canvas, Size size) {
    if (values.isEmpty) return;
    final maxV = values.reduce(math.max).clamp(1, 1 << 30);
    final n = values.length;
    final gap = n > 40 ? 1.0 : 3.0;
    final w = (size.width - gap * (n - 1)) / n;
    final paint = Paint();
    for (var i = 0; i < n; i++) {
      final h = size.height * (values[i] / maxV).clamp(0.02, 1.0);
      final x = i * (w + gap);
      paint.color = i == n - 1 ? accent : color.withValues(alpha: 0.75);
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(x, size.height - h, w, h),
          Radius.circular(math.min(3, w / 2)),
        ),
        paint,
      );
    }
    canvas.drawLine(
      Offset(0, size.height),
      Offset(size.width, size.height),
      Paint()
        ..color = baseline
        ..strokeWidth = 1,
    );
  }

  @override
  bool shouldRepaint(_BarsPainter old) =>
      old.values != values || old.color != color;
}

/// A smooth 0..1 curve (audience retention across the reel).
class RetentionChart extends StatelessWidget {
  const RetentionChart({
    required this.points,
    required this.semanticLabel,
    super.key,
    this.height = 110,
  });

  final List<double> points;
  final String semanticLabel;
  final double height;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      image: true,
      label: semanticLabel,
      child: SizedBox(
        height: height,
        width: double.infinity,
        child: CustomPaint(
          painter: _LinePainter(
            points: points,
            color: context.scheme.primary,
            grid: context.scheme.outlineVariant,
          ),
        ),
      ),
    );
  }
}

class _LinePainter extends CustomPainter {
  _LinePainter({required this.points, required this.color, required this.grid});

  final List<double> points;
  final Color color;
  final Color grid;

  @override
  void paint(Canvas canvas, Size size) {
    final gridPaint = Paint()
      ..color = grid
      ..strokeWidth = 1;
    for (final f in [0.0, 0.5, 1.0]) {
      final y = size.height * (1 - f);
      canvas.drawLine(Offset(0, y), Offset(size.width, y), gridPaint);
    }
    if (points.length < 2) return;
    final path = Path();
    final fill = Path();
    for (var i = 0; i < points.length; i++) {
      final x = size.width * i / (points.length - 1);
      final y = size.height * (1 - points[i].clamp(0.0, 1.0));
      if (i == 0) {
        path.moveTo(x, y);
        fill
          ..moveTo(x, size.height)
          ..lineTo(x, y);
      } else {
        path.lineTo(x, y);
        fill.lineTo(x, y);
      }
    }
    fill
      ..lineTo(size.width, size.height)
      ..close();
    canvas
      ..drawPath(fill, Paint()..color = color.withValues(alpha: 0.12))
      ..drawPath(
        path,
        Paint()
          ..color = color
          ..style = PaintingStyle.stroke
          ..strokeWidth = 3
          ..strokeJoin = StrokeJoin.round
          ..strokeCap = StrokeCap.round,
      );
  }

  @override
  bool shouldRepaint(_LinePainter old) =>
      old.points != points || old.color != color;
}

/// A labelled horizontal bar (audience by place, earnings by level).
class LabeledBar extends StatelessWidget {
  const LabeledBar({
    required this.label,
    required this.fraction,
    required this.valueLabel,
    required this.color,
    super.key,
    this.labelWidth = 104,
  });

  final String label;
  final double fraction;
  final String valueLabel;
  final Color color;
  final double labelWidth;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      label: '$label: $valueLabel',
      excludeSemantics: true,
      child: Padding(
        padding: const EdgeInsets.only(bottom: BlocksSpacing.sm),
        child: Row(
          children: [
            SizedBox(
              width: labelWidth,
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: context.text.labelLarge,
              ),
            ),
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(BlocksRadius.pill),
                child: LinearProgressIndicator(
                  value: fraction.clamp(0.0, 1.0),
                  minHeight: 12,
                  color: color,
                  backgroundColor: color.withValues(alpha: 0.14),
                ),
              ),
            ),
            const SizedBox(width: BlocksSpacing.sm),
            SizedBox(
              width: 72,
              child: Text(
                valueLabel,
                textAlign: TextAlign.end,
                style: context.text.labelLarge,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// "Available  ₹12,420": one of the three balances.
class BalanceTile extends StatelessWidget {
  const BalanceTile({
    required this.label,
    required this.amount,
    required this.color,
    super.key,
    this.caption,
  });

  final String label;
  final int amount;
  final Color color;
  final String? caption;

  @override
  Widget build(BuildContext context) {
    final text = formatRupees(amount);
    return Semantics(
      container: true,
      label: '$label: $text${caption == null ? '' : ', $caption'}',
      excludeSemantics: true,
      child: Container(
        padding: const EdgeInsets.all(BlocksSpacing.md),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(BlocksRadius.lg),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: context.text.labelMedium?.copyWith(color: color),
            ),
            const SizedBox(height: 2),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: AlignmentDirectional.centerStart,
              child: Text(text, style: context.text.titleMedium),
            ),
            if (caption != null) Text(caption!, style: context.text.labelSmall),
          ],
        ),
      ),
    );
  }
}
