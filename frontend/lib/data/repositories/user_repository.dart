import 'package:blocks_app/data/models/app_user.dart';

abstract interface class UserRepository {
  Future<AppUser> getCurrentUser();

  /// Throws `NotFoundFailure` for an unknown id.
  Future<AppUser> getUser(String id);

  Future<Set<String>> getFollowingIds();
  Future<void> follow(String userId);
  Future<void> unfollow(String userId);

  Future<List<UserSummary>> searchUsers(String query, {int limit = 10});

  /// Turns the 2FA flag on/off for the signed-in user (demo toggle).
  Future<AppUser> setTwoFactorEnabled({required bool enabled});
}
