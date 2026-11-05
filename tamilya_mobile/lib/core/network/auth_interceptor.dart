import 'dart:async';

import 'package:dio/dio.dart';

import '../errors/app_failure.dart';
import 'session_tokens.dart';

/// Intercepteur d'authentification (ARCHITECTURE §5).
///
/// - Ajoute `Authorization: Bearer <jeton courant>` aux seuls appels vers
///   [baseUrl] (jamais vers un autre domaine).
/// - Sur 401 : UN rafraîchissement (verrou partagé entre requêtes
///   simultanées), UN nouvel essai ; si le 401 persiste ou si le
///   rafraîchissement échoue : déconnexion locale et [SessionExpiredFailure].
/// - Une requête marquée `extra[kNoReplay] = true` (le chat, qui consomme du
///   quota) n'est jamais rejouée : après un rafraîchissement réussi elle
///   échoue en [RetryableAuthFailure] (« Renvoyer ») ; la déconnexion n'a lieu
///   que si le rafraîchissement échoue.
class AuthInterceptor extends Interceptor {
  AuthInterceptor({
    required this.tokens,
    required this.baseUrl,
    required this.dio,
  });

  static const String kNoReplay = 'noReplay';
  static const String _kRetried = 'authRetried';

  final SessionTokens tokens;
  final String baseUrl;
  final Dio dio;

  Completer<bool>? _refreshing;

  bool _isApiCall(RequestOptions o) {
    final base = Uri.parse(baseUrl);
    return o.uri.scheme == base.scheme &&
        o.uri.host == base.host &&
        o.uri.port == base.port;
  }

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    if (_isApiCall(options)) {
      final token = await tokens.currentAccessToken();
      if (token != null) options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  Future<bool> _refreshOnce() {
    final running = _refreshing;
    if (running != null) return running.future;
    final completer = _refreshing = Completer<bool>();
    tokens
        .refresh()
        .then(
          completer.complete,
          onError: (Object _) => completer.complete(false),
        )
        .whenComplete(() => _refreshing = null);
    return completer.future;
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    final options = err.requestOptions;
    final is401 = err.response?.statusCode == 401;
    if (!is401 || !_isApiCall(options)) return handler.next(err);

    final alreadyRetried = options.extra[_kRetried] == true;
    final noReplay = options.extra[kNoReplay] == true;
    if (!alreadyRetried && await _refreshOnce()) {
      if (noReplay) {
        // Jeton renouvelé, mais la requête n'est pas rejouée : « Renvoyer ».
        return handler.reject(
          DioException(
            requestOptions: options,
            response: err.response,
            type: DioExceptionType.badResponse,
            error: const RetryableAuthFailure(),
          ),
        );
      }
      try {
        options.extra[_kRetried] = true;
        final token = await tokens.currentAccessToken();
        if (token != null) options.headers['Authorization'] = 'Bearer $token';
        return handler.resolve(await dio.fetch<dynamic>(options));
      } on DioException catch (second) {
        if (second.response?.statusCode != 401) return handler.next(second);
      }
    }
    // Le 401 persiste (ou rafraîchissement impossible) : session perdue.
    await tokens.expire();
    handler.reject(
      DioException(
        requestOptions: options,
        response: err.response,
        type: DioExceptionType.badResponse,
        error: const SessionExpiredFailure(),
      ),
    );
  }
}
