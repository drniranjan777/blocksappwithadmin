import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/api/api_client.dart';
import 'package:blocks_app/data/api/json_reader.dart';
import 'package:blocks_app/data/api/otp_support.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/data/repositories/security_repository.dart';
import 'package:blocks_app/features/security/domain/password_policy.dart';

/// Account security against the real API: rules, login activity, contacts,
/// two-step sign-in status and alert options.
///
/// Not connected yet (each throws a clear [ForbiddenFailure]):
///  * turning two-step sign-in ON. The server needs the password, shows an
///    authenticator secret / sends a code, and hands out one-time backup codes;
///    the screens for that were built for the demo and do not collect or show
///    any of it yet;
///  * the e-mail fallback switch, which the server has no equivalent for.
class ApiSecurityRepository implements SecurityRepository {
  ApiSecurityRepository(this._api, {DateTime Function()? now})
    : _now = now ?? DateTime.now;

  final ApiClient _api;
  final DateTime Function() _now;

  final Map<String, OtpChallenge> _challenges = {};

  // -------------------------------------------------------------- policy --

  /// The numbers come from the server (`GET /auth/policy`), so the screens show
  /// the same limits the server enforces.
  @override
  Future<SecurityPolicy> getPolicy() async {
    final p = JsonObject.of((await _api.get('/auth/policy')).data);
    final password = p.object('password');
    final signIn = p.object('signIn');
    final code = p.object('code');
    return SecurityPolicy(
      maxFailedAttempts: signIn.integer('maxFailedAttempts', fallback: 5),
      protectionDuration: Duration(
        minutes: signIn.integer('lockMinutes', fallback: 15),
      ),
      otpLength: code.integer('length', fallback: 6),
      otpExpiry: Duration(
        minutes: code.integer('expiresMinutes', fallback: 10),
      ),
      otpMaxAttempts: code.integer('maxAttempts', fallback: 5),
      otpResendCooldown: Duration(
        seconds: code.integer('resendCooldownSeconds', fallback: 30),
      ),
      password: PasswordPolicy(
        minLength: password.integer('minLength', fallback: 10),
        requireUppercase: password.boolean('requireUppercase', fallback: true),
        requireLowercase: password.boolean('requireLowercase', fallback: true),
        requireDigit: password.boolean('requireDigit', fallback: true),
        requireSpecial: password.boolean('requireSpecial', fallback: true),
      ),
    );
  }

  // ------------------------------------------------------------ timeline --

  static String _kind(SecurityEventFilter f) => switch (f) {
    SecurityEventFilter.all => 'all',
    SecurityEventFilter.successful => 'successful',
    SecurityEventFilter.failed => 'failed',
    SecurityEventFilter.suspicious => 'suspicious',
  };

  @override
  Future<List<SecurityEvent>> getEvents({
    SecurityEventFilter filter = SecurityEventFilter.all,
    int limit = 100,
  }) async {
    final events = <SecurityEvent>[];
    String? cursor;
    // Pages of at most 50, until `limit` is reached or the log runs out.
    while (events.length < limit) {
      final answer = await _api.get(
        '/security/events',
        query: {
          'kind': _kind(filter),
          'cursor': cursor,
          'limit': clampPage(limit - events.length),
        },
      );
      for (final e in answer.objects()) {
        final event = securityEventFrom(e);
        if (event != null) events.add(event);
      }
      if (!answer.hasMore) break;
      cursor = answer.nextCursor;
    }
    return events;
  }

  @override
  Future<SecurityEvent> getEvent(String id) async {
    final answer = await _api.get('/security/events/${seg(id)}');
    return securityEventFrom(answer.object()) ??
        (throw const NotFoundFailure('Event'));
  }

  @override
  Future<SecurityEvent> acknowledgeEvent(String id) async {
    final answer = await _api.post('/security/events/${seg(id)}/acknowledge');
    return securityEventFrom(answer.object()) ??
        (throw const NotFoundFailure('Event'));
  }

  // ------------------------------------------------------------ contacts --

  @override
  Future<AccountContacts> getContacts() async {
    final c = JsonObject.of((await _api.get('/account/contacts')).data);
    return AccountContacts(
      maskedEmail: c.objectOrNull('email')?.stringOr('value', '') ?? '',
      maskedPhone: c.objectOrNull('phone')?.stringOr('value', '') ?? '',
    );
  }

  /// Reasons: `invalidEmail`, `invalidPhone`, `wrongPassword`,
  /// `tooManyAttempts`.
  @override
  Future<OtpChallenge> startContactChange({
    required OtpChannel channel,
    required String newValue,
    required String currentPassword,
  }) async {
    final isEmail = channel == OtpChannel.email;
    try {
      final answer = await _api.post(
        '/account/contacts/change',
        body: {
          'kind': isEmail ? 'email' : 'phone',
          'newValue': newValue.trim(),
          'password': currentPassword,
        },
      );
      final challenge = otpChallengeFrom(
        JsonObject.of(answer.data).object('verification'),
        now: _now(),
        fallbackDestination: newValue.trim(),
      );
      _challenges[challenge.id] = challenge;
      return challenge;
    } on UnauthorizedFailure catch (e) {
      if (e.code == 'INVALID_CREDENTIALS') {
        throw const ValidationFailure('wrongPassword');
      }
      rethrow;
    } on ForbiddenFailure catch (e) {
      if (e.code == 'ACCOUNT_LOCKED') {
        throw const ValidationFailure('tooManyAttempts');
      }
      rethrow;
    } on FieldValidationFailure {
      throw ValidationFailure(isEmail ? 'invalidEmail' : 'invalidPhone');
    }
  }

  @override
  Future<OtpChallenge> resendContactChangeCode(String challengeId) async {
    final answer = await _api.post(
      '/auth/resend',
      body: {'challengeId': challengeId},
      authenticated: false,
    );
    final before = _challenges[challengeId];
    final fresh = otpChallengeFrom(
      JsonObject.of(answer.data),
      now: _now(),
      fallbackDestination: before?.maskedDestination ?? '',
    );
    _challenges[fresh.id] = fresh;
    return fresh;
  }

  /// The server makes the change as soon as the code is right, so the answer is
  /// already "applied" and there is nothing more to confirm.
  @override
  Future<OtpResult> verifyContactChange({
    required String challengeId,
    required String code,
  }) async {
    try {
      await _api.post(
        '/account/contacts/change/confirm',
        body: {'challengeId': challengeId, 'code': code.trim()},
      );
      _challenges.remove(challengeId);
      return const OtpVerified(token: '', applied: true);
    } on AppFailure catch (e) {
      final newCodeAt =
          _challenges[challengeId]?.resendAvailableAt ??
          _now().add(const Duration(seconds: 30));
      final result = otpResultOf(e, newCodeAt: newCodeAt);
      if (result != null) return result;
      rethrow;
    }
  }

  /// Nothing to do: the change was applied by [verifyContactChange].
  @override
  Future<AccountContacts> confirmContactChange({required String token}) =>
      getContacts();

  // ----------------------------------------------------- two-factor (2FA) --

  @override
  Future<TwoFactorSettings> getTwoFactor() async {
    final t = JsonObject.of((await _api.get('/security/two-factor')).data);
    final method = t.stringOrNull('method');
    return TwoFactorSettings(
      enabled: t.boolean('enabled'),
      // An authenticator app is the one method that is not a texted/e-mailed code.
      method: method == 'totp'
          ? TwoFactorMethod.authenticatorApp
          : TwoFactorMethod.sms,
      emailFallback: method == 'email',
    );
  }

  @override
  Future<OtpChallenge> startTwoFactorSetup(TwoFactorMethod method) async =>
      throw const ForbiddenFailure(
        'Turning on two-step sign-in is not available in this build yet',
        'NOT_AVAILABLE',
      );

  @override
  Future<OtpChallenge> resendTwoFactorCode(String challengeId) async =>
      throw const ForbiddenFailure(
        'Not available in this build yet',
        'NOT_AVAILABLE',
      );

  @override
  Future<OtpResult> confirmTwoFactorSetup({
    required String challengeId,
    required String code,
  }) async => throw const ForbiddenFailure(
    'Not available in this build yet',
    'NOT_AVAILABLE',
  );

  /// Reason: `wrongPassword`.
  @override
  Future<TwoFactorSettings> disableTwoFactor({
    required String currentPassword,
  }) async {
    try {
      await _api.post(
        '/security/two-factor/disable',
        body: {'password': currentPassword},
      );
    } on UnauthorizedFailure catch (e) {
      if (e.code == 'INVALID_CREDENTIALS') {
        throw const ValidationFailure('wrongPassword');
      }
      rethrow;
    } on ForbiddenFailure catch (e) {
      if (e.code == 'ACCOUNT_LOCKED') {
        throw const ValidationFailure('tooManyAttempts');
      }
      rethrow;
    }
    return getTwoFactor();
  }

  @override
  Future<TwoFactorSettings> setEmailFallback({required bool enabled}) async =>
      throw const ForbiddenFailure(
        'There is no separate e-mail fallback setting',
        'NOT_AVAILABLE',
      );

  // -------------------------------------------------------------- alerts --

  @override
  Future<SecurityAlertPreferences> getAlertPreferences() async => _prefs(
    JsonObject.of((await _api.get('/security/alert-preferences')).data),
  );

  SecurityAlertPreferences _prefs(JsonObject p) => SecurityAlertPreferences(
    emailCopies: p.boolean('securityAlertEmail', fallback: true),
    pushAlerts: p.boolean('securityAlertPush', fallback: true),
    newDeviceAlerts: p.boolean('loginAlerts', fallback: true),
  );

  @override
  Future<SecurityAlertPreferences> setAlertPreferences(
    SecurityAlertPreferences prefs,
  ) async => _prefs(
    JsonObject.of(
      (await _api.put(
        '/security/alert-preferences',
        body: {
          'securityAlertEmail': prefs.emailCopies,
          'securityAlertPush': prefs.pushAlerts,
          'loginAlerts': prefs.newDeviceAlerts,
        },
      )).data,
    ),
  );

  @override
  Future<List<SentSecurityEmail>> getSentAlerts() async {
    final answer = await _api.get('/security/sent-alerts');
    return [for (final row in answer.objects()) ?sentAlertFrom(row)];
  }
}

// ----------------------------------------------------------------- mapping --

/// The server's event type as the app's. Types the app has no screen for
/// (administrator actions, account-deletion steps) are left out of the list.
SecurityEventType? securityEventTypeOf(String type) => switch (type) {
  'LOGIN_SUCCESS' || 'NEW_DEVICE_LOGIN' => SecurityEventType.loginSuccess,
  'LOGIN_FAILED' ||
  'LOGIN_BLOCKED' ||
  'ACCOUNT_LOCKED' => SecurityEventType.loginFailed,
  'SUSPICIOUS_LOGIN' ||
  'REFRESH_TOKEN_REUSE' => SecurityEventType.suspiciousLogin,
  'PASSWORD_CHANGED' || 'PASSWORD_RESET' => SecurityEventType.passwordChanged,
  'EMAIL_CHANGED' => SecurityEventType.emailChanged,
  'PHONE_CHANGED' => SecurityEventType.phoneChanged,
  'TWO_FACTOR_ENABLED' => SecurityEventType.twoFactorEnabled,
  'TWO_FACTOR_DISABLED' => SecurityEventType.twoFactorDisabled,
  'SESSION_REVOKED' ||
  'ALL_SESSIONS_REVOKED' => SecurityEventType.sessionRevoked,
  'PAYOUT_ACCOUNT_CHANGED' => SecurityEventType.payoutAccountChanged,
  'IDENTITY_DETAILS_CHANGED' => SecurityEventType.identityDetailsChanged,
  _ => null,
};

SecurityEventStatus _statusOf(String type) => switch (type) {
  'LOGIN_SUCCESS' || 'NEW_DEVICE_LOGIN' => SecurityEventStatus.success,
  'LOGIN_FAILED' ||
  'LOGIN_BLOCKED' ||
  'ACCOUNT_LOCKED' => SecurityEventStatus.failed,
  'SUSPICIOUS_LOGIN' || 'REFRESH_TOKEN_REUSE' => SecurityEventStatus.suspicious,
  _ => SecurityEventStatus.info,
};

/// One entry of the login-activity log, or null for a type the app does not show.
/// Device and place were recorded by the server from the request itself.
SecurityEvent? securityEventFrom(JsonObject e) {
  final type = e.string('type');
  final mapped = securityEventTypeOf(type);
  if (mapped == null) return null;
  final device = e.stringOr('deviceLabel', '');
  return SecurityEvent(
    id: e.string('id'),
    type: mapped,
    timestamp: e.date('createdAt'),
    deviceName: device,
    platform: _platformOf(device),
    approximateLocation: e.stringOr('locationLabel', ''),
    status: _statusOf(type),
    acknowledged: e.boolean('acknowledged'),
  );
}

/// The server writes labels like "Pixel 8 (Android)"; the platform is the part
/// in brackets, when there is one.
String _platformOf(String deviceLabel) {
  final m = RegExp(r'\(([^)]+)\)\s*$').firstMatch(deviceLabel);
  return switch (m?.group(1)) {
    'android' => 'Android',
    'ios' => 'iOS',
    'web' => 'Web',
    final other? => other,
    null => '',
  };
}

SecurityEventType? _sentTypeOf(String template, String subject) =>
    switch (template) {
      'security_new_device' => SecurityEventType.loginSuccess,
      'security_suspicious_login' ||
      'security_token_reuse' => SecurityEventType.suspiciousLogin,
      'security_account_locked' => SecurityEventType.loginFailed,
      'security_password_changed' => SecurityEventType.passwordChanged,
      'security_two_factor_enabled' => SecurityEventType.twoFactorEnabled,
      'security_two_factor_disabled' => SecurityEventType.twoFactorDisabled,
      'security_sessions_revoked' ||
      'security_secure_account' => SecurityEventType.sessionRevoked,
      'security_payout_account_changed' =>
        SecurityEventType.payoutAccountChanged,
      'security_contact_changed' =>
        subject.toLowerCase().contains('phone')
            ? SecurityEventType.phoneChanged
            : SecurityEventType.emailChanged,
      _ => null,
    };

/// One security e-mail the server sent. The app's list has no id of the event it
/// was about, so [SentSecurityEmail.eventId] is empty.
SentSecurityEmail? sentAlertFrom(JsonObject row) {
  final type = _sentTypeOf(
    row.stringOr('template', ''),
    row.stringOr('subject', ''),
  );
  if (type == null) return null;
  return SentSecurityEmail(
    id: row.string('id'),
    eventId: '',
    type: type,
    maskedTo: row.stringOr('to', ''),
    sentAt: row.date('sentAt'),
  );
}
