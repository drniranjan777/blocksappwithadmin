import 'package:blocks_app/core/utils/id_mask.dart';
import 'package:blocks_app/data/mock/mock_creator_state.dart';
import 'package:blocks_app/data/mock/mock_name_matcher.dart';
import 'package:blocks_app/data/models/kyc_models.dart';
import 'package:blocks_app/data/models/payout_models.dart';
import 'package:blocks_app/features/kyc/domain/kyc_form_validator.dart';
import 'package:blocks_app/features/payout/domain/bank_validator.dart';
import 'package:blocks_app/features/payout/domain/payout_rules.dart';
import 'package:flutter_test/flutter_test.dart';

BankAccountInput bank({
  String holder = 'Aarav Kumar',
  String account = '123456784821',
  String? confirm,
  String ifsc = 'HDFC0001234',
}) => BankAccountInput(
  holderName: holder,
  accountNumber: account,
  confirmAccountNumber: confirm ?? account,
  ifsc: ifsc,
);

BankAccount account({
  BankVerificationStatus status = BankVerificationStatus.verified,
}) => BankAccount(
  id: 'b1',
  holderName: 'Aarav Kumar',
  maskedAccountNumber: 'XXXXXXXX4821',
  last4: '4821',
  ifsc: 'HDFC0001234',
  bankName: 'HDFC Bank',
  type: BankAccountType.savings,
  status: status,
  addedAt: DateTime(2026, 10, 1),
);

const _file = KycFile(name: 'pan.jpg', sizeBytes: 800 * 1024);

void main() {
  group('masking', () {
    test('a 12-digit ID is grouped: XXXX XXXX 4821', () {
      expect(maskIdNumber('2345 6789 4821'), 'XXXX XXXX 4821');
      expect(maskIdNumber('234567894821'), 'XXXX XXXX 4821');
    });

    test('other IDs keep their length and the last four characters', () {
      expect(maskIdNumber('ABCDE1234F'), 'XXXXXX234F');
      expect(maskIdNumber('a1234567'), 'XXXX4567');
    });

    test('nothing readable is left apart from the last four', () {
      final masked = maskIdNumber('234567894821');
      expect(masked.replaceAll(RegExp(r'[X\s]'), ''), '4821');
    });

    test('short and empty values', () {
      expect(maskIdNumber(''), '');
      expect(maskIdNumber('123'), 'XXX');
    });

    test('bank account numbers and last digits', () {
      expect(maskAccountNumber('123456784821'), 'XXXXXXXX4821');
      expect(maskAccountNumber(''), '');
      expect(lastDigits('1234 5678 4821'), '4821');
      expect(lastDigits('12'), '12');
    });
  });

  group('name matching (server-side)', () {
    test('same name, any order, case, punctuation or honorific', () {
      expect(NameMatcher.matches('Aarav Kumar', 'aarav kumar'), isTrue);
      expect(NameMatcher.matches('Kumar Aarav', 'Aarav Kumar'), isTrue);
      expect(NameMatcher.matches('Mr. Aarav Kumar', 'Aarav Kumar'), isTrue);
      expect(NameMatcher.matches('Smt Lakshmi Devi', 'Lakshmi Devi'), isTrue);
      expect(NameMatcher.matches('AARAV  KUMAR', 'Aarav Kumar'), isTrue);
    });

    test('initials are accepted when a whole word also matches', () {
      expect(NameMatcher.matches('Aarav K', 'Aarav Kumar'), isTrue);
      expect(NameMatcher.matches('A Kumar', 'Aarav Kumar'), isTrue);
    });

    test('different people do not match', () {
      expect(NameMatcher.matches('Rohit Sharma', 'Aarav Kumar'), isFalse);
      expect(NameMatcher.matches('Aarav Reddy', 'Aarav Kumar'), isFalse);
    });

    test('a single word is never enough', () {
      expect(NameMatcher.matches('Kumar', 'Aarav Kumar'), isFalse);
      expect(NameMatcher.matches('Aarav', 'Aarav Kumar'), isFalse);
    });

    test('empty never matches', () {
      expect(NameMatcher.matches('', 'Aarav Kumar'), isFalse);
      expect(NameMatcher.matches('Mr', 'Aarav Kumar'), isFalse);
    });

    test('works for names written in Indian scripts', () {
      expect(NameMatcher.matches('आरव कुमार', 'कुमार आरव'), isTrue);
      expect(NameMatcher.matches('ఆరవ్ కుమార్', 'ఆరవ్ కుమార్'), isTrue);
    });
  });

  group('bank form validation', () {
    test('a good form has no errors', () {
      expect(BankAccountValidator.validate(bank()), isEmpty);
    });

    test('holder name', () {
      expect(
        BankAccountValidator.validate(bank(holder: ''))[BankField.holderName],
        BankFieldError.required,
      );
      expect(
        BankAccountValidator.validate(
          bank(holder: '1234'),
        )[BankField.holderName],
        BankFieldError.invalid,
      );
      expect(
        BankAccountValidator.validate(bank(holder: "Anil D'Souza-Rao"))
            .containsKey(BankField.holderName),
        isFalse,
      );
    });

    test('account number: 9-18 digits, not one repeated digit', () {
      for (final bad in [
        '12345678',
        '1234567890123456789',
        '111111111',
        'abc123456789',
        '12-34x56789',
      ]) {
        expect(
          BankAccountValidator.validate(
            bank(account: bad, confirm: bad),
          )[BankField.accountNumber],
          BankFieldError.invalid,
          reason: bad,
        );
      }
      for (final good in [
        '123456789',
        '123456784821',
        '1234 5678 4821',
        '123456789012345678',
      ]) {
        expect(
          BankAccountValidator.validate(bank(account: good, confirm: good))
              .containsKey(BankField.accountNumber),
          isFalse,
          reason: good,
        );
      }
    });

    test('confirmation must match', () {
      final e = BankAccountValidator.validate(bank(confirm: '123456784822'));
      expect(e[BankField.confirmAccountNumber], BankFieldError.mismatch);
      expect(
        BankAccountValidator.validate(
          bank(confirm: ''),
        )[BankField.confirmAccountNumber],
        BankFieldError.required,
      );
    });

    test('IFSC: 4 letters, a zero, 6 letters or digits (case-insensitive)', () {
      expect(BankAccountValidator.isValidIfsc('HDFC0001234'), isTrue);
      expect(BankAccountValidator.isValidIfsc('hdfc0001234'), isTrue);
      expect(BankAccountValidator.isValidIfsc(' hdfc 0001234 '), isTrue);
      for (final bad in [
        'HDFC1001234',
        'HDF00001234',
        'HDFC000123',
        'HDFC00012345',
        '',
      ]) {
        expect(BankAccountValidator.isValidIfsc(bad), isFalse, reason: bad);
      }
      expect(
        BankAccountValidator.validate(bank(ifsc: 'NOPE'))[BankField.ifsc],
        BankFieldError.invalid,
      );
    });

    test('the raw account number never appears in toString', () {
      expect(bank().toString(), isNot(contains('123456784821')));
    });
  });

  group('payout eligibility', () {
    const config = PayoutConfig.demo();
    final now = DateTime(2026, 10, 9, 12);

    PayoutEligibility eval({
      KycStatus kyc = KycStatus.verified,
      List<BankAccount>? accounts,
      int available = 12420,
      DateTime? hold,
      bool good = true,
    }) => PayoutRules.evaluate(
      kyc: kyc,
      accounts: accounts ?? [account()],
      available: available,
      config: config,
      now: now,
      holdUntil: hold,
      goodStanding: good,
    );

    test('all five checks met -> eligible', () {
      final e = eval();
      expect(e.isEligible, isTrue);
      expect(e.metCount, 5);
    });

    test('each requirement can block on its own', () {
      expect(eval(kyc: KycStatus.pending).isEligible, isFalse);
      expect(
        eval(kyc: KycStatus.pending).isMet(EligibilityCheck.identityVerified),
        isFalse,
      );
      expect(eval(accounts: []).isMet(EligibilityCheck.bankVerified), isFalse);
      expect(
        eval(accounts: [account(status: BankVerificationStatus.nameMismatch)])
            .isMet(EligibilityCheck.bankVerified),
        isFalse,
      );
      expect(
        eval(available: 999).isMet(EligibilityCheck.minimumBalance),
        isFalse,
      );
      expect(
        eval(available: 1000).isMet(EligibilityCheck.minimumBalance),
        isTrue,
      );
      expect(eval(good: false).isMet(EligibilityCheck.goodStanding), isFalse);
    });

    test('a hold blocks until it ends, then lifts by itself', () {
      final held = eval(hold: now.add(const Duration(hours: 2)));
      expect(held.isMet(EligibilityCheck.noActiveHold), isFalse);
      expect(held.holdUntil, now.add(const Duration(hours: 2)));
      final over = eval(hold: now.subtract(const Duration(minutes: 1)));
      expect(over.isMet(EligibilityCheck.noActiveHold), isTrue);
      expect(over.holdUntil, isNull);
    });

    test('expired / rejected / action-required identity do not qualify', () {
      for (final k in [
        KycStatus.expired,
        KycStatus.rejected,
        KycStatus.actionRequired,
        KycStatus.notStarted,
        KycStatus.underReview,
      ]) {
        expect(eval(kyc: k).isEligible, isFalse, reason: '$k');
      }
    });

    test('the minimum comes from configuration, not code', () {
      final strict = config.copyWith(minimumAmount: 5000);
      final e = PayoutRules.evaluate(
        kyc: KycStatus.verified,
        accounts: [account()],
        available: 3000,
        config: strict,
        now: now,
      );
      expect(e.isMet(EligibilityCheck.minimumBalance), isFalse);
    });
  });

  group('payout amount rules', () {
    const config = PayoutConfig.demo();

    test('minimum is inclusive; cannot exceed what is available', () {
      expect(
        PayoutRules.checkAmount(999, available: 12420, config: config),
        PayoutAmountIssue.belowMinimum,
      );
      expect(
        PayoutRules.checkAmount(1000, available: 12420, config: config),
        isNull,
      );
      expect(
        PayoutRules.checkAmount(12420, available: 12420, config: config),
        isNull,
      );
      expect(
        PayoutRules.checkAmount(12421, available: 12420, config: config),
        PayoutAmountIssue.exceedsAvailable,
      );
      expect(
        PayoutRules.checkAmount(0, available: 12420, config: config),
        PayoutAmountIssue.belowMinimum,
      );
    });

    test('large payouts need a stronger confirmation', () {
      expect(PayoutRules.needsStepUp(24999, config), isFalse);
      expect(PayoutRules.needsStepUp(25000, config), isTrue);
      expect(
        PayoutRules.needsStepUp(5000, config.copyWith(stepUpAmount: 5000)),
        isTrue,
      );
    });

    test('business days skip the weekend', () {
      // Friday 9 Oct 2026 + 2 business days = Tuesday 13 Oct.
      final friday = DateTime(2026, 10, 9);
      expect(friday.weekday, DateTime.friday);
      expect(PayoutRules.addBusinessDays(friday, 2), DateTime(2026, 10, 13));
      // Monday + 5 = next Monday.
      final monday = DateTime(2026, 10, 12);
      expect(PayoutRules.addBusinessDays(monday, 5), DateTime(2026, 10, 19));
      expect(PayoutRules.addBusinessDays(friday, 0), friday);
    });

    test('the arrival window follows the configured range', () {
      final friday = DateTime(2026, 10, 9);
      final (from, to) = PayoutRules.estimateArrival(friday, config);
      expect(from, DateTime(2026, 10, 13));
      expect(to, DateTime(2026, 10, 16));
      final fast = config.copyWith(estimatedDaysMin: 1, estimatedDaysMax: 1);
      final (a, b) = PayoutRules.estimateArrival(friday, fast);
      expect(a, DateTime(2026, 10, 12));
      expect(b, DateTime(2026, 10, 12));
    });
  });

  group('KYC form validation', () {
    const cfg = defaultKycConfig;

    KycDocumentInput doc(
      String type,
      String number, {
      KycFile? back,
      KycFile file = _file,
    }) => KycDocumentInput(
      typeId: type,
      number: number,
      file: file,
      backFile: back,
    );

    final today = DateTime(2026, 10, 9);

    Map<String, String> check(
      KycSubject subject,
      List<KycDocumentInput> docs, {
      String name = 'Aarav Kumar',
      String business = '',
      DateTime? dob,
      bool skipDob = false,
      String businessType = 'private',
      KycConfig? config,
    }) => KycFormValidator.validate(
      subject: subject,
      legalName: name,
      businessName: business,
      documents: docs,
      config: config ?? cfg,
      now: today,
      dateOfBirth: skipDob ? null : (dob ?? DateTime(1992, 4, 12)),
      businessType: businessType,
    );

    test('an individual with a valid PAN passes', () {
      expect(check(KycSubject.individual, [doc('pan', 'ABCDE1234F')]), isEmpty);
    });

    test('accepted documents come from configuration', () {
      expect(check(KycSubject.individual, [doc('gst', '36ABCDE1234F1Z5')]), {
        'document': 'unsupported',
      });
      final onlyPan = KycConfig(
        individualDocuments: [
          cfg.individualDocuments.firstWhere((d) => d.id == 'pan'),
        ],
        businessDocuments: cfg.businessDocuments,
        signatoryDocuments: cfg.signatoryDocuments,
      );
      final errors = check(KycSubject.individual, [
        doc('passport', 'A1234567'),
      ], config: onlyPan);
      expect(errors['document'], 'unsupported');
    });

    test('Aadhaar needs 12 digits and a back side', () {
      final front = doc('aadhaar', '234567894821');
      expect(check(KycSubject.individual, [front])['file'], 'required');
      final both = doc('aadhaar', '234567894821', back: _file);
      expect(check(KycSubject.individual, [both]), isEmpty);
      expect(
        check(KycSubject.individual, [
          doc('aadhaar', '12345', back: _file),
        ])['number'],
        'invalid',
      );
      // Aadhaar numbers never start with 0 or 1.
      expect(
        check(KycSubject.individual, [
          doc('aadhaar', '134567894821', back: _file),
        ])['number'],
        'invalid',
      );
    });

    test('number formats', () {
      expect(check(KycSubject.individual, [doc('pan', 'abcde1234f')]), isEmpty);
      expect(
        check(KycSubject.individual, [doc('pan', 'ABCDE12345')])['number'],
        'invalid',
      );
      expect(
        check(KycSubject.individual, [doc('passport', 'A1234567')]),
        isEmpty,
      );
      expect(
        check(KycSubject.individual, [doc('passport', '12345678')])['number'],
        'invalid',
      );
    });

    test('name rules', () {
      expect(
        check(KycSubject.individual, [
          doc('pan', 'ABCDE1234F'),
        ], name: '')['legalName'],
        'invalid',
      );
      expect(
        check(KycSubject.individual, [
          doc('pan', 'ABCDE1234F'),
        ], name: 'A1')['legalName'],
        'invalid',
      );
      expect(
        check(KycSubject.individual, [
          doc('pan', 'ABCDE1234F'),
        ], name: 'ఆరవ్ కుమార్'),
        isEmpty,
      );
    });

    test('an individual must give a date of birth', () {
      expect(
        check(KycSubject.individual, [doc('pan', 'ABCDE1234F')], skipDob: true),
        {'dateOfBirth': 'required'},
      );
    });

    test('the minimum age is the server\'s, not the app\'s', () {
      final pan = doc('pan', 'ABCDE1234F');
      // Exactly 18 today: allowed. A day short: not.
      expect(
        check(KycSubject.individual, [pan], dob: DateTime(2008, 10, 9)),
        isEmpty,
      );
      expect(check(KycSubject.individual, [pan], dob: DateTime(2008, 10, 10)), {
        'dateOfBirth': 'underage',
      });
      // The same date passes when the server's minimum is lower.
      final lower = KycConfig(
        individualDocuments: cfg.individualDocuments,
        businessDocuments: cfg.businessDocuments,
        signatoryDocuments: cfg.signatoryDocuments,
        minimumAge: 16,
      );
      expect(
        check(
          KycSubject.individual,
          [pan],
          dob: DateTime(2008, 10, 10),
          config: lower,
        ),
        isEmpty,
      );
    });

    test('a date of birth in the future or absurdly old is invalid', () {
      final pan = doc('pan', 'ABCDE1234F');
      expect(check(KycSubject.individual, [pan], dob: DateTime(2027, 1, 1)), {
        'dateOfBirth': 'invalid',
      });
      expect(check(KycSubject.individual, [pan], dob: DateTime(1890, 1, 1)), {
        'dateOfBirth': 'invalid',
      });
    });

    test('age counts whole years, birthday included', () {
      expect(
        KycFormValidator.ageOn(DateTime(2000, 6, 15), DateTime(2026, 6, 14)),
        25,
      );
      expect(
        KycFormValidator.ageOn(DateTime(2000, 6, 15), DateTime(2026, 6, 15)),
        26,
      );
      expect(
        KycFormValidator.ageOn(DateTime(2000, 12, 31), DateTime(2026, 1, 1)),
        25,
      );
    });

    test('a business has no date of birth, but does need a business type', () {
      final gst = doc('gst', '36ABCDE1234F1Z5');
      final signer = doc('pan', 'ABCDE1234F');
      expect(
        check(
          KycSubject.business,
          [gst, signer],
          business: 'Hyderabad Foods',
          skipDob: true,
        ),
        isEmpty,
      );
      expect(
        check(
          KycSubject.business,
          [gst, signer],
          business: 'Hyderabad Foods',
          businessType: '',
        ),
        {'businessType': 'required'},
      );
      expect(
        check(
          KycSubject.business,
          [gst, signer],
          business: 'Hyderabad Foods',
          businessType: 'not-a-type',
        ),
        {'businessType': 'required'},
      );
    });

    test('the business types are configuration', () {
      expect(cfg.businessTypes.map((t) => t.id), contains('private'));
      expect(cfg.businessTypeById('llp')?.label, isNotEmpty);
      expect(cfg.businessTypeById('nope'), isNull);
      // A provider that does not ask for a type is not forced to.
      final none = KycConfig(
        individualDocuments: cfg.individualDocuments,
        businessDocuments: cfg.businessDocuments,
        signatoryDocuments: cfg.signatoryDocuments,
      );
      expect(
        check(
          KycSubject.business,
          [doc('gst', '36ABCDE1234F1Z5'), doc('pan', 'ABCDE1234F')],
          business: 'Hyderabad Foods',
          businessType: '',
          config: none,
        ),
        isEmpty,
      );
    });

    test('file type and size limits', () {
      const big = KycFile(name: 'scan.pdf', sizeBytes: 9 * 1024 * 1024);
      const odd = KycFile(name: 'scan.exe', sizeBytes: 1000);
      const empty = KycFile(name: 'scan.jpg', sizeBytes: 0);
      expect(
        check(KycSubject.individual, [
          doc('pan', 'ABCDE1234F', file: big),
        ])['file'],
        'tooLarge',
      );
      expect(
        check(KycSubject.individual, [
          doc('pan', 'ABCDE1234F', file: odd),
        ])['file'],
        'unsupported',
      );
      expect(
        check(KycSubject.individual, [
          doc('pan', 'ABCDE1234F', file: empty),
        ])['file'],
        'unsupported',
      );
      expect(KycFormValidator.checkFile(null, cfg), 'required');
    });

    test(
      'a business needs its name, a registration document and a signatory',
      () {
        final gst = doc('gst', '36ABCDE1234F1Z5');
        final signer = doc('pan', 'ABCDE1234F');
        expect(
          check(KycSubject.business, [
            gst,
            signer,
          ], business: 'Hyderabad Foods'),
          isEmpty,
        );
        expect(
          check(KycSubject.business, [gst, signer])['businessName'],
          'required',
        );
        expect(
          check(KycSubject.business, [
            gst,
          ], business: 'Hyderabad Foods')['document'],
          'required',
        );
        // The signatory cannot be a registration document.
        expect(
          check(KycSubject.business, [
            gst,
            doc('gst', '36ABCDE1234F1Z5'),
          ], business: 'X Foods')['document'],
          'unsupported',
        );
      },
    );
  });

  group('KYC status presentation', () {
    test('internal states collapse to what the creator is told', () {
      expect(KycStatus.underReview.summary, KycStatus.pending);
      expect(KycStatus.expired.summary, KycStatus.actionRequired);
      expect(KycStatus.verified.summary, KycStatus.verified);
      expect(KycStatus.rejected.summary, KycStatus.rejected);
    });

    test('only unfinished or failed states can (re)submit', () {
      for (final s in KycStatus.values) {
        final can = switch (s) {
          KycStatus.notStarted ||
          KycStatus.rejected ||
          KycStatus.actionRequired ||
          KycStatus.expired => true,
          _ => false,
        };
        expect(s.canSubmit, can, reason: '$s');
      }
    });

    test('input objects never print the secret', () {
      const input = KycDocumentInput(
        typeId: 'pan',
        number: 'ABCDE1234F',
        file: _file,
      );
      expect(input.toString(), isNot(contains('ABCDE1234F')));
      const submission = KycSubmission(
        subject: KycSubject.individual,
        legalName: 'Aarav Kumar',
        documents: [input],
      );
      expect(submission.toString(), isNot(contains('ABCDE1234F')));
      expect(submission.toString(), isNot(contains('Aarav')));
    });
  });
}
