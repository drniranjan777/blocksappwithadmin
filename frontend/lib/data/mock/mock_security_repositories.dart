import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/core/utils/contact_utils.dart';
import 'package:blocks_app/data/mock/mock_security_state.dart';
import 'package:blocks_app/data/mock/mock_world.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/data/repositories/password_repository.dart';
import 'package:blocks_app/data/repositories/security_repository.dart';
import 'package:blocks_app/data/repositories/session_repository.dart';
import 'package:blocks_app/data/services/security_demo_service.dart';
import 'package:blocks_app/features/security/domain/login_attempt_tracker.dart';

const _purposeContact = 'contact';
const _purposeReset = 'reset';
const _purposeTwoFactor = 'two-factor';

/// Mirrors the server's checks so mock behaviour matches production rules.
void _requirePassword(MockSecurityState s, String password) {
  if (password != s.password) throw const ValidationFailure('wrongPassword');
}

void _requireStrong(MockSecurityState s, String password) {
  if (!s.policy.password.isSatisfiedBy(password)) {
    throw const ValidationFailure('weakPassword');
  }
}

// ---------------------------------------------------------------- security --

class MockSecurityRepository implements SecurityRepository {
  MockSecurityRepository(this._w);

  final MockWorld _w;
  MockSecurityState get _s => _w.security;

  @override
  Future<SecurityPolicy> getPolicy() async => _s.policy;

  @override
  Future<List<SecurityEvent>> getEvents({
    SecurityEventFilter filter = SecurityEventFilter.all,
    int limit = 100,
  }) async {
    await _w.pause();
    return _s.events.where(filter.matches).take(limit).toList();
  }

  @override
  Future<SecurityEvent> getEvent(String id) async {
    for (final e in _s.events) {
      if (e.id == id) return e;
    }
    throw NotFoundFailure('Security event $id not found');
  }

  @override
  Future<SecurityEvent> acknowledgeEvent(String id) async {
    await _w.pause();
    final i = _s.events.indexWhere((e) => e.id == id);
    if (i < 0) throw NotFoundFailure('Security event $id not found');
    final updated = _s.events[i].copyWith(acknowledged: true);
    _s.events[i] = updated;
    return updated;
  }

  @override
  Future<AccountContacts> getContacts() async => AccountContacts(
    maskedEmail: maskEmail(_s.email),
    maskedPhone: maskPhone(_s.phone),
  );

  // ----------------------------------------------------- contact change --

  @override
  Future<OtpChallenge> startContactChange({
    required OtpChannel channel,
    required String newValue,
    required String currentPassword,
  }) async {
    await _w.pause();
    _requirePassword(_s, currentPassword);

    final String value;
    switch (channel) {
      case OtpChannel.email:
        if (!isValidEmail(newValue)) {
          throw const ValidationFailure('invalidEmail');
        }
        value = newValue.trim().toLowerCase();
        if (value == _s.email.toLowerCase()) {
          throw const ValidationFailure('sameValue');
        }
      case OtpChannel.phone:
        final phone = normalizeIndianPhone(newValue);
        if (phone == null) throw const ValidationFailure('invalidPhone');
        if (phone == _s.phone) throw const ValidationFailure('sameValue');
        value = phone;
      case OtpChannel.authenticator:
        throw const ValidationFailure('invalidChannel');
    }
    return _s.otp.issue(
      channel: channel,
      destination: value,
      purpose: _purposeContact,
      payload: value,
    );
  }

  @override
  Future<OtpChallenge> resendContactChangeCode(String challengeId) async {
    await _w.pause();
    return _s.otp.resend(challengeId);
  }

  @override
  Future<OtpResult> verifyContactChange({
    required String challengeId,
    required String code,
  }) async {
    await _w.pause();
    return _s.otp.verify(challengeId, code);
  }

  @override
  Future<AccountContacts> confirmContactChange({required String token}) async {
    await _w.pause();
    final value = _s.otp.consume(token, _purposeContact)! as String;
    if (value.contains('@')) {
      // Raised first so the alert goes to the *previous* address.
      _s.raise(SecurityEventType.emailChanged);
      _s.email = value;
    } else {
      _s.raise(SecurityEventType.phoneChanged);
      _s.phone = value;
    }
    return getContacts();
  }

  // ------------------------------------------------------------ two-factor --

  @override
  Future<TwoFactorSettings> getTwoFactor() async => _s.twoFactor;

  @override
  Future<OtpChallenge> startTwoFactorSetup(TwoFactorMethod method) async {
    await _w.pause();
    return switch (method) {
      TwoFactorMethod.sms => _s.otp.issue(
        channel: OtpChannel.phone,
        destination: _s.phone,
        purpose: _purposeTwoFactor,
        payload: method,
      ),
      TwoFactorMethod.authenticatorApp => _s.otp.issue(
        channel: OtpChannel.authenticator,
        destination: 'authenticator',
        purpose: _purposeTwoFactor,
        payload: method,
      ),
    };
  }

  @override
  Future<OtpChallenge> resendTwoFactorCode(String challengeId) async {
    await _w.pause();
    return _s.otp.resend(challengeId);
  }

  @override
  Future<OtpResult> confirmTwoFactorSetup({
    required String challengeId,
    required String code,
  }) async {
    await _w.pause();
    final result = _s.otp.verify(challengeId, code);
    if (result is OtpVerified) {
      final method =
          _s.otp.consume(result.token, _purposeTwoFactor)! as TwoFactorMethod;
      _s.twoFactor = _s.twoFactor.copyWith(enabled: true, method: method);
      _w.me = _w.me.copyWith(isTwoFactorEnabled: true);
      _s.raise(SecurityEventType.twoFactorEnabled);
    }
    return result;
  }

  @override
  Future<TwoFactorSettings> disableTwoFactor({
    required String currentPassword,
  }) async {
    await _w.pause();
    _requirePassword(_s, currentPassword);
    _s.twoFactor = _s.twoFactor.copyWith(enabled: false);
    _w.me = _w.me.copyWith(isTwoFactorEnabled: false);
    _s.raise(SecurityEventType.twoFactorDisabled);
    return _s.twoFactor;
  }

  @override
  Future<TwoFactorSettings> setEmailFallback({required bool enabled}) async {
    await _w.pause();
    _s.twoFactor = _s.twoFactor.copyWith(emailFallback: enabled);
    return _s.twoFactor;
  }

  // ---------------------------------------------------------------- alerts --

  @override
  Future<SecurityAlertPreferences> getAlertPreferences() async => _s.alerts;

  @override
  Future<SecurityAlertPreferences> setAlertPreferences(
    SecurityAlertPreferences prefs,
  ) async {
    await _w.pause();
    _s.alerts = prefs;
    return prefs;
  }

  @override
  Future<List<SentSecurityEmail>> getSentAlerts() async => [..._s.outbox];
}

// ---------------------------------------------------------------- sessions --

class MockSessionRepository implements SessionRepository {
  MockSessionRepository(this._w);

  final MockWorld _w;
  MockSecurityState get _s => _w.security;

  @override
  Future<List<DeviceSession>> getSessions() async {
    await _w.pause();
    final others = _s.sessions.where((x) => !x.isCurrent).toList()
      ..sort((a, b) => b.lastActive.compareTo(a.lastActive));
    return [..._s.sessions.where((x) => x.isCurrent), ...others];
  }

  @override
  Future<void> revokeSession(String sessionId) async {
    await _w.pause();
    final i = _s.sessions.indexWhere((x) => x.id == sessionId);
    if (i < 0) throw NotFoundFailure('Session $sessionId not found');
    final session = _s.sessions[i];
    if (session.isCurrent) throw const ValidationFailure('currentSession');
    _s.sessions.removeAt(i);
    _s.raise(
      SecurityEventType.sessionRevoked,
      device: DeviceDescriptor(
        name: session.deviceName,
        platform: session.platform,
        appOrBrowser: session.appOrBrowser,
        approximateLocation: session.approximateLocation,
      ),
    );
  }

  @override
  Future<void> revokeAllOtherSessions() async {
    await _w.pause();
    final before = _s.sessions.length;
    _s.sessions.removeWhere((x) => !x.isCurrent);
    if (_s.sessions.length == before) return;
    _s.raise(
      SecurityEventType.sessionRevoked,
      device: DeviceDescriptor(
        name: 'All other devices',
        platform: 'All',
        appOrBrowser: '',
        approximateLocation: _s.currentDevice.approximateLocation,
      ),
    );
  }
}

// --------------------------------------------------------------- passwords --

class MockPasswordRepository implements PasswordRepository {
  MockPasswordRepository(this._w);

  final MockWorld _w;

  @override
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    await _w.pause();
    final s = _w.security;
    if (currentPassword != s.password) {
      throw const ValidationFailure('wrongCurrentPassword');
    }
    if (newPassword == currentPassword) {
      throw const ValidationFailure('samePassword');
    }
    _requireStrong(s, newPassword);
    s.password = newPassword;
    s.raise(SecurityEventType.passwordChanged);
  }
}

class MockPasswordResetRepository implements PasswordResetRepository {
  MockPasswordResetRepository(this._w);

  final MockWorld _w;
  MockSecurityState get _s => _w.security;

  @override
  Future<OtpChallenge> startReset({
    required OtpChannel channel,
    required String destination,
  }) async {
    await _w.pause();
    final String normalized;
    switch (channel) {
      case OtpChannel.email:
        if (!isValidEmail(destination)) {
          throw const ValidationFailure('invalidEmail');
        }
        normalized = destination.trim().toLowerCase();
      case OtpChannel.phone:
        final phone = normalizeIndianPhone(destination);
        if (phone == null) throw const ValidationFailure('invalidPhone');
        normalized = phone;
      case OtpChannel.authenticator:
        throw const ValidationFailure('invalidChannel');
    }
    // Demo: any well-formed destination works. A real server answers the same
    // way whether or not an account exists, so this cannot be used to probe
    // for registered e-mails or numbers.
    return _s.otp.issue(
      channel: channel,
      destination: normalized,
      purpose: _purposeReset,
    );
  }

  @override
  Future<OtpChallenge> resendCode(String challengeId) async {
    await _w.pause();
    return _s.otp.resend(challengeId);
  }

  @override
  Future<OtpResult> verifyCode({
    required String challengeId,
    required String code,
  }) async {
    await _w.pause();
    return _s.otp.verify(challengeId, code);
  }

  @override
  Future<void> completeReset({
    required String token,
    required String newPassword,
  }) async {
    await _w.pause();
    _s.otp.consume(token, _purposeReset);
    _requireStrong(_s, newPassword);
    _s
      ..password = newPassword
      // A reset ends temporary protection and signs out every other device.
      ..tracker.clear()
      ..sessions.removeWhere((x) => !x.isCurrent);
    _s.raise(SecurityEventType.passwordChanged);
  }
}

// -------------------------------------------------------------- demo lab ---

class MockSecurityDemoService implements SecurityDemoService {
  MockSecurityDemoService(this._w);

  final MockWorld _w;
  MockSecurityState get _s => _w.security;

  /// A device the user does not own, as the server would record it.
  static const _attacker = DeviceDescriptor(
    name: 'Chrome on Windows',
    platform: 'Windows',
    appOrBrowser: 'Chrome',
    approximateLocation: 'Hyderabad, India',
  );

  static const _newPhone = DeviceDescriptor(
    name: 'Pixel 8',
    platform: 'Android',
    appOrBrowser: 'Chrome',
    approximateLocation: 'Pune, India',
  );

  /// One wrong password; raises the suspicious-login alert when it reaches
  /// the limit. Returns the alert's event id, if one was raised.
  String? _failedAttempt() {
    final outcome = _s.tracker.recordFailure(_s.now());
    _s.raise(SecurityEventType.loginFailed, device: _attacker);
    if (outcome is AttemptProtectionTriggered) {
      return _s
          .raise(
            SecurityEventType.suspiciousLogin,
            device: _attacker,
            attempts: outcome.failedAttempts,
          )
          .id;
    }
    return null;
  }

  @override
  Future<DemoScenarioResult> run(DemoScenario scenario) async {
    await _w.pause();
    switch (scenario) {
      case DemoScenario.normalLogin:
        _s.tracker.recordSuccess();
        final e = _s.raise(SecurityEventType.loginSuccess);
        return DemoScenarioResult(scenario: scenario, eventId: e.id);

      case DemoScenario.wrongPassword:
        final alert = _failedAttempt();
        return DemoScenarioResult(
          scenario: scenario,
          eventId: alert ?? _s.events.first.id,
          alertRaised: alert != null,
        );

      case DemoScenario.maxFailedAttempts:
        String? alert;
        for (var i = 0; i < _s.policy.maxFailedAttempts && alert == null; i++) {
          alert = _failedAttempt();
        }
        return DemoScenarioResult(
          scenario: scenario,
          eventId: alert,
          alertRaised: alert != null,
        );

      case DemoScenario.suspiciousLogin:
        final e = _s.raise(
          SecurityEventType.suspiciousLogin,
          device: _attacker,
        );
        return DemoScenarioResult(
          scenario: scenario,
          eventId: e.id,
          alertRaised: true,
        );

      case DemoScenario.passwordChanged:
        final e = _s.raise(SecurityEventType.passwordChanged);
        return DemoScenarioResult(scenario: scenario, eventId: e.id);

      case DemoScenario.newDeviceLogin:
        _s.registerSignIn(_newPhone);
        final e = _s.raise(
          SecurityEventType.loginSuccess,
          device: _newPhone,
          newDevice: true,
        );
        return DemoScenarioResult(scenario: scenario, eventId: e.id);

      case DemoScenario.sessionRevoked:
        // Make sure there is another device to log out.
        if (_s.sessions.every((x) => x.isCurrent)) _s.registerSignIn(_newPhone);
        final target =
            (_s.sessions.where((x) => !x.isCurrent).toList()
                  ..sort((a, b) => b.lastActive.compareTo(a.lastActive)))
                .first;
        await MockSessionRepository(_w).revokeSession(target.id);
        return DemoScenarioResult(
          scenario: scenario,
          eventId: _s.events.first.id,
        );

      case DemoScenario.photoUploadFails:
        _s.failNextPhotoUpload = true;
        return const DemoScenarioResult(
          scenario: DemoScenario.photoUploadFails,
        );
    }
  }

  @override
  Future<void> reset() async {
    await _w.pause();
    _s.reset();
    _w.readNotifications.removeWhere((id) => id.startsWith('sec~n'));
  }

  @override
  Future<DemoServerStatus> status() async => DemoServerStatus(
    failedAttempts: _s.tracker.failedAttempts,
    maxAttempts: _s.policy.maxFailedAttempts,
    protectedUntil: _s.tracker.protectedUntil(_s.now()),
    emailsSent: _s.outbox.length,
    activeSessions: _s.sessions.length,
    photoUploadWillFail: _s.failNextPhotoUpload,
  );
}
