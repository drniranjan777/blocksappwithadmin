import 'package:blocks_app/core/pagination/content_epoch.dart';
import 'package:blocks_app/data/models/content_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// The story tray. First group is always the signed-in user's own.
class StoryController extends AsyncNotifier<List<StoryGroup>> {
  @override
  Future<List<StoryGroup>> build() {
    ref.watch(contentEpochProvider);
    return ref.read(storyRepositoryProvider).getStoryGroups();
  }

  Future<void> markViewed(String groupId) async {
    final groups = state.value;
    if (groups == null) return;
    final target = groups.where((g) => g.id == groupId).firstOrNull;
    if (target == null || target.isViewed || target.isOwn) return;

    state = AsyncData([
      for (final g in groups) g.id == groupId ? g.copyWith(isViewed: true) : g,
    ]);
    await ref.read(storyRepositoryProvider).markViewed(groupId);
  }

  Future<void> addStory({required String mediaUrl, String? caption}) async {
    await ref
        .read(storyRepositoryProvider)
        .addStory(mediaUrl: mediaUrl, caption: caption);
    ref.invalidateSelf();
    await future;
  }
}

final storyControllerProvider =
    AsyncNotifierProvider<StoryController, List<StoryGroup>>(
      StoryController.new,
    );
