import 'dart:async';

import '../domain/app_user.dart';
import '../domain/auth_repository.dart';

/// Implémentation factice (mode maquette sans configuration, et tests) :
/// accepte tout, aucun appel réseau. Garde un état de session local.
class FakeAuthRepository implements AuthRepository {
  FakeAuthRepository({bool signedIn = false})
    : _signedIn = signedIn; // ignore: prefer_initializing_formals

  static const AppUser _user = AppUser(id: 'fake-user', displayName: 'Toi');

  bool _signedIn;
  final StreamController<bool> _changes = StreamController<bool>.broadcast();

  @override
  bool get hasSession => _signedIn;

  @override
  Stream<bool> get sessionChanges => _changes.stream;

  void _set(bool value) {
    _signedIn = value;
    _changes.add(value);
  }

  @override
  Future<AppUser> signIn({
    required String email,
    required String password,
  }) async {
    _set(true);
    return _user;
  }

  @override
  Future<SignUpOutcome> signUp({
    required String email,
    required String password,
    required String displayName,
    required String commune,
    required String addressLine,
  }) async {
    _set(true);
    return SignUpOutcome.signedIn;
  }

  @override
  Future<void> requestPasswordReset(String email) async {}

  @override
  Future<void> resendConfirmation(String email) async {}

  @override
  Future<AppUser> signInWithGoogle() =>
      throw UnimplementedError('Connexion Google désactivée (flag).');

  @override
  Future<void> signOut() async => _set(false);
}
