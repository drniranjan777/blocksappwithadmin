import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/pagination/paged_notifier.dart';
import 'package:flutter/material.dart';

/// Bottom of a paginated list.
///
///  * Idle with more pages: invisible, but asks for the next page as soon as
///    it is built (i.e. the user is about to reach the end). This also covers
///    screens too short to scroll.
///  * Loading: spinner (only while actually loading — never an idle,
///    forever-animating indicator).
///  * Failed: a retry button.
class LoadMoreFooter extends StatefulWidget {
  const LoadMoreFooter({
    required this.state,
    required this.onLoadMore,
    super.key,
  });

  final PagedState<Object?> state;
  final VoidCallback onLoadMore;

  @override
  State<LoadMoreFooter> createState() => _LoadMoreFooterState();
}

class _LoadMoreFooterState extends State<LoadMoreFooter> {
  @override
  void initState() {
    super.initState();
    _maybeLoad();
  }

  @override
  void didUpdateWidget(LoadMoreFooter old) {
    super.didUpdateWidget(old);
    _maybeLoad();
  }

  void _maybeLoad() {
    final s = widget.state;
    if (!s.hasMore || s.isLoadingMore || s.loadMoreFailed) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) widget.onLoadMore();
    });
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.state;
    if (s.loadMoreFailed) {
      return Center(
        child: TextButton(
          onPressed: widget.onLoadMore,
          child: Text(context.l10n.retry),
        ),
      );
    }
    if (s.isLoadingMore) {
      return const Padding(
        padding: EdgeInsets.all(BlocksSpacing.lg),
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      );
    }
    return const SizedBox(height: BlocksSpacing.xl);
  }
}
