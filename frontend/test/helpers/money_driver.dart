import 'package:blocks_app/data/mock/demo_credentials.dart';
import 'package:blocks_app/data/models/kyc_models.dart';
import 'package:blocks_app/data/models/payout_models.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/payout/presentation/step_up_sheet.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'app_driver.dart';

/// Drives the identity / bank / payout screens with a clock the test owns, so
/// "the review finishes after a few seconds" is deterministic.
class MoneyDriver {
  MoneyDriver(this.tester);

  final WidgetTester tester;

  /// Mock "server time". Everything time-based (identity review, payout
  /// progress, safety holds) follows this.
  DateTime now = DateTime(2026, 10, 9, 12);

  Size get size => const Size(390, 1800);

  /// Boots the signed-in app on a tall screen, using [now] as the clock.
  Future<void> boot() async {
    tester.view
      ..physicalSize = size * 2
      ..devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    await openSignedInApp(
      tester,
      size: size,
      overrides: [clockProvider.overrideWithValue(() => now)],
    );
  }

  // ---------------------------------------------------------------- time --

  /// Moves server time on and lets the screen's polling pick it up.
  Future<void> advance(Duration d) async {
    now = now.add(d);
    // Long enough for any polling timer (1.5 s / 4 s) to fire once.
    await tester.pump(const Duration(seconds: 5));
    await tester.pump();
    await tester.pump();
  }

  // ---------------------------------------------------------- finders --

  Finder fieldLabeled(String label) => find.byWidgetPredicate(
    (w) => w is TextField && w.decoration?.labelText == label,
    description: 'TextField labelled "$label"',
  );

  Finder inSheet(Finder f) =>
      find.descendant(of: find.byType(StepUpSheet), matching: f);

  // ------------------------------------------------------ setup via repos --

  /// Gets identity verified through the same repositories the screens use.
  Future<void> verifyIdentity({String name = 'Aarav Kumar'}) async {
    final c = containerOf(tester);
    await c
        .read(kycRepositoryProvider)
        .submit(
          KycSubmission(
            subject: KycSubject.individual,
            legalName: name,
            dateOfBirth: DateTime(1992, 4, 12),
            documents: const [
              KycDocumentInput(
                typeId: 'pan',
                number: 'ABCDE1234F',
                file: KycFile(name: 'pan.jpg', sizeBytes: 600 * 1024),
              ),
            ],
          ),
        );
    now = now.add(const Duration(seconds: 7));
    await c.read(kycRepositoryProvider).getApplication();
  }

  /// A fresh step-up token, obtained the way a person would: password, code.
  Future<String> token(StepUpPurpose purpose) async {
    final repo = containerOf(tester).read(stepUpRepositoryProvider);
    final challenge = await repo.begin(
      purpose,
      password: DemoCredentials.password,
    );
    final result = await repo.verify(
      challengeId: challenge.id,
      code: DemoCredentials.otp,
    );
    return (result as OtpVerified).token;
  }

  Future<BankAccount> addBank({
    String holder = 'Aarav Kumar',
    String account = '123456784821',
    String ifsc = 'HDFC0001234',
  }) async =>
      containerOf(tester)
          .read(bankAccountRepositoryProvider)
          .addAccount(
            BankAccountInput(
              holderName: holder,
              accountNumber: account,
              confirmAccountNumber: account,
              ifsc: ifsc,
            ),
            stepUpToken: await token(StepUpPurpose.addBankAccount),
          );

  // ------------------------------------------------------------ step-up --

  /// Completes the on-screen "Confirm it's you" sheet: password, then code.
  Future<void> completeStepUp({
    String password = DemoCredentials.password,
    String code = DemoCredentials.otp,
  }) async {
    expect(find.byType(StepUpSheet), findsOneWidget);
    await tester.enterText(inSheet(find.byType(TextField)).first, password);
    await tester.pump();
    await tester.tap(inSheet(find.widgetWithText(FilledButton, 'Next')));
    await tester.pumpAndSettle();
    await tester.enterText(inSheet(find.byType(TextField)).first, code);
    await tester.pump();
    await tester.tap(inSheet(find.widgetWithText(FilledButton, 'Confirm')));
    await tester.pumpAndSettle();
  }
}
