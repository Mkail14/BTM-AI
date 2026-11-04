import 'app_user.dart';

/// Contrat d'authentification. Remplacé par l'implémentation Supabase en C3.
abstract interface class AuthRepository {
  Future<AppUser> signIn({required String email, required String password});

  /// Lève [UnimplementedError] tant que `FeatureFlags.googleSignIn` est faux.
  Future<AppUser> signInWithGoogle();

  Future<void> signOut();
}
