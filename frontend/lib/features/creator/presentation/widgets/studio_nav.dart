import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/features/reel_studio/presentation/widgets/panel_parts.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Where you can go inside Creator Studio.
///
/// Overview · Content (Reels, Posts, Drafts) · Analytics · Reach · Earnings ·
/// Copyright and music · Payout (Verification, Bank Account, History live inside the Payout Center).
enum StudioSection {
  overview(Routes.creatorStudio, Icons.dashboard_rounded),
  reels(Routes.creatorReels, Icons.movie_rounded),
  posts(Routes.creatorPosts, Icons.grid_view_rounded),
  drafts(Routes.creatorDrafts, Icons.edit_note_rounded),
  analytics(Routes.creatorAnalytics, Icons.bar_chart_rounded),
  reach(Routes.creatorReach, Icons.stacked_line_chart_rounded),
  earnings(Routes.creatorEarnings, Icons.payments_rounded),
  music(Routes.creatorMusic, Icons.library_music_rounded),
  payout(Routes.payoutCenter, Icons.account_balance_wallet_rounded);

  const StudioSection(this.route, this.icon);

  final String route;
  final IconData icon;

  String label(BuildContext context) {
    final l = context.l10n;
    return switch (this) {
      StudioSection.overview => l.csNavOverview,
      StudioSection.reels => l.csNavReels,
      StudioSection.posts => l.csNavPosts,
      StudioSection.drafts => l.csNavDrafts,
      StudioSection.analytics => l.csNavAnalytics,
      StudioSection.reach => l.csNavReach,
      StudioSection.earnings => l.csNavEarnings,
      StudioSection.music => l.csNavMusic,
      StudioSection.payout => l.csNavPayout,
    };
  }
}

/// A row of section chips shown on every Creator Studio screen. It replaces
/// the screen it is on (so Back still returns to wherever you came from, not
/// through every section you visited).
class StudioNav extends StatelessWidget {
  const StudioNav({required this.current, super.key});

  final StudioSection current;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      label: context.l10n.csNavLabel,
      child: SizedBox(
        height: BlocksSpacing.touchTarget + 4,
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: BlocksSpacing.lg),
          child: Row(
            children: [
              for (final s in StudioSection.values)
                Padding(
                  padding: const EdgeInsetsDirectional.only(
                    end: BlocksSpacing.xs,
                  ),
                  child: PanelChip(
                    icon: s.icon,
                    label: s.label(context),
                    selected: s == current,
                    onTap: s == current
                        ? null
                        : () => context.pushReplacement(s.route),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// App bar + section chips + body, for every Creator Studio screen.
class StudioScaffold extends StatelessWidget {
  const StudioScaffold({
    required this.section,
    required this.body,
    super.key,
    this.title,
    this.actions,
    this.floatingActionButton,
  });

  final StudioSection section;
  final String? title;
  final Widget body;
  final List<Widget>? actions;
  final Widget? floatingActionButton;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(title ?? context.l10n.studioTitle),
        actions: actions,
      ),
      floatingActionButton: floatingActionButton,
      body: SafeArea(
        child: ResponsiveCenter(
          maxWidth: 720,
          child: Column(
            children: [
              StudioNav(current: section),
              Expanded(child: body),
            ],
          ),
        ),
      ),
    );
  }
}
