import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/core/utils/id_mask.dart';
import 'package:blocks_app/data/mock/mock_creator_state.dart';
import 'package:blocks_app/data/mock/mock_step_up_repository.dart';
import 'package:blocks_app/data/mock/mock_world.dart';
import 'package:blocks_app/data/models/payout_models.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/data/repositories/payout_repository.dart';
import 'package:blocks_app/features/payout/domain/bank_validator.dart';
import 'package:blocks_app/features/payout/domain/payout_rules.dart';

/// IFSC prefix -> bank. The real directory is the bank / payout provider's.
const _bankDirectory = {
  'HDFC': 'HDFC Bank',
  'ICIC': 'ICICI Bank',
  'SBIN': 'State Bank of India',
  'UTIB': 'Axis Bank',
  'KKBK': 'Kotak Mahindra Bank',
  'PUNB': 'Punjab National Bank',
  'BARB': 'Bank of Baroda',
  'CNRB': 'Canara Bank',
  'IDIB': 'Indian Bank',
  'YESB': 'Yes Bank',
  'INDB': 'IndusInd Bank',
  'UBIN': 'Union Bank of India',
  'IBKL': 'IDBI Bank',
  'FDRL': 'Federal Bank',
};

const _branches = [
  ('Banjara Hills', 'Hyderabad'),
  ('Jubilee Hills', 'Hyderabad'),
  ('Madhapur', 'Hyderabad'),
  ('Koramangala', 'Bengaluru'),
  ('Anna Nagar', 'Chennai'),
  ('Andheri West', 'Mumbai'),
  ('Connaught Place', 'New Delhi'),
];

String _bankLabel(BankAccount a) => '${a.bankName} •••• ${a.last4}';

// -------------------------------------------------------------------- bank --

class MockBankAccountRepository implements BankAccountRepository {
  MockBankAccountRepository(this._w);

  final MockWorld _w;
  MockCreatorState get _c => _w.creator;

  @override
  Future<List<BankAccount>> getAccounts() async {
    await _w.pause();
    _c.syncKyc();
    return List.unmodifiable(_c.banks);
  }

  @override
  Future<BankBranch?> lookupIfsc(String ifsc) async {
    await _w.pauseBrief();
    final code = BankAccountValidator.normalizeIfsc(ifsc);
    if (!BankAccountValidator.isValidIfsc(code)) return null;
    final bank = _bankDirectory[code.substring(0, 4)];
    if (bank == null) return null;
    final (branch, city) = _branches[code.hashCode.abs() % _branches.length];
    return BankBranch(ifsc: code, bankName: bank, branch: branch, city: city);
  }

  @override
  Future<BankAccount> addAccount(
    BankAccountInput input, {
    required String stepUpToken,
  }) async {
    await _w.pause();

    // The server validates again; it never relies on the app's own check.
    final fieldErrors = BankAccountValidator.validate(input);
    if (fieldErrors.isNotEmpty) {
      throw FieldValidationFailure({
        for (final e in fieldErrors.entries) e.key.name: e.value.name,
      });
    }
    final ifsc = BankAccountValidator.normalizeIfsc(input.ifsc);
    final branch = await lookupIfsc(ifsc);
    if (branch == null) {
      throw const FieldValidationFailure({'ifsc': 'unknown'});
    }
    final digits = BankAccountValidator.digitsOnly(input.accountNumber);
    final last4 = lastDigits(digits);
    if (_c.banks.any((b) => b.ifsc == ifsc && b.last4 == last4)) {
      throw const FieldValidationFailure({'accountNumber': 'duplicate'});
    }

    requireStepUp(_w, stepUpToken, StepUpPurpose.addBankAccount);

    // The bank check ("penny drop") takes a moment.
    await _w.pause();

    final draft = BankAccount(
      id: _c.nextId('bank'),
      holderName: input.holderName.trim().replaceAll(RegExp(r'\s+'), ' '),
      // Masked on arrival: the full number is dropped here and never returned.
      maskedAccountNumber: maskAccountNumber(digits),
      last4: last4,
      ifsc: ifsc,
      bankName: branch.bankName,
      branch: '${branch.branch}, ${branch.city}',
      type: input.type,
      status: BankVerificationStatus.verifying,
      addedAt: _w.now(),
      isPrimary: _c.banks.isEmpty,
    );
    final account = _c.resolveBank(draft);
    _c.banks.add(account);
    _afterAccountChange();
    return account;
  }

  @override
  Future<List<BankAccount>> setPrimary(
    String accountId, {
    required String stepUpToken,
  }) async {
    await _w.pause();
    final i = _c.banks.indexWhere((b) => b.id == accountId);
    if (i < 0) throw const NotFoundFailure('Bank account not found');
    requireStepUp(_w, stepUpToken, StepUpPurpose.changeBankAccount);
    for (var k = 0; k < _c.banks.length; k++) {
      _c.banks[k] = _c.banks[k].copyWith(isPrimary: k == i);
    }
    _afterAccountChange();
    return List.unmodifiable(_c.banks);
  }

  @override
  Future<List<BankAccount>> removeAccount(
    String accountId, {
    required String stepUpToken,
  }) async {
    await _w.pause();
    final i = _c.banks.indexWhere((b) => b.id == accountId);
    if (i < 0) throw const NotFoundFailure('Bank account not found');
    requireStepUp(_w, stepUpToken, StepUpPurpose.removeBankAccount);
    final removed = _c.banks.removeAt(i);
    if (removed.isPrimary && _c.banks.isNotEmpty) {
      _c.banks[0] = _c.banks[0].copyWith(isPrimary: true);
    }
    _afterAccountChange();
    return List.unmodifiable(_c.banks);
  }

  /// Every payout-account change alerts the owner and (if configured) pauses
  /// payouts for a while, so a hijacked session can't quietly redirect money.
  void _afterAccountChange() {
    _c.startAccountHold();
    _w.security.raise(SecurityEventType.payoutAccountChanged);
  }
}

// ------------------------------------------------------------------ payouts --

class MockPayoutRepository implements PayoutRepository {
  MockPayoutRepository(this._w);

  final MockWorld _w;
  MockCreatorState get _c => _w.creator;

  PayoutEligibility _eligibility() {
    return PayoutRules.evaluate(
      kyc: _c.kycStatus,
      accounts: _c.banks,
      available: _c.available,
      config: _c.payoutConfig,
      now: _w.now(),
      holdUntil: _c.payoutHoldUntil,
    );
  }

  @override
  Future<PayoutOverview> getOverview() async {
    await _w.pause();
    _c.syncKyc();
    _c.syncPayouts();
    final open = _c.payouts.where((p) => p.status.isOpen).firstOrNull;
    return PayoutOverview(
      available: _c.available,
      pending: _c.pending,
      paid: _c.paid,
      eligibility: _eligibility(),
      config: _c.payoutConfig,
      kycStatus: _c.kycStatus,
      bankAccounts: List.unmodifiable(_c.banks),
      openPayout: open,
    );
  }

  @override
  Future<List<PayoutRequest>> getHistory() async {
    await _w.pause();
    _c.syncPayouts();
    return [..._c.payouts]
      ..sort((a, b) => b.requestedAt.compareTo(a.requestedAt));
  }

  @override
  Future<PayoutRequest> requestPayout({
    required int amount,
    required String accountId,
    String? stepUpToken,
  }) async {
    await _w.pause();
    _c.syncKyc();
    _c.syncPayouts();

    final account = _c.banks.where((b) => b.id == accountId).firstOrNull;
    if (account == null) throw const ValidationFailure('noBankAccount');

    final eligibility = _eligibility();
    if (!eligibility.isMet(EligibilityCheck.noActiveHold)) {
      throw const ValidationFailure('onHold');
    }
    if (!eligibility.isMet(EligibilityCheck.identityVerified) ||
        !account.status.isVerified ||
        !eligibility.isMet(EligibilityCheck.goodStanding)) {
      throw const ValidationFailure('notEligible');
    }
    final issue = PayoutRules.checkAmount(
      amount,
      available: _c.available,
      config: _c.payoutConfig,
    );
    if (issue != null) throw ValidationFailure(issue.name);

    if (PayoutRules.needsStepUp(amount, _c.payoutConfig)) {
      requireStepUp(_w, stepUpToken, StepUpPurpose.requestPayout);
    }

    final now = _w.now();
    final (from, to) = PayoutRules.estimateArrival(now, _c.payoutConfig);
    final request = PayoutRequest(
      id: _c.nextId('po'),
      amount: amount,
      status: PayoutStatus.requested,
      requestedAt: now,
      estimatedFrom: from,
      estimatedTo: to,
      bankLabel: _bankLabel(account),
      reference: 'BLK${100000 + _c.payouts.length * 7 + 1}',
    );
    _c.available -= amount;
    _c.planPayout(request.id);
    _c.payouts.insert(0, request);
    return request;
  }
}

// --------------------------------------------------------------------- tax --

class MockTaxRepository implements TaxRepository {
  MockTaxRepository(this._w);

  final MockWorld _w;

  static final _pan = RegExp(r'^[A-Z]{5}\d{4}[A-Z]$');

  @override
  Future<TaxInfo> getTaxInfo() async {
    await _w.pause();
    final c = _w.creator..syncPayouts();

    // What the provider has issued so far: one statement per completed
    // payout, and a withholding certificate for the quarter (issued after the
    // quarter ends, where one applies). No amounts are worked out here.
    final done = c.payouts.where((p) => p.status == PayoutStatus.completed);
    final docs = <TaxDocument>[
      for (final p in done)
        TaxDocument(
          id: 'stmt~${p.id}',
          kind: TaxDocumentKind.payoutStatement,
          period: p.completedAt ?? p.requestedAt,
          status: TaxDocumentStatus.available,
        ),
      if (done.isNotEmpty)
        TaxDocument(
          id: 'cert~${_w.now().year}q${(_w.now().month - 1) ~/ 3 + 1}',
          kind: TaxDocumentKind.withholdingCertificate,
          period: _w.now(),
          status: TaxDocumentStatus.issuedLater,
        ),
    ];
    return c.tax.copyWith(accountType: c.kyc.subject, documents: docs);
  }

  @override
  Future<TaxInfo> saveTaxInfo({
    required String pan,
    required String stepUpToken,
  }) async {
    await _w.pause();
    final v = pan.replaceAll(RegExp(r'\s'), '').toUpperCase();
    if (!_pan.hasMatch(v)) {
      throw const FieldValidationFailure({'pan': 'invalid'});
    }
    requireStepUp(_w, stepUpToken, StepUpPurpose.updateTaxInfo);
    _w.creator.tax = TaxInfo(
      status: TaxInfoStatus.provided,
      maskedPan: maskIdNumber(v),
      updatedAt: _w.now(),
    );
    _w.security.raise(SecurityEventType.identityDetailsChanged);
    return getTaxInfo();
  }
}
