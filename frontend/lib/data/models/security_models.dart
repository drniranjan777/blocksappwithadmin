import 'package:blocks_app/data/models/auth_models.dart';
import 'package:blocks_app/features/security/domain/password_policy.dart';
import 'package:equatable/equatable.dart';

// ------------------------------------------------------------------ events --

enum SecurityEventType {
  loginSuccess,
  loginFailed,
  suspiciousLogin,
  passwordChanged,
  emailChanged,
  phoneChanged,
  twoFactorEnabled,
  twoFactorDisabled,
  sessionRevoked,

  /// A payout account was added, removed or made primary.
  payoutAccountChanged,

  /// Identity (KYC) details were submitted or changed.
  identityDetailsChanged,
}

enum SecurityEventStatus { success, failed, suspicious, info }

/// Login Activity filter chips.
enum SecurityEventFilter { all, successful, failed, suspicious }

extension SecurityEventTypeX on SecurityEventType {
  /// Critical events are always e-mailed and can never be switched off.
  bool get isCritical => switch (this) {
    SecurityEventType.suspiciousLogin ||
    SecurityEventType.passwordChanged ||
    SecurityEventType.emailChanged ||
    SecurityEventType.phoneChanged ||
    SecurityEventType.payoutAccountChanged => true,
    _ => false,
  };
}

extension SecurityEventFilterX on SecurityEventFilter {
  bool matches(SecurityEvent e) => switch (this) {
    SecurityEventFilter.all => true,
    SecurityEventFilter.successful => e.status == SecurityEventStatus.success,
    SecurityEventFilter.failed => e.status == SecurityEventStatus.failed,
    SecurityEventFilter.suspicious =>
      e.status == SecurityEventStatus.suspicious,
  };
}

/// One entry in the account's security timeline.
///
/// Every value here is **recorded by the server** from the request it saw
/// (device, platform and an *approximate* location derived from the IP). The
/// app only displays it and never supplies or trusts any of it.
class SecurityEvent extends Equatable {
  const SecurityEvent({
    required this.id,
    required this.type,
    required this.timestamp,
    required this.deviceName,
    required this.platform,
    required this.approximateLocation,
    required this.status,
    this.attempts,
    this.acknowledged = false,
  });

  final String id;
  final SecurityEventType type;
  final DateTime timestamp;
  final String deviceName;
  final String platform;

  /// City / region level only, e.g. "Hyderabad, India". Never exact.
  final String approximateLocation;
  final SecurityEventStatus status;

  /// Failed-attempt count for suspicious-login events (server-reported).
  final int? attempts;

  /// The user tapped "This was me" on the alert.
  final bool acknowledged;

  SecurityEvent copyWith({bool? acknowledged}) => SecurityEvent(
    id: id,
    type: type,
    timestamp: timestamp,
    deviceName: deviceName,
    platform: platform,
    approximateLocation: approximateLocation,
    status: status,
    attempts: attempts,
    acknowledged: acknowledged ?? this.acknowledged,
  );

  @override
  List<Object?> get props => [
    id,
    type,
    timestamp,
    deviceName,
    platform,
    approximateLocation,
    status,
    attempts,
    acknowledged,
  ];
}

// ----------------------------------------------------------------- devices --

/// How the server saw the device making a request. Production derives this
/// from the connection and token; it is never read from client-supplied data.
class DeviceDescriptor extends Equatable {
  const DeviceDescriptor({
    required this.name,
    required this.platform,
    required this.appOrBrowser,
    required this.approximateLocation,
  });

  final String name;
  final String platform;
  final String appOrBrowser;
  final String approximateLocation;

  @override
  List<Object?> get props => [
    name,
    platform,
    appOrBrowser,
    approximateLocation,
  ];
}

class DeviceSession extends Equatable {
  const DeviceSession({
    required this.id,
    required this.deviceName,
    required this.platform,
    required this.appOrBrowser,
    required this.approximateLocation,
    required this.lastActive,
    this.isCurrent = false,
  });

  final String id;
  final String deviceName;
  final String platform;
  final String appOrBrowser;
  final String approximateLocation;
  final DateTime lastActive;
  final bool isCurrent;

  @override
  List<Object?> get props => [
    id,
    deviceName,
    platform,
    appOrBrowser,
    approximateLocation,
    lastActive,
    isCurrent,
  ];
}

// --------------------------------------------------------------- contacts --

/// The account's recovery contacts, **already masked by the server**.
class AccountContacts extends Equatable {
  const AccountContacts({required this.maskedEmail, required this.maskedPhone});

  final String maskedEmail;
  final String maskedPhone;

  @override
  List<Object?> get props => [maskedEmail, maskedPhone];
}

// -------------------------------------------------------------------- OTP --

/// Where a code is delivered. [authenticator] has no destination: the code
/// comes from the user's authenticator app.
enum OtpChannel { email, phone, authenticator }

/// A one-time-code request. [maskedDestination] is where the code went.
class OtpChallenge extends Equatable {
  const OtpChallenge({
    required this.id,
    required this.channel,
    required this.maskedDestination,
    required this.length,
    required this.expiresAt,
    required this.resendAvailableAt,
  });

  final String id;
  final OtpChannel channel;
  final String maskedDestination;
  final int length;
  final DateTime expiresAt;
  final DateTime resendAvailableAt;

  @override
  List<Object?> get props => [
    id,
    channel,
    maskedDestination,
    length,
    expiresAt,
    resendAvailableAt,
  ];
}

/// Outcome of checking a code. Attempts are counted by the server.
sealed class OtpResult {
  const OtpResult();
}

class OtpVerified extends OtpResult {
  const OtpVerified({required this.token, this.applied = false});

  /// Single-use proof to present to the next step (set new password,
  /// confirm the change). Opaque to the app.
  final String token;

  /// True when the server acted on the code at once (the live service applies
  /// a new e-mail or phone as soon as the code is right), so there is no
  /// further step to confirm.
  final bool applied;
}

class OtpIncorrect extends OtpResult {
  const OtpIncorrect({required this.attemptsRemaining});

  final int attemptsRemaining;
}

class OtpExpired extends OtpResult {
  const OtpExpired();
}

class OtpLocked extends OtpResult {
  const OtpLocked({required this.retryAt});

  final DateTime retryAt;
}

// ------------------------------------------------------------------ login --

sealed class LoginResult {
  const LoginResult();
}

class LoginSucceeded extends LoginResult {
  const LoginSucceeded({this.isNewDevice = false});

  final bool isNewDevice;
}

/// Wrong identifier or password. The server never says which was wrong.
class LoginRejected extends LoginResult {
  const LoginRejected({required this.attemptsRemaining});

  final int attemptsRemaining;
}

/// The password was right, but the server wants a code before it opens a
/// session. Continue with `AuthRepository.submitCode`.
class LoginNeedsCode extends LoginResult {
  const LoginNeedsCode(this.challenge);

  final CodeChallenge challenge;
}

/// Too many failures: sign-in is paused until [retryAt].
class LoginProtected extends LoginResult {
  const LoginProtected({required this.retryAt, this.justTriggered = false});

  final DateTime retryAt;

  /// True for the failure that tripped protection (vs. a later attempt).
  final bool justTriggered;
}

// ------------------------------------------------------------ 2FA & alerts --

enum TwoFactorMethod { sms, authenticatorApp }

class TwoFactorSettings extends Equatable {
  const TwoFactorSettings({
    required this.enabled,
    this.method = TwoFactorMethod.sms,
    this.emailFallback = true,
  });

  final bool enabled;
  final TwoFactorMethod method;
  final bool emailFallback;

  TwoFactorSettings copyWith({
    bool? enabled,
    TwoFactorMethod? method,
    bool? emailFallback,
  }) => TwoFactorSettings(
    enabled: enabled ?? this.enabled,
    method: method ?? this.method,
    emailFallback: emailFallback ?? this.emailFallback,
  );

  @override
  List<Object?> get props => [enabled, method, emailFallback];
}

/// Optional alert channels. Critical alerts (suspicious sign-ins, password /
/// e-mail / phone changes) are always sent and are not in this list.
class SecurityAlertPreferences extends Equatable {
  const SecurityAlertPreferences({
    this.emailCopies = true,
    this.pushAlerts = true,
    this.newDeviceAlerts = true,
  });

  final bool emailCopies;
  final bool pushAlerts;
  final bool newDeviceAlerts;

  SecurityAlertPreferences copyWith({
    bool? emailCopies,
    bool? pushAlerts,
    bool? newDeviceAlerts,
  }) => SecurityAlertPreferences(
    emailCopies: emailCopies ?? this.emailCopies,
    pushAlerts: pushAlerts ?? this.pushAlerts,
    newDeviceAlerts: newDeviceAlerts ?? this.newDeviceAlerts,
  );

  @override
  List<Object?> get props => [emailCopies, pushAlerts, newDeviceAlerts];
}

/// A security e-mail the (mock) server "sent". Lets the demo show that an
/// alert really was generated; production has no such list in the client.
class SentSecurityEmail extends Equatable {
  const SentSecurityEmail({
    required this.id,
    required this.eventId,
    required this.type,
    required this.maskedTo,
    required this.sentAt,
  });

  final String id;
  final String eventId;
  final SecurityEventType type;
  final String maskedTo;
  final DateTime sentAt;

  @override
  List<Object?> get props => [id, eventId, type, maskedTo, sentAt];
}

// ------------------------------------------------------------------ policy --

/// Server-controlled security configuration (demo values).
class SecurityPolicy extends Equatable {
  const SecurityPolicy({
    this.maxFailedAttempts = 5,
    this.protectionDuration = const Duration(minutes: 15),
    this.otpLength = 6,
    this.otpExpiry = const Duration(minutes: 5),
    this.otpMaxAttempts = 5,
    this.otpResendCooldown = const Duration(seconds: 30),
    this.password = const PasswordPolicy.demo(),
  });

  const SecurityPolicy.demo() : this();

  final int maxFailedAttempts;
  final Duration protectionDuration;
  final int otpLength;
  final Duration otpExpiry;
  final int otpMaxAttempts;
  final Duration otpResendCooldown;
  final PasswordPolicy password;

  @override
  List<Object?> get props => [
    maxFailedAttempts,
    protectionDuration,
    otpLength,
    otpExpiry,
    otpMaxAttempts,
    otpResendCooldown,
    password,
  ];
}
