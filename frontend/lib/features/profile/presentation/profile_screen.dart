import 'dart:async';

import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/utils/number_format.dart';
import 'package:blocks_app/core/widgets/app_snack.dart';
import 'package:blocks_app/core/widgets/blocks_avatar.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/core/widgets/paged_grid.dart';
import 'package:blocks_app/core/widgets/pinned_tab_strip.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:blocks_app/data/models/app_user.dart';
import 'package:blocks_app/data/models/business_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/engagement/presentation/follow_button.dart';
import 'package:blocks_app/features/post/presentation/post_tile.dart';
import 'package:blocks_app/features/profile/application/profile_controllers.dart';
import 'package:blocks_app/features/profile/application/user_providers.dart';
import 'package:blocks_app/features/profile/presentation/photo_widgets.dart';
import 'package:blocks_app/features/profile/presentation/reel_tile.dart';
import 'package:blocks_app/features/reach/application/reach_providers.dart';
import 'package:blocks_app/features/reach/presentation/reach_level_labels.dart';
import 'package:blocks_app/features/reach/presentation/widgets/reach_ladder.dart';
import 'package:blocks_app/features/reach/presentation/widgets/reach_level_badge.dart';
import 'package:blocks_app/features/safety/presentation/content_actions_sheet.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Own profile (the Profile tab, [userId] null) or another user's profile.
class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key, this.userId});

  final String? userId;

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  int _tab = 0;

  bool get _isOwnRoute => widget.userId == null;

  @override
  Widget build(BuildContext context) {
    final async = _isOwnRoute
        ? ref.watch(currentUserProvider)
        : ref.watch(userProvider(widget.userId!));
    final me = ref.watch(currentUserProvider).value;

    return Scaffold(
      body: async.when(
        loading: () => const SafeArea(child: LoadingView()),
        error: (_, _) => SafeArea(
          child: ErrorView(
            onRetry: () => _isOwnRoute
                ? ref.invalidate(currentUserProvider)
                : ref.invalidate(userProvider(widget.userId!)),
          ),
        ),
        data: (user) => _content(context, user, isOwn: user.id == me?.id),
      ),
    );
  }

  Widget _content(BuildContext context, AppUser user, {required bool isOwn}) {
    return SafeArea(
      bottom: false,
      child: ResponsiveCenter(
        maxWidth: 720,
        child: NotificationListener<ScrollNotification>(
          onNotification: (n) {
            if (n.metrics.axis == Axis.vertical &&
                n.metrics.extentAfter < 600) {
              _loadMore(user.id);
            }
            return false;
          },
          child: CustomScrollView(
            slivers: [
              _appBar(context, user, isOwn),
              SliverToBoxAdapter(
                child: _Header(user: user, isOwn: isOwn),
              ),
              SliverToBoxAdapter(child: _ReachCard(user: user)),
              SliverPersistentHeader(
                pinned: true,
                delegate: PinnedTabStripDelegate(
                  items: [
                    TabStripItem(
                      Icons.grid_on_rounded,
                      context.l10n.profileTabPosts,
                    ),
                    TabStripItem(
                      Icons.play_circle_outline_rounded,
                      context.l10n.profileTabReels,
                    ),
                    TabStripItem(
                      Icons.person_pin_outlined,
                      context.l10n.profileTabTagged,
                    ),
                  ],
                  selected: _tab,
                  onSelected: (i) => setState(() => _tab = i),
                  background: context.theme.scaffoldBackgroundColor,
                ),
              ),
              ..._tabSlivers(user.id),
              const SliverToBoxAdapter(
                child: SizedBox(height: BlocksSpacing.xxl),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _appBar(BuildContext context, AppUser user, bool isOwn) {
    final l10n = context.l10n;
    return SliverAppBar(
      pinned: true,
      automaticallyImplyLeading: false,
      leading: _isOwnRoute
          ? null
          : IconButton(
              tooltip: l10n.backTooltip,
              icon: const Icon(Icons.arrow_back_rounded),
              onPressed: () =>
                  context.canPop() ? context.pop() : context.go(Routes.home),
            ),
      title: Text(user.username),
      actions: [
        if (isOwn)
          IconButton(
            tooltip: l10n.profileMenu,
            icon: const Icon(Icons.menu_rounded),
            onPressed: () => _showMenu(context, user),
          )
        else
          IconButton(
            tooltip: l10n.postMoreOptions,
            icon: const Icon(Icons.more_horiz_rounded),
            onPressed: () => showContentActionsSheet(
              context,
              author: user.summary,
              contentId: user.id,
              targetType: ReportTargetType.user,
              isOwn: false,
            ),
          ),
      ],
    );
  }

  // ---------------------------------------------------------------- tabs --

  void _loadMore(String id) {
    switch (_tab) {
      case 0:
        ref.read(userPostsProvider(id).notifier).loadMore();
      case 1:
        ref.read(userReelsProvider(id).notifier).loadMore();
      default:
        ref.read(taggedPostsProvider(id).notifier).loadMore();
    }
  }

  List<Widget> _tabSlivers(String id) {
    switch (_tab) {
      case 0:
        return pagedGridSlivers(
          context,
          async: ref.watch(userPostsProvider(id)),
          onRetry: () => ref.invalidate(userPostsProvider(id)),
          onLoadMore: () => ref.read(userPostsProvider(id).notifier).loadMore(),
          tile: (p) => PostTile(key: ValueKey(p.id), post: p),
        );
      case 1:
        return pagedGridSlivers(
          context,
          async: ref.watch(userReelsProvider(id)),
          onRetry: () => ref.invalidate(userReelsProvider(id)),
          onLoadMore: () => ref.read(userReelsProvider(id).notifier).loadMore(),
          tile: (r) => ReelTile(key: ValueKey(r.id), reel: r),
          aspectRatio: 0.62,
        );
      default:
        return pagedGridSlivers(
          context,
          async: ref.watch(taggedPostsProvider(id)),
          onRetry: () => ref.invalidate(taggedPostsProvider(id)),
          onLoadMore: () =>
              ref.read(taggedPostsProvider(id).notifier).loadMore(),
          tile: (p) => PostTile(key: ValueKey(p.id), post: p),
        );
    }
  }

  // ---------------------------------------------------------------- menu --

  void _showMenu(BuildContext context, AppUser user) {
    final l10n = context.l10n;
    // The three things people reach for first, then everything else.
    final primary = <(IconData, String, String)>[
      (Icons.edit_outlined, l10n.epTitle, Routes.editProfile),
      (Icons.security_rounded, l10n.settingsSecurity, Routes.security),
      (Icons.settings_outlined, l10n.profileSettings, Routes.settings),
    ];
    final items = <(IconData, String, String)>[
      (Icons.insights_rounded, l10n.profileCreatorStudio, Routes.creatorStudio),
      if (user.businessId != null)
        (
          Icons.storefront_rounded,
          l10n.profileBusiness,
          Routes.business(user.businessId!),
        ),
      (Icons.verified_rounded, l10n.profileVerification, Routes.verification),
      (
        Icons.chat_bubble_outline_rounded,
        l10n.profileMessages,
        Routes.messages,
      ),
      (Icons.shield_outlined, l10n.profileSafetyCenter, Routes.safety),
    ];
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (sheet) => SafeArea(
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final (icon, label, route) in primary)
                ListTile(
                  leading: Icon(icon),
                  title: Text(label),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () {
                    Navigator.of(sheet).pop();
                    context.push(route);
                  },
                ),
              const Divider(height: 1),
              for (final (icon, label, route) in items)
                ListTile(
                  leading: Icon(icon),
                  title: Text(label),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () {
                    Navigator.of(sheet).pop();
                    context.push(route);
                  },
                ),
            ],
          ),
        ),
      ),
    );
  }
}

// ------------------------------------------------------------------ header --

class _Header extends ConsumerWidget {
  const _Header({required this.user, required this.isOwn});

  final AppUser user;
  final bool isOwn;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;

    Future<void> message() async {
      final conv = await ref
          .read(messageRepositoryProvider)
          .conversationWith(user.id);
      if (context.mounted) unawaited(context.push(Routes.chat(conv.id)));
    }

    Future<void> share() async {
      await Clipboard.setData(
        ClipboardData(
          text: 'https://blocks.example/u/${user.username.substring(1)}',
        ),
      );
      if (context.mounted) showAppSnack(context, l10n.linkCopied);
    }

    return Padding(
      padding: const EdgeInsets.all(BlocksSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (isOwn) ...[
            // Progress / success / error of a photo change, right where the
            // picture is.
            const PhotoUploadStatus(),
          ],
          Row(
            children: [
              if (isOwn)
                // The camera badge replaces the verified tick on the picture;
                // the tick still sits next to the name.
                EditableAvatar(user: user)
              else
                BlocksAvatar(
                  name: user.name,
                  imageUrl: user.avatarUrl,
                  size: 84,
                  isVerified: user.isVerified,
                ),
              const SizedBox(width: BlocksSpacing.lg),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            user.name,
                            style: context.text.titleLarge,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (user.isVerified) ...[
                          const SizedBox(width: 4),
                          Icon(
                            Icons.verified_rounded,
                            size: 20,
                            color: context.blocks.reachState,
                          ),
                        ],
                      ],
                    ),
                    Text(
                      user.username,
                      style: context.text.bodyMedium?.copyWith(
                        color: context.scheme.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: BlocksSpacing.xs + 2),
                    Row(
                      children: [
                        Icon(
                          Icons.location_on_rounded,
                          size: 15,
                          color: context.scheme.primary,
                        ),
                        const SizedBox(width: 3),
                        Flexible(
                          child: Text(
                            user.location,
                            style: context.text.bodySmall,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (user.bio.isNotEmpty) ...[
            const SizedBox(height: BlocksSpacing.md),
            Text(user.bio, style: context.text.bodyMedium),
          ],
          if (user.website != null) ...[
            const SizedBox(height: BlocksSpacing.sm),
            Semantics(
              link: true,
              label: user.website,
              excludeSemantics: true,
              child: InkWell(
                onTap: () async {
                  await Clipboard.setData(ClipboardData(text: user.website!));
                  if (context.mounted) showAppSnack(context, l10n.linkCopied);
                },
                child: ConstrainedBox(
                  constraints: const BoxConstraints(
                    minHeight: BlocksSpacing.touchTarget,
                  ),
                  child: Row(
                    children: [
                      Icon(
                        Icons.link_rounded,
                        size: 18,
                        color: context.scheme.primary,
                      ),
                      const SizedBox(width: BlocksSpacing.xs),
                      Flexible(
                        child: Text(
                          user.website!.replaceFirst(RegExp('^https?://'), ''),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: context.text.bodyMedium?.copyWith(
                            color: context.scheme.primary,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
          const SizedBox(height: BlocksSpacing.lg),
          Row(
            children: [
              _Stat(value: user.postsCount, label: l10n.profilePosts),
              _Stat(value: user.followersCount, label: l10n.profileFollowers),
              _Stat(value: user.followingCount, label: l10n.profileFollowing),
            ],
          ),
          const SizedBox(height: BlocksSpacing.lg),
          Wrap(
            spacing: BlocksSpacing.sm,
            runSpacing: BlocksSpacing.sm,
            children: [
              if (user.isVerified && user.verificationType != null)
                _TrustChip(type: user.verificationType!),
            ],
          ),
          if (user.isVerified) const SizedBox(height: BlocksSpacing.lg),
          if (isOwn) ...[
            Row(
              children: [
                Expanded(
                  child: BlocksButton(
                    label: l10n.epTitle,
                    icon: Icons.edit_outlined,
                    variant: BlocksButtonVariant.outline,
                    onPressed: () => context.push(Routes.editProfile),
                  ),
                ),
                const SizedBox(width: BlocksSpacing.sm),
                IconButton.outlined(
                  tooltip: l10n.profileShare,
                  onPressed: share,
                  icon: const Icon(Icons.ios_share_rounded),
                ),
              ],
            ),
            const SizedBox(height: BlocksSpacing.sm),
            BlocksButton(
              label: l10n.profileCreatorStudio,
              icon: Icons.insights_rounded,
              onPressed: () => context.push(Routes.creatorStudio),
            ),
          ] else
            Row(
              children: [
                Expanded(child: FollowButton(userId: user.id, expand: true)),
                const SizedBox(width: BlocksSpacing.sm),
                Expanded(
                  child: BlocksButton(
                    label: l10n.actionMessage,
                    variant: BlocksButtonVariant.outline,
                    onPressed: message,
                  ),
                ),
                const SizedBox(width: BlocksSpacing.sm),
                IconButton.outlined(
                  tooltip: l10n.profileShare,
                  onPressed: share,
                  icon: const Icon(Icons.ios_share_rounded),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.value, required this.label});

  final int value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Semantics(
        label: '${compactCount(value)} $label',
        excludeSemantics: true,
        child: Column(
          children: [
            Text(compactCount(value), style: context.text.titleLarge),
            const SizedBox(height: 2),
            Text(label, style: context.text.bodySmall),
          ],
        ),
      ),
    );
  }
}

class _TrustChip extends StatelessWidget {
  const _TrustChip({required this.type});

  final VerificationType type;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final label = switch (type) {
      VerificationType.identity => l10n.verifiedIdentity,
      VerificationType.business => l10n.verifiedBusiness,
      VerificationType.creator => l10n.verifiedCreator,
      VerificationType.publisher => l10n.verifiedPublisher,
    };
    final color = context.blocks.success;
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: BlocksSpacing.md,
        vertical: 6,
      ),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(BlocksRadius.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.verified_user_rounded, size: 16, color: color),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              label,
              style: context.text.labelMedium?.copyWith(color: color),
            ),
          ),
        ],
      ),
    );
  }
}

class _ReachCard extends ConsumerWidget {
  const _ReachCard({required this.user});

  final AppUser user;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final progress = ref
        .watch(reachCalculatorProvider)
        .evaluate(user.bestPostReach);
    final level = progress.current;
    final color = context.blocks.reachColor(level);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: BlocksSpacing.lg),
      child: Container(
        padding: const EdgeInsets.all(BlocksSpacing.lg),
        decoration: BoxDecoration(
          color: context.scheme.surface,
          borderRadius: BorderRadius.circular(BlocksRadius.xl),
          border: Border.all(color: context.scheme.outlineVariant),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    l10n.profileReachLevel,
                    style: context.text.titleSmall,
                  ),
                ),
                // The level readout scales down rather than overflowing on a
                // narrow phone with a large system font.
                Flexible(
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: AlignmentDirectional.centerEnd,
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        ReachLevelBadge(level: level, showName: false),
                        const SizedBox(width: BlocksSpacing.sm),
                        Text(
                          l10n.profileLevelLine(
                            level.code,
                            level.label(l10n).toUpperCase(),
                          ),
                          style: context.text.titleSmall?.copyWith(
                            color: color,
                            letterSpacing: 0.6,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: BlocksSpacing.lg),
            ReachLadder(progress: progress, compact: true),
            const SizedBox(height: BlocksSpacing.md),
            Text(l10n.profileBestPost, style: context.text.bodySmall),
          ],
        ),
      ),
    );
  }
}
