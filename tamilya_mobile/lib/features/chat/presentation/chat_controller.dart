import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/errors/error_messages_fr.dart';
import '../../../shared/models/chat_message.dart';
import '../data/fake_chat_repository.dart';
import '../domain/chat_repository.dart';
import '../domain/chat_stream_event.dart';

/// Surchargé au démarrage par l'implémentation réseau (et dans les tests).
final chatRepositoryProvider = Provider<ChatRepository>(
  (ref) => const FakeChatRepository(),
);

/// Codes d'erreur après lesquels renvoyer le même message ne sert à rien.
const Set<String> _noRetryCodes = {
  'rate_limited',
  'signup_required',
  'conversation_too_long',
  'invalid_request',
  'unauthorized',
  'not_found',
  'refusal',
};

class ChatState {
  const ChatState({
    this.messages = const [],
    this.isTyping = false,
    this.loading = false,
    this.conversationId,
    this.blocked = false,
    this.loadError,
  });

  final List<ChatMessage> messages;

  /// Vrai de l'envoi jusqu'à la fin de la réponse.
  final bool isTyping;

  /// Chargement de l'historique d'une conversation existante.
  final bool loading;

  /// Conversation courante (connue après l'événement `meta` pour une
  /// nouvelle conversation).
  final String? conversationId;

  /// Conversation trop longue : le composer est bloqué (`conversation_too_long`).
  final bool blocked;

  /// Échec du chargement de l'historique (message en français).
  final String? loadError;

  /// Vrai tant que Tamilya n'a pas encore commencé à répondre.
  bool get waitingForFirstChunk =>
      isTyping && (messages.isEmpty || messages.last.role == MessageRole.user);

  ChatState copyWith({
    List<ChatMessage>? messages,
    bool? isTyping,
    bool? loading,
    String? conversationId,
    bool? blocked,
    String? loadError,
    bool clearLoadError = false,
  }) => ChatState(
    messages: messages ?? this.messages,
    isTyping: isTyping ?? this.isTyping,
    loading: loading ?? this.loading,
    conversationId: conversationId ?? this.conversationId,
    blocked: blocked ?? this.blocked,
    loadError: clearLoadError ? null : (loadError ?? this.loadError),
  );
}

/// Contrôleur d'une conversation ([conversationId] nul = nouvelle).
class ChatController extends Notifier<ChatState> {
  ChatController(this.conversationId);

  final String? conversationId;
  int _seq = 0;
  StreamSubscription<ChatStreamEvent>? _sub;
  Completer<void>? _running;

  @override
  ChatState build() {
    ref.onDispose(() => _sub?.cancel());
    if (conversationId == null) return const ChatState();
    Future.microtask(_loadHistory);
    return ChatState(loading: true, conversationId: conversationId);
  }

  Future<void> _loadHistory() async {
    try {
      final history = await ref
          .read(chatRepositoryProvider)
          .history(conversationId!);
      if (!ref.mounted) return;
      state = state.copyWith(
        messages: history,
        loading: false,
        clearLoadError: true,
      );
    } on Object catch (e) {
      if (!ref.mounted) return;
      state = state.copyWith(loading: false, loadError: _messageOf(e));
    }
  }

  /// Recharge l'historique après un échec de chargement.
  Future<void> reload() async {
    if (conversationId == null) return;
    state = state.copyWith(loading: true, clearLoadError: true);
    await _loadHistory();
  }

  /// Bouton « Arrêter » : annule la requête (le flux dio), garde le texte
  /// déjà reçu, marqué « Réponse interrompue ».
  void stop() {
    final sub = _sub;
    if (sub == null) return;
    unawaited(sub.cancel());
    _sub = null;
    _settle(interruptedByUser: true);
    _running?.complete();
  }

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

  // --- état de la réponse en cours -------------------------------------
  String _received = '';
  String _assistantId = '';
  bool _started = false;

  Future<void> send(String text) async {
    final trimmed = text.trim();
    if (trimmed.isEmpty || state.isTyping || state.blocked) return;

    final id = _seq++;
    _assistantId = 'a$id';
    _received = '';
    _started = false;
    state = state.copyWith(
      messages: [
        ...state.messages,
        ChatMessage(id: 'u$id', role: MessageRole.user, text: trimmed),
      ],
      isTyping: true,
    );

    final running = _running = Completer<void>();
    final stream = ref
        .read(chatRepositoryProvider)
        .sendMessage(
          conversationId: state.conversationId ?? conversationId,
          text: trimmed,
        );
    _sub = stream.listen(
      _onEvent,
      onError: (Object e) {
        _sub = null;
        _fail(code: e is ApiFailure ? e.code : null, failure: e);
        if (!running.isCompleted) running.complete();
      },
      onDone: () {
        if (_sub == null) return; // déjà réglé (arrêt, erreur ou fin)
        _sub = null;
        // Flux fermé sans `done` : coupure en cours de réponse.
        _fail(failure: const NetworkFailure());
        if (!running.isCompleted) running.complete();
      },
      cancelOnError: true,
    );
    await running.future;
  }

  void _onEvent(ChatStreamEvent event) {
    if (!ref.mounted) return;
    switch (event) {
      case MetaEvent(:final conversationId):
        state = state.copyWith(conversationId: conversationId);
      case DeltaEvent(:final text):
        _received += text;
        _show(MessageStatus.streaming);
      case ReplaceEvent(:final text):
        _received = text;
        _show(MessageStatus.streaming);
      case DoneEvent(:final finishReason):
        _finish();
        _show(
          finishReason == FinishReason.length
              ? MessageStatus.interrupted
              : MessageStatus.complete,
        );
        _settle();
      case ErrorEvent(:final code, :final message):
        final sub = _sub;
        _sub = null;
        if (sub != null) unawaited(sub.cancel());
        _fail(
          code: code,
          failure: ApiFailure(
            code: code,
            message: message.isNotEmpty
                ? message
                : (kApiErrorMessagesFr[code] ??
                      kApiErrorMessagesFr['internal']!),
          ),
        );
        _running?.complete();
    }
  }

  void _finish() {
    final sub = _sub;
    _sub = null;
    if (sub != null) unawaited(sub.cancel());
    _running?.complete();
  }

  /// Termine la réponse sans erreur (fin normale ou arrêt demandé).
  void _settle({bool interruptedByUser = false}) {
    if (!ref.mounted) return;
    if (interruptedByUser && _received.isNotEmpty) {
      _show(MessageStatus.interrupted);
    }
    state = state.copyWith(isTyping: false);
  }

  void _fail({String? code, required Object failure}) {
    if (!ref.mounted) return;
    final text = _messageOf(failure);
    final retry = switch (failure) {
      RetryableAuthFailure() => RetryKind.resend,
      SessionExpiredFailure() => RetryKind.none,
      ApiFailure(:final code) when _noRetryCodes.contains(code) =>
        RetryKind.none,
      _ => RetryKind.retry,
    };
    _show(
      _received.isEmpty ? MessageStatus.error : MessageStatus.interrupted,
      errorText: text,
      retry: retry,
    );
    state = state.copyWith(
      isTyping: false,
      blocked: code == 'conversation_too_long' ? true : null,
    );
  }

  String _messageOf(Object e) =>
      e is AppFailure ? e.message : kApiErrorMessagesFr['internal']!;

  void _show(
    MessageStatus status, {
    String? errorText,
    RetryKind retry = RetryKind.none,
  }) {
    if (!ref.mounted) return;
    final message = ChatMessage(
      id: _assistantId,
      role: MessageRole.assistant,
      text: _received,
      status: status,
      errorText: errorText,
      retry: retry,
    );
    final list = [...state.messages];
    if (_started && list.isNotEmpty) {
      list[list.length - 1] = message;
    } else {
      list.add(message);
    }
    _started = true;
    state = state.copyWith(messages: list);
  }
}

final chatControllerProvider =
    NotifierProvider.family<ChatController, ChatState, String?>(
      ChatController.new,
    );
