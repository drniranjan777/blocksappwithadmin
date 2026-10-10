import 'package:blocks_app/core/utils/contact_utils.dart';

/// Demo-only sign-in values for the mock server.
///
/// These belong to the fictional demo user and open nothing real. They are
/// shown on the sign-in and verification screens **in demo builds only**;
/// production has no such values and never displays a one-time code.
abstract final class DemoCredentials {
  static const email = 'aarav@blocks.example';
  static const phone = '+919876543210';
  static const username = 'aarav.blocks';
  static const password = 'Demo@Pass2026';

  /// Every one-time code in the demo.
  static const otp = '123456';

  /// Whether [identifier] (e-mail, phone or username) names the demo account.
  static bool matchesIdentifier(
    String identifier, {
    String? email,
    String? phone,
  }) {
    final id = identifier.trim();
    if (id.isEmpty) return false;
    final lower = id.toLowerCase();
    if (lower == (email ?? DemoCredentials.email).toLowerCase()) return true;
    final bare = lower.startsWith('@') ? lower.substring(1) : lower;
    if (bare == username) return true;
    final normalized = normalizeIndianPhone(id);
    return normalized != null && normalized == (phone ?? DemoCredentials.phone);
  }
}
