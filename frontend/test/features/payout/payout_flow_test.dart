import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/data/models/kyc_models.dart';
import 'package:blocks_app/data/models/payout_models.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/data/services/creator_demo_service.dart';
import 'package:blocks_app/features/kyc/application/kyc_providers.dart';
import 'package:blocks_app/features/kyc/presentation/kyc_flow_screen.dart';
import 'package:blocks_app/features/payout/application/payout_providers.dart';
import 'package:blocks_app/features/payout/presentation/add_bank_screen.dart';
import 'package:blocks_app/features/payout/presentation/payout_center_screen.dart';
import 'package:blocks_app/features/payout/presentation/request_payout_screen.dart';
import 'package:blocks_app/features/payout/presentation/step_up_sheet.dart';
import 'package:blocks_app/features/payout/presentation/tax_info_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/app_driver.dart';
import '../../helpers/money_driver.dart';

void moneyTest(
  String name,
  Future<void> Function(WidgetTester, MoneyDriver) body,
) {
  testWidgets(name, (tester) async {
    final handle = tester.ensureSemantics();
    final d = MoneyDriver(tester);
    try {
      await d.boot();
      await body(tester, d);
    } finally {
      handle.dispose();
    }
  });
}

Future<void> tapLabel(WidgetTester tester, String text) async {
  final f = find.text(text).first;
  await tester.ensureVisible(f);
  await tester.pumpAndSettle();
  await tester.tap(f);
  await tester.pumpAndSettle();
}

Future<void> openTab(WidgetTester tester, String name) async {
  await tester.tap(find.widgetWithText(Tab, name));
  await tester.pumpAndSettle();
}

void main() {
  group('Payout Center, before setup', () {
    moneyTest('shows balances, the checklist and why payout is not ready', (
      tester,
      d,
    ) async {
      await pushRoute(tester, Routes.payoutCenter);
      expect(find.byType(PayoutCenterScreen), findsOneWidget);
      expect(find.text('₹12,420'), findsWidgets);
      expect(find.text('Pending ₹4,800 · Paid ₹48,200'), findsOneWidget);

      expect(
        find.bySemanticsLabel('Identity verified: not yet'),
        findsOneWidget,
      );
      expect(
        find.bySemanticsLabel('Bank account verified: not yet'),
        findsOneWidget,
      );
      expect(
        find.bySemanticsLabel('Balance of at least ₹1,000: done'),
        findsOneWidget,
      );

      await tester.dragUntilVisible(
        find.text('Request payout'),
        find.byType(ListView).first,
        const Offset(0, -300),
      );
      expect(
        find.textContaining('Not ready yet: Identity verified'),
        findsOneWidget,
      );
      final button = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Request payout'),
      );
      expect(button.onPressed, isNull);
    });

    moneyTest('lists the rules from server configuration', (tester, d) async {
      await pushRoute(tester, Routes.payoutCenter);
      await tester.dragUntilVisible(
        find.text('Payout rules'),
        find.byType(ListView).first,
        const Offset(0, -300),
      );
      expect(find.text('Minimum withdrawal ₹1,000.'), findsOneWidget);
      expect(
        find.text('Money arrives in 2 to 5 business days.'),
        findsOneWidget,
      );
      expect(
        find.textContaining('₹25,000 or more need an extra confirmation'),
        findsOneWidget,
      );
    });
  });

  group('Identity verification (KYC)', () {
    /// Opens the date picker on the details step and accepts the date it
    /// offers (an adult, going by the server's minimum age).
    Future<void> pickBirthDate(WidgetTester tester) async {
      await tester.tap(find.text('Date of birth'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
    }

    Future<void> pickBusinessType(
      WidgetTester tester, [
      String label = 'Private limited company',
    ]) async {
      await tester.tap(find.byType(DropdownButtonFormField<String>));
      await tester.pumpAndSettle();
      await tester.tap(find.text(label).last);
      await tester.pumpAndSettle();
    }

    Future<void> reachDocuments(
      WidgetTester tester, {
      bool business = false,
    }) async {
      await pushRoute(tester, Routes.kycFlow);
      expect(find.byType(KycFlowScreen), findsOneWidget);
      expect(find.text('Who is being verified?'), findsOneWidget);
      if (business) await tester.tap(find.text('Business'));
      await tester.pump();
      await tester.tap(find.text('Next'));
      await tester.pumpAndSettle();
    }

    moneyTest(
      'an individual verifies with a PAN and the status becomes Verified',
      (tester, d) async {
        await reachDocuments(tester);
        // Name is prefilled from the profile, and can be corrected.
        expect(find.widgetWithText(TextField, 'Aarav Kumar'), findsOneWidget);

        // A date of birth is needed before going on, and it is asked for here.
        await tester.tap(find.text('Next'));
        await tester.pumpAndSettle();
        expect(find.text('Choose your date of birth.'), findsOneWidget);
        expect(find.text('Your documents'), findsNothing);

        await pickBirthDate(tester);
        expect(find.text('Choose your date of birth.'), findsNothing);
        await tester.tap(find.text('Next'));
        await tester.pumpAndSettle();

        expect(find.text('Your documents'), findsOneWidget);
        // The document types come from server configuration.
        for (final label in [
          'Aadhaar',
          'PAN card',
          'Passport',
          'Voter ID',
          'Driving licence',
        ]) {
          expect(find.text(label), findsWidgets, reason: label);
        }
        await tester.tap(find.text('PAN card'));
        await tester.pumpAndSettle();
        await tester.enterText(d.fieldLabeled('PAN number'), 'ABCDE1234F');
        await tester.pump();
        await tester.tap(find.text('Choose'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Take a photo'));
        await tester.pumpAndSettle();
        expect(find.textContaining('document_camera.jpg'), findsOneWidget);

        await tester.tap(find.widgetWithText(FilledButton, 'Next'));
        await tester.pumpAndSettle();

        // Review: the number is masked even here.
        expect(find.text('Check and submit'), findsOneWidget);
        expect(find.text('XXXXXX234F'), findsOneWidget);
        expect(find.textContaining('ABCDE1234F'), findsNothing);

        await tester.tap(find.text('Submit for verification'));
        // The status screen polls while the review runs, so it never settles.
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
        expect(find.text('Pending'), findsOneWidget);
        expect(find.text('Documents received'), findsOneWidget);

        // Not verified by anything the app does: only the server's clock.
        var status = (await containerOf(
          tester,
        ).read(kycApplicationProvider.future)).status;
        expect(status, KycStatus.pending);
        await d.advance(const Duration(seconds: 3));
        expect(find.text('Under review'), findsOneWidget);
        await d.advance(const Duration(seconds: 6));
        await tester.pumpAndSettle();
        expect(find.text('Verified'), findsOneWidget);
        status = (await containerOf(tester).read(kycApplicationProvider.future))
            .status;
        expect(status, KycStatus.verified);

        // The full number is nowhere in what the app holds.
        final app = await containerOf(tester)
            .read(kycApplicationProvider.future);
        expect('${app.props}', isNot(contains('ABCDE1234F')));
        expect(app.documents.single.maskedNumber, 'XXXXXX234F');

        await tester.tap(find.text('Done'));
        await tester.pumpAndSettle();
      },
    );

    moneyTest('Aadhaar needs both sides and is shown as XXXX XXXX 4821', (
      tester,
      d,
    ) async {
      await reachDocuments(tester);
      await pickBirthDate(tester);
      await tester.tap(find.text('Next'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Aadhaar'));
      await tester.pumpAndSettle();
      await tester.enterText(
        d.fieldLabeled('Aadhaar number'),
        '2345 6789 4821',
      );
      await tester.pump();
      // Front chosen, back missing: cannot continue yet.
      await tester.tap(find.text('Choose').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Choose a PDF'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Next'));
      await tester.pumpAndSettle();
      // (Next is allowed once a front exists; the server asks for the back.)
      if (find.text('Check and submit').evaluate().isNotEmpty) {
        await tester.tap(find.text('Submit for verification'));
        await tester.pumpAndSettle();
        expect(find.text('Add a picture of the document.'), findsOneWidget);
        await tester.tap(find.text('Choose').last);
        await tester.pumpAndSettle();
        await tester.tap(find.text('Take a photo'));
        await tester.pumpAndSettle();
        await tester.tap(find.widgetWithText(FilledButton, 'Next'));
        await tester.pumpAndSettle();
      }
      expect(find.text('XXXX XXXX 4821'), findsOneWidget);
      expect(find.textContaining('234567894821'), findsNothing);
    });

    moneyTest('a wrongly formatted number is refused with a clear message', (
      tester,
      d,
    ) async {
      await reachDocuments(tester);
      await pickBirthDate(tester);
      await tester.tap(find.text('Next'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('PAN card'));
      await tester.pumpAndSettle();
      await tester.enterText(d.fieldLabeled('PAN number'), '12345');
      await tester.tap(find.text('Choose'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Choose from gallery'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Next'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Submit for verification'));
      await tester.pumpAndSettle();
      expect(
        find.text('That number does not look right for this document.'),
        findsOneWidget,
      );
      expect(
        (await containerOf(tester).read(kycApplicationProvider.future)).status,
        KycStatus.notStarted,
      );
    });

    moneyTest('an oversized file is refused', (tester, d) async {
      await reachDocuments(tester);
      await pickBirthDate(tester);
      await tester.tap(find.text('Next'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('PAN card'));
      await tester.pumpAndSettle();
      await tester.enterText(d.fieldLabeled('PAN number'), 'ABCDE1234F');
      await tester.tap(find.text('Choose'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Demo: a file that is too large'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Next'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Submit for verification'));
      await tester.pumpAndSettle();
      expect(find.text('That file is too large.'), findsOneWidget);
    });

    moneyTest(
      'a business adds a registration document and the signatory\'s ID',
      (tester, d) async {
        await reachDocuments(tester, business: true);
        await tester.enterText(
          d.fieldLabeled('Business name'),
          'Hyderabad Foods LLP',
        );
        // A business is asked for its type, not for a date of birth.
        expect(find.text('Date of birth'), findsNothing);
        await tester.tap(find.text('Next'));
        await tester.pumpAndSettle();
        expect(find.text('Choose the type of business.'), findsOneWidget);
        await pickBusinessType(tester, 'Limited liability partnership');
        expect(find.text('Choose the type of business.'), findsNothing);
        await tester.tap(find.text('Next'));
        await tester.pumpAndSettle();

        expect(find.text('Business document'), findsOneWidget);
        expect(find.text('Authorised person’s ID'), findsOneWidget);
        await tester.tap(find.text('GST certificate'));
        await tester.pumpAndSettle();
        await tester.enterText(d.fieldLabeled('GSTIN'), '36ABCDE1234F1Z5');
        await tester.tap(find.text('Choose').first);
        await tester.pumpAndSettle();
        await tester.tap(find.text('Choose a PDF'));
        await tester.pumpAndSettle();

        await tester.ensureVisible(find.text('PAN card').last);
        await tester.pumpAndSettle();
        await tester.tap(find.text('PAN card').last);
        await tester.pumpAndSettle();
        await tester.enterText(d.fieldLabeled('PAN number'), 'ABCDE1234F');
        await tester.ensureVisible(find.text('Choose').last);
        await tester.pumpAndSettle();
        await tester.tap(find.text('Choose').last);
        await tester.pumpAndSettle();
        await tester.tap(find.text('Take a photo'));
        await tester.pumpAndSettle();

        await tester.ensureVisible(find.widgetWithText(FilledButton, 'Next'));
        await tester.tap(find.widgetWithText(FilledButton, 'Next'));
        await tester.pumpAndSettle();
        expect(find.text('XXXXXXXXXXXF1Z5'), findsOneWidget);
        expect(find.text('XXXXXX234F'), findsOneWidget);

        await tester.tap(find.text('Submit for verification'));
        // The status screen polls while the review runs, so it never settles.
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
        final app = await containerOf(tester)
            .read(kycApplicationProvider.future);
        expect(app.subject, KycSubject.business);
        expect(app.businessName, 'Hyderabad Foods LLP');
        expect(app.businessType, 'Limited liability partnership');
        expect(app.documents.map((x) => x.typeId), ['gst', 'pan']);
      },
    );

    moneyTest('a rejected review explains why and lets the creator try again', (
      tester,
      d,
    ) async {
      containerOf(tester).read(mockWorldProvider).creator.kycOutcome =
          DemoKycOutcome.rejected;
      await d.verifyIdentity();
      await pushRoute(tester, Routes.payoutVerification);
      await openTab(tester, 'Verification');
      expect(find.text('Rejected'), findsWidgets);
      expect(
        find.text('The name or details did not match the document.'),
        findsOneWidget,
      );
      expect(find.text('Try again'), findsOneWidget);
    });

    moneyTest(
      'the Verification tab shows the status, masked documents and privacy promises',
      (tester, d) async {
        await d.verifyIdentity();
        await pushRoute(tester, Routes.payoutVerification);
        expect(find.text('Verified'), findsWidgets);
        expect(find.text('Individual'), findsOneWidget);
        expect(find.text('Aarav Kumar'), findsWidgets);
        expect(find.text('XXXXXX234F'), findsOneWidget);
        expect(find.textContaining('ABCDE1234F'), findsNothing);
        await tester.dragUntilVisible(
          find.text('How your documents are protected'),
          find.byType(ListView).first,
          const Offset(0, -300),
        );
        expect(find.textContaining('Not kept on this phone'), findsOneWidget);
      },
    );
  });

  group('Bank account', () {
    Future<void> fillBank(
      WidgetTester tester,
      MoneyDriver d, {
      String holder = 'Aarav Kumar',
      String account = '123456784821',
      String confirm = '123456784821',
      String ifsc = 'HDFC0001234',
    }) async {
      await tester.enterText(d.fieldLabeled('Account holder'), holder);
      await tester.enterText(d.fieldLabeled('Account number'), account);
      await tester.enterText(d.fieldLabeled('Confirm account number'), confirm);
      await tester.enterText(d.fieldLabeled('IFSC code'), ifsc);
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
    }

    moneyTest('looks up the bank from the IFSC', (tester, d) async {
      await pushRoute(tester, Routes.addBank);
      expect(find.byType(AddBankScreen), findsOneWidget);
      await tester.enterText(d.fieldLabeled('IFSC code'), 'sbin0004321');
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      expect(find.textContaining('State Bank of India'), findsOneWidget);
    });

    moneyTest('field errors appear before anything is sent', (tester, d) async {
      await pushRoute(tester, Routes.addBank);
      await fillBank(tester, d, account: '123', confirm: '456', ifsc: 'BAD');
      await tester.ensureVisible(find.text('Save and verify'));
      await tester.tap(find.text('Save and verify'));
      await tester.pumpAndSettle();
      expect(find.text('Account numbers have 9 to 18 digits.'), findsOneWidget);
      expect(
        find.text('The two account numbers do not match.'),
        findsOneWidget,
      );
      expect(
        find.text('An IFSC has 11 characters, like HDFC0001234.'),
        findsOneWidget,
      );
      // No confirmation was asked for, and nothing was saved.
      expect(find.byType(StepUpSheet), findsNothing);
      expect(
        await containerOf(tester)
            .read(bankAccountRepositoryProvider)
            .getAccounts(),
        isEmpty,
      );
    });

    moneyTest('adding an account needs the password and a code', (
      tester,
      d,
    ) async {
      await d.verifyIdentity();
      await pushRoute(tester, Routes.addBank);
      await fillBank(tester, d);
      await tester.ensureVisible(find.text('Save and verify'));
      await tester.tap(find.text('Save and verify'));
      await tester.pumpAndSettle();

      expect(find.byType(StepUpSheet), findsOneWidget);
      expect(find.text('Confirm it’s you'), findsOneWidget);
      // Nothing is saved until the confirmation passes.
      expect(
        await containerOf(tester)
            .read(bankAccountRepositoryProvider)
            .getAccounts(),
        isEmpty,
      );

      // A wrong password is refused.
      await tester.enterText(
        d.inSheet(find.byType(TextField)).first,
        'not-my-password',
      );
      await tester.pump();
      await tester.tap(d.inSheet(find.widgetWithText(FilledButton, 'Next')));
      await tester.pumpAndSettle();
      expect(find.text('That password isn’t right.'), findsOneWidget);

      // The right one moves on to the one-time code.
      await d.completeStepUp();
      expect(find.text('Verified'), findsWidgets);

      final accounts = await containerOf(tester)
          .read(bankAccountRepositoryProvider)
          .getAccounts();
      expect(accounts.single.last4, '4821');
      expect(accounts.single.status, BankVerificationStatus.verified);
    });

    moneyTest('only the masked account number is shown afterwards', (
      tester,
      d,
    ) async {
      await d.verifyIdentity();
      await d.addBank();
      await pushRoute(tester, Routes.payoutBank);
      expect(find.text('HDFC Bank'), findsOneWidget);
      expect(find.textContaining('•••• 4821'), findsOneWidget);
      expect(find.text('XXXXXXXX4821'), findsOneWidget);
      expect(find.textContaining('123456784821'), findsNothing);
      expect(find.text('Primary'), findsOneWidget);
      expect(find.text('Verified'), findsWidgets);
    });

    moneyTest('a name that doesn\'t match the identity is flagged', (
      tester,
      d,
    ) async {
      await d.verifyIdentity();
      await pushRoute(tester, Routes.addBank);
      await fillBank(tester, d, holder: 'Rohit Sharma');
      await tester.ensureVisible(find.text('Save and verify'));
      await tester.tap(find.text('Save and verify'));
      await tester.pumpAndSettle();
      await d.completeStepUp();
      expect(find.text('Name doesn’t match'), findsWidgets);
      expect(find.text('Edit details'), findsOneWidget);
      expect(
        (await containerOf(
          tester,
        ).read(bankAccountRepositoryProvider).getAccounts()).single.status,
        BankVerificationStatus.nameMismatch,
      );
    });

    moneyTest(
      'an account added before identity is verified waits, then resolves',
      (tester, d) async {
        await pushRoute(tester, Routes.addBank);
        await fillBank(tester, d);
        await tester.ensureVisible(find.text('Save and verify'));
        await tester.tap(find.text('Save and verify'));
        await tester.pumpAndSettle();
        await d.completeStepUp();
        expect(find.text('Waiting for identity check'), findsWidgets);

        await d.verifyIdentity();
        final accounts = await containerOf(tester)
            .read(bankAccountRepositoryProvider)
            .getAccounts();
        expect(accounts.single.status, BankVerificationStatus.verified);
      },
    );

    moneyTest(
      'removing an account asks first, then confirms with password and code',
      (tester, d) async {
        await d.verifyIdentity();
        await d.addBank();
        await pushRoute(tester, Routes.payoutBank);
        await tester.ensureVisible(
          find.widgetWithText(OutlinedButton, 'Remove'),
        );
        await tester.tap(find.widgetWithText(OutlinedButton, 'Remove'));
        await tester.pumpAndSettle();
        expect(find.text('Remove this account?'), findsOneWidget);
        await tester.tap(
          find.descendant(
            of: find.byType(AlertDialog),
            matching: find.text('Remove'),
          ),
        );
        await tester.pumpAndSettle();
        await d.completeStepUp();
        expect(find.text('Bank account removed'), findsOneWidget);
        expect(
          await containerOf(tester)
              .read(bankAccountRepositoryProvider)
              .getAccounts(),
          isEmpty,
        );
      },
    );

    moneyTest('every payout-account change alerts the owner', (
      tester,
      d,
    ) async {
      await d.verifyIdentity();
      final world = containerOf(tester).read(mockWorldProvider);
      await d.addBank();
      expect(
        world.security.events.first.type,
        SecurityEventType.payoutAccountChanged,
      );
      expect(
        world.security.outbox.first.type,
        SecurityEventType.payoutAccountChanged,
      );
      expect(
        world.security.notifications.first.title,
        'Payout Account Changed',
      );
    });
  });

  group('Requesting a payout', () {
    Future<BankAccount> setUp(MoneyDriver d) async {
      await d.verifyIdentity();
      return d.addBank();
    }

    moneyTest('becomes possible once identity and a bank are verified', (
      tester,
      d,
    ) async {
      await setUp(d);
      await pushRoute(tester, Routes.payoutCenter);
      expect(find.bySemanticsLabel('Identity verified: done'), findsOneWidget);
      expect(
        find.bySemanticsLabel('Bank account verified: done'),
        findsOneWidget,
      );
      await tester.dragUntilVisible(
        find.text('Request payout'),
        find.byType(ListView).first,
        const Offset(0, -300),
      );
      final button = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Request payout'),
      );
      expect(button.onPressed, isNotNull);
    });

    moneyTest('checks the amount as you type', (tester, d) async {
      await setUp(d);
      await pushRoute(tester, Routes.requestPayout);
      expect(find.byType(RequestPayoutScreen), findsOneWidget);

      await tester.enterText(find.byType(TextField).first, '500');
      await tester.pump();
      expect(
        find.text('That is below the minimum withdrawal.'),
        findsOneWidget,
      );
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Review payout'),
            )
            .onPressed,
        isNull,
      );

      await tester.enterText(find.byType(TextField).first, '999999');
      await tester.pump();
      expect(
        find.text('That is more than your available balance.'),
        findsOneWidget,
      );

      await tester.enterText(find.byType(TextField).first, '5000');
      await tester.pump();
      expect(find.text('That is below the minimum withdrawal.'), findsNothing);
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Review payout'),
            )
            .onPressed,
        isNotNull,
      );
    });

    moneyTest('quick amounts fill the field', (tester, d) async {
      await setUp(d);
      await pushRoute(tester, Routes.requestPayout);
      await tester.tap(find.text('All'));
      await tester.pump();
      expect(find.widgetWithText(TextField, '12420'), findsOneWidget);
      await tester.tap(find.text('₹1,000').first);
      await tester.pump();
      expect(find.widgetWithText(TextField, '1000'), findsOneWidget);
    });

    moneyTest(
      'confirm, request, and see it in History with the money set aside',
      (tester, d) async {
        await setUp(d);
        await pushRoute(tester, Routes.requestPayout);
        await tester.enterText(find.byType(TextField).first, '5000');
        await tester.pump();
        await tester.ensureVisible(find.text('Review payout'));
        await tester.tap(find.text('Review payout'));
        await tester.pumpAndSettle();

        // The confirmation shows exactly what will happen.
        expect(find.text('Confirm payout'), findsOneWidget);
        expect(find.text('₹5,000'), findsWidgets);
        expect(find.text('HDFC Bank •••• 4821'), findsWidgets);
        expect(find.text('Expected arrival'), findsWidgets);
        await tester.tap(find.text('Confirm ₹5,000'));
        await tester.pumpAndSettle();

        expect(find.text('Payout requested'), findsOneWidget);
        expect(find.textContaining('Reference BLK'), findsOneWidget);

        final overview = await containerOf(tester)
            .read(payoutRepositoryProvider)
            .getOverview();
        expect(overview.available, 12420 - 5000);
        final history = await containerOf(tester)
            .read(payoutRepositoryProvider)
            .getHistory();
        expect(history.first.amount, 5000);
        expect(history.first.status, PayoutStatus.requested);

        await tester.tap(find.text('View history'));
        await tester.pumpAndSettle();
        expect(find.text('₹5,000'), findsWidgets);
        expect(find.text('Requested'), findsWidgets);
      },
    );

    moneyTest('History follows the payout: Requested, Processing, Completed', (
      tester,
      d,
    ) async {
      await setUp(d);
      await containerOf(tester)
          .read(payoutRepositoryProvider)
          .requestPayout(
            amount: 5000,
            accountId: (await containerOf(
              tester,
            ).read(bankAccountRepositoryProvider).getAccounts()).first.id,
          );
      await pushRoute(tester, Routes.payoutHistory);
      expect(find.text('Requested'), findsWidgets);

      await d.advance(const Duration(seconds: 6));
      expect(find.text('Processing'), findsWidgets);

      await d.advance(const Duration(seconds: 12));
      await tester.pumpAndSettle();
      expect(find.text('Completed'), findsWidgets);
      final o = await containerOf(tester)
          .read(payoutRepositoryProvider)
          .getOverview();
      expect(o.paid, 48200 + 5000);
    });

    moneyTest('a large payout asks for the extra confirmation', (
      tester,
      d,
    ) async {
      await setUp(d);
      containerOf(tester).read(mockWorldProvider).creator.available = 60000;
      await pushRoute(tester, Routes.requestPayout);
      await tester.enterText(find.byType(TextField).first, '30000');
      await tester.pump();
      await tester.ensureVisible(find.text('Review payout'));
      await tester.tap(find.text('Review payout'));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('needs an extra confirmation'),
        findsOneWidget,
      );
      await tester.tap(find.text('Confirm ₹30,000'));
      await tester.pumpAndSettle();

      // Nothing has been requested yet: the confirmation comes first.
      expect(find.byType(StepUpSheet), findsOneWidget);
      expect(
        (await containerOf(
          tester,
        ).read(payoutRepositoryProvider).getHistory()).first.amount,
        isNot(30000),
      );

      await d.completeStepUp();
      expect(find.text('Payout requested'), findsOneWidget);
      expect(
        (await containerOf(
          tester,
        ).read(payoutRepositoryProvider).getHistory()).first.amount,
        30000,
      );
    });

    moneyTest('a failed payout shows why and returns the money', (
      tester,
      d,
    ) async {
      final bank = await setUp(d);
      containerOf(tester).read(mockWorldProvider).creator.payoutOutcome =
          DemoPayoutOutcome.failed;
      await containerOf(tester)
          .read(payoutRepositoryProvider)
          .requestPayout(amount: 5000, accountId: bank.id);
      await pushRoute(tester, Routes.payoutHistory);
      await d.advance(const Duration(seconds: 20));
      await tester.pumpAndSettle();
      expect(find.text('Failed'), findsWidgets);
      expect(
        find.textContaining('The bank could not accept this payment'),
        findsWidgets, // (the seeded failed payout says the same)
      );
      final o = await containerOf(tester)
          .read(payoutRepositoryProvider)
          .getOverview();
      expect(o.available, 12420);
    });

    moneyTest(
      'without verification the request screen sends you back to the Payout Center',
      (tester, d) async {
        await pushRoute(tester, Routes.requestPayout);
        expect(find.text('You can’t withdraw yet'), findsOneWidget);
        expect(find.text('Open Payout Center'), findsOneWidget);
      },
    );

    moneyTest('History is empty-state friendly and lists the earlier payouts', (
      tester,
      d,
    ) async {
      await pushRoute(tester, Routes.payoutHistory);
      // The seeded creator already has earlier payouts.
      expect(find.text('Completed'), findsWidgets);
      expect(find.text('Failed'), findsWidgets);
      expect(find.text('₹20,000'), findsOneWidget);
    });
  });

  group('Tax information', () {
    moneyTest('shows the account type and what the provider has issued', (
      tester,
      d,
    ) async {
      await d.verifyIdentity();
      final bank = await d.addBank();
      final creator = containerOf(tester).read(mockWorldProvider).creator;
      int completed() {
        // Statuses follow the clock, so bring them up to date first.
        creator.syncPayouts();
        return creator.payouts
            .where((p) => p.status == PayoutStatus.completed)
            .length;
      }

      // The demo creator has been paid before, so statements already exist.
      final before = completed();
      expect(before, greaterThan(0));

      await pushRoute(tester, Routes.payoutTax);
      expect(find.text('Account type'), findsOneWidget);
      expect(find.text('Individual'), findsOneWidget);
      expect(find.text('Payout statement'), findsNWidgets(before));
      expect(find.text('Tax withholding certificate'), findsOneWidget);
      expect(
        find.text('Issued after the period ends, if it applies'),
        findsOneWidget,
      );

      // A payout that completes brings its own statement.
      await containerOf(tester)
          .read(payoutRepositoryProvider)
          .requestPayout(amount: 1000, accountId: bank.id);
      await d.advance(const Duration(seconds: 15));
      expect(completed(), before + 1);
      containerOf(tester).invalidate(taxInfoProvider);
      await tester.pumpAndSettle();
      expect(find.text('Payout statement'), findsNWidgets(before + 1));

      // Nothing is calculated here: the app lists documents, not tax amounts.
      expect(find.textContaining('TDS'), findsNothing);
    });

    moneyTest('with no completed payouts there is nothing to list yet', (
      tester,
      d,
    ) async {
      containerOf(tester).read(mockWorldProvider).creator.payouts.clear();
      await pushRoute(tester, Routes.payoutTax);
      expect(find.textContaining('No documents yet'), findsOneWidget);
      expect(find.text('Payout statement'), findsNothing);
      expect(find.text('Tax withholding certificate'), findsNothing);
      // Before identity is verified the account type is not known.
      expect(find.text('Not set yet'), findsOneWidget);
    });

    moneyTest('adding a PAN needs confirmation and is shown masked', (
      tester,
      d,
    ) async {
      await pushRoute(tester, Routes.payoutTax);
      expect(find.byType(TaxInfoScreen), findsOneWidget);
      expect(find.text('Not provided yet'), findsOneWidget);
      expect(find.textContaining('does not calculate tax'), findsWidgets);

      await tester.tap(find.text('Add PAN'));
      await tester.pumpAndSettle();
      await tester.enterText(d.fieldLabeled('PAN number'), 'BAD');
      await tester.tap(find.text('Save PAN'));
      await tester.pumpAndSettle();
      expect(
        find.text('A PAN has 10 characters, like ABCDE1234F.'),
        findsOneWidget,
      );
      expect(find.byType(StepUpSheet), findsNothing);

      await tester.enterText(d.fieldLabeled('PAN number'), 'abcde1234f');
      await tester.tap(find.text('Save PAN'));
      await tester.pumpAndSettle();
      await d.completeStepUp();
      expect(find.text('XXXXXX234F'), findsOneWidget);
      expect(find.textContaining('ABCDE1234F'), findsNothing);
      expect(find.text('Update PAN'), findsOneWidget);
    });
  });

  group('Safety hold', () {
    moneyTest('pauses payouts after a bank change when switched on', (
      tester,
      d,
    ) async {
      final world = containerOf(tester).read(mockWorldProvider);
      world.creator.payoutConfig = world.creator.payoutConfig.copyWith(
        holdAfterAccountChange: const Duration(hours: 24),
      );
      await d.verifyIdentity();
      await d.addBank();
      await pushRoute(tester, Routes.payoutCenter);
      expect(find.textContaining('Paused until'), findsOneWidget);
      expect(find.textContaining('Payouts pause for 24 hours'), findsOneWidget);

      d.now = d.now.add(const Duration(hours: 25));
      containerOf(tester).invalidate(payoutOverviewProvider);
      await tester.pumpAndSettle();
      expect(find.textContaining('Paused until'), findsNothing);
    });
  });

  group('Verification renewal', () {
    moneyTest('an expired verification blocks payouts until renewed', (
      tester,
      d,
    ) async {
      await d.verifyIdentity();
      await d.addBank();
      d.now = d.now.add(const Duration(days: 800));
      await pushRoute(tester, Routes.payoutVerification);
      expect(find.text('Expired'), findsWidgets);
      expect(find.text('Renew verification'), findsOneWidget);
      final o = await containerOf(tester)
          .read(payoutRepositoryProvider)
          .getOverview();
      expect(o.eligibility.isMet(EligibilityCheck.identityVerified), isFalse);
    });
  });
}
