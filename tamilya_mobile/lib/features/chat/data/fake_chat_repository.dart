import '../../../shared/models/chat_message.dart';
import '../domain/chat_repository.dart';

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
  Stream<String> sendMessage({
    String? conversationId,
    required String text,
  }) async* {
    const reply = 'Ceci est une réponse factice de Tamilya.';
    await Future<void>.delayed(delay * 4);
    for (final word in reply.split(' ')) {
      yield '$word ';
      await Future<void>.delayed(delay);
    }
  }
}
