import 'package:blocks_app/data/models/security_models.dart';

/// The devices signed in to the account.
///
/// Production revokes refresh tokens / server sessions; the app cannot revoke
/// anything by itself.
abstract interface class SessionRepository {
  /// Current device first, then most recently active.
  Future<List<DeviceSession>> getSessions();

  /// Logs one *other* device out. Throws `ValidationFailure` for the current
  /// session (signing out of this device is `AuthRepository.signOut`) and
  /// `NotFoundFailure` for an unknown id.
  Future<void> revokeSession(String sessionId);

  /// Logs out every device except this one.
  Future<void> revokeAllOtherSessions();
}
