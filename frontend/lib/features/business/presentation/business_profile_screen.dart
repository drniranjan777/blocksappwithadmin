import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/utils/number_format.dart';
import 'package:blocks_app/core/widgets/app_snack.dart';
import 'package:blocks_app/core/widgets/blocks_avatar.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/core/widgets/demo_art.dart';
import 'package:blocks_app/core/widgets/paged_grid.dart';
import 'package:blocks_app/core/widgets/pinned_tab_strip.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:blocks_app/data/models/business_models.dart';
import 'package:blocks_app/features/business/application/business_providers.dart';
import 'package:blocks_app/features/engagement/presentation/follow_button.dart';
import 'package:blocks_app/features/post/presentation/post_tile.dart';
import 'package:blocks_app/features/profile/application/profile_controllers.dart';
import 'package:blocks_app/features/profile/presentation/reel_tile.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// "BLOCKS Business" page: header, Follow / Contact / Promote, and the
/// Posts · Reels · Offers · About tabs.
class BusinessProfileScreen extends ConsumerStatefulWidget {
  const BusinessProfileScreen({required this.businessId, super.key});

  final String businessId;

  @override
  ConsumerState<BusinessProfileScreen> createState() => _BusinessProfileState();
}

class _BusinessProfileState extends ConsumerState<BusinessProfileScreen> {
  int _tab = 0;

  String get _id => widget.businessId;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(businessProvider(_id));

    return Scaffold(
      body: async.when(
        loading: () => const SafeArea(child: LoadingView()),
        error: (err, _) => SafeArea(
          child: ErrorView(
            error: err,
            onRetry: () => ref.invalidate(businessProvider(_id)),
          ),
        ),
        data: (b) => _content(context, b),
      ),
    );
  }

  Widget _content(BuildContext context, BusinessProfile b) {
    final l10n = context.l10n;
    return SafeArea(
      bottom: false,
      child: ResponsiveCenter(
        maxWidth: 720,
        child: NotificationListener<ScrollNotification>(
          onNotification: (n) {
            if (n.metrics.axis == Axis.vertical &&
                n.metrics.extentAfter < 600) {
              if (_tab == 0) {
                ref.read(businessPostsProvider(_id).notifier).loadMore();
              } else if (_tab == 1) {
                ref.read(userReelsProvider(_id).notifier).loadMore();
              }
            }
            return false;
          },
          child: CustomScrollView(
            slivers: [
              SliverAppBar(
                pinned: true,
                title: Text(l10n.businessLabel),
                leading: IconButton(
                  tooltip: l10n.backTooltip,
                  icon: const Icon(Icons.arrow_back_rounded),
                  onPressed: () => context.canPop()
                      ? context.pop()
                      : context.go(Routes.home),
                ),
              ),
              SliverToBoxAdapter(child: _Header(business: b)),
              SliverPersistentHeader(
                pinned: true,
                delegate: PinnedTabStripDelegate(
                  items: [
                    TabStripItem(Icons.grid_on_rounded, l10n.businessTabPosts),
                    TabStripItem(
                      Icons.play_circle_outline_rounded,
                      l10n.businessTabReels,
                    ),
                    TabStripItem(
                      Icons.local_offer_outlined,
                      l10n.businessTabOffers,
                    ),
                    TabStripItem(
                      Icons.info_outline_rounded,
                      l10n.businessTabAbout,
                    ),
                  ],
                  selected: _tab,
                  onSelected: (i) => setState(() => _tab = i),
                  background: context.theme.scaffoldBackgroundColor,
                ),
              ),
              ..._tabContent(context, b),
              const SliverToBoxAdapter(
                child: SizedBox(height: BlocksSpacing.xxl),
              ),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _tabContent(BuildContext context, BusinessProfile b) {
    switch (_tab) {
      case 0:
        return pagedGridSlivers(
          context,
          async: ref.watch(businessPostsProvider(_id)),
          onRetry: () => ref.invalidate(businessPostsProvider(_id)),
          onLoadMore: () =>
              ref.read(businessPostsProvider(_id).notifier).loadMore(),
          tile: (p) => PostTile(key: ValueKey(p.id), post: p),
        );
      case 1:
        return pagedGridSlivers(
          context,
          async: ref.watch(userReelsProvider(_id)),
          onRetry: () => ref.invalidate(userReelsProvider(_id)),
          onLoadMore: () =>
              ref.read(userReelsProvider(_id).notifier).loadMore(),
          tile: (r) => ReelTile(key: ValueKey(r.id), reel: r),
          aspectRatio: 0.62,
        );
      case 2:
        final offers = ref.watch(businessOffersProvider(_id));
        final list = offers.value;
        if (list == null) {
          return [
            SliverToBoxAdapter(
              child: SizedBox(
                height: 240,
                child: offers.hasError
                    ? ErrorView(
                        error: offers.error,
                        onRetry: () =>
                            ref.invalidate(businessOffersProvider(_id)),
                      )
                    : const LoadingView(),
              ),
            ),
          ];
        }
        if (list.isEmpty) {
          return [
            const SliverToBoxAdapter(
              child: SizedBox(height: 240, child: EmptyView()),
            ),
          ];
        }
        return [
          SliverPadding(
            padding: const EdgeInsets.all(BlocksSpacing.lg),
            sliver: SliverList.separated(
              itemCount: list.length,
              separatorBuilder: (_, _) =>
                  const SizedBox(height: BlocksSpacing.md),
              itemBuilder: (context, i) => _OfferCard(offer: list[i]),
            ),
          ),
        ];
      default:
        return [SliverToBoxAdapter(child: _About(business: b))];
    }
  }
}

class _Header extends ConsumerWidget {
  const _Header({required this.business});

  final BusinessProfile business;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final b = business;
    final coverSeed = b.id.codeUnits.fold<int>(7, (a, c) => a * 31 + c);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: BlocksSpacing.lg),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(BlocksRadius.xl),
            child: SizedBox(
              height: 130,
              width: double.infinity,
              child: DemoArt(seed: coverSeed),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: BlocksSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // The avatar overlaps the cover: a fixed-height slot with the
              // avatar positioned above it, so layout space is exact.
              SizedBox(
                height: 48,
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Positioned(
                      left: BlocksSpacing.md,
                      top: -40,
                      child: Container(
                        padding: const EdgeInsets.all(4),
                        decoration: BoxDecoration(
                          color: context.theme.scaffoldBackgroundColor,
                          borderRadius: BorderRadius.circular(30),
                        ),
                        child: BlocksAvatar(name: b.name, size: 72),
                      ),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(b.name, style: context.text.headlineSmall),
                      ),
                      if (b.isVerified) ...[
                        const SizedBox(width: 6),
                        Icon(
                          Icons.verified_rounded,
                          color: context.blocks.reachState,
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 2),
                  if (b.isVerified)
                    Padding(
                      padding: const EdgeInsets.only(bottom: BlocksSpacing.sm),
                      child: Row(
                        children: [
                          Icon(
                            Icons.verified_user_rounded,
                            size: 16,
                            color: context.blocks.success,
                          ),
                          const SizedBox(width: 4),
                          Flexible(
                            child: Text(
                              l10n.verifiedBusiness,
                              style: context.text.labelMedium?.copyWith(
                                color: context.blocks.success,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  Text(
                    '${b.category} · ${b.location}',
                    style: context.text.bodyMedium,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    l10n.businessFollowers(compactCount(b.followersCount)),
                    style: context.text.titleSmall,
                  ),
                  const SizedBox(height: BlocksSpacing.lg),
                  Row(
                    children: [
                      Expanded(child: FollowButton(userId: b.id, expand: true)),
                      const SizedBox(width: BlocksSpacing.sm),
                      Expanded(
                        child: BlocksButton(
                          label: l10n.businessContact,
                          variant: BlocksButtonVariant.outline,
                          onPressed: () => _showContact(context, b),
                        ),
                      ),
                      const SizedBox(width: BlocksSpacing.sm),
                      Expanded(
                        child: BlocksButton(
                          label: l10n.businessPromote,
                          variant: BlocksButtonVariant.tonal,
                          onPressed: () => context.push(Routes.promote),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  void _showContact(BuildContext context, BusinessProfile b) {
    final l10n = context.l10n;
    final rows = [
      (Icons.call_rounded, l10n.businessCall, b.phone),
      (Icons.chat_rounded, l10n.businessWhatsApp, b.whatsapp),
      (Icons.language_rounded, l10n.businessWebsite, b.website),
    ];
    showModalBottomSheet<void>(
      context: context,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final (icon, label, value) in rows)
              ListTile(
                leading: Icon(icon),
                title: Text(label),
                subtitle: Text(value),
                trailing: const Icon(Icons.copy_rounded, size: 20),
                // The demo copies instead of dialling/opening links.
                onTap: () async {
                  await Clipboard.setData(ClipboardData(text: value));
                  if (sheet.mounted) Navigator.of(sheet).pop();
                  if (context.mounted) {
                    showAppSnack(context, l10n.businessCopied(label));
                  }
                },
              ),
          ],
        ),
      ),
    );
  }
}

class _OfferCard extends StatelessWidget {
  const _OfferCard({required this.offer});

  final Offer offer;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final until = MaterialLocalizations.of(context)
        .formatMediumDate(offer.validUntil);

    return Container(
      decoration: BoxDecoration(
        color: context.scheme.surface,
        borderRadius: BorderRadius.circular(BlocksRadius.xl),
        border: Border.all(color: context.scheme.outlineVariant),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            height: 92,
            width: double.infinity,
            child: Stack(
              fit: StackFit.expand,
              children: [
                DemoArt(seed: offer.artSeed),
                Positioned(
                  left: BlocksSpacing.lg,
                  bottom: BlocksSpacing.md,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.45),
                      borderRadius: BorderRadius.circular(BlocksRadius.pill),
                    ),
                    child: Text(
                      l10n.businessOfferValid(until),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(BlocksSpacing.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(offer.title, style: context.text.titleMedium),
                const SizedBox(height: 4),
                Text(offer.description, style: context.text.bodyMedium),
                const SizedBox(height: BlocksSpacing.md),
                // Wrap, not Row: the code chip and the copy button flow onto
                // two lines on narrow screens or with long translations.
                Wrap(
                  alignment: WrapAlignment.spaceBetween,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  runSpacing: BlocksSpacing.xs,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: context.blocks.accent.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(BlocksRadius.sm),
                      ),
                      child: Text(
                        l10n.businessOfferCode(offer.code),
                        style: context.text.labelLarge?.copyWith(
                          color: context.blocks.accent,
                        ),
                      ),
                    ),
                    TextButton.icon(
                      onPressed: () async {
                        await Clipboard.setData(
                          ClipboardData(text: offer.code),
                        );
                        if (context.mounted) {
                          showAppSnack(
                            context,
                            l10n.businessCopied(offer.code),
                          );
                        }
                      },
                      icon: const Icon(Icons.copy_rounded, size: 18),
                      label: Text(l10n.businessCopyCode),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _About extends StatelessWidget {
  const _About({required this.business});

  final BusinessProfile business;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final b = business;
    Widget row(IconData icon, String label, String value) => Padding(
      padding: const EdgeInsets.symmetric(vertical: BlocksSpacing.sm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: context.scheme.primary),
          const SizedBox(width: BlocksSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: context.text.labelMedium?.copyWith(
                    color: context.scheme.onSurfaceVariant,
                  ),
                ),
                Text(value, style: context.text.bodyMedium),
              ],
            ),
          ),
        ],
      ),
    );

    return Padding(
      padding: const EdgeInsets.all(BlocksSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
            header: true,
            child: Text(l10n.businessAbout, style: context.text.titleMedium),
          ),
          const SizedBox(height: BlocksSpacing.sm),
          Text(b.about, style: context.text.bodyMedium),
          const SizedBox(height: BlocksSpacing.lg),
          row(Icons.category_outlined, l10n.businessCategory, b.category),
          row(Icons.location_on_outlined, l10n.businessLocation, b.location),
          row(Icons.schedule_rounded, l10n.businessHours, b.hours),
          row(Icons.call_outlined, l10n.businessCall, b.phone),
          row(Icons.chat_outlined, l10n.businessWhatsApp, b.whatsapp),
          row(Icons.language_rounded, l10n.businessWebsite, b.website),
        ],
      ),
    );
  }
}
