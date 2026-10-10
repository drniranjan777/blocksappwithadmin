import 'package:equatable/equatable.dart';

enum PasswordStrength { weak, fair, strong, veryStrong }

enum PasswordRule { minLength, uppercase, lowercase, digit, special }

/// Password rules. The server owns the real policy and returns it through
/// `SecurityRepository.getPolicy()`; this class is how the app *displays and
/// pre-checks* it. The server must re-validate every password it receives.
class PasswordPolicy extends Equatable {
  const PasswordPolicy({
    this.minLength = 8,
    this.requireUppercase = true,
    this.requireLowercase = true,
    this.requireDigit = true,
    this.requireSpecial = true,
  });

  /// Demo values.
  const PasswordPolicy.demo() : this();

  final int minLength;
  final bool requireUppercase;
  final bool requireLowercase;
  final bool requireDigit;
  final bool requireSpecial;

  static final _upper = RegExp(r'\p{Lu}', unicode: true);
  static final _lower = RegExp(r'\p{Ll}', unicode: true);
  static final _digit = RegExp(r'\p{Nd}', unicode: true);
  static final _special = RegExp(r'[^\p{L}\p{N}\s]', unicode: true);

  /// Rules that apply under this policy, in display order.
  List<PasswordRule> get rules => [
    PasswordRule.minLength,
    if (requireUppercase) PasswordRule.uppercase,
    if (requireLowercase) PasswordRule.lowercase,
    if (requireDigit) PasswordRule.digit,
    if (requireSpecial) PasswordRule.special,
  ];

  bool passes(PasswordRule rule, String password) => switch (rule) {
    PasswordRule.minLength => password.length >= minLength,
    PasswordRule.uppercase => _upper.hasMatch(password),
    PasswordRule.lowercase => _lower.hasMatch(password),
    PasswordRule.digit => _digit.hasMatch(password),
    PasswordRule.special => _special.hasMatch(password),
  };

  /// Every active rule and whether [password] meets it.
  Map<PasswordRule, bool> check(String password) => {
    for (final r in rules) r: passes(r, password),
  };

  bool isSatisfiedBy(String password) =>
      rules.every((r) => passes(r, password));

  /// A advisory score for the strength meter.
  ///
  /// Compliance gates the result: below the minimum length is always weak, and
  /// a password that breaks any rule can never be better than fair. Common or
  /// patterned passwords are weak whatever they contain.
  PasswordStrength strengthOf(String password) {
    if (password.isEmpty || password.length < minLength) {
      return PasswordStrength.weak;
    }
    if (_isCommon(password) || _isPatterned(password)) {
      return PasswordStrength.weak;
    }

    var points = 0;
    for (final r in PasswordRule.values) {
      if (passes(r, password)) points++;
    }
    if (password.length >= 12) points++;
    if (password.length >= 16) points++;
    if (password.runes.toSet().length >= 8) points++;

    var strength = switch (points) {
      <= 2 => PasswordStrength.weak,
      <= 4 => PasswordStrength.fair,
      <= 6 => PasswordStrength.strong,
      _ => PasswordStrength.veryStrong,
    };
    if (!isSatisfiedBy(password) &&
        strength.index > PasswordStrength.fair.index) {
      strength = PasswordStrength.fair;
    }
    return strength;
  }

  static const _common = {
    'password',
    'passw0rd',
    'qwerty',
    'qwertyuiop',
    'letmein',
    'welcome',
    'admin',
    'iloveyou',
    'abc123',
    'monkey',
    'dragon',
    'blocks',
    'blocks123',
    'india123',
  };

  static bool _isCommon(String p) {
    final lower = p.toLowerCase();
    // "Password1!" is still "password" with decoration.
    final stripped = lower.replaceAll(RegExp(r'[^a-z]'), '');
    return _common.contains(lower) ||
        (stripped.isNotEmpty && _common.contains(stripped));
  }

  static bool _isPatterned(String p) {
    final runes = p.runes.toList();
    if (runes.toSet().length <= 2) return true; // "aaaaaaaa", "abababab"
    var step = true;
    for (var i = 1; i < runes.length; i++) {
      if (runes[i] - runes[i - 1] != 1) {
        step = false;
        break;
      }
    }
    return step; // "12345678", "abcdefgh"
  }

  @override
  List<Object?> get props => [
    minLength,
    requireUppercase,
    requireLowercase,
    requireDigit,
    requireSpecial,
  ];
}
