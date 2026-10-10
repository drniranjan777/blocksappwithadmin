import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/pagination/paged_notifier.dart';
import 'package:blocks_app/core/widgets/load_more_footer.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Slivers for a paginated grid with the standard loading / error / empty /
/// content states. Shared by profile, business and any other tile grid.
List<Widget> pagedGridSlivers<T>(
  BuildContext context, {
  required AsyncValue<PagedState<T>> async,
  required VoidCallback onRetry,
  required VoidCallback onLoadMore,
  required Widget Function(T item) tile,
  double aspectRatio = 0.8,
  int skeletonCount = 9,
}) {
  final data = async.value;
  final columns = MediaQuery.sizeOf(context).width >= 600 ? 4 : 3;
  final delegate = SliverGridDelegateWithFixedCrossAxisCount(
    crossAxisCount: columns,
    mainAxisSpacing: 4,
    crossAxisSpacing: 4,
    childAspectRatio: aspectRatio,
  );

  if (data == null) {
    if (async.hasError) {
      return [
        SliverToBoxAdapter(
          child: SizedBox(height: 260, child: ErrorView(onRetry: onRetry)),
        ),
      ];
    }
    return [
      SliverPadding(
        padding: const EdgeInsets.symmetric(horizontal: BlocksSpacing.lg),
        sliver: SliverGrid.builder(
          gridDelegate: delegate,
          itemCount: skeletonCount,
          itemBuilder: (context, _) => DecoratedBox(
            decoration: BoxDecoration(
              color: context.blocks.surfaceMuted,
              borderRadius: BorderRadius.circular(BlocksRadius.md),
            ),
          ),
        ),
      ),
    ];
  }

  if (data.items.isEmpty) {
    return [
      const SliverToBoxAdapter(
        child: SizedBox(height: 260, child: EmptyView()),
      ),
    ];
  }

  return [
    SliverPadding(
      padding: const EdgeInsets.symmetric(horizontal: BlocksSpacing.lg),
      sliver: SliverGrid.builder(
        gridDelegate: delegate,
        itemCount: data.items.length,
        itemBuilder: (context, i) => tile(data.items[i]),
      ),
    ),
    SliverToBoxAdapter(
      child: LoadMoreFooter(state: data, onLoadMore: onLoadMore),
    ),
  ];
}
