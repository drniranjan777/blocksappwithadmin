import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/api/api_client.dart';
import 'package:blocks_app/data/api/json_reader.dart';
import 'package:blocks_app/data/api/mappers.dart';
import 'package:blocks_app/data/models/app_user.dart';
import 'package:blocks_app/data/repositories/user_repository.dart';

/// Profiles, following and people search against the real API.
class ApiUserRepository implements UserRepository {
  ApiUserRepository(this._api, {DateTime Function()? now})
    : _now = now ?? DateTime.now;

  /// Followed accounts are read this many at a time, up to [_maxFollowingPages]
  /// pages: enough for the follow buttons of any normal account.
  static const _maxFollowingPages = 40;

  final ApiClient _api;
  final DateTime Function() _now;
  String? _myId;

  @override
  Future<AppUser> getCurrentUser() async {
    final answers = await Future.wait([
      _api.get('/users/me/profile'),
      _api.get('/users/me'),
    ]);
    final profile = JsonObject.of(answers[0].data);
    final account = JsonObject.of(answers[1].data);
    _myId = profile.string('id');
    return appUserFromProfile(
      profile,
      now: _now(),
      twoFactorEnabled: account.boolean('twoFactorEnabled'),
    );
  }

  @override
  Future<AppUser> getUser(String id) async {
    final answer = await _api.get('/profiles/${seg(id)}');
    return appUserFromProfile(JsonObject.of(answer.data), now: _now());
  }

  @override
  Future<Set<String>> getFollowingIds() async {
    final me = _myId ?? (await getCurrentUser()).id;
    final ids = <String>{};
    String? cursor;
    for (var page = 0; page < _maxFollowingPages; page++) {
      final answer = await _api.get(
        '/profiles/${seg(me)}/following',
        query: {'cursor': cursor, 'limit': maxPageSize},
      );
      for (final person in answer.objects()) {
        ids.add(person.string('id'));
      }
      if (!answer.hasMore) break;
      cursor = answer.nextCursor;
    }
    return ids;
  }

  /// Following a private account only sends a request; the follow takes effect
  /// when they approve. The app shows it as followed meanwhile.
  @override
  Future<void> follow(String userId) async {
    await _api.post('/users/${seg(userId)}/follow');
  }

  @override
  Future<void> unfollow(String userId) async {
    await _api.delete('/users/${seg(userId)}/follow');
  }

  @override
  Future<List<UserSummary>> searchUsers(String query, {int limit = 10}) async {
    final q = query.trim();
    if (q.length < 2) return const [];
    final answer = await _api.get(
      '/search/users',
      query: {'q': q, 'limit': limit.clamp(1, 20)},
    );
    return [for (final u in answer.objects()) userSummaryFromCard(u)];
  }

  /// Two-step sign-in is set up and turned off through the security settings
  /// (it needs a confirming code); there is no one-tap switch on the server.
  @override
  Future<AppUser> setTwoFactorEnabled({required bool enabled}) async =>
      throw const ForbiddenFailure(
        'Use the security settings to change two-step sign-in',
      );
}
