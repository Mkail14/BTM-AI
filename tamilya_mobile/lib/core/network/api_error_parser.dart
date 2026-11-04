import 'package:dio/dio.dart';

import '../errors/app_failure.dart';
import '../errors/error_messages_fr.dart';

/// Transforme une réponse ou une exception dio en [AppFailure]
/// (ARCHITECTURE §7). Accepte les deux formes de corps d'erreur :
/// `{"error":{"code","message"}}` et `{"error":"texte"}` (maintenance).
abstract final class ApiErrorParser {
  static AppFailure fromDio(DioException e) {
    final response = e.response;
    if (response == null) {
      return switch (e.type) {
        DioExceptionType.cancel => const UnknownFailure('Requête annulée.'),
        _ => const NetworkFailure(),
      };
    }
    return fromResponse(response.statusCode, response.data, response.headers);
  }

  static AppFailure fromResponse(
    int? status,
    Object? body, [
    Headers? headers,
  ]) {
    final retryAfter = _retryAfter(headers);
    final error = body is Map ? body['error'] : null;

    // Forme B : le proxy de maintenance renvoie une simple chaîne.
    if (error is String) {
      if (status == 503) {
        return MaintenanceFailure(error, retryAfter: retryAfter);
      }
      return ApiFailure(
        code: 'internal',
        message: error,
        statusCode: status,
        retryAfter: retryAfter,
      );
    }

    // Forme A : code + message.
    if (error is Map) {
      final code = (error['code'] as String?) ?? 'internal';
      final message = error['message'];
      final text = (message is String && message.isNotEmpty)
          ? message
          : (kApiErrorMessagesFr[code] ?? kApiErrorMessagesFr['internal']!);
      if (code == 'unauthorized') return const SessionExpiredFailure();
      return ApiFailure(
        code: code,
        message: text,
        statusCode: status,
        retryAfter: retryAfter,
      );
    }

    if (status == 401) return const SessionExpiredFailure();
    if (status == 503) {
      return MaintenanceFailure(
        kApiErrorMessagesFr['service_unavailable']!,
        retryAfter: retryAfter,
      );
    }
    return ApiFailure(
      code: 'internal',
      message: kApiErrorMessagesFr['internal']!,
      statusCode: status,
      retryAfter: retryAfter,
    );
  }

  static Duration? _retryAfter(Headers? headers) {
    final raw = headers?.value('retry-after');
    final seconds = raw == null ? null : int.tryParse(raw.trim());
    return seconds == null ? null : Duration(seconds: seconds);
  }
}
