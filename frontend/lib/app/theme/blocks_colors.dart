import 'package:blocks_app/features/reach/domain/reach_level.dart';
import 'package:flutter/material.dart';

/// Raw brand palette. Widgets should NOT read these directly — use the
/// [ColorScheme] or [BlocksColors] theme extension so dark mode just works.
abstract final class BlocksPalette {
  // Brand
  static const indigo = Color(0xFF3A3DD8);
  static const indigoSoft = Color(0xFFE6E7FF);
  static const indigoLight = Color(0xFF9094FF);
  static const saffron = Color(0xFFF28A1C);
  static const saffronLight = Color(0xFFFFA24A);

  // Ink / neutrals
  static const ink = Color(0xFF11142B);
  static const inkDeep = Color(0xFF080A1A);
  static const night = Color(0xFF0B0D1E);
  static const nightSurface = Color(0xFF14172E);

  // Reach ladder
  static const district = Color(0xFF0FA39A);
  static const state = Color(0xFF2F6BFF);
  static const national = Color(0xFFF08A00);
  static const global = Color(0xFFD6246E);

  // Status
  // Dark enough for 4.5:1 text contrast on white and on its own 12% tint.
  static const success = Color(0xFF0A6B42);
  static const warning = Color(0xFFB7791F);
  static const danger = Color(0xFFC8222E);
}

/// Semantic colours that Material's [ColorScheme] has no slot for.
@immutable
class BlocksColors extends ThemeExtension<BlocksColors> {
  const BlocksColors({
    required this.reachDistrict,
    required this.reachState,
    required this.reachNational,
    required this.reachGlobal,
    required this.success,
    required this.warning,
    required this.accent,
    required this.surfaceMuted,
    required this.heroTop,
    required this.heroBottom,
    required this.onHero,
    required this.onHeroMuted,
  });

  static const light = BlocksColors(
    reachDistrict: BlocksPalette.district,
    reachState: BlocksPalette.state,
    reachNational: BlocksPalette.national,
    reachGlobal: BlocksPalette.global,
    success: BlocksPalette.success,
    warning: BlocksPalette.warning,
    accent: BlocksPalette.saffron,
    surfaceMuted: Color(0xFFEEEFF8),
    heroTop: Color(0xFF1B1E6B),
    heroBottom: BlocksPalette.inkDeep,
    onHero: Colors.white,
    onHeroMuted: Color(0xFFB9BBE6),
  );

  static const dark = BlocksColors(
    reachDistrict: Color(0xFF2CC7BC),
    reachState: Color(0xFF6C94FF),
    reachNational: Color(0xFFFFA630),
    reachGlobal: Color(0xFFFF5C9A),
    success: Color(0xFF3CCB8A),
    warning: Color(0xFFE8B24D),
    accent: BlocksPalette.saffronLight,
    surfaceMuted: Color(0xFF1B1F3B),
    heroTop: Color(0xFF1B1E6B),
    heroBottom: BlocksPalette.inkDeep,
    onHero: Colors.white,
    onHeroMuted: Color(0xFFB9BBE6),
  );

  final Color reachDistrict;
  final Color reachState;
  final Color reachNational;
  final Color reachGlobal;
  final Color success;
  final Color warning;

  /// Saffron accent — used sparingly (Rising, milestones, highlights).
  final Color accent;
  final Color surfaceMuted;

  /// Splash / onboarding hero gradient and its foreground colours.
  final Color heroTop;
  final Color heroBottom;
  final Color onHero;
  final Color onHeroMuted;

  Color reachColor(ReachLevel level) => switch (level) {
    ReachLevel.district => reachDistrict,
    ReachLevel.state => reachState,
    ReachLevel.national => reachNational,
    ReachLevel.global => reachGlobal,
  };

  @override
  BlocksColors copyWith({
    Color? reachDistrict,
    Color? reachState,
    Color? reachNational,
    Color? reachGlobal,
    Color? success,
    Color? warning,
    Color? accent,
    Color? surfaceMuted,
    Color? heroTop,
    Color? heroBottom,
    Color? onHero,
    Color? onHeroMuted,
  }) {
    return BlocksColors(
      reachDistrict: reachDistrict ?? this.reachDistrict,
      reachState: reachState ?? this.reachState,
      reachNational: reachNational ?? this.reachNational,
      reachGlobal: reachGlobal ?? this.reachGlobal,
      success: success ?? this.success,
      warning: warning ?? this.warning,
      accent: accent ?? this.accent,
      surfaceMuted: surfaceMuted ?? this.surfaceMuted,
      heroTop: heroTop ?? this.heroTop,
      heroBottom: heroBottom ?? this.heroBottom,
      onHero: onHero ?? this.onHero,
      onHeroMuted: onHeroMuted ?? this.onHeroMuted,
    );
  }

  @override
  BlocksColors lerp(ThemeExtension<BlocksColors>? other, double t) {
    if (other is! BlocksColors) return this;
    Color mix(Color a, Color b) => Color.lerp(a, b, t)!;
    return BlocksColors(
      reachDistrict: mix(reachDistrict, other.reachDistrict),
      reachState: mix(reachState, other.reachState),
      reachNational: mix(reachNational, other.reachNational),
      reachGlobal: mix(reachGlobal, other.reachGlobal),
      success: mix(success, other.success),
      warning: mix(warning, other.warning),
      accent: mix(accent, other.accent),
      surfaceMuted: mix(surfaceMuted, other.surfaceMuted),
      heroTop: mix(heroTop, other.heroTop),
      heroBottom: mix(heroBottom, other.heroBottom),
      onHero: mix(onHero, other.onHero),
      onHeroMuted: mix(onHeroMuted, other.onHeroMuted),
    );
  }
}
