import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/utils/number_format.dart';
import 'package:blocks_app/core/utils/time_ago.dart';
import 'package:blocks_app/core/widgets/blocks_avatar.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:blocks_app/data/models/business_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/engagement/application/engagement_controllers.dart';
import 'package:blocks_app/features/post/application/post_providers.dart';
import 'package:blocks_app/features/safety/presentation/report_sheet.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Comments for a post or a reel.
Future<void> showCommentsSheet(BuildContext context, ContentRef content) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.75,
      minChildSize: 0.45,
      maxChildSize: 0.95,
      builder: (context, scroll) =>
          _CommentsBody(content: content, scroll: scroll),
    ),
  );
}

class _CommentsBody extends ConsumerStatefulWidget {
  const _CommentsBody({required this.content, required this.scroll});

  final ContentRef content;
  final ScrollController scroll;

  @override
  ConsumerState<_CommentsBody> createState() => _CommentsBodyState();
}

class _CommentsBodyState extends ConsumerState<_CommentsBody> {
  final _input = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    await ref
        .read(commentsControllerProvider(widget.content.id).notifier)
        .add(text);
    ref.read(interactionsProvider.notifier).commentAdded(widget.content);
    if (!mounted) return;
    _input.clear();
    setState(() => _sending = false);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final async = ref.watch(commentsControllerProvider(widget.content.id));
    final data = async.value;
    final now = ref.read(clockProvider)();
    final controller = ref.read(
      commentsControllerProvider(widget.content.id).notifier,
    );

    Widget body;
    if (data == null) {
      body = async.hasError
          ? ErrorView(
              onRetry: () =>
                  ref.invalidate(commentsControllerProvider(widget.content.id)),
            )
          : const LoadingView();
    } else if (data.items.isEmpty) {
      body = EmptyView(
        icon: Icons.mode_comment_outlined,
        title: l10n.commentsEmptyTitle,
        body: l10n.commentsEmptyBody,
      );
    } else {
      body = NotificationListener<ScrollNotification>(
        onNotification: (n) {
          if (n.metrics.extentAfter < 400) controller.loadMore();
          return false;
        },
        child: ListView.builder(
          controller: widget.scroll,
          padding: const EdgeInsets.symmetric(horizontal: BlocksSpacing.lg),
          itemCount: data.items.length + (data.hasMore ? 1 : 0),
          itemBuilder: (context, i) {
            if (i >= data.items.length) {
              return const Padding(
                padding: EdgeInsets.all(BlocksSpacing.lg),
                child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
              );
            }
            final c = data.items[i];
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: BlocksSpacing.sm),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  BlocksAvatar(
                    name: c.author.name,
                    imageUrl: c.author.avatarUrl,
                    size: 36,
                  ),
                  const SizedBox(width: BlocksSpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text.rich(
                          TextSpan(
                            children: [
                              TextSpan(
                                text: c.author.name,
                                style: context.text.titleSmall,
                              ),
                              TextSpan(
                                text:
                                    '  ${timeAgo(l10n, c.createdAt, now: now)}',
                                style: context.text.bodySmall,
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(c.text, style: context.text.bodyMedium),
                        if (c.likes > 0)
                          Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Text(
                              '${compactCount(c.likes)} ♥',
                              style: context.text.bodySmall,
                            ),
                          ),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: l10n.actionReport,
                    icon: const Icon(Icons.flag_outlined, size: 20),
                    onPressed: () => showReportSheet(
                      context,
                      targetType: ReportTargetType.comment,
                      targetId: c.id,
                    ),
                  ),
                ],
              ),
            );
          },
        ),
      );
    }

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: BlocksSpacing.sm),
          child: Semantics(
            header: true,
            child: Text(l10n.commentsTitle, style: context.text.titleMedium),
          ),
        ),
        const Divider(),
        Expanded(child: body),
        const Divider(),
        Padding(
          padding: EdgeInsets.fromLTRB(
            BlocksSpacing.lg,
            BlocksSpacing.sm,
            BlocksSpacing.sm,
            BlocksSpacing.sm + MediaQuery.viewInsetsOf(context).bottom,
          ),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _input,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _send(),
                  decoration: InputDecoration(hintText: l10n.commentsHint),
                ),
              ),
              const SizedBox(width: BlocksSpacing.sm),
              IconButton.filled(
                tooltip: l10n.commentPost,
                onPressed: _sending ? null : _send,
                icon: const Icon(Icons.send_rounded),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
