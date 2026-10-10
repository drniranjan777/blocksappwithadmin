import 'package:blocks_app/data/models/content_models.dart';

abstract interface class StoryRepository {
  /// First item is always the signed-in user's own (possibly empty) group.
  Future<List<StoryGroup>> getStoryGroups();
  Future<void> markViewed(String groupId);
  Future<StoryItem> addStory({required String mediaUrl, String? caption});
}
