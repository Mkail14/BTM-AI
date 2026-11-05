import '../../../shared/models/chat_message.dart';
import '../domain/chat_repository.dart';
import '../domain/chat_stream_event.dart';

/// Répond une phrase factice, mot par mot, avec un léger délai.
class FakeChatRepository implements ChatRepository {
  const FakeChatRepository({this.delay = const Duration(milliseconds: 80)});

  final Duration delay;

  @override
  Future<List<ChatMessage>> history(String conversationId) async => const [
    ChatMessage(
      id: 'h1',
      role: MessageRole.user,
      text: 'Comment dit-on bonjour ?',
    ),
    ChatMessage(
      id: 'h2',
      role: MessageRole.assistant,
      text: 'Exemple de réponse factice de Tamilya.',
    ),
  ];

  @override
  Stream<ChatStreamEvent> sendMessage({
    String? conversationId,
    required String text,
  }) async* {
    const reply = 'Ceci est une réponse factice de Tamilya.';
    await Future<void>.delayed(delay * 4);
    yield MetaEvent(conversationId ?? 'fake-conversation');
    for (final word in reply.split(' ')) {
      yield DeltaEvent('$word ');
      await Future<void>.delayed(delay);
    }
    yield const DoneEvent(FinishReason.stop);
  }
}
