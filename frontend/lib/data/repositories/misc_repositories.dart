import 'package:blocks_app/data/models/app_user.dart';
import 'package:blocks_app/data/models/business_models.dart';
import 'package:blocks_app/data/models/discovery_models.dart';
import 'package:blocks_app/data/models/paged_result.dart';
import 'package:blocks_app/data/models/post.dart';

abstract interface class CreatorRepository {
  Future<CreatorDashboard> getDashboard();
}

abstract interface class AdRepository {
  Future<List<Campaign>> getCampaigns();

  /// Demo: creates a simulated campaign. No money is processed.
  Future<Campaign> createCampaign(CampaignDraft draft);
}

abstract interface class VerificationRepository {
  Future<VerificationStatus> getStatus();
  Future<VerificationStatus> submit(VerificationType type);

  /// Demo admin action that approves the pending request.
  Future<VerificationStatus> approveForDemo();
}

abstract interface class ModerationRepository {
  Future<void> report(ReportRequest request);

  Future<void> blockUser(String userId);
  Future<void> unblockUser(String userId);
  Future<void> muteUser(String userId);
  Future<void> unmuteUser(String userId);
  Future<void> restrictUser(String userId);

  Future<List<UserSummary>> getBlockedUsers();
  Future<List<UserSummary>> getMutedUsers();
  Future<Set<String>> getHiddenUserIds();
}

abstract interface class ExploreRepository {
  Future<List<TrendingTopic>> getTrending(ExploreScope scope);

  Future<PagedResult<Post>> getExplorePosts({
    required ExploreScope scope,
    ExploreCategory? category,
    String? cursor,
    int limit = 18,
  });

  Future<SearchResults> search(String query);
}
