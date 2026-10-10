import 'package:blocks_app/core/pagination/content_epoch.dart';
import 'package:blocks_app/data/models/app_user.dart';
import 'package:blocks_app/data/models/business_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/engagement/application/engagement_controllers.dart';
import 'package:blocks_app/features/profile/application/user_providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final blockedUsersProvider = FutureProvider<List<UserSummary>>(
  (ref) => ref.watch(moderationRepositoryProvider).getBlockedUsers(),
);

final mutedUsersProvider = FutureProvider<List<UserSummary>>(
  (ref) => ref.watch(moderationRepositoryProvider).getMutedUsers(),
);

/// Report / block / mute / restrict. After any change that affects who the
/// user can see, [ContentEpoch] is bumped so lists refresh themselves.
class SafetyActions {
  SafetyActions(this._ref);

  final Ref _ref;

  Future<void> report(ReportRequest request) =>
      _ref.read(moderationRepositoryProvider).report(request);

  Future<void> block(String userId) async {
    await _ref.read(moderationRepositoryProvider).blockUser(userId);
    _ref.invalidate(followingProvider);
    _ref.invalidate(currentUserProvider);
    _contentChanged();
  }

  Future<void> unblock(String userId) async {
    await _ref.read(moderationRepositoryProvider).unblockUser(userId);
    _contentChanged();
  }

  Future<void> mute(String userId) async {
    await _ref.read(moderationRepositoryProvider).muteUser(userId);
    _contentChanged();
  }

  Future<void> unmute(String userId) async {
    await _ref.read(moderationRepositoryProvider).unmuteUser(userId);
    _contentChanged();
  }

  Future<void> restrict(String userId) =>
      _ref.read(moderationRepositoryProvider).restrictUser(userId);

  void _contentChanged() {
    _ref
      ..invalidate(blockedUsersProvider)
      ..invalidate(mutedUsersProvider);
    _ref.read(contentEpochProvider.notifier).bump();
  }
}

final safetyActionsProvider = Provider<SafetyActions>(SafetyActions.new);
