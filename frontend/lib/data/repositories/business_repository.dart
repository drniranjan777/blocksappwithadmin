import 'package:blocks_app/data/models/business_models.dart';
import 'package:blocks_app/data/models/paged_result.dart';
import 'package:blocks_app/data/models/post.dart';

abstract interface class BusinessRepository {
  Future<BusinessProfile> getMyBusiness();
  Future<BusinessProfile> getBusiness(String id);
  Future<List<Offer>> getOffers(String businessId);
  Future<PagedResult<Post>> getBusinessPosts(
    String businessId, {
    String? cursor,
    int limit = 18,
  });
}
