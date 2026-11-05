import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_error_parser.dart';
import '../../../core/network/auth_interceptor.dart';
import '../../../core/supabase/supabase_failure.dart';
import '../../../shared/models/chat_message.dart';
import '../domain/chat_repository.dart';
import '../domain/chat_stream_event.dart';
import 'ndjson_decoder.dart';

/// Lecture des lignes de la table `messages` d'une conversation (Supabase,
/// sous RLS), du plus ancien au plus récent. Injectée : aucune dépendance
/// réseau dans la logique testable.
typedef MessagesReader = Future<List<Map<String, dynamic>>> Function(
  String conversationId,
);

/// `POST /api/chat` (flux NDJSON) pour l'envoi, lecture Supabase pour
/// l'historique (ARCHITECTURE §1 : lire en direct, écrire par le serveur).
class ApiChatRepository implements ChatRepository {
  ApiChatRepository({required this.dio, required this.readMessages});

  final Dio dio;
  final MessagesReader readMessages;

  @override
  Future<List<ChatMessage>> history(String conversationId) async {
    try {
      final rows = await readMessages(conversationId);
      return rows.map(chatMessageFromRow).toList();
    } on Object catch (e) {
      throw supabaseToFailure(e);
    }
  }

  @override
  Stream<ChatStreamEvent> sendMessage({
    String? conversationId,
    required String text,
  }) {
    final cancel = CancelToken();
    late final StreamController<ChatStreamEvent> out;
    out = StreamController<ChatStreamEvent>(
      onListen: () async {
        try {
          final response = await dio.post<ResponseBody>(
            '/api/chat',
            data: {'message': text, 'conversationId': ?conversationId},
            cancelToken: cancel,
            options: Options(
              responseType: ResponseType.stream,
              headers: {Headers.acceptHeader: 'application/x-ndjson'},
              // Le chat consomme du quota et crée un message : jamais rejoué.
              extra: {AuthInterceptor.kNoReplay: true},
              // Délai maximal entre deux morceaux (maxDuration serveur : 120 s).
              receiveTimeout: const Duration(seconds: 120),
            ),
          );
          await for (final event in decodeNdjson(response.data!.stream)) {
            if (out.isClosed) return;
            out.add(event);
          }
        } on Object catch (e) {
          if (e is DioException && CancelToken.isCancel(e)) return;
          if (!out.isClosed) out.addError(await _failure(e));
        } finally {
          if (!out.isClosed) unawaited(out.close());
        }
      },
      onCancel: () {
        if (!cancel.isCancelled) cancel.cancel('arrêt demandé');
      },
    );
    return out.stream;
  }

  /// Avec `ResponseType.stream`, le corps d'erreur arrive en flux : on le lit
  /// pour retrouver `{"error":{"code","message"}}`.
  Future<AppFailure> _failure(Object e) async {
    if (e is DioException) {
      final inner = e.error;
      if (inner is AppFailure) return inner;
      final response = e.response;
      final data = response?.data;
      if (response != null && data is ResponseBody) {
        Object? body;
        try {
          final raw = await utf8.decoder.bind(data.stream).join();
          body = jsonDecode(raw);
        } on Object {
          body = null;
        }
        return ApiErrorParser.fromResponse(
          response.statusCode,
          body,
          response.headers,
        );
      }
    }
    return toFailure(e);
  }
}

/// Ligne Supabase `messages` -> message affiché.
ChatMessage chatMessageFromRow(Map<String, dynamic> row) => ChatMessage(
  id: row['id'] as String,
  role: row['role'] == 'user' ? MessageRole.user : MessageRole.assistant,
  text: (row['content'] as String?) ?? '',
  status: switch (row['status']) {
    'interrupted' => MessageStatus.interrupted,
    'error' => MessageStatus.error,
    _ => MessageStatus.complete,
  },
);
