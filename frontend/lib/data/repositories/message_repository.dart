import 'package:blocks_app/data/models/content_models.dart';
import 'package:blocks_app/data/models/paged_result.dart';

abstract interface class MessageRepository {
  Future<List<Conversation>> getConversations({String query = ''});
  Future<Conversation> getConversation(String id);

  /// Newest-first pages; the UI reverses for display.
  Future<PagedResult<ChatMessage>> getMessages(
    String conversationId, {
    String? cursor,
    int limit = 30,
  });
  Future<ChatMessage> sendMessage(String conversationId, String text);
  Future<void> markConversationRead(String conversationId);

  /// Opens (or creates) the 1:1 conversation with [userId].
  Future<Conversation> conversationWith(String userId);
}
