import 'app_user.dart';

/// Résultat d'une inscription.
enum SignUpOutcome {
  /// Session immédiate (confirmation par e-mail désactivée côté Supabase).
  signedIn,

  /// Un e-mail de confirmation a été envoyé. Même résultat que l'adresse
  /// existe déjà ou non (pas d'énumération des comptes).
  confirmationSent,
}

/// Contrat d'authentification (e-mail + mot de passe). Les erreurs sortent
/// sous forme d'`AuthFailure` ou de `NetworkFailure`.
abstract interface class AuthRepository {
  /// Une session est-elle présente (restaurée ou ouverte) ?
  bool get hasSession;

  /// Émet à chaque changement : vrai = session ouverte, faux = fermée.
  Stream<bool> get sessionChanges;

  Future<AppUser> signIn({required String email, required String password});

  Future<SignUpOutcome> signUp({
    required String email,
    required String password,
    required String displayName,
    required String commune,
    required String addressLine,
  });

  /// Envoie le lien de réinitialisation. Même issue que le compte existe ou non.
  Future<void> requestPasswordReset(String email);

  /// Renvoie l'e-mail de confirmation d'inscription.
  Future<void> resendConfirmation(String email);

  /// Lève [UnimplementedError] tant que `FeatureFlags.googleSignIn` est faux.
  Future<AppUser> signInWithGoogle();

  /// Déconnexion locale (efface le stockage sécurisé).
  Future<void> signOut();
}
