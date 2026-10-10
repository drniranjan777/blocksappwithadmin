import 'package:blocks_app/data/models/kyc_models.dart';
import 'package:equatable/equatable.dart';

// ------------------------------------------------------------ bank account --

enum BankAccountType { savings, current }

enum BankVerificationStatus {
  /// Saved, but the name can only be matched once identity is verified.
  awaitingIdentity,

  /// The server is checking the account.
  verifying,
  verified,

  /// The account holder's name does not match the verified identity.
  nameMismatch,
  failed,
}

extension BankVerificationStatusX on BankVerificationStatus {
  bool get isVerified => this == BankVerificationStatus.verified;
  bool get needsAttention =>
      this == BankVerificationStatus.nameMismatch ||
      this == BankVerificationStatus.failed;
}

/// A payout account as the server reports it: the number is **already
/// masked**; the full number is never sent back to the app.
class BankAccount extends Equatable {
  const BankAccount({
    required this.id,
    required this.holderName,
    required this.maskedAccountNumber,
    required this.last4,
    required this.ifsc,
    required this.bankName,
    required this.type,
    required this.status,
    required this.addedAt,
    this.branch = '',
    this.verifiedAt,
    this.isPrimary = false,
    this.failureReason,
  });

  final String id;
  final String holderName;
  final String maskedAccountNumber;
  final String last4;
  final String ifsc;
  final String bankName;
  final String branch;
  final BankAccountType type;
  final BankVerificationStatus status;
  final DateTime addedAt;
  final DateTime? verifiedAt;
  final bool isPrimary;

  /// Reason code when [status] needs attention (`nameMismatch`, ...).
  final String? failureReason;

  BankAccount copyWith({
    BankVerificationStatus? status,
    bool? isPrimary,
    DateTime? verifiedAt,
    String? failureReason,
    bool clearFailure = false,
  }) => BankAccount(
    id: id,
    holderName: holderName,
    maskedAccountNumber: maskedAccountNumber,
    last4: last4,
    ifsc: ifsc,
    bankName: bankName,
    branch: branch,
    type: type,
    status: status ?? this.status,
    addedAt: addedAt,
    verifiedAt: verifiedAt ?? this.verifiedAt,
    isPrimary: isPrimary ?? this.isPrimary,
    failureReason: clearFailure ? null : (failureReason ?? this.failureReason),
  );

  @override
  List<Object?> get props => [
    id,
    holderName,
    maskedAccountNumber,
    last4,
    ifsc,
    bankName,
    branch,
    type,
    status,
    addedAt,
    verifiedAt,
    isPrimary,
    failureReason,
  ];
}

/// What the creator typed. Holds the **raw account number** only while the
/// form is open and for the one submit call; never logged, stored or shown
/// again ([toString] is redacted).
class BankAccountInput {
  const BankAccountInput({
    required this.holderName,
    required this.accountNumber,
    required this.confirmAccountNumber,
    required this.ifsc,
    this.type = BankAccountType.savings,
  });

  final String holderName;
  final String accountNumber;
  final String confirmAccountNumber;
  final String ifsc;
  final BankAccountType type;

  @override
  String toString() => 'BankAccountInput(<redacted>)';
}

/// Result of an IFSC lookup (the server owns the bank directory).
class BankBranch extends Equatable {
  const BankBranch({
    required this.ifsc,
    required this.bankName,
    required this.branch,
    this.city = '',
  });

  final String ifsc;
  final String bankName;
  final String branch;
  final String city;

  @override
  List<Object?> get props => [ifsc, bankName, branch, city];
}

// ---------------------------------------------------------------- payouts --

enum PayoutStatus { requested, processing, completed, failed, reversed, onHold }

extension PayoutStatusX on PayoutStatus {
  bool get isOpen =>
      this == PayoutStatus.requested ||
      this == PayoutStatus.processing ||
      this == PayoutStatus.onHold;
}

class PayoutRequest extends Equatable {
  const PayoutRequest({
    required this.id,
    required this.amount,
    required this.status,
    required this.requestedAt,
    required this.estimatedFrom,
    required this.estimatedTo,
    required this.bankLabel,
    required this.reference,
    this.completedAt,
    this.reasonCode,
  });

  final String id;

  /// Whole rupees (production: paise).
  final int amount;
  final PayoutStatus status;
  final DateTime requestedAt;
  final DateTime estimatedFrom;
  final DateTime estimatedTo;

  /// E.g. "HDFC Bank •••• 4821" (built by the server; no full number).
  final String bankLabel;
  final String reference;
  final DateTime? completedAt;

  /// Why a payout failed / was held / reversed.
  final String? reasonCode;

  PayoutRequest copyWith({
    PayoutStatus? status,
    DateTime? completedAt,
    String? reasonCode,
  }) => PayoutRequest(
    id: id,
    amount: amount,
    status: status ?? this.status,
    requestedAt: requestedAt,
    estimatedFrom: estimatedFrom,
    estimatedTo: estimatedTo,
    bankLabel: bankLabel,
    reference: reference,
    completedAt: completedAt ?? this.completedAt,
    reasonCode: reasonCode ?? this.reasonCode,
  );

  @override
  List<Object?> get props => [
    id,
    amount,
    status,
    requestedAt,
    estimatedFrom,
    estimatedTo,
    bankLabel,
    reference,
    completedAt,
    reasonCode,
  ];
}

/// Payout rules. **Server configuration**: every figure here is a demo value
/// and may differ per country, creator tier or season.
class PayoutConfig extends Equatable {
  const PayoutConfig({
    this.minimumAmount = 1000,
    this.estimatedDaysMin = 2,
    this.estimatedDaysMax = 5,
    this.stepUpAmount = 25000,
    this.holdAfterAccountChange = Duration.zero,
  });

  /// Demo values. The safety hold is off by default so the walk-through
  /// (verify -> add bank -> withdraw) is not blocked; the demo lab can switch
  /// it on to show the behaviour.
  const PayoutConfig.demo() : this();

  PayoutConfig copyWith({
    int? minimumAmount,
    int? estimatedDaysMin,
    int? estimatedDaysMax,
    int? stepUpAmount,
    Duration? holdAfterAccountChange,
  }) => PayoutConfig(
    minimumAmount: minimumAmount ?? this.minimumAmount,
    estimatedDaysMin: estimatedDaysMin ?? this.estimatedDaysMin,
    estimatedDaysMax: estimatedDaysMax ?? this.estimatedDaysMax,
    stepUpAmount: stepUpAmount ?? this.stepUpAmount,
    holdAfterAccountChange:
        holdAfterAccountChange ?? this.holdAfterAccountChange,
  );

  final int minimumAmount;
  final int estimatedDaysMin;
  final int estimatedDaysMax;

  /// Payouts at or above this amount need extra confirmation.
  final int stepUpAmount;

  /// Payouts pause for this long after the payout account changes. Zero turns
  /// the safety hold off.
  final Duration holdAfterAccountChange;

  @override
  List<Object?> get props => [
    minimumAmount,
    estimatedDaysMin,
    estimatedDaysMax,
    stepUpAmount,
    holdAfterAccountChange,
  ];
}

enum EligibilityCheck {
  identityVerified,
  bankVerified,
  minimumBalance,
  noActiveHold,
  goodStanding,
}

class EligibilityItem extends Equatable {
  const EligibilityItem({required this.check, required this.met});

  final EligibilityCheck check;
  final bool met;

  @override
  List<Object?> get props => [check, met];
}

/// The server's answer to "can this creator withdraw now?". Always computed
/// server-side; the app never derives eligibility from its own state.
class PayoutEligibility extends Equatable {
  const PayoutEligibility({required this.items, this.holdUntil});

  final List<EligibilityItem> items;

  /// When the safety hold after a payout-account change ends.
  final DateTime? holdUntil;

  bool get isEligible => items.every((i) => i.met);
  int get metCount => items.where((i) => i.met).length;

  bool isMet(EligibilityCheck c) => items.any((i) => i.check == c && i.met);

  @override
  List<Object?> get props => [items, holdUntil];
}

/// Everything the Payout Center overview needs in one call.
class PayoutOverview extends Equatable {
  const PayoutOverview({
    required this.available,
    required this.pending,
    required this.paid,
    required this.eligibility,
    required this.config,
    required this.kycStatus,
    required this.bankAccounts,
    this.openPayout,
  });

  final int available;
  final int pending;
  final int paid;
  final PayoutEligibility eligibility;
  final PayoutConfig config;
  final KycStatus kycStatus;
  final List<BankAccount> bankAccounts;

  /// A payout that is still being processed, if any.
  final PayoutRequest? openPayout;

  BankAccount? get primaryBank {
    for (final b in bankAccounts) {
      if (b.isPrimary) return b;
    }
    return bankAccounts.isEmpty ? null : bankAccounts.first;
  }

  @override
  List<Object?> get props => [
    available,
    pending,
    paid,
    eligibility,
    config,
    kycStatus,
    bankAccounts,
    openPayout,
  ];
}

// -------------------------------------------------------------------- tax --

enum TaxInfoStatus { notProvided, provided }

enum TaxDocumentKind { payoutStatement, withholdingCertificate }

/// Whether a document can be had yet. `issuedLater` is a document the payout
/// provider produces after a period ends, where one applies.
enum TaxDocumentStatus { available, issuedLater }

/// A statement or certificate the payout provider issues for the creator's
/// payouts. The app lists what exists; it never builds one, and it never
/// works out an amount of tax.
class TaxDocument extends Equatable {
  const TaxDocument({
    required this.id,
    required this.kind,
    required this.period,
    required this.status,
  });

  final String id;
  final TaxDocumentKind kind;

  /// Any day inside the month (statement) or quarter (certificate) it covers.
  final DateTime period;
  final TaxDocumentStatus status;

  @override
  List<Object?> get props => [id, kind, period, status];
}

/// Tax identity the payout provider needs. BLOCKS collects it; it does not
/// calculate any tax. Deductions (if any) are applied and itemised by the
/// payout service, not by the app.
class TaxInfo extends Equatable {
  const TaxInfo({
    required this.status,
    this.maskedPan = '',
    this.updatedAt,
    this.accountType,
    this.documents = const [],
  });

  const TaxInfo.none() : this(status: TaxInfoStatus.notProvided);

  final TaxInfoStatus status;
  final String maskedPan;
  final DateTime? updatedAt;

  /// Individual or business, as set by the verified identity. Null until
  /// identity verification has been started.
  final KycSubject? accountType;
  final List<TaxDocument> documents;

  TaxInfo copyWith({KycSubject? accountType, List<TaxDocument>? documents}) =>
      TaxInfo(
        status: status,
        maskedPan: maskedPan,
        updatedAt: updatedAt,
        accountType: accountType ?? this.accountType,
        documents: documents ?? this.documents,
      );

  @override
  List<Object?> get props => [
    status,
    maskedPan,
    updatedAt,
    accountType,
    documents,
  ];
}

// ---------------------------------------------------------------- step-up --

/// What the user is about to do that needs a stronger confirmation.
enum StepUpPurpose {
  addBankAccount,
  changeBankAccount,
  removeBankAccount,
  requestPayout,
  updateTaxInfo,
}
