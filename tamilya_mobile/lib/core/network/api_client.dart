import 'package:dio/dio.dart';

import '../errors/app_failure.dart';
import 'api_error_parser.dart';
import 'auth_interceptor.dart';
import 'session_tokens.dart';

/// Client HTTP vers l'API Tamilya (`API_BASE_URL`). Aucun cookie : le seul
/// justificatif est le Bearer (pas de CookieJar, revue sécurité R-6).
Dio createApiDio({
  required String baseUrl,
  required SessionTokens tokens,
  HttpClientAdapter? adapter,
}) {
  final dio = Dio(
    BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 15),
      sendTimeout: const Duration(seconds: 30),
      receiveTimeout: const Duration(seconds: 30),
      followRedirects: false,
      maxRedirects: 0,
      contentType: Headers.jsonContentType,
      responseType: ResponseType.json,
      validateStatus: (s) => s != null && s >= 200 && s < 300,
    ),
  );
  if (adapter != null) dio.httpClientAdapter = adapter;
  dio.interceptors.add(
    AuthInterceptor(tokens: tokens, baseUrl: baseUrl, dio: dio),
  );
  return dio;
}

/// Convertit n'importe quelle exception d'appel en [AppFailure].
AppFailure toFailure(Object error) {
  if (error is AppFailure) return error;
  if (error is DioException) {
    final inner = error.error;
    if (inner is AppFailure) return inner;
    return ApiErrorParser.fromDio(error);
  }
  return const UnknownFailure();
}
