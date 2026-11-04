import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamilya_mobile/core/errors/app_failure.dart';
import 'package:tamilya_mobile/core/errors/error_messages_fr.dart';
import 'package:tamilya_mobile/core/network/api_error_parser.dart';

void main() {
  test('forme A : code et message du serveur', () {
    final f = ApiErrorParser.fromResponse(400, {
      'error': {'code': 'invalid_request', 'message': '60 caractères maximum.'},
    });
    expect(f, isA<ApiFailure>());
    expect((f as ApiFailure).code, 'invalid_request');
    expect(f.message, '60 caractères maximum.');
    expect(f.statusCode, 400);
  });

  test('forme A sans message : libellé de repli français', () {
    final f = ApiErrorParser.fromResponse(500, {
      'error': {'code': 'internal'},
    });
    expect(f.message, kApiErrorMessagesFr['internal']);
  });

  test('chaque code connu a un libellé de repli', () {
    for (final code in kApiErrorMessagesFr.keys) {
      if (code == 'unauthorized') continue;
      final f = ApiErrorParser.fromResponse(400, {
        'error': {'code': code},
      });
      expect(f.message, kApiErrorMessagesFr[code], reason: code);
    }
  });

  test('code inconnu : message du serveur, sinon libellé interne', () {
    final withMsg = ApiErrorParser.fromResponse(400, {
      'error': {'code': 'nouveau', 'message': 'Texte serveur'},
    });
    expect(withMsg.message, 'Texte serveur');
    final without = ApiErrorParser.fromResponse(400, {
      'error': {'code': 'nouveau'},
    });
    expect(without.message, kApiErrorMessagesFr['internal']);
  });

  test('unauthorized : session expirée', () {
    final f = ApiErrorParser.fromResponse(401, {
      'error': {'code': 'unauthorized', 'message': 'x'},
    });
    expect(f, isA<SessionExpiredFailure>());
  });

  test('forme B 503 : maintenance avec Retry-After', () {
    final headers = Headers()..set('retry-after', '600');
    final f = ApiErrorParser.fromResponse(503, {
      'error': 'Maintenance en cours.',
    }, headers);
    expect(f, isA<MaintenanceFailure>());
    expect(f.message, 'Maintenance en cours.');
    expect((f as MaintenanceFailure).retryAfter, const Duration(minutes: 10));
  });

  test('429 : Retry-After lu', () {
    final headers = Headers()..set('retry-after', '30');
    final f = ApiErrorParser.fromResponse(429, {
      'error': {'code': 'rate_limited', 'message': 'Doucement.'},
    }, headers);
    expect((f as ApiFailure).retryAfter, const Duration(seconds: 30));
  });

  test('sans réponse : échec réseau', () {
    final f = ApiErrorParser.fromDio(
      DioException(
        requestOptions: RequestOptions(path: '/x'),
        type: DioExceptionType.connectionError,
      ),
    );
    expect(f, isA<NetworkFailure>());
  });
}
