enum MessageRole { user, assistant }

/// État d'un message (03-uiux.md §4 : complete, streaming, interrupted, error).
enum MessageStatus { complete, streaming, interrupted, error }

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.role,
    required this.text,
    this.status = MessageStatus.complete,
  });

  final String id;
  final MessageRole role;
  final String text;
  final MessageStatus status;

  ChatMessage copyWith({String? text, MessageStatus? status}) => ChatMessage(
    id: id,
    role: role,
    text: text ?? this.text,
    status: status ?? this.status,
  );
}
