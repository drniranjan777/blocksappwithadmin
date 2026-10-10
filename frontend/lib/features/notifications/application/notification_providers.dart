import 'package:blocks_app/core/pagination/paged_notifier.dart';
import 'package:blocks_app/data/models/content_models.dart';
import 'package:blocks_app/data/models/paged_result.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Badge count on the bell. Invalidate after marking notifications read.
final unreadNotificationsProvider = FutureProvider<int>(
  (ref) => ref.watch(notificationRepositoryProvider).getUnreadCount(),
);

/// null = "All".
class SelectedNotificationCategory extends Notifier<NotificationCategory?> {
  @override
  NotificationCategory? build() => null;

  void select(NotificationCategory? category) => state = category;
}

final selectedNotificationCategoryProvider =
    NotifierProvider<SelectedNotificationCategory, NotificationCategory?>(
      SelectedNotificationCategory.new,
    );

class NotificationsController extends PagedNotifier<AppNotification> {
  NotificationsController(this.category);

  final NotificationCategory? category;

  @override
  Future<PagedResult<AppNotification>> fetchPage(String? cursor) => ref
      .read(notificationRepositoryProvider)
      .getNotifications(category: category, cursor: cursor, limit: 20);
}

final notificationsProvider =
    AsyncNotifierProvider.family<
      NotificationsController,
      PagedState<AppNotification>,
      NotificationCategory?
    >(NotificationsController.new);

/// Marks everything read and refreshes every list and the bell badge.
Future<void> markAllNotificationsRead(WidgetRef ref) async {
  await ref.read(notificationRepositoryProvider).markAllRead();
  ref
    ..invalidate(notificationsProvider)
    ..invalidate(unreadNotificationsProvider);
}

Future<void> markNotificationRead(WidgetRef ref, String id) async {
  await ref.read(notificationRepositoryProvider).markRead(id);
  ref
    ..invalidate(notificationsProvider)
    ..invalidate(unreadNotificationsProvider);
}
