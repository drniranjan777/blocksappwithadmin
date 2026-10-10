import 'package:blocks_app/data/models/security_models.dart';

/// Sends the security e-mails (and, in production, push alerts).
///
/// **This is a backend responsibility.** It exists here only so the demo's
/// mock "server" can show that an alert was generated. The app must never hold
/// mail credentials and must never call a real mail provider: production has
/// `EmailSecurityNotificationService` on the server, triggered by the same
/// security events.
abstract interface class SecurityNotificationService {
  Future<void> sendSuspiciousLoginAlert(SecurityEvent event);

  Future<void> sendPasswordChangedAlert(SecurityEvent event);

  Future<void> sendEmailChangedAlert(SecurityEvent event);

  Future<void> sendPhoneChangedAlert(SecurityEvent event);

  /// A payout bank account was added, removed or made primary. Always sent:
  /// it is the alert that lets an account owner catch a payout hijack.
  Future<void> sendPayoutAccountChangedAlert(SecurityEvent event);
}
