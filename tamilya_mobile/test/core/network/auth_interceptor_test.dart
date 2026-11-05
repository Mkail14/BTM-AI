import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamilya_mobile/core/errors/app_failure.dart';
import 'package:tamilya_mobile/core/network/api_client.dart';
import 'package:tamilya_mobile/core/network/auth_interceptor.dart';
import 'package:tamilya_mobile/core/network/session_tokens.dart';

import 'fake_adapter.dart';

class _Tokens implements SessionTokens {
  _Tokens({this.token = 'jeton-1', this.refreshWorks = true});

  String? token;
  bool refreshWorks;
  int refreshCalls = 0;
  int expireCalls = 0;

  @override
  Future<String?> currentAccessToken() async => token;

  @override
  Future<bool> refresh() async {
    refreshCalls++;
    await Future<void>.delayed(const Duration(milliseconds: 5));
    if (refreshWorks) token = 'jeton-2';
    return refreshWorks;
  }

  @override
  Future<void> expire() async {
    expireCalls++;
    token = null;
  }
}

Dio _dio(_Tokens tokens, FakeAdapter adapter) => createApiDio(
  baseUrl: 'http://localhost:8090',
  tokens: tokens,
  adapter: adapter,
);

void main() {
  test('ajoute le Bearer courant aux appels vers l API', () async {
    final adapter = FakeAdapter([
      FakeAdapter.reply(200, {'ok': true}),
    ]);
    final dio = _dio(_Tokens(), adapter);
    await dio.get<Object?>('/api/me');
    expect(adapter.requests.single.headers['Authorization'], 'Bearer jeton-1');
  });

  test('sans session : aucun en-tête Authorization', () async {
    final adapter = FakeAdapter([FakeAdapter.reply(200, {})]);
    final dio = _dio(_Tokens(token: null), adapter);
    await dio.get<Object?>('/api/me');
    expect(
      adapter.requests.single.headers.containsKey('Authorization'),
      isFalse,
    );
  });

  test('jamais de Bearer vers un autre domaine', () async {
    final adapter = FakeAdapter([FakeAdapter.reply(200, {})]);
    final dio = _dio(_Tokens(), adapter);
    await dio.get<Object?>('https://autre.exemple.invalid/x');
    expect(
      adapter.requests.single.headers.containsKey('Authorization'),
      isFalse,
    );
  });

  test(
    '401 : un rafraîchissement puis un nouvel essai avec le nouveau jeton',
    () async {
      final tokens = _Tokens();
      final adapter = FakeAdapter([
        FakeAdapter.reply(401, {
          'error': {'code': 'unauthorized', 'message': 'x'},
        }),
        FakeAdapter.reply(200, {'ok': true}),
      ]);
      final res = await _dio(tokens, adapter).get<Object?>('/api/me');
      expect(res.statusCode, 200);
      expect(tokens.refreshCalls, 1);
      expect(tokens.expireCalls, 0);
      expect(adapter.requests.last.headers['Authorization'], 'Bearer jeton-2');
    },
  );

  test('401 persistant : déconnexion locale et session expirée', () async {
    final tokens = _Tokens();
    final body = {
      'error': {'code': 'unauthorized', 'message': 'x'},
    };
    final adapter = FakeAdapter([
      FakeAdapter.reply(401, body),
      FakeAdapter.reply(401, body),
    ]);
    final dio = _dio(tokens, adapter);
    await expectLater(
      dio.get<Object?>('/api/me'),
      throwsA(
        isA<DioException>().having(
          (e) => toFailure(e),
          'échec',
          isA<SessionExpiredFailure>(),
        ),
      ),
    );
    expect(tokens.refreshCalls, 1);
    expect(tokens.expireCalls, greaterThanOrEqualTo(1));
    expect(adapter.requests, hasLength(2));
  });

  test(
    'rafraîchissement impossible : déconnexion, pas de second essai',
    () async {
      final tokens = _Tokens(refreshWorks: false);
      final adapter = FakeAdapter([
        FakeAdapter.reply(401, {'error': 'x'}),
      ]);
      await expectLater(
        _dio(tokens, adapter).get<Object?>('/api/me'),
        throwsA(isA<DioException>()),
      );
      expect(tokens.expireCalls, 1);
      expect(adapter.requests, hasLength(1));
    },
  );

  test('noReplay + 401 : rafraîchit, ne rejoue pas, "Renvoyer"', () async {
    final tokens = _Tokens();
    final adapter = FakeAdapter([FakeAdapter.reply(401, {})]);
    await expectLater(
      _dio(tokens, adapter).post<Object?>(
        '/api/chat',
        options: Options(extra: {AuthInterceptor.kNoReplay: true}),
      ),
      throwsA(
        isA<DioException>().having(
          (e) => e.error,
          'error',
          isA<RetryableAuthFailure>(),
        ),
      ),
    );
    expect(tokens.refreshCalls, 1);
    expect(tokens.expireCalls, 0);
    expect(adapter.requests, hasLength(1));
  });

  test('noReplay + 401 + rafraîchissement impossible : déconnexion', () async {
    final tokens = _Tokens(refreshWorks: false);
    final adapter = FakeAdapter([FakeAdapter.reply(401, {})]);
    await expectLater(
      _dio(tokens, adapter).post<Object?>(
        '/api/chat',
        options: Options(extra: {AuthInterceptor.kNoReplay: true}),
      ),
      throwsA(
        isA<DioException>().having(
          (e) => e.error,
          'error',
          isA<SessionExpiredFailure>(),
        ),
      ),
    );
    expect(tokens.expireCalls, 1);
    expect(adapter.requests, hasLength(1));
  });

  test(
    'pas de Bearer si le schéma diffère; redirections désactivées',
    () async {
      final adapter = FakeAdapter([FakeAdapter.reply(200, {})]);
      final dio = _dio(_Tokens(), adapter);
      await dio.get<Object?>('https://localhost:8090/api/x');
      expect(adapter.requests.single.headers['Authorization'], isNull);
      expect(dio.options.followRedirects, isFalse);
      expect(dio.options.maxRedirects, 0);
    },
  );

  test('deux 401 simultanés : un seul rafraîchissement', () async {
    final tokens = _Tokens();
    final adapter = FakeAdapter([
      FakeAdapter.reply(401, {}),
      FakeAdapter.reply(401, {}),
      FakeAdapter.reply(200, {'a': 1}),
      FakeAdapter.reply(200, {'b': 2}),
    ]);
    final dio = _dio(tokens, adapter);
    final results = await Future.wait([
      dio.get<Object?>('/api/a'),
      dio.get<Object?>('/api/b'),
    ]);
    expect(results.map((r) => r.statusCode), [200, 200]);
    expect(tokens.refreshCalls, 1);
  });
}
