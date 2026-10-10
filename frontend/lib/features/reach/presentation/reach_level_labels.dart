import 'package:blocks_app/features/reach/domain/reach_level.dart';
import 'package:blocks_app/l10n/gen/app_localizations.dart';

/// Presentation-only: keeps the domain enum free of l10n/Flutter imports.
extension ReachLevelLabels on ReachLevel {
  String label(AppLocalizations l10n) => switch (this) {
    ReachLevel.district => l10n.levelDistrict,
    ReachLevel.state => l10n.levelState,
    ReachLevel.national => l10n.levelNational,
    ReachLevel.global => l10n.levelGlobal,
  };
}
