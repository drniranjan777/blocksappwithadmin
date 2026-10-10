/// The result of recording one failed sign-in.
sealed class AttemptOutcome {
  const AttemptOutcome();
}

/// Rejected, but the account is not protected yet.
class AttemptRejected extends AttemptOutcome {
  const AttemptRejected({required this.attemptsRemaining});

  final int attemptsRemaining;
}

/// That failure reached the limit: temporary protection starts now.
class AttemptProtectionTriggered extends AttemptOutcome {
  const AttemptProtectionTriggered({
    required this.failedAttempts,
    required this.protectedUntil,
  });

  final int failedAttempts;
  final DateTime protectedUntil;
}

/// Sign-in attempts are being refused because protection is already active.
class AttemptWhileProtected extends AttemptOutcome {
  const AttemptWhileProtected({required this.protectedUntil});

  final DateTime protectedUntil;
}

/// Counts failed sign-ins and decides when to apply temporary protection.
///
/// **This runs on the (mock) server.** The app never holds or sends an attempt
/// counter: it only receives the outcome. In production the same logic lives in
/// the auth service, keyed by account *and* IP *and* device, and persisted so
/// it survives restarts and cannot be reset by the client.
///
/// Protection is temporary and time-boxed; a correct password reset clears it.
/// It is never a permanent lock decided from client input.
class LoginAttemptTracker {
  LoginAttemptTracker({required this.maxAttempts, required this.protectionFor})
    : assert(maxAttempts > 0, 'maxAttempts must be positive');

  final int maxAttempts;
  final Duration protectionFor;

  int _failed = 0;
  DateTime? _protectedUntil;

  int get failedAttempts => _failed;

  /// When protection ends, or null when the account is not protected at [now].
  DateTime? protectedUntil(DateTime now) {
    _expire(now);
    return _protectedUntil;
  }

  bool isProtected(DateTime now) => protectedUntil(now) != null;

  /// Records a failed sign-in.
  AttemptOutcome recordFailure(DateTime now) {
    _expire(now);
    final until = _protectedUntil;
    if (until != null) return AttemptWhileProtected(protectedUntil: until);

    _failed++;
    if (_failed >= maxAttempts) {
      final count = _failed;
      _protectedUntil = now.add(protectionFor);
      return AttemptProtectionTriggered(
        failedAttempts: count,
        protectedUntil: _protectedUntil!,
      );
    }
    return AttemptRejected(attemptsRemaining: maxAttempts - _failed);
  }

  /// A correct sign-in clears the failure count.
  void recordSuccess() => _failed = 0;

  /// Lifts protection and clears the count (password reset, support action).
  void clear() {
    _failed = 0;
    _protectedUntil = null;
  }

  void _expire(DateTime now) {
    final until = _protectedUntil;
    if (until != null && !now.isBefore(until)) clear();
  }
}
