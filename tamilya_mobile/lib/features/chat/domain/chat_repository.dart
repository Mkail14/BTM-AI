import '../../../shared/models/chat_message.dart';
import 'chat_stream_event.dart';

/// Messages d'une conversation et envoi.
abstract interface class ChatRepository {
  /// Messages déjà enregistrés d'une conversation (lecture RLS).
  /// Lève une `AppFailure` en cas d'échec.
  Future<List<ChatMessage>> history(String conversationId);

  /// Envoie un message et renvoie le flux d'événements de la réponse.
  /// Annuler l'abonnement interrompt la requête (bouton « Arrêter »).
  /// Les échecs arrivent comme erreurs du flux, de type `AppFailure`.
  Stream<ChatStreamEvent> sendMessage({
    String? conversationId,
    required String text,
  });
}
