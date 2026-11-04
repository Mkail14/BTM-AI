import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/fake_conversations_repository.dart';
import '../domain/conversation_summary.dart';
import '../domain/conversations_repository.dart';

final conversationsRepositoryProvider = Provider<ConversationsRepository>(
  (ref) => const FakeConversationsRepository(),
);

final conversationsListProvider = FutureProvider<List<ConversationSummary>>(
  (ref) => ref.watch(conversationsRepositoryProvider).list(),
);
