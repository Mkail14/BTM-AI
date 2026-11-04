import 'profile.dart';

/// Compte utilisateur : GET et PATCH `/api/me`. La suppression de compte
/// (DELETE) arrive avec C3c.
abstract interface class AccountRepository {
  Future<AccountData> load();

  /// Renvoie le profil mis à jour. Nom vide = retiré (0 à 60 caractères).
  Future<Profile> updateDisplayName(String name);

  Future<Profile> updatePersonality(String personalityId);
}
