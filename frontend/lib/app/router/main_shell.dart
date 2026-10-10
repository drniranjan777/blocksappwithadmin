import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Hosts the four tab branches. The centre "Create" action is not a tab: it
/// opens a full-screen flow above the shell, so each branch keeps its own
/// scroll position and navigation stack.
class MainShell extends StatelessWidget {
  const MainShell({required this.navigationShell, super.key});

  final StatefulNavigationShell navigationShell;

  /// Bottom-nav slot -> shell branch (slot 2 is Create, which has no branch).
  static const _branchForSlot = {0: 0, 1: 1, 3: 2, 4: 3};
  static const _slotForBranch = [0, 1, 3, 4];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: BlocksBottomNav(
        selectedSlot: _slotForBranch[navigationShell.currentIndex],
        onSelected: (slot) {
          if (slot == 2) {
            context.push(Routes.create);
            return;
          }
          final branch = _branchForSlot[slot]!;
          navigationShell.goBranch(
            branch,
            initialLocation: branch == navigationShell.currentIndex,
          );
        },
      ),
    );
  }
}

class BlocksBottomNav extends StatelessWidget {
  const BlocksBottomNav({
    required this.selectedSlot,
    required this.onSelected,
    super.key,
  });

  final int selectedSlot;
  final ValueChanged<int> onSelected;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final items = [
      (Icons.home_outlined, Icons.home_rounded, l10n.navHome),
      (Icons.explore_outlined, Icons.explore_rounded, l10n.navExplore),
      (Icons.add_rounded, Icons.add_rounded, l10n.navCreate),
      (
        Icons.play_circle_outline_rounded,
        Icons.play_circle_rounded,
        l10n.navReels,
      ),
      (Icons.person_outline_rounded, Icons.person_rounded, l10n.navProfile),
    ];

    return DecoratedBox(
      decoration: BoxDecoration(
        color: context.scheme.surface,
        border: Border(top: BorderSide(color: context.scheme.outlineVariant)),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 64,
          child: Row(
            children: [
              for (var i = 0; i < items.length; i++)
                Expanded(
                  child: i == 2
                      ? _CreateButton(
                          label: items[i].$3,
                          onTap: () => onSelected(i),
                        )
                      : _NavItem(
                          icon: items[i].$1,
                          activeIcon: items[i].$2,
                          label: items[i].$3,
                          selected: selectedSlot == i,
                          onTap: () => onSelected(i),
                        ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final IconData activeIcon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = selected
        ? context.scheme.primary
        : context.scheme.onSurfaceVariant;
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      excludeSemantics: true,
      child: InkResponse(
        onTap: onTap,
        radius: 36,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            AnimatedSwitcher(
              duration: BlocksDurations.fast,
              child: Icon(
                selected ? activeIcon : icon,
                key: ValueKey(selected),
                color: color,
                size: 26,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: context.text.labelSmall?.copyWith(
                color: color,
                fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CreateButton extends StatelessWidget {
  const _CreateButton({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: Center(
        child: GestureDetector(
          onTap: onTap,
          child: Container(
            width: 52,
            height: 44,
            decoration: BoxDecoration(
              color: context.scheme.primary,
              borderRadius: BorderRadius.circular(BlocksRadius.md + 2),
              boxShadow: BlocksShadows.lifted(context.scheme.primary),
            ),
            child: Icon(
              Icons.add_rounded,
              color: context.scheme.onPrimary,
              size: 28,
            ),
          ),
        ),
      ),
    );
  }
}
