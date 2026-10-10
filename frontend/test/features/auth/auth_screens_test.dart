import 'package:blocks_app/app/config/app_config.dart';
import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/app_theme.dart';
import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/core/services/local_store.dart';
import 'package:blocks_app/data/models/auth_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/auth/presentation/register_screen.dart';
import 'package:blocks_app/features/auth/presentation/verify_code_screen.dart';
import 'package:blocks_app/l10n/gen/app_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import '../../helpers/fake_auth_repository.dart';

const _live = AppConfig(
  environment: AppEnvironment.staging,
  useMockData: false,
  apiBaseUrl: 'https://api.example.test',
  enableLogging: false,
);

final _now = DateTime.utc(2026, 10, 9, 12);

Future<void> _pump(
  WidgetTester tester,
  FakeAuthRepository auth,
  Widget screen,
) async {
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(SystemChannels.platform, (call) async => null);
  tester.view
    ..physicalSize = const Size(780, 1688)
    ..devicePixelRatio = 2;
  addTearDown(tester.view.reset);

  final router = GoRouter(
    initialLocation: '/here',
    routes: [
      GoRoute(path: '/here', builder: (_, _) => screen),
      GoRoute(
        path: Routes.landing,
        builder: (_, _) => const Scaffold(body: Text('LANDED')),
      ),
      GoRoute(
        path: Routes.auth,
        builder: (_, _) => const Scaffold(body: Text('AUTH ENTRY')),
      ),
      GoRoute(
        path: Routes.verifyCode,
        builder: (_, state) {
          final c = state.extra as CodeChallenge?;
          return Scaffold(body: Text('CODE ${c?.id}'));
        },
      ),
      GoRoute(
        path: Routes.signIn,
        builder: (_, _) => const Scaffold(body: Text('SIGN IN')),
      ),
    ],
  );
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        localStoreProvider.overrideWithValue(InMemoryLocalStore()),
        appConfigProvider.overrideWithValue(_live),
        authRepositoryProvider.overrideWithValue(auth),
        clockProvider.overrideWithValue(() => _now),
      ],
      child: MaterialApp.router(
        routerConfig: router,
        theme: AppTheme.light(),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _type(WidgetTester tester, String label, String text) async {
  await tester.enterText(find.widgetWithText(TextField, label), text);
  // Settle: a field cross-fades between its error and helper text.
  await tester.pumpAndSettle();
}

/// Scrolls to [label] (a long form builds its lower part lazily) and taps it.
Future<void> _tapButton(WidgetTester tester, String label) async {
  final button = find.text(label);
  await tester.scrollUntilVisible(
    button,
    200,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.tap(button);
  await tester.pumpAndSettle();
}

void main() {
  group('the code screen', () {
    CodeChallenge contact({DateTime? resendAt}) => CodeChallenge(
      id: 'c1',
      kind: CodeChallengeKind.contactVerification,
      destinationMasked: 'a***@example.com',
      resendAvailableAt: resendAt ?? _now.subtract(const Duration(seconds: 1)),
    );

    Finder codeField() => find.byType(TextField);

    testWidgets(
      'says where the code went and keeps Continue off until all six digits are typed',
      (tester) async {
        final auth = FakeAuthRepository();
        await _pump(tester, auth, VerifyCodeScreen(challenge: contact()));

        expect(
          find.text('We sent a 6-digit code to a***@example.com.'),
          findsOneWidget,
        );
        expect(
          find.text('Confirm it is you to finish creating your account.'),
          findsOneWidget,
        );

        await tester.enterText(codeField(), '12345');
        await tester.pump();
        await tester.tap(find.text('Continue'));
        await tester.pump();
        expect(auth.codes, isEmpty, reason: 'five digits is not a code');

        await tester.enterText(codeField(), '123456');
        await tester.pump();
        await _tapButton(tester, 'Continue');
        expect(auth.codes.single.code, '123456');
        expect(auth.codes.single.method, SignInCodeMethod.otp);
        expect(find.text('LANDED'), findsOneWidget);
      },
    );

    testWidgets('only digits are accepted in the field', (tester) async {
      await _pump(
        tester,
        FakeAuthRepository(),
        VerifyCodeScreen(challenge: contact()),
      );
      await tester.enterText(codeField(), '12ab34cd56789');
      await tester.pump();
      expect(tester.widget<TextField>(codeField()).controller!.text, '123456');
    });

    testWidgets('a wrong code shows the tries left and clears the field', (
      tester,
    ) async {
      final auth = FakeAuthRepository()
        ..submitError = const ValidationFailure(
          'That code is not correct.',
          'OTP_INVALID',
          {'attemptsLeft': 2},
        );
      await _pump(tester, auth, VerifyCodeScreen(challenge: contact()));
      await tester.enterText(codeField(), '000000');
      await tester.pump();
      await _tapButton(tester, 'Continue');

      expect(
        find.text("That code isn't right. 2 attempts left."),
        findsOneWidget,
      );
      expect(tester.widget<TextField>(codeField()).controller!.text, isEmpty);
      expect(find.text('LANDED'), findsNothing);
    });

    testWidgets(
      'an expired code, too many wrong codes and a dead connection each say so',
      (tester) async {
        Future<void> tryWith(
          Object error,
          String expected, {
          bool locked = false,
        }) async {
          final auth = FakeAuthRepository()..submitError = error;
          await _pump(tester, auth, VerifyCodeScreen(challenge: contact()));
          await tester.enterText(codeField(), '111111');
          await tester.pump();
          await _tapButton(tester, 'Continue');
          expect(find.text(expected), findsOneWidget);
          if (locked) {
            expect(
              codeField(),
              findsNothing,
              reason: 'entry is closed until a new code',
            );
          }
        }

        await tryWith(
          const ValidationFailure('x', 'OTP_EXPIRED'),
          'This code has expired. Request a new one.',
        );
        await tryWith(
          const RateLimitedFailure(code: 'OTP_LOCKED'),
          'Too many wrong codes. Request a new code to continue.',
          locked: true,
        );
        await tryWith(
          const NetworkFailure(),
          'Please check your connection and try again.',
        );
      },
    );

    testWidgets(
      'resend waits for the server\'s time, then asks for a new code',
      (tester) async {
        final auth = FakeAuthRepository();
        await _pump(
          tester,
          auth,
          VerifyCodeScreen(
            challenge: contact(resendAt: _now.add(const Duration(seconds: 30))),
          ),
        );
        expect(find.text('Resend in 30s'), findsOneWidget);
        await tester.tap(find.text('Resend in 30s'));
        await tester.pump();
        expect(auth.resends, isEmpty);
      },
    );

    testWidgets('resend is available once the time has passed', (tester) async {
      final auth = FakeAuthRepository();
      await _pump(tester, auth, VerifyCodeScreen(challenge: contact()));
      await tester.tap(find.text('Resend code'));
      await tester.pump();
      await tester.pump();
      expect(auth.resends.single.id, 'c1');
      expect(find.text('A new code was sent'), findsOneWidget);
    });

    testWidgets(
      'a two-step sign-in starts with the authenticator app and can switch to a recovery code',
      (tester) async {
        final auth = FakeAuthRepository();
        await _pump(
          tester,
          auth,
          const VerifyCodeScreen(
            challenge: CodeChallenge(
              id: 'c2',
              kind: CodeChallengeKind.secondFactor,
              methods: [SignInCodeMethod.totp, SignInCodeMethod.backupCode],
            ),
          ),
        );
        expect(
          find.text('Enter the 6-digit code from your authenticator app.'),
          findsOneWidget,
        );
        expect(
          find.text('Resend code'),
          findsNothing,
          reason: 'an app sends nothing',
        );

        await tester.tap(find.text('Use a recovery code'));
        await tester.pumpAndSettle();
        expect(find.text('Enter one of your recovery codes.'), findsOneWidget);

        await tester.enterText(codeField(), 'abcd-efgh-jk');
        await tester.pump();
        await _tapButton(tester, 'Continue');
        expect(auth.codes.single.code, 'ABCD-EFGH-JK');
        expect(auth.codes.single.method, SignInCodeMethod.backupCode);
      },
    );
  });

  group('the create-account screen', () {
    Future<void> fillIn(
      WidgetTester tester, {
      String username = 'asha.k',
    }) async {
      await _type(tester, 'Full name', ' Asha K ');
      await _type(tester, 'Username', username);
      await _type(tester, 'E-mail', 'asha@example.com');
      await _type(tester, 'Password', 'S3cret!pass');
      await tester.scrollUntilVisible(
        find.text('Choose your date of birth'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Choose your date of birth'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
    }

    testWidgets('keeps Create off until the required details are in', (
      tester,
    ) async {
      final auth = FakeAuthRepository();
      await _pump(tester, auth, const RegisterScreen());
      await _tapButton(tester, 'Create account');
      expect(auth.registrations, isEmpty);

      // Even with everything but the date of birth filled in.
      await _type(tester, 'Full name', 'Asha');
      await _type(tester, 'Username', 'asha.k');
      await _type(tester, 'E-mail', 'asha@example.com');
      await _type(tester, 'Password', 'S3cret!pass');
      await _tapButton(tester, 'Create account');
      expect(auth.registrations, isEmpty);
    });

    testWidgets('sends what was typed and carries on to the code screen', (
      tester,
    ) async {
      final auth = FakeAuthRepository();
      await _pump(tester, auth, const RegisterScreen());
      await fillIn(tester);
      await _tapButton(tester, 'Create account');

      final sent = auth.registrations.single;
      expect(sent.username, 'asha.k');
      expect(sent.displayName, ' Asha K ');
      expect(sent.email, 'asha@example.com');
      expect(sent.password, 'S3cret!pass');
      expect(sent.language, 'en');
      expect(sent.dateOfBirth.isBefore(_now), isTrue);
      expect(find.text('CODE challenge-1'), findsOneWidget);
    });

    testWidgets('puts the server\'s reasons next to the fields', (
      tester,
    ) async {
      final auth = FakeAuthRepository()
        ..registerResult = const FieldValidationFailure({
          'username': 'invalid_format',
          'dateOfBirth': 'too_young',
          'password': 'too_short',
        });
      await _pump(tester, auth, const RegisterScreen());
      await fillIn(tester);
      await _tapButton(tester, 'Create account');

      expect(
        find.text('Use 3–30 letters, numbers, dots or underscores'),
        findsOneWidget,
      );
      expect(find.text('You must be at least 13 to join'), findsOneWidget);
      expect(find.textContaining('Choose a stronger password'), findsOneWidget);
      expect(find.textContaining('CODE'), findsNothing);
    });

    testWidgets(
      'says when the username is taken, and shows other failures as a banner',
      (tester) async {
        final taken = FakeAuthRepository()
          ..registerResult = const ConflictFailure('x', 'USERNAME_TAKEN');
        await _pump(tester, taken, const RegisterScreen());
        await fillIn(tester);
        await _tapButton(tester, 'Create account');
        expect(find.text('That username is not available'), findsOneWidget);

        final down = FakeAuthRepository()
          ..registerResult = const NetworkFailure();
        await _pump(tester, down, const RegisterScreen());
        await fillIn(tester);
        await _tapButton(tester, 'Create account');
        expect(find.text('Something went wrong'), findsOneWidget);
      },
    );

    testWidgets('an editing change clears the old reasons', (tester) async {
      final auth = FakeAuthRepository()
        ..registerResult = const FieldValidationFailure({
          'username': 'invalid_format',
        });
      await _pump(tester, auth, const RegisterScreen());
      await fillIn(tester);
      await _tapButton(tester, 'Create account');
      expect(
        find.text('Use 3–30 letters, numbers, dots or underscores'),
        findsOneWidget,
      );
      await _type(tester, 'Username', 'asha.k2');
      expect(
        find.text('Use 3–30 letters, numbers, dots or underscores'),
        findsNothing,
      );
    });
  });
}
