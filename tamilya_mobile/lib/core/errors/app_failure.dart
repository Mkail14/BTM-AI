/// Erreur typée remontée par les repositories (ARCHITECTURE §3).
///
/// Les cas réseau, API et maintenance seront ajoutés avec C3.
sealed class AppFailure implements Exception {
  const AppFailure(this.message);

  /// Message prêt à afficher, en français.
  final String message;
}

final class UnknownFailure extends AppFailure {
  const UnknownFailure([super.message = 'Une erreur est survenue.']);
}

final class SessionExpiredFailure extends AppFailure {
  const SessionExpiredFailure([
    super.message = 'Ta session a expiré. Reconnecte-toi.',
  ]);
}
