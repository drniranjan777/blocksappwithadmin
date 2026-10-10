import 'package:blocks_app/data/models/discovery_models.dart';
import 'package:blocks_app/l10n/gen/app_localizations.dart';
import 'package:flutter/material.dart';

extension ExploreScopeLabels on ExploreScope {
  String label(AppLocalizations l10n) => switch (this) {
    ExploreScope.district => l10n.levelDistrict,
    ExploreScope.state => l10n.levelState,
    ExploreScope.india => l10n.feedIndia,
    ExploreScope.global => l10n.levelGlobal,
  };

  IconData get icon => switch (this) {
    ExploreScope.district => Icons.location_city_rounded,
    ExploreScope.state => Icons.map_rounded,
    ExploreScope.india => Icons.flag_rounded,
    ExploreScope.global => Icons.public_rounded,
  };
}

extension ExploreCategoryLabels on ExploreCategory {
  String label(AppLocalizations l10n) => switch (this) {
    ExploreCategory.news => l10n.catNews,
    ExploreCategory.entertainment => l10n.catEntertainment,
    ExploreCategory.education => l10n.catEducation,
    ExploreCategory.business => l10n.catBusiness,
    ExploreCategory.food => l10n.catFood,
    ExploreCategory.travel => l10n.catTravel,
    ExploreCategory.technology => l10n.catTechnology,
    ExploreCategory.sports => l10n.catSports,
    ExploreCategory.agriculture => l10n.catAgriculture,
    ExploreCategory.fashion => l10n.catFashion,
    ExploreCategory.local => l10n.catLocal,
    ExploreCategory.jobs => l10n.catJobs,
    ExploreCategory.events => l10n.catEvents,
  };
}
