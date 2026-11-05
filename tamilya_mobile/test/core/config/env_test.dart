import 'package:flutter_test/flutter_test.dart';
import 'package:tamilya_mobile/core/config/env.dart';

void main() {
  const pub = 'sb_publishable_exemple';
  String? check({
    String api = 'https://api.exemple.fr',
    String sup = 'https://x.supabase.co',
    String key = pub,
    String env = 'dev',
    bool web = false,
  }) => Env.validate(api: api, supabase: sup, key: key, env: env, web: web);

  test('configuration valide en dev et en prod', () {
    expect(check(), isNull);
    expect(check(env: 'prod'), isNull);
  });

  test('dev : http admis vers localhost seulement', () {
    expect(check(api: 'http://localhost:8090'), isNull);
    expect(check(api: 'http://127.0.0.1:8090'), isNull);
    expect(check(api: 'http://exemple.fr'), isNotNull);
  });

  test('prod : refuse web, http et localhost', () {
    expect(check(env: 'prod', web: true), contains('web'));
    expect(check(env: 'prod', api: 'http://localhost:8090'), isNotNull);
    expect(check(env: 'prod', api: 'https://localhost:8090'), isNotNull);
    expect(check(env: 'prod', sup: 'http://x.supabase.co'), isNotNull);
  });

  test('prod : exige une clé sb_publishable_', () {
    expect(check(env: 'prod', key: 'autre'), isNotNull);
  });

  test('clé sb_secret_ refusée partout', () {
    expect(check(key: 'sb_secret_x'), contains('secrète'));
    expect(check(env: 'prod', key: 'sb_secret_x'), contains('secrète'));
  });

  test('recette : jamais en release, seulement avec FORCE_THEME', () {
    expect(Env.recetteAllowed(release: false, theme: 'dark'), isTrue);
    expect(Env.recetteAllowed(release: false, theme: ''), isFalse);
    expect(Env.recetteAllowed(release: true, theme: 'dark'), isFalse);
  });
}
