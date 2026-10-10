import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/api/api_client.dart';
import 'package:blocks_app/data/api/json_reader.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/data/repositories/session_repository.dart';

/// The devices signed in to the account, against the real API.
class ApiSessionRepository implements SessionRepository {
  ApiSessionRepository(this._api);

  final ApiClient _api;

  /// The session of this device, as of the last list. Signing out of this
  /// device is `AuthRepository.signOut`, not something done from this list.
  String? _currentId;

  @override
  Future<List<DeviceSession>> getSessions() async {
    final answer = await _api.get('/sessions');
    final sessions = [for (final s in answer.objects()) _session(s)];
    _currentId = sessions
        .where((s) => s.isCurrent)
        .map((s) => s.id)
        .firstOrNull;
    // This device first, then the most recently used.
    sessions.sort((a, b) {
      if (a.isCurrent != b.isCurrent) return a.isCurrent ? -1 : 1;
      return b.lastActive.compareTo(a.lastActive);
    });
    return sessions;
  }

  DeviceSession _session(JsonObject s) {
    final platform = s.stringOr('platform', 'UNKNOWN');
    final version = s.stringOrNull('appVersion');
    return DeviceSession(
      id: s.string('id'),
      deviceName: s.stringOr('deviceName', 'Unknown device'),
      platform: switch (platform) {
        'ANDROID' => 'Android',
        'IOS' => 'iOS',
        'WEB' => 'Web',
        _ => 'Unknown',
      },
      appOrBrowser: platform == 'WEB'
          ? 'Browser'
          : (version == null ? 'BLOCKS app' : 'BLOCKS app $version'),
      approximateLocation: s.stringOr('locationLabel', ''),
      lastActive: s.date('lastUsedAt'),
      isCurrent: s.boolean('current'),
    );
  }

  @override
  Future<void> revokeSession(String sessionId) async {
    if (sessionId == _currentId) {
      throw const ValidationFailure('currentSession');
    }
    await _api.delete('/sessions/${seg(sessionId)}');
  }

  @override
  Future<void> revokeAllOtherSessions() async {
    await _api.post('/sessions/revoke-others');
  }
}
