import 'package:blocks_app/data/api/api_client.dart';
import 'package:blocks_app/data/api/mappers.dart';
import 'package:blocks_app/data/models/content_models.dart';
import 'package:blocks_app/data/models/paged_result.dart';
import 'package:blocks_app/data/repositories/notification_repository.dart';

/// In-app notifications against the real API.
///
/// The server writes each notification's title and text in the person's own
/// language, so the app only lays them out.
class ApiNotificationRepository implements NotificationRepository {
  ApiNotificationRepository(this._api);

  /// When a category filter is on, the API still returns every kind, so pages are
  /// read until enough of the wanted kind turn up. This bounds that work.
  static const _maxPagesPerFilteredRead = 5;

  final ApiClient _api;

  @override
  Future<PagedResult<AppNotification>> getNotifications({
    NotificationCategory? category,
    String? cursor,
    int limit = 20,
  }) async {
    final found = <AppNotification>[];
    String? next = cursor;
    var more = true;
    for (var page = 0; more && page < _maxPagesPerFilteredRead; page++) {
      final answer = await _api.get(
        '/notifications',
        query: {
          'cursor': next,
          'limit': category == null ? clampPage(limit) : maxPageSize,
        },
      );
      for (final raw in answer.objects()) {
        final n = notificationFromView(raw);
        if (category == null || n.category == category) found.add(n);
      }
      more = answer.hasMore;
      next = answer.nextCursor;
      if (category == null || found.length >= limit) break;
    }
    return PagedResult(items: found, nextCursor: more ? next : null);
  }

  @override
  Future<int> getUnreadCount() async {
    final answer = await _api.get('/notifications/unread-count');
    return answer.object().integer('count');
  }

  @override
  Future<void> markAllRead() async {
    await _api.post('/notifications/read-all');
  }

  @override
  Future<void> markRead(String id) async {
    await _api.post('/notifications/${seg(id)}/read');
  }
}
