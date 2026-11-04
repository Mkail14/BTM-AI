import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/fake_auth_repository.dart';
import '../domain/auth_repository.dart';

/// Surchargé au démarrage par l'implémentation Supabase (voir `main.dart`) ;
/// sans configuration, l'application tourne en mode maquette (dépôt factice).
final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => FakeAuthRepository(),
);

/// Session de l'utilisateur : vrai = connecté. Suit le dépôt (session
/// restaurée au démarrage, connexion, déconnexion, expiration).
class SessionController extends Notifier<bool> {
  @override
  bool build() {
    final repo = ref.watch(authRepositoryProvider);
    final sub = repo.sessionChanges.listen((signedIn) => state = signedIn);
    ref.onDispose(sub.cancel);
    return repo.hasSession;
  }
}

final sessionProvider = NotifierProvider<SessionController, bool>(
  SessionController.new,
);
