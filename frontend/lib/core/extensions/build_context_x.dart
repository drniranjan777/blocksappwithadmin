import 'package:blocks_app/app/theme/blocks_colors.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/l10n/gen/app_localizations.dart';
import 'package:flutter/material.dart';

extension BlocksContext on BuildContext {
  ThemeData get theme => Theme.of(this);
  ColorScheme get scheme => Theme.of(this).colorScheme;
  TextTheme get text => Theme.of(this).textTheme;
  BlocksColors get blocks => Theme.of(this).extension<BlocksColors>()!;
  AppLocalizations get l10n => AppLocalizations.of(this);

  Size get screenSize => MediaQuery.sizeOf(this);
  bool get isCompact => screenSize.width < BlocksBreakpoints.compact;
  bool get isTablet => screenSize.width >= BlocksBreakpoints.tablet;

  /// True when the user (or OS) asked for reduced motion.
  bool get reduceMotion => MediaQuery.disableAnimationsOf(this);
}
