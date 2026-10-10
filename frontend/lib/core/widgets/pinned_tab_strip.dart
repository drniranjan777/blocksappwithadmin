import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:flutter/material.dart';

class TabStripItem {
  const TabStripItem(this.icon, this.label);

  final IconData icon;
  final String label;
}

/// Pinned, underlined tab strip for use inside a `CustomScrollView`.
///
/// Tabs switch the slivers below it rather than using a `TabBarView`, which
/// keeps one scroll position and one scroll controller for the whole page.
class PinnedTabStripDelegate extends SliverPersistentHeaderDelegate {
  PinnedTabStripDelegate({
    required this.items,
    required this.selected,
    required this.onSelected,
    required this.background,
  });

  final List<TabStripItem> items;
  final int selected;
  final ValueChanged<int> onSelected;
  final Color background;

  @override
  double get minExtent => 52;
  @override
  double get maxExtent => 52;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    return ColoredBox(
      color: background,
      child: Row(
        children: [
          for (var i = 0; i < items.length; i++)
            Expanded(
              child: _TabButton(
                item: items[i],
                selected: i == selected,
                onTap: () => onSelected(i),
              ),
            ),
        ],
      ),
    );
  }

  @override
  bool shouldRebuild(PinnedTabStripDelegate old) =>
      old.selected != selected ||
      old.background != background ||
      old.items.length != items.length;
}

class _TabButton extends StatelessWidget {
  const _TabButton({
    required this.item,
    required this.selected,
    required this.onTap,
  });

  final TabStripItem item;
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
      label: item.label,
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        child: Container(
          alignment: Alignment.center,
          decoration: BoxDecoration(
            border: Border(
              bottom: BorderSide(
                color: selected
                    ? context.scheme.primary
                    : context.scheme.outlineVariant,
                width: selected ? 3 : 1,
              ),
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(item.icon, size: 20, color: color),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  item.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: context.text.labelLarge?.copyWith(color: color),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
