import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/data/models/content_models.dart';
import 'package:blocks_app/features/notifications/application/notification_providers.dart';
import 'package:blocks_app/features/notifications/presentation/notifications_screen.dart';
import 'package:blocks_app/features/post/presentation/post_detail_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/app_driver.dart';

void main() {
  testWidgets('Home bell shows the unread count and opens notifications', (
    tester,
  ) async {
    await openSignedInApp(tester);
    expect(find.text('12'), findsOneWidget); // badge

    await tester.tap(find.byTooltip('Notifications'));
    await tester.pumpAndSettle();
    expect(find.byType(NotificationsScreen), findsOneWidget);
  });

  testWidgets('shows the level-unlocked notification first', (tester) async {
    await openSignedInApp(tester);
    await pushRoute(tester, Routes.notifications);

    expect(find.text('Your post reached STATE level!'), findsOneWidget);
    expect(
      find.text('Your content is now eligible for State discovery.'),
      findsOneWidget,
    );
    expect(find.byIcon(Icons.celebration_rounded), findsWidgets);
  });

  testWidgets('category filter shows only that category', (tester) async {
    await openSignedInApp(tester);
    await pushRoute(tester, Routes.notifications);

    await tester.tap(find.text('Likes'));
    await tester.pumpAndSettle();
    expect(find.text('Your post reached STATE level!'), findsNothing);
    expect(find.textContaining('liked your post'), findsWidgets);
  });

  testWidgets('mark all as read clears the badge and confirms', (tester) async {
    await openSignedInApp(tester);
    await pushRoute(tester, Routes.notifications);

    await tester.tap(find.byTooltip('Mark all as read'));
    await tester.pumpAndSettle();
    expect(find.text('All notifications marked as read'), findsOneWidget);
    expect(containerOf(tester).read(unreadNotificationsProvider).value, 0);

    // Button is disabled once nothing is unread.
    final button = tester.widget<IconButton>(
      find.widgetWithIcon(IconButton, Icons.done_all_rounded),
    );
    expect(button.onPressed, isNull);
  });

  testWidgets('tapping a reach notification opens that post', (tester) async {
    await openSignedInApp(tester);
    await pushRoute(tester, Routes.notifications);

    await tester.tap(find.text('Your post reached STATE level!'));
    await tester.pumpAndSettle();
    expect(find.byType(PostDetailScreen), findsOneWidget);
    expect(containerOf(tester).read(unreadNotificationsProvider).value, 11);
  });

  testWidgets('earnings notification routes to Creator Studio', (tester) async {
    await openSignedInApp(tester);
    await pushRoute(tester, Routes.notifications);

    await tester.tap(find.text('Estimated earnings updated'));
    await tester.pumpAndSettle();
    expect(find.text('Creator Studio'), findsWidgets);
  });

  test('routeForNotification maps categories to destinations', () {
    AppNotification n(NotificationCategory c, String? target) =>
        AppNotification(
          id: 'x',
          category: c,
          title: 't',
          body: 'b',
          createdAt: DateTime(2026),
          targetId: target,
        );

    expect(
      routeForNotification(n(NotificationCategory.earnings, null)),
      Routes.creatorStudio,
    );
    expect(
      routeForNotification(n(NotificationCategory.safety, null)),
      Routes.safety,
    );
    expect(
      routeForNotification(n(NotificationCategory.follower, 'u3')),
      Routes.user('u3'),
    );
    expect(
      routeForNotification(n(NotificationCategory.follower, null)),
      isNull,
    );
    expect(
      routeForNotification(n(NotificationCategory.like, 'p~feed~forYou~1')),
      Routes.post('p~feed~forYou~1'),
    );
    expect(
      routeForNotification(n(NotificationCategory.like, 'garbage')),
      isNull,
    );
    expect(
      routeForNotification(n(NotificationCategory.business, 'biz_me')),
      Routes.business('biz_me'),
    );
  });
}
