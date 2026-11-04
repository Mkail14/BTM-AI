import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tamilya_mobile/core/errors/app_failure.dart';
import 'package:tamilya_mobile/core/network/api_client.dart';
import 'package:tamilya_mobile/core/network/session_tokens.dart';
import 'package:tamilya_mobile/features/settings/data/api_account_repository.dart';

import '../../core/network/fake_adapter.dart';

class _Tokens implements SessionTokens {
  @override
  Future<String?> currentAccessToken() async => 'jeton';
  @override
  Future<bool> refresh() async => false;
  @override
  Future<void> expire() async {}
}

Dio _dio(FakeAdapter a) => createApiDio(
  baseUrl: 'http://localhost:8090',
  tokens: _Tokens(),
  adapter: a,
);

const _me = {
  'profile': {'email': 'a@b.fr', 'displayName': 'Ali', 'personality': null},
  'personalities': [
    {
      'id': 'cool',
      'label': "À l'aise",
      'emoji': '😎',
      'description': 'd',
      'sample': 's',
    },
  ],
  'defaultPersonality': 'professionnelle',
};

void main() {
  test('GET /api/me : profil et fiches de personnalités', () async {
    final adapter = FakeAdapter([FakeAdapter.reply(200, _me)]);
    final data = await ApiAccountRepository(_dio(adapter)).load();
    expect(data.profile.displayName, 'Ali');
    expect(data.profile.personality, isNull);
    expect(data.personalities.single.id, 'cool');
    expect(data.defaultPersonality, 'professionnelle');
    expect(adapter.requests.single.path, '/api/me');
  });

  test('PATCH du nom et de la personnalité', () async {
    final adapter = FakeAdapter([
      FakeAdapter.reply(200, {
        'profile': {
          'email': 'a@b.fr',
          'displayName': 'Zoé',
          'personality': null,
        },
      }),
      FakeAdapter.reply(200, {
        'profile': {
          'email': 'a@b.fr',
          'displayName': 'Zoé',
          'personality': 'cool',
        },
      }),
    ]);
    final repo = ApiAccountRepository(_dio(adapter));
    expect((await repo.updateDisplayName(' Zoé ')).displayName, 'Zoé');
    expect(adapter.requests.first.method, 'PATCH');
    expect(adapter.requests.first.data, {'displayName': 'Zoé'});
    expect((await repo.updatePersonality('cool')).personality, 'cool');
    expect(adapter.requests.last.data, {'personality': 'cool'});
  });

  test('erreur serveur : AppFailure typé, jamais une exception dio', () async {
    final adapter = FakeAdapter([
      FakeAdapter.reply(400, {
        'error': {
          'code': 'invalid_request',
          'message': '60 caractères maximum.',
        },
      }),
    ]);
    await expectLater(
      ApiAccountRepository(_dio(adapter)).updateDisplayName('x'),
      throwsA(
        isA<ApiFailure>().having(
          (f) => f.message,
          'message',
          '60 caractères maximum.',
        ),
      ),
    );
  });
}
