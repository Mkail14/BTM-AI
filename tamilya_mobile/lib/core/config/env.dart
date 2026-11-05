import 'package:flutter/foundation.dart';

/// Configuration injectée à la compilation par `--dart-define-from-file`.
///
/// Valeurs publiques par conception (ARCHITECTURE §8). Aucun secret ici.
/// La validation au démarrage (https, valeurs présentes) arrive avec C3.
abstract final class Env {
  static const String appEnv = String.fromEnvironment(
    'APP_ENV',
    defaultValue: 'dev',
  );

  /// Outil de recette : `--dart-define=FORCE_THEME=dark|light` (sinon système).
  static const String forceTheme = String.fromEnvironment('FORCE_THEME');
  static const String apiBaseUrl = String.fromEnvironment('API_BASE_URL');
  static const String supabaseUrl = String.fromEnvironment('SUPABASE_URL');
  static const String supabasePublishableKey = String.fromEnvironment(
    'SUPABASE_PUBLISHABLE_KEY',
  );

  /// Les trois valeurs nécessaires à la connexion sont présentes.
  static bool get isConfigured =>
      apiBaseUrl.isNotEmpty &&
      supabaseUrl.isNotEmpty &&
      supabasePublishableKey.isNotEmpty;

  /// Outil de recette (routes `/recette/*`, session factice) : jamais en
  /// release, et seulement si `FORCE_THEME` est défini (revue sécurité F-6).
  static bool get recetteEnabled =>
      recetteAllowed(release: kReleaseMode, theme: forceTheme);

  static bool recetteAllowed({required bool release, required String theme}) =>
      !release && theme.isNotEmpty;

  /// Vérifie la configuration (ARCHITECTURE §8). Renvoie un message d'erreur
  /// de configuration, ou null si tout va bien. HTTP en clair seulement vers
  /// localhost (développement). En `APP_ENV=prod` : pas de build web, https
  /// partout, pas de localhost. Une clé secrète est refusée partout.
  static String? validate({
    String? api,
    String? supabase,
    String? key,
    String? env,
    bool? web,
  }) {
    final a = api ?? apiBaseUrl;
    final s = supabase ?? supabaseUrl;
    final k = key ?? supabasePublishableKey;
    final prod = (env ?? appEnv) == 'prod';
    if (a.isEmpty || s.isEmpty || k.isEmpty) {
      return 'Configuration manquante : API_BASE_URL, SUPABASE_URL et '
          'SUPABASE_PUBLISHABLE_KEY sont requis.';
    }
    if (k.startsWith('sb_secret_')) {
      return "Clé secrète interdite dans l'app.";
    }
    if (prod && (web ?? kIsWeb)) {
      return 'Build web non autorisé en production.';
    }
    bool secure(String url) {
      final u = Uri.tryParse(url);
      if (u == null || u.host.isEmpty) return false;
      if (u.scheme == 'https') return !(prod && _isLocal(u.host));
      return !prod && u.scheme == 'http' && _isLocal(u.host);
    }

    if (!secure(a) || !secure(s)) {
      return prod
          ? 'Configuration refusée : en production, les adresses doivent être '
                'en https et ne pas viser localhost.'
          : 'Configuration refusée : les adresses doivent être en https '
                "(http n'est admis que vers localhost).";
    }
    if (prod && !k.startsWith('sb_publishable_')) {
      return 'Configuration refusée : clé publique (sb_publishable_) requise.';
    }
    return null;
  }

  static bool _isLocal(String host) =>
      host == 'localhost' || host == '127.0.0.1';
}
