import 'package:flutter/material.dart';

/// 4-pt spacing scale. Use these instead of magic numbers.
abstract final class BlocksSpacing {
  static const double xxs = 2;
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;
  static const double xxl = 32;
  static const double huge = 48;

  /// Minimum comfortable touch target.
  static const double touchTarget = 48;
}

abstract final class BlocksRadius {
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;
  static const double pill = 999;

  static BorderRadius get smAll => BorderRadius.circular(sm);
  static BorderRadius get mdAll => BorderRadius.circular(md);
  static BorderRadius get lgAll => BorderRadius.circular(lg);
  static BorderRadius get xlAll => BorderRadius.circular(xl);
}

abstract final class BlocksShadows {
  static List<BoxShadow> soft(Color base) => [
    BoxShadow(
      color: base.withValues(alpha: 0.08),
      blurRadius: 16,
      offset: const Offset(0, 6),
    ),
  ];

  static List<BoxShadow> lifted(Color base) => [
    BoxShadow(
      color: base.withValues(alpha: 0.18),
      blurRadius: 28,
      offset: const Offset(0, 12),
    ),
  ];
}

abstract final class BlocksDurations {
  static const fast = Duration(milliseconds: 150);
  static const medium = Duration(milliseconds: 300);
  static const slow = Duration(milliseconds: 600);
}

/// Layout breakpoints (logical pixels).
abstract final class BlocksBreakpoints {
  static const double compact = 360;
  static const double tablet = 600;

  /// Max width for single-column content on large screens.
  static const double contentMaxWidth = 520;
}
