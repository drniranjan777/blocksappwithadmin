import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/models/business_models.dart';

enum CampaignError {
  postRequired,
  goalRequired,
  locationRequired,
  budgetTooLow,
  budgetTooHigh,
  durationInvalid,
}

/// Validation and the (simulated) reach estimate for "Promote Your Post".
/// DEMO rules only: no money moves and no real ad system exists.
abstract final class CampaignRules {
  static const minDailyBudget = 100;
  static const maxDailyBudget = 50000;
  static const maxDays = 30;

  static List<CampaignError> validate(CampaignDraft d) {
    return [
      if (d.postId == null) CampaignError.postRequired,
      if (d.goal == null) CampaignError.goalRequired,
      if (d.locations.isEmpty) CampaignError.locationRequired,
      if (d.dailyBudgetRupees < minDailyBudget) CampaignError.budgetTooLow,
      if (d.dailyBudgetRupees > maxDailyBudget) CampaignError.budgetTooHigh,
      if (d.days < 1 || d.days > maxDays) CampaignError.durationInvalid,
    ];
  }

  static void ensureValid(CampaignDraft d) {
    final errors = validate(d);
    if (errors.isNotEmpty) throw ValidationFailure(errors.first.name);
  }

  /// People reached per rupee, by goal (illustrative).
  static double _reachPerRupee(AdGoal goal) => switch (goal) {
    AdGoal.reach => 28,
    AdGoal.videoViews => 22,
    AdGoal.followers => 14,
    AdGoal.websiteVisits => 10,
    AdGoal.contact => 9,
  };

  /// Returns (min, max) estimated reach. Narrower audiences cost more per
  /// person, wider location sets add reach with diminishing returns.
  static (int, int) estimateReach(CampaignDraft d) {
    final goal = d.goal ?? AdGoal.reach;
    final locationBoost = d.locations.isEmpty
        ? 1.0
        : 1 + 0.25 * (d.locations.length.clamp(1, 5) - 1);
    final narrowing = d.interests.isEmpty ? 1.0 : 0.85;
    final mid =
        d.totalBudgetRupees * _reachPerRupee(goal) * locationBoost * narrowing;
    int round100(double v) => (v / 100).round() * 100;
    return (round100(mid * 0.8), round100(mid * 1.3));
  }
}
