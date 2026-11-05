import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/supabase/supabase_failure.dart';
import '../domain/conversation_summary.dart';
import '../domain/conversations_repository.dart';

/// Lecture des lignes de `conversations` (injectée, sans réseau en test).
typedef ConversationsReader = Future<List<Map<String, dynamic>>> Function();

/// Liste des conversations de l'utilisateur, lue directement dans Supabase
/// sous RLS (`conversations_select_own`), les plus récentes d'abord.
class SupabaseConversationsRepository implements ConversationsRepository {
  SupabaseConversationsRepository(this.read);

  factory SupabaseConversationsRepository.client(
    SupabaseClient client, {
    int limit = 50,
  }) => SupabaseConversationsRepository(() async {
    final rows = await client
        .from('conversations')
        .select('id, title, updated_at')
        .order('updated_at', ascending: false)
        .limit(limit);
    return List<Map<String, dynamic>>.from(rows);
  });

  final ConversationsReader read;

  @override
  Future<List<ConversationSummary>> list() async {
    try {
      final rows = await read();
      return [
        for (final r in rows)
          ConversationSummary(
            id: r['id'] as String,
            title: (r['title'] as String?)?.trim().isNotEmpty == true
                ? r['title'] as String
                : 'Nouvelle conversation',
          ),
      ];
    } on Object catch (e) {
      throw supabaseToFailure(e);
    }
  }
}
