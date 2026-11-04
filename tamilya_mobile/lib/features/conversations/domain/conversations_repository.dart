import 'conversation_summary.dart';

/// Lecture de l'historique. Lecture Supabase directe en C3.
abstract interface class ConversationsRepository {
  Future<List<ConversationSummary>> list();
}
