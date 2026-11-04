/// Erreur typée remontée par les repositories (ARCHITECTURE §3 et §7).
/// Aucune exception dio ou Supabase ne sort de `data/`.
sealed class AppFailure implements Exception {
  const AppFailure(this.message);

  /// Message prêt à afficher, en français.
  final String message;

  @override
  String toString() => '$runtimeType($message)';
}

final class UnknownFailure extends AppFailure {
  const UnknownFailure([super.message = 'Une erreur est survenue.']);
}

/// Pas de réponse du serveur (hors ligne, délai dépassé).
final class NetworkFailure extends AppFailure {
  const NetworkFailure([super.message = 'Vérifie ta connexion internet.']);
}

final class SessionExpiredFailure extends AppFailure {
  const SessionExpiredFailure([
    super.message = 'Ta session a expiré. Reconnecte-toi.',
  ]);
}

/// Erreur renvoyée par l'API : `{"error":{"code","message"}}`.
final class ApiFailure extends AppFailure {
  const ApiFailure({
    required this.code,
    required String message,
    this.statusCode,
    this.retryAfter,
  }) : super(message);

  final String code;
  final int? statusCode;

  /// En-tête `Retry-After` (429, 503), s'il est présent.
  final Duration? retryAfter;
}

/// 503 de maintenance : `{"error":"texte"}` (+ `Retry-After`).
final class MaintenanceFailure extends AppFailure {
  const MaintenanceFailure(super.message, {this.retryAfter});

  final Duration? retryAfter;
}

/// Échec d'authentification (connexion, inscription, mot de passe oublié).
final class AuthFailure extends AppFailure {
  const AuthFailure(super.message, {this.code});

  /// Code Supabase (`invalid_credentials`, `email_not_confirmed`, ...).
  final String? code;

  bool get emailNotConfirmed => code == 'email_not_confirmed';
  bool get alreadyRegistered =>
      code == 'user_already_exists' || code == 'email_exists';
}
