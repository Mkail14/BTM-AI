import 'package:flutter_test/flutter_test.dart';
import 'package:tamilya_mobile/core/config/env.dart';
import 'package:tamilya_mobile/features/auth/domain/auth_messages.dart';
import 'package:tamilya_mobile/features/auth/domain/signup_rules.dart';

void main() {
  test('17 communes de Mayotte', () {
    expect(kMayotteCommunes, hasLength(17));
    expect(kMayotteCommunes, containsAll(['Mamoudzou', "M'Tsangamouji"]));
  });

  test('commune obligatoire et valide', () {
    expect(
      addressFieldErrors(commune: null, line: 'Rue du port 12').commune,
      'Choisis ta commune.',
    );
    expect(
      addressFieldErrors(commune: 'Paris', line: 'Rue du port 12').commune,
      'Choisis ta commune.',
    );
    expect(
      addressFieldErrors(commune: 'Sada', line: 'Rue du port 12').commune,
      isNull,
    );
  });

  test('adresse : 5 à 200 caractères après nettoyage des espaces', () {
    expect(
      addressFieldErrors(commune: 'Sada', line: ' a   b ').line,
      contains('Indique ton adresse'),
    );
    expect(
      addressFieldErrors(commune: 'Sada', line: 'a' * 201).line,
      contains('200 caractères'),
    );
    expect(
      addressFieldErrors(commune: 'Sada', line: 'près de la mosquée').line,
      isNull,
    );
    expect(normalizeAddressLine('  rue   du  port '), 'rue du port');
  });

  test(
    'mot de passe : 8 caractères, lettre, chiffre, différent de l e-mail',
    () {
      expect(isPasswordValid('court1'), isFalse);
      expect(isPasswordValid('seulementdeslettres'), isFalse);
      expect(isPasswordValid('12345678'), isFalse);
      expect(isPasswordValid('fatima2026', 'fatima@exemple.fr'), isFalse);
      expect(isPasswordValid('mot2passe9', 'fatima@exemple.fr'), isTrue);
    },
  );

  test('nom : espaces réduits, 60 caractères au plus', () {
    expect(normalizeDisplayName('  Ali   Said '), 'Ali Said');
    expect(normalizeDisplayName('a' * 80), hasLength(60));
    expect(normalizeEmail('  Ali@Exemple.FR '), 'ali@exemple.fr');
  });

  test('messages d erreur d authentification (describeAuthError)', () {
    expect(
      describeAuthError('invalid_credentials'),
      'E-mail ou mot de passe incorrect.',
    );
    expect(
      describeAuthError('email_exists'),
      contains('Un compte existe déjà'),
    );
    expect(describeAuthError('over_request_rate_limit'), contains('Patiente'));
    expect(describeAuthError('inconnu'), contains("La demande n'a pas abouti"));
  });

  test('configuration : https obligatoire, http seulement vers localhost', () {
    expect(
      Env.validate(api: '', supabase: 'https://a.b', key: 'k'),
      contains('manquante'),
    );
    expect(
      Env.validate(api: 'http://exemple.fr', supabase: 'https://a.b', key: 'k'),
      contains('https'),
    );
    expect(
      Env.validate(
        api: 'http://localhost:8090',
        supabase: 'https://a.b',
        key: 'k',
      ),
      isNull,
    );
    expect(
      Env.validate(
        api: 'https://api.exemple.fr',
        supabase: 'https://a.b',
        key: 'k',
      ),
      isNull,
    );
  });
}
