import 'package:blocks_app/data/models/kyc_models.dart';
import 'package:blocks_app/data/models/payout_models.dart';

enum PayoutAmountIssue { belowMinimum, exceedsAvailable }

/// The rules for "can this creator withdraw, and how much?".
///
/// **The server owns these rules.** The mock server runs this very code so the
/// demo behaves like production, and the app uses it only to give instant
/// feedback while typing; a payout request is always checked again by the
/// server. Every threshold comes from [PayoutConfig], never from here.
abstract final class PayoutRules {
  static PayoutEligibility evaluate({
    required KycStatus kyc,
    required List<BankAccount> accounts,
    required int available,
    required PayoutConfig config,
    required DateTime now,
    DateTime? holdUntil,
    bool goodStanding = true,
  }) {
    final held = holdUntil != null && now.isBefore(holdUntil);
    return PayoutEligibility(
      holdUntil: held ? holdUntil : null,
      items: [
        EligibilityItem(
          check: EligibilityCheck.identityVerified,
          met: kyc.isVerified,
        ),
        EligibilityItem(
          check: EligibilityCheck.bankVerified,
          met: accounts.any((a) => a.status.isVerified),
        ),
        EligibilityItem(
          check: EligibilityCheck.minimumBalance,
          met: available >= config.minimumAmount,
        ),
        EligibilityItem(check: EligibilityCheck.noActiveHold, met: !held),
        EligibilityItem(
          check: EligibilityCheck.goodStanding,
          met: goodStanding,
        ),
      ],
    );
  }

  /// Null when [amount] is acceptable.
  static PayoutAmountIssue? checkAmount(
    int amount, {
    required int available,
    required PayoutConfig config,
  }) {
    if (amount < config.minimumAmount) return PayoutAmountIssue.belowMinimum;
    if (amount > available) return PayoutAmountIssue.exceedsAvailable;
    return null;
  }

  /// Large payouts need the stronger confirmation.
  static bool needsStepUp(int amount, PayoutConfig config) =>
      amount >= config.stepUpAmount;

  /// [from] plus [days] working days (Saturday and Sunday skipped). Bank
  /// holidays are a server calendar concern and are not modelled here.
  static DateTime addBusinessDays(DateTime from, int days) {
    var d = from;
    var left = days;
    while (left > 0) {
      d = d.add(const Duration(days: 1));
      if (d.weekday != DateTime.saturday && d.weekday != DateTime.sunday) {
        left--;
      }
    }
    return d;
  }

  /// The window in which the money is expected, from the configured range.
  static (DateTime, DateTime) estimateArrival(
    DateTime requestedAt,
    PayoutConfig config,
  ) => (
    addBusinessDays(requestedAt, config.estimatedDaysMin),
    addBusinessDays(requestedAt, config.estimatedDaysMax),
  );
}
