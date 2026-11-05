/// Raison de fin d'une réponse (`src/lib/chat/types.ts`).
enum FinishReason { stop, length, refusal, other }

/// Événements du flux NDJSON de `POST /api/chat` (ARCHITECTURE §6).
sealed class ChatStreamEvent {
  const ChatStreamEvent();
}

/// Identifiant de la conversation (créée par le serveur si nouvelle).
final class MetaEvent extends ChatStreamEvent {
  const MetaEvent(this.conversationId);
  final String conversationId;
}

/// Morceau de texte à ajouter à la réponse.
final class DeltaEvent extends ChatStreamEvent {
  const DeltaEvent(this.text);
  final String text;
}

/// Texte final qui remplace tout ce qui a été affiché.
final class ReplaceEvent extends ChatStreamEvent {
  const ReplaceEvent(this.text);
  final String text;
}

final class DoneEvent extends ChatStreamEvent {
  const DoneEvent(this.finishReason);
  final FinishReason finishReason;
}

/// Erreur signalée dans le flux ; [message] est en français.
final class ErrorEvent extends ChatStreamEvent {
  const ErrorEvent({required this.code, required this.message});
  final String code;
  final String message;
}
