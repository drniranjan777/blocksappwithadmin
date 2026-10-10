import 'package:blocks_app/data/models/app_user.dart';
import 'package:equatable/equatable.dart';

/// Gate for Live access. Every threshold is configurable (the admin console
/// controls them in production) — none are hard-coded in UI.
class LiveEligibilityConfig extends Equatable {
  const LiveEligibilityConfig({
    required this.minFollowers,
    required this.minAccountAgeDays,
    required this.requireTwoFactor,
    required this.requireTrustEligible,
    required this.forbidMajorViolation,
    required this.requireAgeEligible,
  });

  /// Demo defaults from the product blueprint.
  const LiveEligibilityConfig.demo()
    : minFollowers = 5000,
      minAccountAgeDays = 30,
      requireTwoFactor = true,
      requireTrustEligible = true,
      forbidMajorViolation = true,
      requireAgeEligible = true;

  final int minFollowers;
  final int minAccountAgeDays;
  final bool requireTwoFactor;
  final bool requireTrustEligible;
  final bool forbidMajorViolation;
  final bool requireAgeEligible;

  @override
  List<Object?> get props => [
    minFollowers,
    minAccountAgeDays,
    requireTwoFactor,
    requireTrustEligible,
    forbidMajorViolation,
    requireAgeEligible,
  ];
}

enum LiveRule { followers, accountAge, trust, twoFactor, noViolation, age }

class LiveCheck extends Equatable {
  const LiveCheck({
    required this.rule,
    required this.passed,
    this.current,
    this.required,
  });

  final LiveRule rule;
  final bool passed;

  /// For numeric rules: the user's value and the requirement.
  final int? current;
  final int? required;

  @override
  List<Object?> get props => [rule, passed, current, required];
}

class LiveEligibilityResult extends Equatable {
  const LiveEligibilityResult(this.checks);

  final List<LiveCheck> checks;

  bool get isEligible => checks.every((c) => c.passed);

  @override
  List<Object?> get props => [checks];
}

class LiveEligibilityEvaluator {
  const LiveEligibilityEvaluator([
    this.config = const LiveEligibilityConfig.demo(),
  ]);

  final LiveEligibilityConfig config;

  bool canGoLive(AppUser user) => evaluate(user).isEligible;

  LiveEligibilityResult evaluate(AppUser user) {
    return LiveEligibilityResult([
      LiveCheck(
        rule: LiveRule.followers,
        passed: user.followersCount >= config.minFollowers,
        current: user.followersCount,
        required: config.minFollowers,
      ),
      LiveCheck(
        rule: LiveRule.accountAge,
        passed: user.accountAgeDays >= config.minAccountAgeDays,
        current: user.accountAgeDays,
        required: config.minAccountAgeDays,
      ),
      LiveCheck(
        rule: LiveRule.trust,
        passed:
            !config.requireTrustEligible ||
            user.trustStatus == TrustStatus.eligible,
      ),
      LiveCheck(
        rule: LiveRule.twoFactor,
        passed: !config.requireTwoFactor || user.isTwoFactorEnabled,
      ),
      LiveCheck(
        rule: LiveRule.noViolation,
        passed: !config.forbidMajorViolation || !user.hasMajorViolation,
      ),
      LiveCheck(
        rule: LiveRule.age,
        passed: !config.requireAgeEligible || user.isAgeEligible,
      ),
    ]);
  }
}
