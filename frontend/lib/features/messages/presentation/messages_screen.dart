import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/utils/debouncer.dart';
import 'package:blocks_app/core/utils/time_ago.dart';
import 'package:blocks_app/core/widgets/blocks_avatar.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:blocks_app/data/models/content_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/messages/application/message_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class MessagesScreen extends ConsumerStatefulWidget {
  const MessagesScreen({super.key});

  @override
  ConsumerState<MessagesScreen> createState() => _MessagesScreenState();
}

class _MessagesScreenState extends ConsumerState<MessagesScreen> {
  final _text = TextEditingController();
  final _debounce = Debouncer(delay: const Duration(milliseconds: 300));

  @override
  void dispose() {
    _debounce.dispose();
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final async = ref.watch(conversationsProvider);
    final query = ref.watch(messageQueryProvider);
    final list = async.value;

    Widget body;
    if (list == null) {
      body = async.hasError
          ? ErrorView(onRetry: () => ref.invalidate(conversationsProvider))
          : const LoadingView();
    } else if (list.isEmpty) {
      body = query.isEmpty
          ? EmptyView(
              icon: Icons.chat_bubble_outline_rounded,
              title: l10n.messagesEmptyTitle,
              body: l10n.messagesEmptyBody,
            )
          : EmptyView(
              icon: Icons.search_off_rounded,
              title: l10n.messagesNoMatch(query),
            );
    } else {
      body = ListView.builder(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        itemCount: list.length,
        itemBuilder: (context, i) => _ConversationTile(conversation: list[i]),
      );
    }

    return Scaffold(
      appBar: AppBar(title: Text(l10n.messagesTitle)),
      body: SafeArea(
        child: ResponsiveCenter(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  BlocksSpacing.lg,
                  BlocksSpacing.sm,
                  BlocksSpacing.lg,
                  BlocksSpacing.md,
                ),
                child: TextField(
                  controller: _text,
                  onChanged: (v) => _debounce.run(() {
                    if (mounted) ref.read(messageQueryProvider.notifier).set(v);
                  }),
                  decoration: InputDecoration(
                    hintText: l10n.messagesSearchHint,
                    prefixIcon: const Icon(Icons.search_rounded),
                  ),
                ),
              ),
              Expanded(child: body),
            ],
          ),
        ),
      ),
    );
  }
}

class _ConversationTile extends ConsumerWidget {
  const _ConversationTile({required this.conversation});

  final Conversation conversation;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final c = conversation;
    final now = ref.read(clockProvider)();
    final unread = c.unreadCount > 0;

    return Semantics(
      button: true,
      label:
          '${c.participant.name}. ${c.lastMessage}.${unread ? ' ${l10n.conversationUnread('${c.unreadCount}')}.' : ''}${c.isOnline ? ' ${l10n.chatOnline}.' : ''}',
      excludeSemantics: true,
      child: InkWell(
        onTap: () => context.push(Routes.chat(c.id)),
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: BlocksSpacing.lg,
            vertical: BlocksSpacing.md,
          ),
          child: Row(
            children: [
              BlocksAvatar(
                name: c.participant.name,
                imageUrl: c.participant.avatarUrl,
                size: 52,
                isOnline: c.isOnline,
              ),
              const SizedBox(width: BlocksSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            c.participant.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: context.text.titleSmall,
                          ),
                        ),
                        if (c.participant.isVerified) ...[
                          const SizedBox(width: 4),
                          Icon(
                            Icons.verified_rounded,
                            size: 15,
                            color: context.blocks.reachState,
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      c.lastMessage,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: context.text.bodyMedium?.copyWith(
                        color: unread
                            ? context.scheme.onSurface
                            : context.scheme.onSurfaceVariant,
                        fontWeight: unread ? FontWeight.w700 : FontWeight.w400,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: BlocksSpacing.sm),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    timeAgo(l10n, c.lastAt, now: now),
                    style: context.text.labelSmall,
                  ),
                  const SizedBox(height: 6),
                  if (unread)
                    Container(
                      constraints: const BoxConstraints(minWidth: 22),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: context.scheme.primary,
                        borderRadius: BorderRadius.circular(BlocksRadius.pill),
                      ),
                      child: Text(
                        '${c.unreadCount}',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: context.scheme.onPrimary,
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    )
                  else
                    const SizedBox(height: 18),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
