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

  /// Vérifie la configuration (ARCHITECTURE §8). Renvoie un message d'erreur
  /// de configuration, ou null si tout va bien. HTTP en clair seulement vers
  /// localhost (développement).
  static String? validate({String? api, String? supabase, String? key}) {
    final a = api ?? apiBaseUrl;
    final s = supabase ?? supabaseUrl;
    final k = key ?? supabasePublishableKey;
    if (a.isEmpty || s.isEmpty || k.isEmpty) {
      return 'Configuration manquante : API_BASE_URL, SUPABASE_URL et '
          'SUPABASE_PUBLISHABLE_KEY sont requis.';
    }
    bool secure(String url) {
      final u = Uri.tryParse(url);
      if (u == null || u.host.isEmpty) return false;
      return u.scheme == 'https' ||
          (u.scheme == 'http' &&
              (u.host == 'localhost' || u.host == '127.0.0.1'));
    }

    if (!secure(a) || !secure(s)) {
      return 'Configuration refusée : les adresses doivent être en https '
          "(http n'est admis que vers localhost).";
    }
    return null;
  }
}
