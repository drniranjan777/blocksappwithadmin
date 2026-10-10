import 'package:blocks_app/data/models/payout_models.dart';

/// Payout bank accounts.
///
/// The full account number is sent once, over TLS, to the payout provider
/// through the BLOCKS backend, and never comes back: the app only ever holds a
/// masked number. Whether the name on the account matches the verified
/// identity is decided by the server / bank, not by the app.
///
/// Adding, changing or removing an account needs a step-up token (see
/// `StepUpRepository`); the server raises a security event, e-mails the owner,
/// and may pause payouts for a while.
abstract interface class BankAccountRepository {
  Future<List<BankAccount>> getAccounts();

  /// Looks the branch up from its IFSC. Null if the code is unknown.
  Future<BankBranch?> lookupIfsc(String ifsc);

  /// Throws `FieldValidationFailure` (keys `holderName`, `accountNumber`,
  /// `confirmAccountNumber`, `ifsc`) for refused fields, and
  /// `UnauthorizedFailure` when [stepUpToken] is missing or not valid for
  /// `StepUpPurpose.addBankAccount`.
  Future<BankAccount> addAccount(
    BankAccountInput input, {
    required String stepUpToken,
  });

  Future<List<BankAccount>> setPrimary(
    String accountId, {
    required String stepUpToken,
  });

  Future<List<BankAccount>> removeAccount(
    String accountId, {
    required String stepUpToken,
  });
}

/// Withdrawals.
abstract interface class PayoutRepository {
  /// Balances, eligibility (computed by the server), rules and accounts.
  Future<PayoutOverview> getOverview();

  /// Newest first.
  Future<List<PayoutRequest>> getHistory();

  /// Throws `ValidationFailure` with a reason key: `belowMinimum`,
  /// `exceedsAvailable`, `notEligible`, `onHold`, `noBankAccount`; and
  /// `UnauthorizedFailure` when the amount needs a step-up and
  /// [stepUpToken] is missing or invalid. The server re-checks every rule.
  Future<PayoutRequest> requestPayout({
    required int amount,
    required String accountId,
    String? stepUpToken,
  });
}

/// Tax identity collected for the payout provider. BLOCKS does not calculate
/// tax in the app.
abstract interface class TaxRepository {
  Future<TaxInfo> getTaxInfo();

  /// Throws `FieldValidationFailure` (key `pan`) when the number is refused.
  Future<TaxInfo> saveTaxInfo({
    required String pan,
    required String stepUpToken,
  });
}
