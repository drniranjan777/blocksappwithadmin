/// Masking for identity and bank numbers.
///
/// The app's rule: a full Aadhaar, PAN, passport or bank-account number is
/// typed into a form once, sent to the server over TLS, and **never shown
/// again**. Everything displayed afterwards comes from here (and in
/// production, from the server, which masks before it responds).
library;

/// Keeps the last [visible] characters and replaces the rest with `X`.
///
/// A 12-digit number (Aadhaar-style) is grouped as `XXXX XXXX 4821`; anything
/// else keeps its length (`ABCDE1234F` -> `XXXXXX234F`).
String maskIdNumber(String raw, {int visible = 4}) {
  final clean = raw.replaceAll(RegExp(r'[\s\-]'), '').toUpperCase();
  if (clean.isEmpty) return '';
  if (clean.length <= visible) return 'X' * clean.length;
  final tail = clean.substring(clean.length - visible);
  if (RegExp(r'^\d{12}$').hasMatch(clean)) return 'XXXX XXXX $tail';
  return '${'X' * (clean.length - visible)}$tail';
}

/// `123456784821` -> `XXXXXXXX4821`.
String maskAccountNumber(String raw, {int visible = 4}) {
  final digits = raw.replaceAll(RegExp(r'\D'), '');
  if (digits.isEmpty) return '';
  if (digits.length <= visible) return 'X' * digits.length;
  return '${'X' * (digits.length - visible)}${digits.substring(digits.length - visible)}';
}

/// The last [count] digits, for labels such as "HDFC Bank •••• 4821".
String lastDigits(String raw, {int count = 4}) {
  final digits = raw.replaceAll(RegExp(r'\D'), '');
  return digits.length <= count
      ? digits
      : digits.substring(digits.length - count);
}
