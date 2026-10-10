import 'package:blocks_app/data/models/content_models.dart';
import 'package:blocks_app/data/models/paged_result.dart';

abstract interface class NotificationRepository {
  Future<PagedResult<AppNotification>> getNotifications({
    NotificationCategory? category,
    String? cursor,
    int limit = 20,
  });
  Future<int> getUnreadCount();
  Future<void> markAllRead();
  Future<void> markRead(String id);
}
