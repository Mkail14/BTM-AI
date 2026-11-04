import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';

/// Adaptateur dio de test : réponses préparées, AUCUN réseau réel.
class FakeAdapter implements HttpClientAdapter {
  FakeAdapter(this.responses);

  /// Réponses servies dans l'ordre : (statut, corps JSON, en-têtes).
  final List<({int status, Object? body, Map<String, String> headers})>
  responses;

  /// Requêtes reçues (pour vérifier les en-têtes).
  final List<RequestOptions> requests = [];

  static ({int status, Object? body, Map<String, String> headers}) reply(
    int status,
    Object? body, {
    Map<String, String> headers = const {},
  }) => (status: status, body: body, headers: headers);

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    final r = responses.removeAt(0);
    return ResponseBody.fromString(
      jsonEncode(r.body),
      r.status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
        for (final e in r.headers.entries) e.key: [e.value],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}
