import '../domain/app_user.dart';
import '../domain/auth_repository.dart';

/// Implémentation factice : accepte tout. Aucun appel réseau.
class FakeAuthRepository implements AuthRepository {
  const FakeAuthRepository();

  static const AppUser _user = AppUser(id: 'fake-user', displayName: 'Toi');

  @override
  Future<AppUser> signIn({
    required String email,
    required String password,
  }) async => _user;

  @override
  Future<AppUser> signInWithGoogle() =>
      throw UnimplementedError('Connexion Google désactivée (flag).');

  @override
  Future<void> signOut() async {}
}
