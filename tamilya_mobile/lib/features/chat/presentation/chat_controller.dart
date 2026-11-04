import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/models/chat_message.dart';
import '../data/fake_chat_repository.dart';
import '../domain/chat_repository.dart';

/// Surchargé en C3 par l'implémentation réseau (et dans les tests).
final chatRepositoryProvider = Provider<ChatRepository>(
  (ref) => const FakeChatRepository(),
);

class ChatState {
  const ChatState({
    this.messages = const [],
    this.isTyping = false,
    this.loading = false,
  });

  final List<ChatMessage> messages;

  /// Vrai de l'envoi jusqu'à la fin de la réponse.
  final bool isTyping;

  /// Chargement de l'historique d'une conversation existante.
  final bool loading;

  /// Vrai tant que Tamilya n'a pas encore commencé à répondre.
  bool get waitingForFirstChunk =>
      isTyping && (messages.isEmpty || messages.last.role == MessageRole.user);

  ChatState copyWith({
    List<ChatMessage>? messages,
    bool? isTyping,
    bool? loading,
  }) => ChatState(
    messages: messages ?? this.messages,
    isTyping: isTyping ?? this.isTyping,
    loading: loading ?? this.loading,
  );
}

/// Contrôleur d'une conversation ([conversationId] nul = nouvelle).
class ChatController extends Notifier<ChatState> {
  ChatController(this.conversationId);

  final String? conversationId;
  int _seq = 0;
  bool _stopRequested = false;

  @override
  ChatState build() {
    if (conversationId == null) return const ChatState();
    Future.microtask(_loadHistory);
    return const ChatState(loading: true);
  }

  Future<void> _loadHistory() async {
    final history = await ref
        .read(chatRepositoryProvider)
        .history(conversationId!);
    if (!ref.mounted) return;
    state = state.copyWith(messages: history, loading: false);
  }

  void stop() => _stopRequested = true;

  /// Renvoie le dernier message utilisateur après une réponse en erreur ou
  /// interrompue. Action explicite de l'utilisateur (ARCHITECTURE A4) : le
  /// message en échec est retiré de l'affichage, puis le texte est renvoyé.
  Future<void> retry() async {
    if (state.isTyping) return;
    final messages = [...state.messages];
    if (messages.isEmpty || messages.last.role != MessageRole.assistant) return;
    messages.removeLast();
    if (messages.isEmpty || messages.last.role != MessageRole.user) return;
    final text = messages.removeLast().text;
    state = state.copyWith(messages: messages);
    await send(text);
  }

  Future<void> send(String text) async {
    final trimmed = text.trim();
    if (trimmed.isEmpty || state.isTyping) return;

    _stopRequested = false;
    final id = _seq++;
    final assistantId = 'a$id';
    state = state.copyWith(
      messages: [
        ...state.messages,
        ChatMessage(id: 'u$id', role: MessageRole.user, text: trimmed),
      ],
      isTyping: true,
    );

    var received = '';
    var started = false;
    try {
      final stream = ref
          .read(chatRepositoryProvider)
          .sendMessage(conversationId: conversationId, text: trimmed);
      await for (final delta in stream) {
        if (!ref.mounted) return;
        received += delta;
        _upsertAssistant(
          ChatMessage(
            id: assistantId,
            role: MessageRole.assistant,
            text: received,
            status: MessageStatus.streaming,
          ),
          replace: started,
        );
        started = true;
        if (_stopRequested) break;
      }
      if (!ref.mounted) return;
      _upsertAssistant(
        ChatMessage(
          id: assistantId,
          role: MessageRole.assistant,
          text: received,
          status: _stopRequested
              ? MessageStatus.interrupted
              : MessageStatus.complete,
        ),
        replace: started,
      );
    } on Object {
      if (!ref.mounted) return;
      _upsertAssistant(
        ChatMessage(
          id: assistantId,
          role: MessageRole.assistant,
          text: received,
          status: received.isEmpty
              ? MessageStatus.error
              : MessageStatus.interrupted,
        ),
        replace: started,
      );
    } finally {
      if (ref.mounted) state = state.copyWith(isTyping: false);
    }
  }

  void _upsertAssistant(ChatMessage message, {required bool replace}) {
    final list = [...state.messages];
    if (replace && list.isNotEmpty) {
      list[list.length - 1] = message;
    } else {
      list.add(message);
    }
    state = state.copyWith(messages: list);
  }
}

final chatControllerProvider =
    NotifierProvider.family<ChatController, ChatState, String?>(
      ChatController.new,
    );
