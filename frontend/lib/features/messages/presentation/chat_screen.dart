import 'dart:math';

import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/app_snack.dart';
import 'package:blocks_app/core/widgets/blocks_avatar.dart';
import 'package:blocks_app/core/widgets/blocks_image.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:blocks_app/data/models/content_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/messages/application/message_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({required this.conversationId, super.key});

  final String conversationId;

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _input = TextEditingController();
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      await ref
          .read(messageRepositoryProvider)
          .markConversationRead(widget.conversationId);
      if (mounted) ref.invalidate(conversationsProvider);
    });
  }

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    _input.clear();
    await ref
        .read(chatControllerProvider(widget.conversationId).notifier)
        .send(text);
    if (mounted) setState(() => _sending = false);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final conv = ref.watch(conversationProvider(widget.conversationId));
    final async = ref.watch(chatControllerProvider(widget.conversationId));
    final data = async.value;
    final controller = ref.read(
      chatControllerProvider(widget.conversationId).notifier,
    );

    Widget body;
    if (data == null) {
      body = async.hasError
          ? ErrorView(
              onRetry: () =>
                  ref.invalidate(chatControllerProvider(widget.conversationId)),
            )
          : const LoadingView();
    } else if (data.items.isEmpty) {
      body = EmptyView(
        icon: Icons.waving_hand_rounded,
        title: l10n.chatEmptyTitle,
        body: l10n.chatEmptyBody,
      );
    } else {
      // reverse: true keeps the newest message pinned to the composer, and
      // older pages load as the user scrolls up.
      body = NotificationListener<ScrollNotification>(
        onNotification: (n) {
          if (n.metrics.extentAfter < 300) controller.loadMore();
          return false;
        },
        child: ListView.builder(
          reverse: true,
          padding: const EdgeInsets.all(BlocksSpacing.lg),
          itemCount: data.items.length,
          itemBuilder: (context, i) =>
              _Bubble(key: ValueKey(data.items[i].id), message: data.items[i]),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: conv.when(
          loading: () => const SizedBox.shrink(),
          error: (_, _) => const SizedBox.shrink(),
          data: (c) => Row(
            children: [
              BlocksAvatar(
                name: c.participant.name,
                imageUrl: c.participant.avatarUrl,
                size: 38,
                isOnline: c.isOnline,
              ),
              const SizedBox(width: BlocksSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      c.participant.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: context.text.titleSmall,
                    ),
                    Text(
                      c.isOnline ? l10n.chatOnline : l10n.chatOffline,
                      style: context.text.bodySmall?.copyWith(
                        color: c.isOnline ? context.blocks.success : null,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
      body: SafeArea(
        child: ResponsiveCenter(
          child: Column(
            children: [
              Expanded(child: body),
              _Composer(
                controller: _input,
                sending: _sending,
                onSend: _send,
                onUnavailable: () =>
                    showAppSnack(context, l10n.chatUnavailableDemo),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  const _Composer({
    required this.controller,
    required this.sending,
    required this.onSend,
    required this.onUnavailable,
  });

  final TextEditingController controller;
  final bool sending;
  final VoidCallback onSend;
  final VoidCallback onUnavailable;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Container(
      padding: const EdgeInsets.fromLTRB(
        BlocksSpacing.sm,
        BlocksSpacing.sm,
        BlocksSpacing.sm,
        BlocksSpacing.sm,
      ),
      decoration: BoxDecoration(
        color: context.scheme.surface,
        border: Border(top: BorderSide(color: context.scheme.outlineVariant)),
      ),
      child: Row(
        children: [
          IconButton(
            tooltip: l10n.chatAttach,
            icon: const Icon(Icons.add_photo_alternate_outlined),
            onPressed: onUnavailable,
          ),
          Expanded(
            child: TextField(
              controller: controller,
              minLines: 1,
              maxLines: 4,
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => onSend(),
              decoration: InputDecoration(hintText: l10n.chatMessageHint),
            ),
          ),
          const SizedBox(width: BlocksSpacing.xs),
          // Mic when empty, send when there is text.
          ValueListenableBuilder<TextEditingValue>(
            valueListenable: controller,
            builder: (context, value, _) {
              final hasText = value.text.trim().isNotEmpty;
              return IconButton.filled(
                tooltip: hasText ? l10n.chatSend : l10n.chatVoice,
                icon: Icon(hasText ? Icons.send_rounded : Icons.mic_rounded),
                onPressed: hasText ? (sending ? null : onSend) : onUnavailable,
              );
            },
          ),
        ],
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.message, super.key});

  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    final mine = message.isMine;
    final bg = mine ? context.scheme.primary : context.scheme.surface;
    final fg = mine ? context.scheme.onPrimary : context.scheme.onSurface;
    final radius = BorderRadius.only(
      topLeft: const Radius.circular(18),
      topRight: const Radius.circular(18),
      bottomLeft: Radius.circular(mine ? 18 : 4),
      bottomRight: Radius.circular(mine ? 4 : 18),
    );

    final Widget content = switch (message.kind) {
      MessageKind.text => Text(
        message.text ?? '',
        style: context.text.bodyMedium?.copyWith(color: fg),
      ),
      MessageKind.image => _ImageContent(url: message.mediaUrl),
      MessageKind.voice => _VoiceContent(message: message, color: fg),
    };

    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width * 0.78,
        ),
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 3),
          padding: message.kind == MessageKind.image
              ? const EdgeInsets.all(4)
              : const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: radius,
            border: mine
                ? null
                : Border.all(color: context.scheme.outlineVariant),
          ),
          child: content,
        ),
      ),
    );
  }
}

class _ImageContent extends StatelessWidget {
  const _ImageContent({required this.url});

  final String? url;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      image: true,
      label: context.l10n.chatPhoto,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: SizedBox(
          width: 200,
          height: 220,
          child: url == null
              ? ColoredBox(color: context.blocks.surfaceMuted)
              : BlocksImage(url: url!, variant: ImageVariant.medium),
        ),
      ),
    );
  }
}

/// Voice-message placeholder: play button, waveform and duration.
class _VoiceContent extends StatelessWidget {
  const _VoiceContent({required this.message, required this.color});

  final ChatMessage message;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final seconds = message.voiceSeconds ?? 0;
    final duration =
        '${seconds ~/ 60}:${(seconds % 60).toString().padLeft(2, '0')}';
    final rnd = Random(message.id.hashCode);
    final bars = List.generate(22, (_) => 6 + rnd.nextInt(20).toDouble());

    return Semantics(
      label: context.l10n.chatVoiceMessage(duration),
      excludeSemantics: true,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.play_circle_fill_rounded, color: color, size: 34),
          const SizedBox(width: BlocksSpacing.sm),
          for (final h in bars)
            Container(
              width: 3,
              height: h,
              margin: const EdgeInsets.symmetric(horizontal: 1),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.75),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          const SizedBox(width: BlocksSpacing.sm),
          Text(
            duration,
            style: TextStyle(
              color: color,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}
