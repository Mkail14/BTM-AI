enum MessageRole { user, assistant }

/// Action proposée sous une réponse en échec.
enum RetryKind { none, retry, resend }

/// État d'un message (03-uiux.md §4 : complete, streaming, interrupted, error).
enum MessageStatus { complete, streaming, interrupted, error }

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.role,
    required this.text,
    this.status = MessageStatus.complete,
    this.errorText,
    this.retry = RetryKind.none,
  });

  final String id;
  final MessageRole role;
  final String text;
  final MessageStatus status;

  /// Message d'erreur à afficher (français) pour une réponse en échec.
  final String? errorText;

  /// Bouton proposé : « Réessayer » ou « Renvoyer » (session renouvelée).
  final RetryKind retry;

  ChatMessage copyWith({String? text, MessageStatus? status}) => ChatMessage(
    id: id,
    role: role,
    text: text ?? this.text,
    status: status ?? this.status,
    errorText: errorText,
    retry: retry,
  );
}
