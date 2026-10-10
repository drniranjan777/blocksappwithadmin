import 'dart:async';

import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/pagination/paged_notifier.dart';
import 'package:blocks_app/core/utils/time_ago.dart';
import 'package:blocks_app/core/widgets/app_snack.dart';
import 'package:blocks_app/core/widgets/blocks_chip.dart';
import 'package:blocks_app/core/widgets/load_more_footer.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:blocks_app/data/models/content_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/notifications/application/notification_providers.dart';
import 'package:blocks_app/features/security/domain/security_targets.dart';
import 'package:blocks_app/l10n/gen/app_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

extension NotificationCategoryLabels on NotificationCategory {
  String label(AppLocalizations l10n) => switch (this) {
    NotificationCategory.like => l10n.notifCatLikes,
    NotificationCategory.comment => l10n.notifCatComments,
    NotificationCategory.follower => l10n.notifCatFollowers,
    NotificationCategory.share => l10n.notifCatShares,
    NotificationCategory.reach => l10n.notifCatReach,
    NotificationCategory.earnings => l10n.notifCatEarnings,
    NotificationCategory.business => l10n.notifCatBusiness,
    NotificationCategory.safety => l10n.notifCatSafety,
    NotificationCategory.security => l10n.notifCatSecurity,
  };

  IconData get icon => switch (this) {
    NotificationCategory.like => Icons.favorite_rounded,
    NotificationCategory.comment => Icons.mode_comment_rounded,
    NotificationCategory.follower => Icons.person_add_alt_1_rounded,
    NotificationCategory.share => Icons.ios_share_rounded,
    NotificationCategory.reach => Icons.celebration_rounded,
    NotificationCategory.earnings => Icons.currency_rupee_rounded,
    NotificationCategory.business => Icons.storefront_rounded,
    NotificationCategory.safety => Icons.shield_rounded,
    NotificationCategory.security => Icons.gpp_maybe_rounded,
  };

  Color color(BuildContext context) {
    final c = context.blocks;
    return switch (this) {
      NotificationCategory.like => c.reachGlobal,
      NotificationCategory.comment => c.reachState,
      NotificationCategory.follower => c.reachDistrict,
      NotificationCategory.share => c.reachState,
      NotificationCategory.reach => c.reachNational,
      NotificationCategory.earnings => c.success,
      NotificationCategory.business => c.accent,
      NotificationCategory.safety => context.scheme.error,
      NotificationCategory.security => c.warning,
    };
  }
}

/// Where tapping a notification should go (null = nowhere).
String? routeForNotification(AppNotification n) {
  final target = n.targetId;
  switch (n.category) {
    case NotificationCategory.earnings:
      return Routes.creatorStudio;
    case NotificationCategory.safety:
      return Routes.safety;
    case NotificationCategory.security:
      return SecurityTargets.routeFor(target) ?? Routes.security;
    case NotificationCategory.follower:
      return target == null ? null : Routes.user(target);
    case NotificationCategory.business:
      return target == null ? null : Routes.business(target);
    case NotificationCategory.like:
    case NotificationCategory.comment:
    case NotificationCategory.share:
    case NotificationCategory.reach:
      return target != null && target.startsWith('p~')
          ? Routes.post(target)
          : null;
  }
}

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final category = ref.watch(selectedNotificationCategoryProvider);
    final async = ref.watch(notificationsProvider(category));
    final data = async.value;
    final unread = ref.watch(unreadNotificationsProvider).value ?? 0;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.notifTitle),
        actions: [
          IconButton(
            tooltip: l10n.notifMarkAllRead,
            icon: const Icon(Icons.done_all_rounded),
            onPressed: unread == 0
                ? null
                : () async {
                    await markAllNotificationsRead(ref);
                    if (context.mounted) {
                      showAppSnack(context, l10n.notifAllMarked);
                    }
                  },
          ),
          IconButton(
            tooltip: l10n.messagesTitle,
            icon: const Icon(Icons.chat_bubble_outline_rounded),
            onPressed: () => context.push(Routes.messages),
          ),
        ],
      ),
      body: SafeArea(
        child: ResponsiveCenter(
          child: Column(
            children: [
              _CategoryChips(selected: category),
              Expanded(
                child: RefreshIndicator(
                  onRefresh: () async {
                    ref.invalidate(unreadNotificationsProvider);
                    await ref
                        .read(notificationsProvider(category).notifier)
                        .refresh();
                  },
                  child: _list(context, ref, category, async, data),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _list(
    BuildContext context,
    WidgetRef ref,
    NotificationCategory? category,
    AsyncValue<PagedState<AppNotification>> async,
    PagedState<AppNotification>? data,
  ) {
    final l10n = context.l10n;
    final notifier = ref.read(notificationsProvider(category).notifier);

    if (data == null) {
      return async.hasError
          ? ListView(
              children: [
                SizedBox(
                  height: 400,
                  child: ErrorView(
                    onRetry: () =>
                        ref.invalidate(notificationsProvider(category)),
                  ),
                ),
              ],
            )
          : const LoadingView();
    }
    if (data.items.isEmpty) {
      return ListView(
        children: [
          SizedBox(
            height: 400,
            child: EmptyView(
              icon: Icons.notifications_none_rounded,
              title: l10n.notifEmptyTitle,
              body: l10n.notifEmptyBody,
            ),
          ),
        ],
      );
    }

    return NotificationListener<ScrollNotification>(
      onNotification: (n) {
        if (n.metrics.extentAfter < 500) notifier.loadMore();
        return false;
      },
      child: ListView.builder(
        itemCount: data.items.length + 1,
        itemBuilder: (context, i) {
          if (i == data.items.length) {
            return LoadMoreFooter(state: data, onLoadMore: notifier.loadMore);
          }
          return _NotificationTile(notification: data.items[i]);
        },
      ),
    );
  }
}

class _CategoryChips extends ConsumerWidget {
  const _CategoryChips({required this.selected});

  final NotificationCategory? selected;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final notifier = ref.read(selectedNotificationCategoryProvider.notifier);
    return SizedBox(
      height: 56,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(
          horizontal: BlocksSpacing.lg,
          vertical: BlocksSpacing.sm + 2,
        ),
        children: [
          BlocksChip(
            label: l10n.notifAll,
            selected: selected == null,
            onSelected: () => notifier.select(null),
          ),
          for (final c in NotificationCategory.values) ...[
            const SizedBox(width: BlocksSpacing.sm),
            BlocksChip(
              label: c.label(l10n),
              icon: c.icon,
              selected: c == selected,
              onSelected: () => notifier.select(c),
            ),
          ],
        ],
      ),
    );
  }
}

class _NotificationTile extends ConsumerWidget {
  const _NotificationTile({required this.notification});

  final AppNotification notification;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final n = notification;
    final color = n.category.color(context);
    final now = ref.read(clockProvider)();
    final route = routeForNotification(n);

    return Semantics(
      container: true,
      button: route != null,
      label: '${n.isRead ? '' : '${l10n.notifUnread}. '}${n.title}. ${n.body}',
      excludeSemantics: true,
      child: Material(
        color: n.isRead ? Colors.transparent : color.withValues(alpha: 0.07),
        child: InkWell(
          onTap: () async {
            if (!n.isRead) unawaited(markNotificationRead(ref, n.id));
            if (route != null) await context.push(route);
          },
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: BlocksSpacing.lg,
              vertical: BlocksSpacing.md,
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(BlocksRadius.md + 2),
                  ),
                  child: Icon(n.category.icon, color: color, size: 22),
                ),
                const SizedBox(width: BlocksSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        n.title,
                        style: context.text.titleSmall?.copyWith(
                          fontWeight: n.isRead
                              ? FontWeight.w600
                              : FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(n.body, style: context.text.bodySmall),
                    ],
                  ),
                ),
                const SizedBox(width: BlocksSpacing.sm),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      timeAgo(l10n, n.createdAt, now: now),
                      style: context.text.labelSmall,
                    ),
                    if (!n.isRead)
                      Container(
                        margin: const EdgeInsets.only(top: 6),
                        width: 9,
                        height: 9,
                        decoration: BoxDecoration(
                          color: color,
                          shape: BoxShape.circle,
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
