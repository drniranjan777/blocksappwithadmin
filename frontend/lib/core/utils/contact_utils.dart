/// Helpers for e-mail / phone input, display masking and normalisation.
///
/// Masking matters for privacy: the app only ever *displays* a masked contact
/// ("a***v@blocks.example", "+91 *******210"); the full value never needs to
/// leave the server just to be shown on a settings screen.
library;

final _email = RegExp(
  r'^[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}$',
);

bool isValidEmail(String input) {
  final v = input.trim();
  return v.length <= 254 && _email.hasMatch(v);
}

/// Normalises an Indian mobile number to `+91XXXXXXXXXX`, or null when it is
/// not a valid 10-digit mobile number (starting 6-9). Accepts spaces, dashes
/// and an optional `+91`, `91` or `0` prefix.
String? normalizeIndianPhone(String input) {
  var digits = input.replaceAll(RegExp(r'[\s\-().]'), '');
  if (digits.startsWith('+')) digits = digits.substring(1);
  if (digits.length == 12 && digits.startsWith('91')) {
    digits = digits.substring(2);
  } else if (digits.length == 11 && digits.startsWith('0')) {
    digits = digits.substring(1);
  }
  if (!RegExp(r'^[6-9]\d{9}$').hasMatch(digits)) return null;
  return '+91$digits';
}

String maskEmail(String email) {
  final at = email.indexOf('@');
  if (at < 1) return '***';
  final local = email.substring(0, at);
  final domain = email.substring(at);
  if (local.length <= 2) return '${local[0]}***$domain';
  return '${local[0]}***${local[local.length - 1]}$domain';
}

/// `+919876543210` -> `+91 *******210` (country code and last 3 digits only).
String maskPhone(String phone) {
  final digits = phone.replaceAll(RegExp(r'\D'), '');
  if (digits.length < 7) return '***';
  final national = digits.length > 10
      ? digits.substring(digits.length - 10)
      : digits;
  final country = digits.length > 10
      ? digits.substring(0, digits.length - 10)
      : '';
  final masked =
      '${'*' * (national.length - 3)}${national.substring(national.length - 3)}';
  return country.isEmpty ? masked : '+$country $masked';
}
