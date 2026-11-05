import 'package:supabase_flutter/supabase_flutter.dart';

import 'api_chat_repository.dart';

/// Derniers messages d'une conversation de l'utilisateur (RLS
/// `messages_select_own`), du plus ancien au plus récent.
MessagesReader supabaseMessagesReader(
  SupabaseClient client, {
  int limit = 200,
}) {
  return (conversationId) async {
    final rows = await client
        .from('messages')
        .select('id, role, content, status, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', ascending: false)
        .limit(limit);
    return List<Map<String, dynamic>>.from(rows).reversed.toList();
  };
}
