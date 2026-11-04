/// Ce dont le réseau a besoin de la session. Implémenté par le dépôt
/// d'authentification (Supabase) ; remplaçable dans les tests.
abstract interface class SessionTokens {
  /// Jeton d'accès COURANT (relu à chaque requête, jamais mis en cache),
  /// ou null sans session. Rafraîchit d'avance un jeton qui expire sous 30 s.
  Future<String?> currentAccessToken();

  /// Force un rafraîchissement. Vrai si une session valide existe ensuite.
  Future<bool> refresh();

  /// Session perdue (401 persistant) : déconnexion locale propre.
  Future<void> expire();
}
