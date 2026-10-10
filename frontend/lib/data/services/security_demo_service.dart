/// Scenarios an investor/client demo can trigger on demand.
enum DemoScenario {
  /// A: normal sign-in.
  normalLogin,

  /// B: one wrong password.
  wrongPassword,

  /// C: failures up to the maximum, then temporary protection.
  maxFailedAttempts,

  /// D: sign-in from an unknown device.
  suspiciousLogin,

  /// E: password changed.
  passwordChanged,

  /// F: sign-in from a new device.
  newDeviceLogin,

  /// G: another device is logged out.
  sessionRevoked,

  /// H: the next profile-photo upload fails.
  photoUploadFails,
}

class DemoScenarioResult {
  const DemoScenarioResult({
    required this.scenario,
    this.eventId,
    this.alertRaised = false,
  });

  final DemoScenario scenario;

  /// The security event this scenario produced, if any.
  final String? eventId;

  /// A suspicious-login alert (notification + e-mail) was generated.
  final bool alertRaised;
}

/// What the mock server currently believes (shown in the demo lab).
class DemoServerStatus {
  const DemoServerStatus({
    required this.failedAttempts,
    required this.maxAttempts,
    required this.protectedUntil,
    required this.emailsSent,
    required this.activeSessions,
    required this.photoUploadWillFail,
  });

  final int failedAttempts;
  final int maxAttempts;
  final DateTime? protectedUntil;
  final int emailsSent;
  final int activeSessions;
  final bool photoUploadWillFail;
}

/// Demo-only: drives the mock server through the scenarios above. Not part of
/// any production build.
abstract interface class SecurityDemoService {
  Future<DemoScenarioResult> run(DemoScenario scenario);

  /// Restores the seeded security data and lifts any protection.
  Future<void> reset();

  Future<DemoServerStatus> status();
}
