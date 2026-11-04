import '../domain/conversation_summary.dart';
import '../domain/conversations_repository.dart';

/// Données factices pour la maquette.
class FakeConversationsRepository implements ConversationsRepository {
  const FakeConversationsRepository();

  @override
  Future<List<ConversationSummary>> list() async => const [
    ConversationSummary(id: 'c1', title: 'Dire bonjour en shimaoré'),
    ConversationSummary(id: 'c2', title: 'Les nombres de 1 à 10'),
    ConversationSummary(id: 'c3', title: 'Au marché de Mamoudzou'),
  ];
}
