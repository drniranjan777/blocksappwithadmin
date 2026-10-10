import 'package:flutter/material.dart';

/// Central type scale. The font family is intentionally unset so the platform
/// font (and its Indic-script fallbacks) is used; to adopt a brand typeface,
/// bundle it under `assets/fonts` and set [fontFamily] here — nothing else
/// needs to change.
abstract final class BlocksTypography {
  static const String? fontFamily = null;

  static TextTheme textTheme(Color primary, Color secondary) {
    TextStyle s(double size, FontWeight w, {double h = 1.3, double ls = 0}) =>
        TextStyle(
          fontFamily: fontFamily,
          fontSize: size,
          fontWeight: w,
          height: h,
          letterSpacing: ls,
          color: primary,
        );

    return TextTheme(
      displaySmall: s(34, FontWeight.w800, h: 1.1, ls: -0.8),
      headlineMedium: s(28, FontWeight.w800, h: 1.15, ls: -0.5),
      headlineSmall: s(24, FontWeight.w800, h: 1.2, ls: -0.4),
      titleLarge: s(20, FontWeight.w700, ls: -0.2),
      titleMedium: s(16, FontWeight.w700),
      titleSmall: s(14, FontWeight.w700),
      bodyLarge: s(16, FontWeight.w400, h: 1.45),
      bodyMedium: s(14, FontWeight.w400, h: 1.45),
      bodySmall: s(12, FontWeight.w400, h: 1.4).copyWith(color: secondary),
      labelLarge: s(15, FontWeight.w700, ls: 0.1),
      labelMedium: s(12, FontWeight.w700, ls: 0.2),
      labelSmall: s(11, FontWeight.w700, ls: 0.4).copyWith(color: secondary),
    );
  }
}
