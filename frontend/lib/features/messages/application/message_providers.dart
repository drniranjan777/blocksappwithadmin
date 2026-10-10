import 'package:blocks_app/core/pagination/paged_notifier.dart';
import 'package:blocks_app/data/models/content_models.dart';
import 'package:blocks_app/data/models/paged_result.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Debounced search text for the conversation list.
class MessageQuery extends Notifier<String> {
  @override
  String build() => '';

  void set(String v) => state = v.trim();
}

final messageQueryProvider = NotifierProvider<MessageQuery, String>(
  MessageQuery.new,
);

final conversationsProvider = FutureProvider<List<Conversation>>((ref) {
  final q = ref.watch(messageQueryProvider);
  return ref.watch(messageRepositoryProvider).getConversations(query: q);
});

final conversationProvider = FutureProvider.family<Conversation, String>(
  (ref, id) => ref.watch(messageRepositoryProvider).getConversation(id),
);

/// Newest-first pages for one chat; the screen shows them reversed.
class ChatController extends PagedNotifier<ChatMessage> {
  ChatController(this.conversationId);

  final String conversationId;

  @override
  Future<PagedResult<ChatMessage>> fetchPage(String? cursor) => ref
      .read(messageRepositoryProvider)
      .getMessages(conversationId, cursor: cursor, limit: 30);

  Future<void> send(String text) async {
    final message = await ref
        .read(messageRepositoryProvider)
        .sendMessage(conversationId, text);
    prepend(message);
    ref.invalidate(conversationsProvider);
  }
}

final chatControllerProvider =
    AsyncNotifierProvider.family<
      ChatController,
      PagedState<ChatMessage>,
      String
    >(ChatController.new);
