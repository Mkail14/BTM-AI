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
}
