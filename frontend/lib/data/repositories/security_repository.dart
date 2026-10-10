import 'package:blocks_app/data/models/security_models.dart';

/// Account security: policy, timeline, contacts, two-factor and alert options.
///
/// Demo: [MockSecurityRepository]. Production: an API client; every rule
/// below is enforced by the backend, never decided by the app.
abstract interface class SecurityRepository {
  Future<SecurityPolicy> getPolicy();

  // ------------------------------------------------------------ timeline --

  /// Newest first.
  Future<List<SecurityEvent>> getEvents({
    SecurityEventFilter filter = SecurityEventFilter.all,
    int limit = 100,
  });

  /// Throws `NotFoundFailure` for an unknown id.
  Future<SecurityEvent> getEvent(String id);

  /// "This was me" on an alert.
  Future<SecurityEvent> acknowledgeEvent(String id);

  // ------------------------------------------------------------ contacts --

  Future<AccountContacts> getContacts();

  /// Step 1 of changing the e-mail / phone. Re-checks [currentPassword] and
  /// sends a code to the **new** address. Throws `ValidationFailure` with a
  /// reason key (`invalidEmail`, `invalidPhone`, `wrongPassword`, `sameValue`).
  Future<OtpChallenge> startContactChange({
    required OtpChannel channel,
    required String newValue,
    required String currentPassword,
  });

  Future<OtpChallenge> resendContactChangeCode(String challengeId);

  Future<OtpResult> verifyContactChange({
    required String challengeId,
    required String code,
  });

  /// Final step: applies the change using the token from [verifyContactChange]
  /// and alerts the *previous* address.
  Future<AccountContacts> confirmContactChange({required String token});

  // ----------------------------------------------------- two-factor (2FA) --

  Future<TwoFactorSettings> getTwoFactor();

  Future<OtpChallenge> startTwoFactorSetup(TwoFactorMethod method);

  Future<OtpChallenge> resendTwoFactorCode(String challengeId);

  /// Enables 2FA when the code is right.
  Future<OtpResult> confirmTwoFactorSetup({
    required String challengeId,
    required String code,
  });

  /// Throws `ValidationFailure('wrongPassword')` if the password is wrong.
  Future<TwoFactorSettings> disableTwoFactor({required String currentPassword});

  Future<TwoFactorSettings> setEmailFallback({required bool enabled});

  // -------------------------------------------------------------- alerts --

  Future<SecurityAlertPreferences> getAlertPreferences();

  Future<SecurityAlertPreferences> setAlertPreferences(
    SecurityAlertPreferences prefs,
  );

  /// Security e-mails the server sent (demo transparency; newest first).
  Future<List<SentSecurityEmail>> getSentAlerts();
}
