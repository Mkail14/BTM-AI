import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamilya_mobile/core/errors/app_failure.dart';
import 'package:tamilya_mobile/core/network/api_client.dart';
import 'package:tamilya_mobile/core/network/auth_interceptor.dart';
import 'package:tamilya_mobile/core/network/session_tokens.dart';
import 'package:tamilya_mobile/features/chat/data/api_chat_repository.dart';
import 'package:tamilya_mobile/features/chat/domain/chat_stream_event.dart';
import 'package:tamilya_mobile/shared/models/chat_message.dart';

class _Tokens implements SessionTokens {
  _Tokens({this.refreshWorks = true});
  final bool refreshWorks;
  int refreshes = 0;
  int expires = 0;

  @override
  Future<String?> currentAccessToken() async => 'jeton';

  @override
  Future<bool> refresh() async {
    refreshes++;
    return refreshWorks;
  }

  @override
  Future<void> expire() async => expires++;
}

/// Faux serveur : AUCUN réseau. Sert un flux d'octets préparé.
class _StreamAdapter implements HttpClientAdapter {
  _StreamAdapter(this.respond);

  final ResponseBody Function(RequestOptions) respond;
  final List<RequestOptions> requests = [];
  bool cancelled = false;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    cancelFuture?.then((_) => cancelled = true);
    return respond(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _ndjson(List<String> lines) => ResponseBody.fromBytes(
  utf8.encode(lines.map((l) => '$l\n').join()),
  200,
  headers: {
    Headers.contentTypeHeader: ['application/x-ndjson'],
  },
);

ResponseBody _json(int status, Object body) => ResponseBody.fromString(
  jsonEncode(body),
  status,
  headers: {
    Headers.contentTypeHeader: [Headers.jsonContentType],
  },
);

ApiChatRepository _repo(_StreamAdapter a, [_Tokens? t]) => ApiChatRepository(
  dio: createApiDio(
    baseUrl: 'http://localhost:8090',
    tokens: t ?? _Tokens(),
    adapter: a,
  ),
  readMessages: (_) async => [
    {'id': 'm1', 'role': 'user', 'content': 'Salut', 'status': 'complete'},
    {
      'id': 'm2',
      'role': 'assistant',
      'content': 'Hello',
      'status': 'interrupted',
    },
  ],
);

void main() {
  test('POST /api/chat : flux NDJSON, noReplay, Bearer, corps', () async {
    final adapter = _StreamAdapter(
      (_) => _ndjson([
        '{"type":"meta","conversationId":"c-9"}',
        '{"type":"delta","text":"Sa"}',
        '{"type":"delta","text":"lama"}',
        '{"type":"done","finishReason":"stop"}',
      ]),
    );
    final events = await _repo(adapter)
        .sendMessage(text: 'Bonjour', conversationId: 'c-1')
        .toList();

    expect(events.map((e) => e.runtimeType), [
      MetaEvent,
      DeltaEvent,
      DeltaEvent,
      DoneEvent,
    ]);
    final req = adapter.requests.single;
    expect(req.path, '/api/chat');
    expect(req.method, 'POST');
    // Un POST de chat consomme du quota : jamais rejoué (revue sécurité C3a).
    expect(req.extra[AuthInterceptor.kNoReplay], isTrue);
    expect(req.headers['Authorization'], 'Bearer jeton');
    expect(req.data, {'message': 'Bonjour', 'conversationId': 'c-1'});
  });

  test('nouvelle conversation : pas de conversationId dans le corps', () async {
    final adapter = _StreamAdapter(
      (_) => _ndjson(['{"type":"done","finishReason":"stop"}']),
    );
    await _repo(adapter).sendMessage(text: 'Salut').toList();
    expect(adapter.requests.single.data, {'message': 'Salut'});
  });

  test('429 rate_limited : erreur typée avec le message du serveur', () async {
    final adapter = _StreamAdapter(
      (_) => _json(429, {
        'error': {'code': 'rate_limited', 'message': 'Trop de messages.'},
      }),
    );
    await expectLater(
      _repo(adapter).sendMessage(text: 'x'),
      emitsError(
        isA<ApiFailure>()
            .having((f) => f.code, 'code', 'rate_limited')
            .having((f) => f.message, 'message', 'Trop de messages.'),
      ),
    );
    expect(adapter.requests, hasLength(1));
  });

  test('401 : un rafraîchissement, aucun rejeu, Renvoyer', () async {
    final tokens = _Tokens();
    final adapter = _StreamAdapter((_) => _json(401, {}));
    await expectLater(
      _repo(adapter, tokens).sendMessage(text: 'x'),
      emitsError(isA<RetryableAuthFailure>()),
    );
    expect(tokens.refreshes, 1);
    expect(tokens.expires, 0);
    expect(adapter.requests, hasLength(1));
  });

  test('401 puis rafraîchissement impossible : session expirée', () async {
    final tokens = _Tokens(refreshWorks: false);
    final adapter = _StreamAdapter((_) => _json(401, {}));
    await expectLater(
      _repo(adapter, tokens).sendMessage(text: 'x'),
      emitsError(isA<SessionExpiredFailure>()),
    );
    expect(tokens.expires, 1);
  });

  test('serveur injoignable : NetworkFailure', () async {
    final adapter = _StreamAdapter(
      (o) => throw DioException.connectionError(
        requestOptions: o,
        reason: 'hors ligne',
      ),
    );
    await expectLater(
      _repo(adapter).sendMessage(text: 'x'),
      emitsError(isA<NetworkFailure>()),
    );
  });

  test('annuler l abonnement annule la requête dio', () async {
    final hang = StreamController<Uint8List>();
    final adapter = _StreamAdapter(
      (_) => ResponseBody(
        hang.stream,
        200,
        headers: {
          Headers.contentTypeHeader: ['application/x-ndjson'],
        },
      ),
    );
    final received = <ChatStreamEvent>[];
    final sub = _repo(adapter).sendMessage(text: 'x').listen(received.add);
    hang.add(Uint8List.fromList(utf8.encode('{"type":"delta","text":"a"}\n')));
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(received, hasLength(1));
    await sub.cancel();
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(adapter.cancelled, isTrue);
    await hang.close();
  });

  test('historique : lignes Supabase vers messages affichés', () async {
    final adapter = _StreamAdapter((_) => _json(200, {}));
    final h = await _repo(adapter).history('c-1');
    expect(h.map((m) => m.role), [MessageRole.user, MessageRole.assistant]);
    expect(h.last.status, MessageStatus.interrupted);
    expect(h.first.text, 'Salut');
  });

  test('historique : échec de lecture converti, rien de technique', () async {
    final repo = ApiChatRepository(
      dio: Dio(),
      readMessages: (_) async => throw StateError('détail interne'),
    );
    await expectLater(repo.history('c'), throwsA(isA<AppFailure>()));
  });
}
