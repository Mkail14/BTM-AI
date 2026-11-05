import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamilya_mobile/core/errors/app_failure.dart';
import 'package:tamilya_mobile/features/chat/domain/chat_repository.dart';
import 'package:tamilya_mobile/features/chat/domain/chat_stream_event.dart';
import 'package:tamilya_mobile/features/chat/presentation/chat_controller.dart';
import 'package:tamilya_mobile/shared/models/chat_message.dart';

class _Repo implements ChatRepository {
  _Repo(this.script);

  /// Chaque envoi consomme un flux préparé.
  final List<Stream<ChatStreamEvent> Function(String? id)> script;
  final List<String?> ids = [];
  List<ChatMessage> stored = const [];
  Object? historyError;

  @override
  Future<List<ChatMessage>> history(String conversationId) async {
    if (historyError != null) throw historyError!;
    return stored;
  }

  @override
  Stream<ChatStreamEvent> sendMessage({
    String? conversationId,
    required String text,
  }) {
    ids.add(conversationId);
    return script.removeAt(0)(conversationId);
  }
}

ProviderContainer _container(_Repo repo) {
  final c = ProviderContainer(
    overrides: [chatRepositoryProvider.overrideWithValue(repo)],
  );
  addTearDown(c.dispose);
  return c;
}

Stream<ChatStreamEvent> _ok(List<ChatStreamEvent> events) =>
    Stream.fromIterable(events);

void main() {
  test('texte au fil des deltas, conversation mémorisée', () async {
    final repo = _Repo([
      (_) => _ok(const [
        MetaEvent('c-1'),
        DeltaEvent('Sa'),
        DeltaEvent('lama'),
        DoneEvent(FinishReason.stop),
      ]),
      (_) => _ok(const [DeltaEvent('ok'), DoneEvent(FinishReason.stop)]),
    ]);
    final c = _container(repo);
    final provider = chatControllerProvider(null);
    c.listen(provider, (_, _) {});
    final controller = c.read(provider.notifier);

    await controller.send('Bonjour');
    var s = c.read(provider);
    expect(s.conversationId, 'c-1');
    expect(s.isTyping, isFalse);
    expect(s.messages.last.text, 'Salama');
    expect(s.messages.last.status, MessageStatus.complete);

    await controller.send('Encore');
    expect(repo.ids, [null, 'c-1']); // la 2e requête reprend la conversation
    s = c.read(provider);
    expect(s.messages, hasLength(4));
  });

  test('replace remplace le texte; length marque interrompu', () async {
    final repo = _Repo([
      (_) => _ok(const [
        DeltaEvent('brouillon'),
        ReplaceEvent('final'),
        DoneEvent(FinishReason.length),
      ]),
    ]);
    final c = _container(repo);
    final provider = chatControllerProvider(null);
    c.listen(provider, (_, _) {});
    await c.read(provider.notifier).send('x');
    final m = c.read(provider).messages.last;
    expect(m.text, 'final');
    expect(m.status, MessageStatus.interrupted);
  });

  test('stop : annule le flux, garde le texte reçu', () async {
    final source = StreamController<ChatStreamEvent>();
    var cancelled = false;
    source.onCancel = () => cancelled = true;
    final repo = _Repo([(_) => source.stream]);
    final c = _container(repo);
    final provider = chatControllerProvider(null);
    c.listen(provider, (_, _) {});
    final controller = c.read(provider.notifier);

    final sending = controller.send('x');
    source.add(const DeltaEvent('début'));
    await Future<void>.delayed(Duration.zero);
    expect(c.read(provider).isTyping, isTrue);

    controller.stop();
    await sending;
    expect(cancelled, isTrue);
    final s = c.read(provider);
    expect(s.isTyping, isFalse);
    expect(s.messages.last.text, 'début');
    expect(s.messages.last.status, MessageStatus.interrupted);
  });

  Future<ChatMessage> failWith(Object error) async {
    final repo = _Repo([(_) => Stream.error(error)]);
    final c = _container(repo);
    final provider = chatControllerProvider(null);
    c.listen(provider, (_, _) {});
    await c.read(provider.notifier).send('x');
    expect(c.read(provider).isTyping, isFalse);
    return c.read(provider).messages.last;
  }

  test('réseau : message en français et Réessayer', () async {
    final m = await failWith(const NetworkFailure());
    expect(m.status, MessageStatus.error);
    expect(m.errorText, 'Vérifie ta connexion internet.');
    expect(m.retry, RetryKind.retry);
  });

  test('quota : message du serveur, pas de bouton', () async {
    final m = await failWith(
      const ApiFailure(code: 'rate_limited', message: 'Limite atteinte.'),
    );
    expect(m.errorText, 'Limite atteinte.');
    expect(m.retry, RetryKind.none);
  });

  test('session renouvelée : Renvoyer; expirée : aucun bouton', () async {
    expect(
      (await failWith(const RetryableAuthFailure())).retry,
      RetryKind.resend,
    );
    final expired = await failWith(const SessionExpiredFailure());
    expect(expired.retry, RetryKind.none);
    expect(expired.errorText, contains('session'));
  });

  test('erreur dans le flux après du texte : interrompu + message', () async {
    final repo = _Repo([
      (_) => _ok(const [
        DeltaEvent('Sal'),
        ErrorEvent(code: 'timeout', message: 'Trop long.'),
      ]),
    ]);
    final c = _container(repo);
    final provider = chatControllerProvider(null);
    c.listen(provider, (_, _) {});
    await c.read(provider.notifier).send('x');
    final m = c.read(provider).messages.last;
    expect(m.text, 'Sal');
    expect(m.status, MessageStatus.interrupted);
    expect(m.errorText, 'Trop long.');
    expect(m.retry, RetryKind.retry);
  });

  test('conversation trop longue : composer bloqué', () async {
    final repo = _Repo([
      (_) => _ok(const [
        ErrorEvent(code: 'conversation_too_long', message: 'Trop longue.'),
      ]),
    ]);
    final c = _container(repo);
    final provider = chatControllerProvider(null);
    c.listen(provider, (_, _) {});
    await c.read(provider.notifier).send('x');
    expect(c.read(provider).blocked, isTrue);
    expect(c.read(provider).messages.last.retry, RetryKind.none);
  });

  test('flux coupé sans done : interrompu, réessayer', () async {
    final repo = _Repo([
      (_) => _ok(const [DeltaEvent('a')]),
    ]);
    final c = _container(repo);
    final provider = chatControllerProvider(null);
    c.listen(provider, (_, _) {});
    await c.read(provider.notifier).send('x');
    final m = c.read(provider).messages.last;
    expect(m.status, MessageStatus.interrupted);
    expect(m.retry, RetryKind.retry);
  });

  test('conversation existante : historique; échec = message', () async {
    final repo = _Repo([])
      ..stored = const [
        ChatMessage(id: '1', role: MessageRole.user, text: 'Salut'),
      ];
    final c = _container(repo);
    final provider = chatControllerProvider('c-7');
    c.listen(provider, (_, _) {});
    await Future<void>.delayed(Duration.zero);
    expect(c.read(provider).messages.single.text, 'Salut');
    expect(c.read(provider).loading, isFalse);

    final bad = _Repo([])..historyError = const NetworkFailure();
    final c2 = _container(bad);
    final p2 = chatControllerProvider('c-8');
    c2.listen(p2, (_, _) {});
    await Future<void>.delayed(Duration.zero);
    expect(c2.read(p2).loadError, 'Vérifie ta connexion internet.');
    bad.historyError = null;
    await c2.read(p2.notifier).reload();
    expect(c2.read(p2).loadError, isNull);
  });
}
