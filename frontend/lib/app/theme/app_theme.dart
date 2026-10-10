import 'package:blocks_app/app/theme/blocks_colors.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/app/theme/blocks_typography.dart';
import 'package:flutter/material.dart';

abstract final class AppTheme {
  static ThemeData light() => _build(
    brightness: Brightness.light,
    scheme: const ColorScheme(
      brightness: Brightness.light,
      primary: BlocksPalette.indigo,
      onPrimary: Colors.white,
      primaryContainer: BlocksPalette.indigoSoft,
      onPrimaryContainer: Color(0xFF1B1E6B),
      secondary: BlocksPalette.saffron,
      onSecondary: Colors.white,
      secondaryContainer: Color(0xFFFFE7CC),
      onSecondaryContainer: Color(0xFF5A2E00),
      error: BlocksPalette.danger,
      onError: Colors.white,
      errorContainer: Color(0xFFFDE4E6),
      onErrorContainer: Color(0xFF8A1420),
      surface: Colors.white,
      onSurface: BlocksPalette.ink,
      onSurfaceVariant: Color(0xFF5E6180),
      outline: Color(0xFFC9CBE0),
      outlineVariant: Color(0xFFE3E4F0),
      surfaceContainerHighest: Color(0xFFEEEFF8),
      surfaceContainerLow: Color(0xFFF6F6FB),
    ),
    extension: BlocksColors.light,
    scaffold: const Color(0xFFF6F6FB),
  );

  static ThemeData dark() => _build(
    brightness: Brightness.dark,
    scheme: const ColorScheme(
      brightness: Brightness.dark,
      primary: BlocksPalette.indigoLight,
      onPrimary: BlocksPalette.inkDeep,
      primaryContainer: Color(0xFF26297A),
      onPrimaryContainer: Color(0xFFE0E1FF),
      secondary: BlocksPalette.saffronLight,
      onSecondary: BlocksPalette.inkDeep,
      secondaryContainer: Color(0xFF4A2A06),
      onSecondaryContainer: Color(0xFFFFDDB8),
      error: Color(0xFFFF6B75),
      onError: BlocksPalette.inkDeep,
      errorContainer: Color(0xFF5B1B24),
      onErrorContainer: Color(0xFFFFDADD),
      surface: BlocksPalette.nightSurface,
      onSurface: Color(0xFFF1F2FF),
      onSurfaceVariant: Color(0xFFA3A6C8),
      outline: Color(0xFF3A3E63),
      outlineVariant: Color(0xFF272A48),
      surfaceContainerHighest: Color(0xFF1B1F3B),
      surfaceContainerLow: BlocksPalette.night,
    ),
    extension: BlocksColors.dark,
    scaffold: BlocksPalette.night,
  );

  static ThemeData _build({
    required Brightness brightness,
    required ColorScheme scheme,
    required BlocksColors extension,
    required Color scaffold,
  }) {
    final text = BlocksTypography.textTheme(
      scheme.onSurface,
      scheme.onSurfaceVariant,
    );
    final buttonShape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(BlocksRadius.md + 2),
    );
    const buttonSize = Size.fromHeight(BlocksSpacing.touchTarget + 4);

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: scaffold,
      textTheme: text,
      extensions: [extension],
      splashFactory: InkSparkle.splashFactory,
      visualDensity: VisualDensity.standard,
      appBarTheme: AppBarTheme(
        backgroundColor: scaffold,
        foregroundColor: scheme.onSurface,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: text.titleLarge,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: buttonSize,
          shape: buttonShape,
          textStyle: text.labelLarge,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: buttonSize,
          shape: buttonShape,
          side: BorderSide(color: scheme.outline),
          textStyle: text.labelLarge,
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          minimumSize: const Size(
            BlocksSpacing.touchTarget,
            BlocksSpacing.touchTarget,
          ),
          textStyle: text.labelLarge,
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surfaceContainerHighest,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: BlocksSpacing.lg,
          vertical: BlocksSpacing.md + 2,
        ),
        border: OutlineInputBorder(
          borderRadius: BlocksRadius.mdAll,
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BlocksRadius.mdAll,
          borderSide: BorderSide(color: scheme.primary, width: 1.5),
        ),
      ),
      cardTheme: CardThemeData(
        color: scheme.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BlocksRadius.lgAll,
          side: BorderSide(color: scheme.outlineVariant),
        ),
      ),
      dividerTheme: DividerThemeData(
        color: scheme.outlineVariant,
        thickness: 1,
        space: 1,
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: scheme.surface,
        showDragHandle: true,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(BlocksRadius.xl),
          ),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BlocksRadius.mdAll),
      ),
    );
  }
}
