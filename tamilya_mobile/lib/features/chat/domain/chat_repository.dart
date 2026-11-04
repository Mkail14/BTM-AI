import '../../../shared/models/chat_message.dart';

/// Messages d'une conversation et envoi.
/// Remplacé en C3 par la lecture Supabase et POST /api/chat (flux NDJSON).
abstract interface class ChatRepository {
  /// Messages déjà enregistrés d'une conversation.
  Future<List<ChatMessage>> history(String conversationId);

  /// Envoie un message ; le flux émet des morceaux de texte (deltas).
  Stream<String> sendMessage({String? conversationId, required String text});
}
