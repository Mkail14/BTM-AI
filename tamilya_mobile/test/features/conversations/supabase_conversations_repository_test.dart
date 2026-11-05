import 'package:flutter_test/flutter_test.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:tamilya_mobile/core/errors/app_failure.dart';
import 'package:tamilya_mobile/core/supabase/supabase_failure.dart';
import 'package:tamilya_mobile/features/conversations/data/supabase_conversations_repository.dart';

void main() {
  test(
    'lignes Supabase vers résumés (titre vide = titre par défaut)',
    () async {
      final repo = SupabaseConversationsRepository(
        () async => [
          {'id': 'a', 'title': 'Dire bonjour', 'updated_at': 'x'},
          {'id': 'b', 'title': '  ', 'updated_at': 'y'},
        ],
      );
      final list = await repo.list();
      expect(list.map((c) => c.id), ['a', 'b']);
      expect(list.first.title, 'Dire bonjour');
      expect(list.last.title, 'Nouvelle conversation');
    },
  );

  test('JWT expiré = session expirée; autre panne = réseau', () async {
    expect(
      supabaseToFailure(
        const PostgrestException(message: 'JWT expired', code: 'PGRST301'),
      ),
      isA<SessionExpiredFailure>(),
    );
    expect(
      supabaseToFailure(const PostgrestException(message: 'boom', code: '500')),
      isA<NetworkFailure>(),
    );
    final repo = SupabaseConversationsRepository(
      () async => throw const PostgrestException(message: 'JWT expired'),
    );
    await expectLater(repo.list(), throwsA(isA<SessionExpiredFailure>()));
  });
}
