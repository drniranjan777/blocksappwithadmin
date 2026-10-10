import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/core/utils/contact_utils.dart';
import 'package:blocks_app/data/mock/demo_credentials.dart';
import 'package:blocks_app/data/mock/mock_world.dart';
import 'package:blocks_app/data/models/content_models.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/data/services/security_notification_service.dart';
import 'package:blocks_app/features/security/domain/login_attempt_tracker.dart';
import 'package:blocks_app/features/security/domain/security_targets.dart';

/// Everything the mock "auth / security server" knows about the demo account.
///
/// This object plays the backend: it counts failed sign-ins, issues and
/// checks one-time codes, records the security timeline, tracks sessions and
/// "sends" alerts. Nothing here is trusted from, or computed by, the UI.
class MockSecurityState {
  MockSecurityState(this.world, this.currentDevice) {
    notificationService = MockSecurityNotificationService(this);
    otp = OtpDesk(this);
    reset();
  }

  final MockWorld world;

  /// How the server sees *this* device (derived server-side in production).
  final DeviceDescriptor currentDevice;

  late final MockSecurityNotificationService notificationService;
  late final OtpDesk otp;

  DateTime now() => world.now();

  // Account ---------------------------------------------------------------
  SecurityPolicy policy = const SecurityPolicy.demo();
  late LoginAttemptTracker tracker;
  late String password;
  late String email;
  late String phone;
  late TwoFactorSettings twoFactor;
  late SecurityAlertPreferences alerts;

  // Timeline, sessions, outbox, notifications (all newest first) ------------
  final List<SecurityEvent> events = [];
  final List<DeviceSession> sessions = [];
  final List<SentSecurityEmail> outbox = [];
  final List<AppNotification> notifications = [];

  /// Demo lab H.
  bool failNextPhotoUpload = false;

  static const currentSessionId = 'sess~current';
  int _seq = 0;

  String nextId(String prefix) => '$prefix~${++_seq}';

  /// Restores the seeded demo data and lifts any protection.
  void reset() {
    policy = const SecurityPolicy.demo();
    tracker = LoginAttemptTracker(
      maxAttempts: policy.maxFailedAttempts,
      protectionFor: policy.protectionDuration,
    );
    password = DemoCredentials.password;
    email = DemoCredentials.email;
    phone = DemoCredentials.phone;
    twoFactor = const TwoFactorSettings(enabled: true);
    alerts = const SecurityAlertPreferences();
    failNextPhotoUpload = false;

    events
      ..clear()
      ..addAll(_seedEvents());
    sessions
      ..clear()
      ..addAll(_seedSessions());
    outbox.clear();
    notifications.clear();
    otp.clear();
    world.me = world.me.copyWith(isTwoFactorEnabled: true);
  }

  List<SecurityEvent> _seedEvents() {
    final t = now();
    SecurityEvent e(
      Duration ago,
      SecurityEventType type,
      SecurityEventStatus status, {
      String? device,
      String? platform,
      String? location,
    }) => SecurityEvent(
      id: nextId('sec'),
      type: type,
      timestamp: t.subtract(ago),
      deviceName: device ?? currentDevice.name,
      platform: platform ?? currentDevice.platform,
      approximateLocation: location ?? currentDevice.approximateLocation,
      status: status,
    );

    return [
      e(
        const Duration(minutes: 20),
        SecurityEventType.loginSuccess,
        SecurityEventStatus.success,
      ),
      e(
        const Duration(minutes: 22),
        SecurityEventType.loginFailed,
        SecurityEventStatus.failed,
        device: 'Unknown device',
        platform: 'Unknown',
        location: 'India',
      ),
      e(
        const Duration(days: 1, hours: 3),
        SecurityEventType.loginSuccess,
        SecurityEventStatus.success,
        device: 'iPhone 15 Pro',
        platform: 'iOS',
        location: 'Hyderabad, India',
      ),
      e(
        const Duration(days: 3),
        SecurityEventType.loginSuccess,
        SecurityEventStatus.success,
        device: 'Samsung Galaxy',
        platform: 'Android',
        location: 'Bengaluru, India',
      ),
      e(
        const Duration(days: 12),
        SecurityEventType.twoFactorEnabled,
        SecurityEventStatus.success,
      ),
    ];
  }

  List<DeviceSession> _seedSessions() {
    final t = now();
    return [
      DeviceSession(
        id: currentSessionId,
        deviceName: currentDevice.name,
        platform: currentDevice.platform,
        appOrBrowser: currentDevice.appOrBrowser,
        approximateLocation: currentDevice.approximateLocation,
        lastActive: t,
        isCurrent: true,
      ),
      DeviceSession(
        id: nextId('sess'),
        deviceName: 'iPhone 15 Pro',
        platform: 'iOS',
        appOrBrowser: 'BLOCKS app',
        approximateLocation: 'Hyderabad, India',
        lastActive: t.subtract(const Duration(hours: 2)),
      ),
      DeviceSession(
        id: nextId('sess'),
        deviceName: 'Samsung Galaxy',
        platform: 'Android',
        appOrBrowser: 'BLOCKS app',
        approximateLocation: 'Bengaluru, India',
        lastActive: t.subtract(const Duration(days: 3)),
      ),
      DeviceSession(
        id: nextId('sess'),
        deviceName: 'MacBook Air',
        platform: 'macOS',
        appOrBrowser: 'Safari',
        approximateLocation: 'Mumbai, India',
        lastActive: t.subtract(const Duration(days: 9)),
      ),
    ];
  }

  // Raising events ---------------------------------------------------------

  static SecurityEventStatus _defaultStatus(SecurityEventType type) =>
      switch (type) {
        SecurityEventType.loginFailed => SecurityEventStatus.failed,
        SecurityEventType.suspiciousLogin => SecurityEventStatus.suspicious,
        SecurityEventType.sessionRevoked ||
        SecurityEventType.twoFactorDisabled => SecurityEventStatus.info,
        _ => SecurityEventStatus.success,
      };

  /// Records an event and fans it out the way a backend would:
  ///
  /// * the timeline always gets it;
  /// * a notification ("push") for everything except plain failed sign-ins;
  /// * an e-mail: always for critical events, and a copy for the rest when the
  ///   user enabled e-mail copies.
  ///
  /// Critical alerts (suspicious sign-in, password / e-mail / phone change)
  /// ignore the optional switches; they cannot be turned off.
  SecurityEvent raise(
    SecurityEventType type, {
    DeviceDescriptor? device,
    int? attempts,
    bool newDevice = false,
  }) {
    final d = device ?? currentDevice;
    final event = SecurityEvent(
      id: nextId('sec'),
      type: type,
      timestamp: now(),
      deviceName: d.name,
      platform: d.platform,
      approximateLocation: d.approximateLocation,
      status: _defaultStatus(type),
      attempts: attempts,
    );
    events.insert(0, event);

    final isNewDeviceLogin =
        type == SecurityEventType.loginSuccess && newDevice;
    final notifies =
        type != SecurityEventType.loginFailed &&
        (type != SecurityEventType.loginSuccess || isNewDeviceLogin);
    if (notifies) {
      final allowed =
          type.isCritical ||
          (isNewDeviceLogin ? alerts.newDeviceAlerts : alerts.pushAlerts);
      if (allowed) _notify(event, newDevice: isNewDeviceLogin);
    }

    switch (type) {
      case SecurityEventType.suspiciousLogin:
        notificationService.sendSuspiciousLoginAlert(event);
      case SecurityEventType.passwordChanged:
        notificationService.sendPasswordChangedAlert(event);
      case SecurityEventType.emailChanged:
        notificationService.sendEmailChangedAlert(event);
      case SecurityEventType.phoneChanged:
        notificationService.sendPhoneChangedAlert(event);
      case SecurityEventType.payoutAccountChanged:
        notificationService.sendPayoutAccountChangedAlert(event);
      case SecurityEventType.loginFailed:
        break;
      case SecurityEventType.loginSuccess ||
          SecurityEventType.twoFactorEnabled ||
          SecurityEventType.twoFactorDisabled ||
          SecurityEventType.identityDetailsChanged ||
          SecurityEventType.sessionRevoked:
        if (alerts.emailCopies &&
            (type != SecurityEventType.loginSuccess || isNewDeviceLogin)) {
          notificationService.sendInformationalCopy(event);
        }
    }
    return event;
  }

  void _notify(SecurityEvent event, {required bool newDevice}) {
    final (title, body, target) = switch (event.type) {
      SecurityEventType.suspiciousLogin => (
        'Security Alert',
        '${event.attempts ?? 'Multiple'} failed login attempts detected.',
        SecurityTargets.alert(event.id),
      ),
      SecurityEventType.passwordChanged => (
        'Password Changed',
        'Your BLOCKS password was changed successfully.',
        SecurityTargets.activity,
      ),
      SecurityEventType.loginSuccess => (
        'New Login',
        'A new device signed into your BLOCKS account.',
        SecurityTargets.alert(event.id),
      ),
      SecurityEventType.sessionRevoked => (
        'Device Removed',
        'A BLOCKS session was logged out.',
        SecurityTargets.devices,
      ),
      SecurityEventType.emailChanged => (
        'Email Changed',
        'Your BLOCKS email address was changed.',
        SecurityTargets.activity,
      ),
      SecurityEventType.phoneChanged => (
        'Phone Number Changed',
        'Your BLOCKS phone number was changed.',
        SecurityTargets.activity,
      ),
      SecurityEventType.twoFactorEnabled => (
        'Two-Factor Authentication On',
        'Two-factor authentication is now protecting your account.',
        SecurityTargets.twoFactor,
      ),
      SecurityEventType.twoFactorDisabled => (
        'Two-Factor Authentication Off',
        'Two-factor authentication was turned off for your account.',
        SecurityTargets.twoFactor,
      ),
      SecurityEventType.payoutAccountChanged => (
        'Payout Account Changed',
        'A bank account on your BLOCKS payouts was added, removed or changed.',
        SecurityTargets.payouts,
      ),
      SecurityEventType.identityDetailsChanged => (
        'Identity Details Submitted',
        'Your identity verification details were submitted for review.',
        SecurityTargets.activity,
      ),
      SecurityEventType.loginFailed => ('', '', SecurityTargets.activity),
    };
    notifications.insert(
      0,
      AppNotification(
        id: nextId('sec~n'),
        category: NotificationCategory.security,
        title: title,
        body: body,
        createdAt: event.timestamp,
        targetId: target,
      ),
    );
  }

  /// Marks a session as signed in from [device] and returns whether the
  /// device was new to the account.
  bool registerSignIn(DeviceDescriptor device) {
    final known = sessions.any(
      (s) => s.deviceName == device.name && s.platform == device.platform,
    );
    final current =
        device.name == currentDevice.name &&
        device.platform == currentDevice.platform;
    if (known || current) return false;
    sessions.add(
      DeviceSession(
        id: nextId('sess'),
        deviceName: device.name,
        platform: device.platform,
        appOrBrowser: device.appOrBrowser,
        approximateLocation: device.approximateLocation,
        lastActive: now(),
      ),
    );
    return true;
  }
}

// ------------------------------------------------------------------ e-mail --

/// Records the alert e-mails the server "sent". Real delivery is a backend
/// job done through a mail provider; the app never has those credentials.
class MockSecurityNotificationService implements SecurityNotificationService {
  MockSecurityNotificationService(this._s);

  final MockSecurityState _s;

  void _send(SecurityEvent event) {
    _s.outbox.insert(
      0,
      SentSecurityEmail(
        id: _s.nextId('mail'),
        eventId: event.id,
        type: event.type,
        maskedTo: maskEmail(_s.email),
        sentAt: _s.now(),
      ),
    );
  }

  @override
  Future<void> sendSuspiciousLoginAlert(SecurityEvent event) async =>
      _send(event);

  @override
  Future<void> sendPasswordChangedAlert(SecurityEvent event) async =>
      _send(event);

  @override
  Future<void> sendEmailChangedAlert(SecurityEvent event) async {
    // Sent to the *previous* address so a hijacker cannot hide the change.
    _send(event);
  }

  @override
  Future<void> sendPhoneChangedAlert(SecurityEvent event) async => _send(event);

  @override
  Future<void> sendPayoutAccountChangedAlert(SecurityEvent event) async =>
      _send(event);

  /// Optional copy for non-critical events (when the user allows it).
  Future<void> sendInformationalCopy(SecurityEvent event) async => _send(event);
}

// -------------------------------------------------------------------- OTP --

class _OtpRecord {
  _OtpRecord({
    required this.id,
    required this.channel,
    required this.destination,
    required this.purpose,
    required this.expiresAt,
    required this.resendAvailableAt,
    this.payload,
  });

  final String id;
  final OtpChannel channel;
  final String destination;
  final String purpose;
  final Object? payload;
  DateTime expiresAt;
  DateTime resendAvailableAt;
  int attempts = 0;
  DateTime? lockedUntil;
}

class _TokenRecord {
  const _TokenRecord(this.purpose, this.payload);

  final String purpose;
  final Object? payload;
}

/// The mock server's one-time-code desk: expiry, attempt limits, resend
/// cool-down and a per-destination lock-out, all counted here and never by
/// the client. The code is always [DemoCredentials.otp].
class OtpDesk {
  OtpDesk(this._s);

  final MockSecurityState _s;
  final Map<String, _OtpRecord> _records = {};
  final Map<String, _TokenRecord> _tokens = {};
  final Map<String, DateTime> _lockedDestinations = {};

  static const _lockFor = Duration(minutes: 5);

  void clear() {
    _records.clear();
    _tokens.clear();
    _lockedDestinations.clear();
  }

  String _maskFor(OtpChannel channel, String destination) => switch (channel) {
    OtpChannel.email => maskEmail(destination),
    OtpChannel.phone => maskPhone(destination),
    OtpChannel.authenticator => '',
  };

  OtpChallenge _challengeOf(_OtpRecord r) => OtpChallenge(
    id: r.id,
    channel: r.channel,
    maskedDestination: _maskFor(r.channel, r.destination),
    length: _s.policy.otpLength,
    expiresAt: r.expiresAt,
    resendAvailableAt: r.resendAvailableAt,
  );

  /// Starts a challenge. Throws `ValidationFailure('tooManyAttempts')` while
  /// the destination is locked from earlier wrong codes.
  OtpChallenge issue({
    required OtpChannel channel,
    required String destination,
    required String purpose,
    Object? payload,
  }) {
    final now = _s.now();
    final lock = _lockedDestinations[destination];
    if (lock != null && now.isBefore(lock)) {
      throw const ValidationFailure('tooManyAttempts');
    }
    final r = _OtpRecord(
      id: _s.nextId('otp'),
      channel: channel,
      destination: destination,
      purpose: purpose,
      payload: payload,
      expiresAt: now.add(_s.policy.otpExpiry),
      resendAvailableAt: now.add(_s.policy.otpResendCooldown),
    );
    _records[r.id] = r;
    return _challengeOf(r);
  }

  _OtpRecord _require(String id) =>
      _records[id] ?? (throw const NotFoundFailure('Unknown code request'));

  OtpChallenge resend(String id) {
    final r = _require(id);
    final now = _s.now();
    if (now.isBefore(r.resendAvailableAt)) {
      throw const ValidationFailure('resendTooSoon');
    }
    if (r.lockedUntil != null) throw const ValidationFailure('tooManyAttempts');
    r
      ..expiresAt = now.add(_s.policy.otpExpiry)
      ..resendAvailableAt = now.add(_s.policy.otpResendCooldown)
      ..attempts = 0;
    return _challengeOf(r);
  }

  OtpResult verify(String id, String code) {
    final r = _require(id);
    final now = _s.now();

    final locked = r.lockedUntil;
    if (locked != null && now.isBefore(locked)) {
      return OtpLocked(retryAt: locked);
    }
    if (!now.isBefore(r.expiresAt)) return const OtpExpired();

    if (code.trim() == DemoCredentials.otp) {
      _records.remove(id);
      final token = _s.nextId('tok');
      _tokens[token] = _TokenRecord(r.purpose, r.payload ?? r.destination);
      return OtpVerified(token: token);
    }

    r.attempts++;
    final remaining = _s.policy.otpMaxAttempts - r.attempts;
    if (remaining <= 0) {
      final until = now.add(_lockFor);
      r.lockedUntil = until;
      _lockedDestinations[r.destination] = until;
      return OtpLocked(retryAt: until);
    }
    return OtpIncorrect(attemptsRemaining: remaining);
  }

  /// Issues a single-use token for [purpose] straight away (used after a
  /// stronger check such as password + code has already passed).
  String mintToken(String purpose, {Object? payload}) {
    final token = _s.nextId('tok');
    _tokens[token] = _TokenRecord(purpose, payload);
    return token;
  }

  /// Spends a single-use token. Throws `UnauthorizedFailure` if it is unknown,
  /// already used, or issued for a different purpose.
  Object? consume(String token, String purpose) {
    final t = _tokens.remove(token);
    if (t == null || t.purpose != purpose) {
      throw const UnauthorizedFailure('Verification expired. Start again.');
    }
    return t.payload;
  }
}
