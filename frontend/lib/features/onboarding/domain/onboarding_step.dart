import 'package:blocks_app/l10n/gen/app_localizations.dart';

/// The five onboarding pages, in order.
enum OnboardingStep {
  welcome,
  ladder,
  create,
  earn,
  business;

  String title(AppLocalizations l10n) => switch (this) {
    welcome => l10n.onboarding1Title,
    ladder => l10n.onboarding2Title,
    create => l10n.onboarding3Title,
    earn => l10n.onboarding4Title,
    business => l10n.onboarding5Title,
  };

  String body(AppLocalizations l10n) => switch (this) {
    welcome => l10n.onboarding1Body,
    ladder => l10n.onboarding2Body,
    create => l10n.onboarding3Body,
    earn => l10n.onboarding4Body,
    business => l10n.onboarding5Body,
  };

  bool get isLast => this == business;
}
