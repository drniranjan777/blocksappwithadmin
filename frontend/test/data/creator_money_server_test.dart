import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/mock/demo_credentials.dart';
import 'package:blocks_app/data/mock/mock_creator_demo_service.dart';
import 'package:blocks_app/data/models/kyc_models.dart';
import 'package:blocks_app/data/models/payout_models.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/data/services/creator_demo_service.dart';
import 'package:blocks_app/features/reach/domain/reach_level.dart';
import 'package:flutter_test/flutter_test.dart';

import '../helpers/creator_server.dart';

Matcher _validation(String message) =>
    isA<ValidationFailure>().having((f) => f.message, 'message', message);

Matcher _fields(Map<String, String> errors) =>
    isA<FieldValidationFailure>().having((f) => f.errors, 'errors', errors);

void main() {
  late CreatorServer s;
  setUp(() => s = CreatorServer());

  group('server configuration', () {
    test('limits and rules come from the server, not the UI', () async {
      final reel = await s.config.getReelConfig();
      expect(reel.maxDurationSeconds, 180);
      expect(reel.selectableDurations, [15, 30, 60, 90, 180]);
      final payout = await s.config.getPayoutConfig();
      expect(payout.minimumAmount, 1000);
      expect(payout.estimatedDaysMin, 2);
      expect(payout.estimatedDaysMax, 5);
      final kyc = await s.config.getKycConfig();
      expect(
        kyc.individualDocuments.map((d) => d.id),
        containsAll(['aadhaar', 'pan', 'passport']),
      );
      expect(
        kyc.businessDocuments.map((d) => d.id),
        containsAll(['gst', 'udyam']),
      );
    });

    test(
      'changing server config changes behaviour with no app change',
      () async {
        s.world.creator.payoutConfig = s.world.creator.payoutConfig.copyWith(
          minimumAmount: 20000,
        );
        await s.verifyIdentity();
        final b = await s.addBank();
        await expectLater(
          s.payout.requestPayout(amount: 5000, accountId: b.id),
          throwsA(_validation('belowMinimum')),
        );
      },
    );
  });

  group('KYC', () {
    test('starts with nothing submitted', () async {
      final k = await s.kyc.getApplication();
      expect(k.status, KycStatus.notStarted);
      expect(k.documents, isEmpty);
    });

    test(
      'an individual submits; the server keeps only the masked number',
      () async {
        final k = await s.submitKyc(number: 'ABCDE1234F');
        expect(k.status, KycStatus.pending);
        expect(k.subject, KycSubject.individual);
        expect(k.legalName, 'Aarav Kumar');
        expect(k.documents.single.maskedNumber, 'XXXXXX234F');
        expect(k.documents.single.label, 'PAN card');
        expect(k.documents.single.fileName, 'pan.jpg');

        // The raw number is nowhere in what the app (or server state) holds.
        expect('${k.props}', isNot(contains('ABCDE1234F')));
        expect('${s.world.creator.kyc.props}', isNot(contains('ABCDE1234F')));
      },
    );

    test('an Aadhaar number is shown as XXXX XXXX 4821', () async {
      final k = await s.kyc.submit(
        KycSubmission(
          subject: KycSubject.individual,
          legalName: 'Aarav Kumar',
          dateOfBirth: DateTime(1992, 4, 12),
          documents: const [
            KycDocumentInput(
              typeId: 'aadhaar',
              number: '2345 6789 4821',
              file: KycFile(name: 'front.jpg', sizeBytes: 1000),
              backFile: KycFile(name: 'back.jpg', sizeBytes: 1000),
            ),
          ],
        ),
      );
      expect(k.documents.single.maskedNumber, 'XXXX XXXX 4821');
      expect('${k.props}', isNot(contains('234567894821')));
    });

    test(
      'the review moves with time: pending -> under review -> verified',
      () async {
        await s.submitKyc();
        expect((await s.kyc.getApplication()).status, KycStatus.pending);
        s.advance(const Duration(seconds: 3));
        expect((await s.kyc.getApplication()).status, KycStatus.underReview);
        s.advance(const Duration(seconds: 4));
        final done = await s.kyc.getApplication();
        expect(done.status, KycStatus.verified);
        expect(done.reviewedAt, isNotNull);
        expect(done.expiresAt, isNotNull);
        expect(done.documents.single.state, KycDocumentState.accepted);
      },
    );

    test('nothing the app does can make a creator verified early', () async {
      await s.submitKyc();
      for (var i = 0; i < 20; i++) {
        expect((await s.kyc.getApplication()).status.isVerified, isFalse);
      }
    });

    test('a rejected review says why and lets the creator try again', () async {
      s.world.creator.kycOutcome = DemoKycOutcome.rejected;
      await s.submitKyc();
      s.advance(const Duration(seconds: 7));
      final k = await s.kyc.getApplication();
      expect(k.status, KycStatus.rejected);
      expect(k.reasonCode, 'mismatch');
      expect(k.documents.single.state, KycDocumentState.rejected);

      s.world.creator.kycOutcome = DemoKycOutcome.verified;
      final again = await s.submitKyc();
      expect(again.status, KycStatus.pending);
      s.advance(const Duration(seconds: 7));
      expect((await s.kyc.getApplication()).status, KycStatus.verified);
    });

    test('"action required" asks for a better document', () async {
      s.world.creator.kycOutcome = DemoKycOutcome.actionRequired;
      await s.submitKyc();
      s.advance(const Duration(seconds: 7));
      final k = await s.kyc.getApplication();
      expect(k.status, KycStatus.actionRequired);
      expect(k.reasonCode, 'unreadable');
      expect(k.status.canSubmit, isTrue);
    });

    test('cannot submit again while one is in progress or verified', () async {
      await s.submitKyc();
      await expectLater(
        s.submitKyc(),
        throwsA(_validation('alreadySubmitted')),
      );
      s.advance(const Duration(seconds: 7));
      await expectLater(
        s.submitKyc(),
        throwsA(_validation('alreadySubmitted')),
      );
    });

    test('a verification expires after its validity period', () async {
      await s.verifyIdentity();
      expect((await s.kyc.getApplication()).status, KycStatus.verified);
      s.advance(s.world.creator.kycConfig.validity + const Duration(days: 1));
      expect((await s.kyc.getApplication()).status, KycStatus.expired);
    });

    test('the server refuses bad forms with field-level reasons', () async {
      await expectLater(
        s.kyc.submit(
          KycSubmission(
            subject: KycSubject.individual,
            legalName: 'Aarav Kumar',
            dateOfBirth: DateTime(1992, 4, 12),
            documents: [s.panDoc('NOT-A-PAN')],
          ),
        ),
        throwsA(_fields({'number': 'invalid'})),
      );
      await expectLater(
        s.kyc.submit(
          KycSubmission(
            subject: KycSubject.individual,
            legalName: '',
            dateOfBirth: DateTime(1992, 4, 12),
            documents: [s.panDoc()],
          ),
        ),
        throwsA(_fields({'legalName': 'invalid'})),
      );
      // Date of birth is checked by the server too.
      await expectLater(
        s.kyc.submit(
          KycSubmission(
            subject: KycSubject.individual,
            legalName: 'Aarav Kumar',
            documents: [s.panDoc()],
          ),
        ),
        throwsA(_fields({'dateOfBirth': 'required'})),
      );
      await expectLater(
        s.kyc.submit(
          KycSubmission(
            subject: KycSubject.individual,
            legalName: 'Aarav Kumar',
            // 17 years old on the demo date, 18 is the server's minimum.
            dateOfBirth: DateTime(2009, 10, 10),
            documents: [s.panDoc()],
          ),
        ),
        throwsA(_fields({'dateOfBirth': 'underage'})),
      );
      expect((await s.kyc.getApplication()).status, KycStatus.notStarted);
    });

    test(
      'a business submits a registration document and a signatory',
      () async {
        final k = await s.kyc.submit(
          KycSubmission(
            subject: KycSubject.business,
            legalName: 'Aarav Kumar',
            businessName: 'Hyderabad Foods LLP',
            businessType: 'llp',
            documents: [
              const KycDocumentInput(
                typeId: 'gst',
                number: '36ABCDE1234F1Z5',
                file: KycFile(name: 'gst.pdf', sizeBytes: 90000),
              ),
              s.panDoc(),
            ],
          ),
        );
        expect(k.subject, KycSubject.business);
        expect(k.businessName, 'Hyderabad Foods LLP');
        // Stored as the server names it, not the id the app sent.
        expect(k.businessType, 'Limited liability partnership');
        expect(k.documents.map((d) => d.typeId), ['gst', 'pan']);
        // 15 characters: all but the last four are hidden.
        expect(k.documents.first.maskedNumber, 'XXXXXXXXXXXF1Z5');
        s.advance(const Duration(seconds: 7));
        expect((await s.kyc.getApplication()).status, KycStatus.verified);
      },
    );

    test('submitting raises a security event but never the document', () async {
      await s.submitKyc();
      final e = s.world.security.events.first;
      expect(e.type, SecurityEventType.identityDetailsChanged);
    });
  });

  group('step-up confirmation', () {
    test('needs the right password', () async {
      await expectLater(
        s.stepUp.begin(StepUpPurpose.addBankAccount, password: 'wrong'),
        throwsA(_validation('wrongPassword')),
      );
    });

    test('with two-factor on, the code goes to the phone', () async {
      final c = await s.stepUp.begin(
        StepUpPurpose.addBankAccount,
        password: DemoCredentials.password,
      );
      expect(c.channel, OtpChannel.phone);
      expect(c.maskedDestination, isNot(contains('9876543210')));
    });

    test('without two-factor, the code goes to the e-mail', () async {
      s.world.security.twoFactor = const TwoFactorSettings(enabled: false);
      final c = await s.stepUp.begin(
        StepUpPurpose.addBankAccount,
        password: DemoCredentials.password,
      );
      expect(c.channel, OtpChannel.email);
    });

    test('a wrong code is counted; the right one gives a token', () async {
      final c = await s.stepUp.begin(
        StepUpPurpose.requestPayout,
        password: DemoCredentials.password,
      );
      final bad = await s.stepUp.verify(challengeId: c.id, code: '000000');
      expect(bad, isA<OtpIncorrect>());
      final good = await s.stepUp.verify(
        challengeId: c.id,
        code: DemoCredentials.otp,
      );
      expect(good, isA<OtpVerified>());
    });

    test('a token only works for the action it was issued for, once', () async {
      final forAdd = await s.token(StepUpPurpose.addBankAccount);
      // Wrong purpose.
      await s.verifyIdentity();
      final b = await s.addBank();
      await expectLater(
        s.bank.removeAccount(b.id, stepUpToken: forAdd),
        throwsA(isA<UnauthorizedFailure>()),
      );
      // Spent.
      final token = await s.token(StepUpPurpose.addBankAccount);
      await s.addBank(account: '987654321012', stepUpToken: token);
      await expectLater(
        s.addBank(account: '555566667777', stepUpToken: token),
        throwsA(isA<UnauthorizedFailure>()),
      );
    });
  });

  group('bank accounts', () {
    test('adding needs the step-up token', () async {
      await expectLater(
        s.bank.addAccount(
          const BankAccountInput(
            holderName: 'Aarav Kumar',
            accountNumber: '123456784821',
            confirmAccountNumber: '123456784821',
            ifsc: 'HDFC0001234',
          ),
          stepUpToken: '',
        ),
        throwsA(isA<UnauthorizedFailure>()),
      );
      await expectLater(
        s.bank.addAccount(
          const BankAccountInput(
            holderName: 'Aarav Kumar',
            accountNumber: '123456784821',
            confirmAccountNumber: '123456784821',
            ifsc: 'HDFC0001234',
          ),
          stepUpToken: 'forged',
        ),
        throwsA(isA<UnauthorizedFailure>()),
      );
      expect(await s.bank.getAccounts(), isEmpty);
    });

    test('the server returns only a masked number and the bank name', () async {
      await s.verifyIdentity();
      final b = await s.addBank();
      expect(b.maskedAccountNumber, 'XXXXXXXX4821');
      expect(b.last4, '4821');
      expect(b.bankName, 'HDFC Bank');
      expect(b.branch, isNotEmpty);
      expect(b.isPrimary, isTrue);
      expect('${b.props}', isNot(contains('123456784821')));
      final listed = (await s.bank.getAccounts()).single;
      expect('${listed.props}', isNot(contains('123456784821')));
    });

    test(
      'with identity verified, a matching name is verified at once',
      () async {
        await s.verifyIdentity();
        final b = await s.addBank(holder: 'Aarav Kumar');
        expect(b.status, BankVerificationStatus.verified);
        expect(b.verifiedAt, isNotNull);
      },
    );

    test('a name that does not match the identity is flagged', () async {
      await s.verifyIdentity();
      final b = await s.addBank(holder: 'Rohit Sharma');
      expect(b.status, BankVerificationStatus.nameMismatch);
      expect(b.failureReason, 'nameMismatch');
      expect(b.status.needsAttention, isTrue);
    });

    test('name matching is tolerant of order, case and honorifics', () async {
      await s.verifyIdentity();
      final b = await s.addBank(holder: 'MR KUMAR AARAV');
      expect(b.status, BankVerificationStatus.verified);
    });

    test(
      'before identity is verified the account waits, then resolves',
      () async {
        final b = await s.addBank();
        expect(b.status, BankVerificationStatus.awaitingIdentity);

        await s.submitKyc();
        s.advance(const Duration(seconds: 7));
        final after = (await s.bank.getAccounts()).single;
        expect(after.status, BankVerificationStatus.verified);
      },
    );

    test(
      'a waiting account with a wrong name fails when identity arrives',
      () async {
        await s.addBank(holder: 'Rohit Sharma');
        await s.submitKyc();
        s.advance(const Duration(seconds: 7));
        expect(
          (await s.bank.getAccounts()).single.status,
          BankVerificationStatus.nameMismatch,
        );
      },
    );

    test('the server validates every field again', () async {
      await expectLater(
        s.addBank(account: '123', confirm: '123'),
        throwsA(_fields({'accountNumber': 'invalid'})),
      );
      await expectLater(
        s.addBank(confirm: '999999999999'),
        throwsA(_fields({'confirmAccountNumber': 'mismatch'})),
      );
      await expectLater(
        s.addBank(ifsc: 'BAD'),
        throwsA(_fields({'ifsc': 'invalid'})),
      );
      await expectLater(
        s.addBank(ifsc: 'ZZZZ0001234'),
        throwsA(_fields({'ifsc': 'unknown'})),
      );
      expect(await s.bank.getAccounts(), isEmpty);
    });

    test('the same account cannot be added twice', () async {
      await s.addBank();
      await expectLater(
        s.addBank(),
        throwsA(_fields({'accountNumber': 'duplicate'})),
      );
    });

    test('IFSC lookup names the bank and branch', () async {
      final b = (await s.bank.lookupIfsc('sbin0004321'))!;
      expect(b.ifsc, 'SBIN0004321');
      expect(b.bankName, 'State Bank of India');
      expect(b.branch, isNotEmpty);
      expect(await s.bank.lookupIfsc('ZZZZ0001234'), isNull);
      expect(await s.bank.lookupIfsc('bad'), isNull);
    });

    test(
      'the first account is primary; removing it promotes the next',
      () async {
        final first = await s.addBank();
        final second = await s.addBank(
          account: '987654321012',
          ifsc: 'ICIC0004567',
        );
        expect(first.isPrimary, isTrue);
        expect(second.isPrimary, isFalse);

        final afterRemove = await s.bank.removeAccount(
          first.id,
          stepUpToken: await s.token(StepUpPurpose.removeBankAccount),
        );
        expect(afterRemove.single.id, second.id);
        expect(afterRemove.single.isPrimary, isTrue);
      },
    );

    test('changing the primary account needs its own confirmation', () async {
      final first = await s.addBank();
      final second = await s.addBank(
        account: '987654321012',
        ifsc: 'ICIC0004567',
      );
      await expectLater(
        s.bank.setPrimary(
          second.id,
          stepUpToken: await s.token(StepUpPurpose.addBankAccount),
        ),
        throwsA(isA<UnauthorizedFailure>()),
      );
      final list = await s.bank.setPrimary(
        second.id,
        stepUpToken: await s.token(StepUpPurpose.changeBankAccount),
      );
      expect(list.firstWhere((b) => b.id == second.id).isPrimary, isTrue);
      expect(list.firstWhere((b) => b.id == first.id).isPrimary, isFalse);
    });

    test('every payout-account change alerts the owner', () async {
      final events = s.world.security.events;
      final mails = s.world.security.outbox;
      final b = await s.addBank();
      expect(events.first.type, SecurityEventType.payoutAccountChanged);
      expect(SecurityEventType.payoutAccountChanged.isCritical, isTrue);
      expect(mails.first.type, SecurityEventType.payoutAccountChanged);
      expect(
        s.world.security.notifications.first.title,
        'Payout Account Changed',
      );

      await s.bank.removeAccount(
        b.id,
        stepUpToken: await s.token(StepUpPurpose.removeBankAccount),
      );
      expect(
        events.where((e) => e.type == SecurityEventType.payoutAccountChanged),
        hasLength(2),
      );
    });

    test('a safety hold can pause payouts after a change', () async {
      s.world.creator.payoutConfig = s.world.creator.payoutConfig.copyWith(
        holdAfterAccountChange: const Duration(hours: 24),
      );
      await s.verifyIdentity();
      final b = await s.addBank();
      var overview = await s.payout.getOverview();
      expect(
        overview.eligibility.isMet(EligibilityCheck.noActiveHold),
        isFalse,
      );
      expect(
        overview.eligibility.holdUntil,
        s.now.add(const Duration(hours: 24)),
      );
      await expectLater(
        s.payout.requestPayout(amount: 2000, accountId: b.id),
        throwsA(_validation('onHold')),
      );

      s.advance(const Duration(hours: 25));
      overview = await s.payout.getOverview();
      expect(overview.eligibility.isEligible, isTrue);
      expect(
        (await s.payout.requestPayout(amount: 2000, accountId: b.id)).status,
        PayoutStatus.requested,
      );
    });

    test('with no hold configured, payouts are not paused', () async {
      await s.verifyIdentity();
      await s.addBank();
      expect((await s.payout.getOverview()).eligibility.isEligible, isTrue);
    });
  });

  group('payouts', () {
    test('the seeded balances and history', () async {
      final o = await s.payout.getOverview();
      expect((o.available, o.pending, o.paid), (12420, 4800, 48200));
      final h = await s.payout.getHistory();
      expect(h, isNotEmpty);
      expect(
        h.map((p) => p.status),
        containsAll([PayoutStatus.completed, PayoutStatus.failed]),
      );
      for (var i = 1; i < h.length; i++) {
        expect(h[i - 1].requestedAt.isAfter(h[i].requestedAt), isTrue);
      }
    });

    test(
      'a new creator is not yet eligible: identity and bank are missing',
      () async {
        final e = (await s.payout.getOverview()).eligibility;
        expect(e.isEligible, isFalse);
        expect(e.isMet(EligibilityCheck.identityVerified), isFalse);
        expect(e.isMet(EligibilityCheck.bankVerified), isFalse);
        expect(e.isMet(EligibilityCheck.minimumBalance), isTrue);
        expect(e.isMet(EligibilityCheck.noActiveHold), isTrue);
      },
    );

    test(
      'completing KYC and adding a bank makes the creator eligible',
      () async {
        await s.verifyIdentity();
        var e = (await s.payout.getOverview()).eligibility;
        expect(e.isMet(EligibilityCheck.identityVerified), isTrue);
        expect(e.isEligible, isFalse);
        await s.addBank();
        e = (await s.payout.getOverview()).eligibility;
        expect(e.isEligible, isTrue);
        expect(e.metCount, 5);
      },
    );

    test('requesting before eligibility is refused by the server', () async {
      await expectLater(
        s.payout.requestPayout(amount: 2000, accountId: 'nope'),
        throwsA(_validation('noBankAccount')),
      );
      final b = await s.addBank(); // identity still not verified
      await expectLater(
        s.payout.requestPayout(amount: 2000, accountId: b.id),
        throwsA(_validation('notEligible')),
      );
    });

    test('a bank account with a name mismatch cannot be paid', () async {
      await s.verifyIdentity();
      final b = await s.addBank(holder: 'Rohit Sharma');
      await expectLater(
        s.payout.requestPayout(amount: 2000, accountId: b.id),
        throwsA(_validation('notEligible')),
      );
    });

    group('with an eligible creator', () {
      late BankAccount bank;
      setUp(() async {
        await s.verifyIdentity();
        bank = await s.addBank();
      });

      test('amount rules: minimum and available', () async {
        await expectLater(
          s.payout.requestPayout(amount: 999, accountId: bank.id),
          throwsA(_validation('belowMinimum')),
        );
        await expectLater(
          s.payout.requestPayout(amount: 12421, accountId: bank.id),
          throwsA(_validation('exceedsAvailable')),
        );
      });

      test(
        'a request creates a history entry and sets the money aside',
        () async {
          final before = await s.payout.getHistory();
          final r = await s.payout.requestPayout(
            amount: 5000,
            accountId: bank.id,
          );
          expect(r.amount, 5000);
          expect(r.status, PayoutStatus.requested);
          expect(r.bankLabel, 'HDFC Bank •••• 4821');
          expect(r.reference, startsWith('BLK'));

          final after = await s.payout.getHistory();
          expect(after.length, before.length + 1);
          expect(after.first.id, r.id);
          final o = await s.payout.getOverview();
          expect(o.available, 12420 - 5000);
          expect(o.openPayout?.id, r.id);
        },
      );

      test(
        'the arrival estimate skips the weekend and follows config',
        () async {
          // The clock is Friday 12:00 -> 2..5 business days.
          final r = await s.payout.requestPayout(
            amount: 2000,
            accountId: bank.id,
          );
          expect(r.estimatedFrom.weekday, DateTime.tuesday);
          expect(r.estimatedTo.weekday, DateTime.friday);
          expect(r.estimatedTo.isAfter(r.estimatedFrom), isTrue);
        },
      );

      test('a payout moves through its states and is paid', () async {
        await s.payout.requestPayout(amount: 5000, accountId: bank.id);
        Future<PayoutStatus> latest() async =>
            (await s.payout.getHistory()).first.status;

        expect(await latest(), PayoutStatus.requested);
        s.advance(const Duration(seconds: 6));
        expect(await latest(), PayoutStatus.processing);
        s.advance(const Duration(seconds: 10));
        final done = (await s.payout.getHistory()).first;
        expect(done.status, PayoutStatus.completed);
        expect(done.completedAt, isNotNull);
        final o = await s.payout.getOverview();
        expect(o.paid, 48200 + 5000);
        expect(o.available, 12420 - 5000);
        expect(o.openPayout, isNull);
      });

      test('money is settled exactly once however often we look', () async {
        await s.payout.requestPayout(amount: 5000, accountId: bank.id);
        s.advance(const Duration(minutes: 5));
        for (var i = 0; i < 5; i++) {
          await s.payout.getOverview();
          await s.payout.getHistory();
        }
        final o = await s.payout.getOverview();
        expect(o.paid, 53200);
        expect(o.available, 7420);
      });

      test('a failed payout returns the money', () async {
        s.world.creator.payoutOutcome = DemoPayoutOutcome.failed;
        await s.payout.requestPayout(amount: 5000, accountId: bank.id);
        s.advance(const Duration(seconds: 20));
        final p = (await s.payout.getHistory()).first;
        expect(p.status, PayoutStatus.failed);
        expect(p.reasonCode, 'bankRejected');
        final o = await s.payout.getOverview();
        expect(o.available, 12420);
        expect(o.paid, 48200);
      });

      test('a held payout stays open for review', () async {
        s.world.creator.payoutOutcome = DemoPayoutOutcome.onHold;
        await s.payout.requestPayout(amount: 5000, accountId: bank.id);
        s.advance(const Duration(seconds: 20));
        final o = await s.payout.getOverview();
        expect(o.openPayout?.status, PayoutStatus.onHold);
        expect(o.openPayout?.reasonCode, 'securityReview');
        expect(o.available, 12420 - 5000);
      });

      test('a reversed payout is returned to the balance', () async {
        s.world.creator.payoutOutcome = DemoPayoutOutcome.reversed;
        await s.payout.requestPayout(amount: 5000, accountId: bank.id);
        s.advance(const Duration(seconds: 20));
        final p = (await s.payout.getHistory()).first;
        expect(p.status, PayoutStatus.reversed);
        expect((await s.payout.getOverview()).available, 12420);
      });

      test('large payouts need a step-up; small ones do not', () async {
        s.world.creator.available = 60000;
        await expectLater(
          s.payout.requestPayout(amount: 30000, accountId: bank.id),
          throwsA(isA<UnauthorizedFailure>()),
        );
        await expectLater(
          s.payout.requestPayout(
            amount: 30000,
            accountId: bank.id,
            stepUpToken: await s.token(StepUpPurpose.addBankAccount),
          ),
          throwsA(isA<UnauthorizedFailure>()),
        );
        final ok = await s.payout.requestPayout(
          amount: 30000,
          accountId: bank.id,
          stepUpToken: await s.token(StepUpPurpose.requestPayout),
        );
        expect(ok.amount, 30000);
        // Just under the limit: no extra confirmation.
        final small = await s.payout.requestPayout(
          amount: 24999,
          accountId: bank.id,
        );
        expect(small.amount, 24999);
      });
    });
  });

  group('tax information', () {
    test('starts empty; saving keeps only a masked PAN', () async {
      expect((await s.tax.getTaxInfo()).status, TaxInfoStatus.notProvided);
      final t = await s.tax.saveTaxInfo(
        pan: 'abcde1234f',
        stepUpToken: await s.token(StepUpPurpose.updateTaxInfo),
      );
      expect(t.status, TaxInfoStatus.provided);
      expect(t.maskedPan, 'XXXXXX234F');
      expect('${t.props}', isNot(contains('ABCDE1234F')));
      expect('${t.props}'.toUpperCase(), isNot(contains('ABCDE1234F')));
    });

    test('a bad PAN is refused and needs a step-up', () async {
      await expectLater(
        s.tax.saveTaxInfo(
          pan: '12345',
          stepUpToken: await s.token(StepUpPurpose.updateTaxInfo),
        ),
        throwsA(_fields({'pan': 'invalid'})),
      );
      await expectLater(
        s.tax.saveTaxInfo(pan: 'ABCDE1234F', stepUpToken: ''),
        throwsA(isA<UnauthorizedFailure>()),
      );
    });
  });

  group('earnings', () {
    test('the earnings overview adds up and says "estimated"', () async {
      final e = await s.insights.getEarnings();
      expect(e.estimatedTotal, 24580);
      expect(e.thisMonth, 8420);
      expect((e.available, e.pending, e.paid), (12420, 4800, 48200));
      expect(e.byLevel, {
        ReachLevel.district: 1250,
        ReachLevel.state: 4820,
        ReachLevel.national: 12420,
        ReachLevel.global: 6090,
      });
      expect(e.levelTotal, e.estimatedTotal);
      expect(e.rewardPool.qualifiedReach, 1281392);
      expect(e.rewardPool.isEstimate, isTrue);
      expect(e.months, hasLength(6));
      expect(e.months.last.amount, e.thisMonth);
    });

    test('balances follow payouts', () async {
      await s.verifyIdentity();
      final b = await s.addBank();
      await s.payout.requestPayout(amount: 2000, accountId: b.id);
      expect((await s.insights.getEarnings()).available, 10420);
    });
  });

  test('demo lab can reset the creator back-end', () async {
    final demo = MockCreatorDemoService(s.world);
    await s.verifyIdentity();
    await s.addBank();
    expect((await demo.status()).kycStatus, KycStatus.verified);
    expect((await demo.status()).bankAccounts, 1);
    await demo.reset();
    final st = await demo.status();
    expect(st.kycStatus, KycStatus.notStarted);
    expect(st.bankAccounts, 0);
    expect(st.available, 12420);
  });

  test('demo lab can expire a verification', () async {
    final demo = MockCreatorDemoService(s.world);
    await s.verifyIdentity();
    await demo.expireVerification();
    expect((await s.kyc.getApplication()).status, KycStatus.expired);
    final b = (await s.payout.getOverview()).eligibility;
    expect(b.isMet(EligibilityCheck.identityVerified), isFalse);
  });
}
