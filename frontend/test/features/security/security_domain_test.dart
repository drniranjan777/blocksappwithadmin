import 'package:blocks_app/core/utils/contact_utils.dart';
import 'package:blocks_app/features/security/domain/login_attempt_tracker.dart';
import 'package:blocks_app/features/security/domain/password_policy.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('PasswordPolicy', () {
    const policy = PasswordPolicy.demo();

    test('lists the active rules in display order', () {
      expect(policy.rules, [
        PasswordRule.minLength,
        PasswordRule.uppercase,
        PasswordRule.lowercase,
        PasswordRule.digit,
        PasswordRule.special,
      ]);
    });

    test('check() reports exactly which rules fail', () {
      final r = policy.check('abc');
      expect(r[PasswordRule.minLength], isFalse);
      expect(r[PasswordRule.uppercase], isFalse);
      expect(r[PasswordRule.lowercase], isTrue);
      expect(r[PasswordRule.digit], isFalse);
      expect(r[PasswordRule.special], isFalse);
    });

    test('a compliant password satisfies the policy', () {
      expect(policy.isSatisfiedBy('Blocks@2026'), isTrue);
      expect(policy.isSatisfiedBy('Blocks2026'), isFalse); // no special
      expect(policy.isSatisfiedBy('blocks@2026'), isFalse); // no uppercase
      expect(policy.isSatisfiedBy('BLOCKS@2026'), isFalse); // no lowercase
      expect(policy.isSatisfiedBy('Blocks@abcd'), isFalse); // no digit
      expect(policy.isSatisfiedBy('Bl@1'), isFalse); // too short
    });

    test('minimum length is configurable', () {
      const strict = PasswordPolicy(minLength: 12);
      expect(strict.isSatisfiedBy('Blocks@2026'), isFalse); // 11 chars
      expect(strict.isSatisfiedBy('Blocks@20267'), isTrue);
      expect(strict.strengthOf('Blocks@2026'), PasswordStrength.weak);
    });

    test('individual rules can be switched off', () {
      const relaxed = PasswordPolicy(
        requireSpecial: false,
        requireDigit: false,
      );
      expect(relaxed.rules, isNot(contains(PasswordRule.special)));
      expect(relaxed.rules, isNot(contains(PasswordRule.digit)));
      expect(relaxed.isSatisfiedBy('Blocksblocks'), isTrue);
    });

    test('special characters include symbols but not letters or digits', () {
      expect(policy.passes(PasswordRule.special, 'abc123'), isFalse);
      expect(policy.passes(PasswordRule.special, 'abc_123'), isTrue);
      expect(policy.passes(PasswordRule.special, 'abc 123'), isFalse);
    });

    group('strength', () {
      test('empty and too-short are weak', () {
        expect(policy.strengthOf(''), PasswordStrength.weak);
        expect(policy.strengthOf('Ab1@'), PasswordStrength.weak);
      });

      test('common passwords stay weak even when decorated', () {
        // Compliant with every rule, yet guessable: a common word (or the app
        // name) plus digits / symbols.
        for (final p in [
          'password',
          'Password1!',
          'Qwerty123!',
          'Blocks@2026',
          'Welcome#1',
        ]) {
          expect(policy.strengthOf(p), PasswordStrength.weak, reason: p);
        }
      });

      test('repeated and sequential patterns are weak', () {
        expect(policy.strengthOf('aaaaaaaa'), PasswordStrength.weak);
        expect(policy.strengthOf('abababab'), PasswordStrength.weak);
        expect(policy.strengthOf('12345678'), PasswordStrength.weak);
        expect(policy.strengthOf('abcdefgh'), PasswordStrength.weak);
      });

      test('missing a required rule caps the result at fair', () {
        // Long and varied, but no special character.
        expect(
          policy.strengthOf('Tr0ubadourXylophone9'),
          PasswordStrength.fair,
        );
      });

      test('a compliant password is strong, a long varied one very strong', () {
        expect(policy.strengthOf('Rivers@2026'), PasswordStrength.strong);
        expect(
          policy.strengthOf('Xk9#mPz2\$qLwTn'),
          PasswordStrength.veryStrong,
        );
      });

      test('strength never decreases as a good password gets longer', () {
        var previous = PasswordStrength.weak.index;
        for (final p in [
          'Xk9#mPz2',
          'Xk9#mPz2\$q',
          'Xk9#mPz2\$qLwT',
          'Xk9#mPz2\$qLwTn!5',
        ]) {
          final s = policy.strengthOf(p).index;
          expect(s, greaterThanOrEqualTo(previous), reason: p);
          previous = s;
        }
      });
    });
  });

  group('LoginAttemptTracker', () {
    final t0 = DateTime(2026, 10, 8, 20, 40);

    LoginAttemptTracker tracker({int max = 5}) => LoginAttemptTracker(
      maxAttempts: max,
      protectionFor: const Duration(minutes: 15),
    );

    test('counts down the remaining attempts, then triggers protection', () {
      final tr = tracker();
      for (var i = 1; i <= 4; i++) {
        final o = tr.recordFailure(t0);
        expect(o, isA<AttemptRejected>());
        expect((o as AttemptRejected).attemptsRemaining, 5 - i);
      }
      final fifth = tr.recordFailure(t0);
      expect(fifth, isA<AttemptProtectionTriggered>());
      final p = fifth as AttemptProtectionTriggered;
      expect(p.failedAttempts, 5);
      expect(p.protectedUntil, t0.add(const Duration(minutes: 15)));
      expect(tr.isProtected(t0), isTrue);
    });

    test('the limit is configurable', () {
      final tr = tracker(max: 3);
      tr.recordFailure(t0);
      tr.recordFailure(t0);
      expect(tr.recordFailure(t0), isA<AttemptProtectionTriggered>());
    });

    test('attempts while protected are refused and do not extend it', () {
      final tr = tracker();
      for (var i = 0; i < 5; i++) {
        tr.recordFailure(t0);
      }
      final until = tr.protectedUntil(t0)!;
      final later = t0.add(const Duration(minutes: 5));
      final o = tr.recordFailure(later);
      expect(o, isA<AttemptWhileProtected>());
      expect((o as AttemptWhileProtected).protectedUntil, until);
      expect(tr.failedAttempts, 5);
    });

    test('protection ends by itself and the counter starts over', () {
      final tr = tracker();
      for (var i = 0; i < 5; i++) {
        tr.recordFailure(t0);
      }
      final after = t0.add(const Duration(minutes: 15));
      expect(tr.isProtected(after), isFalse);
      expect(tr.failedAttempts, 0);
      final o = tr.recordFailure(after);
      expect((o as AttemptRejected).attemptsRemaining, 4);
    });

    test('a successful sign-in clears the failures', () {
      final tr = tracker();
      tr.recordFailure(t0);
      tr.recordFailure(t0);
      tr.recordSuccess();
      expect(tr.failedAttempts, 0);
      expect((tr.recordFailure(t0) as AttemptRejected).attemptsRemaining, 4);
    });

    test('clear() lifts protection (password reset)', () {
      final tr = tracker();
      for (var i = 0; i < 5; i++) {
        tr.recordFailure(t0);
      }
      tr.clear();
      expect(tr.isProtected(t0), isFalse);
      expect(tr.failedAttempts, 0);
    });
  });

  group('contact helpers', () {
    test('isValidEmail', () {
      expect(isValidEmail('aarav@blocks.example'), isTrue);
      expect(isValidEmail('  a.b+tag@mail.co.in '), isTrue);
      expect(isValidEmail('no-at-sign.example'), isFalse);
      expect(isValidEmail('a@b'), isFalse);
      expect(isValidEmail('a@@b.com'), isFalse);
      expect(isValidEmail(''), isFalse);
      expect(isValidEmail('${'a' * 250}@b.com'), isFalse);
    });

    test('normalizeIndianPhone accepts common formats', () {
      for (final p in [
        '9876543210',
        '98765 43210',
        '+91 98765 43210',
        '+919876543210',
        '919876543210',
        '09876543210',
        '98765-43210',
      ]) {
        expect(normalizeIndianPhone(p), '+919876543210', reason: p);
      }
    });

    test('normalizeIndianPhone rejects invalid numbers', () {
      for (final p in [
        '',
        '12345',
        '5876543210',
        '98765432101',
        'abcdefghij',
      ]) {
        expect(normalizeIndianPhone(p), isNull, reason: p);
      }
    });

    test('masking hides the private part', () {
      expect(maskEmail('aarav@blocks.example'), 'a***v@blocks.example');
      expect(maskEmail('ab@x.com'), 'a***@x.com');
      expect(maskEmail('nonsense'), '***');
      expect(maskPhone('+919876543210'), '+91 *******210');
      expect(maskPhone('12'), '***');
      expect(maskEmail('aarav@blocks.example'), isNot(contains('aarav')));
      expect(maskPhone('+919876543210'), isNot(contains('98765')));
    });
  });
}
