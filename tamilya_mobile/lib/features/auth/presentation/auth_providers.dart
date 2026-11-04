import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/fake_auth_repository.dart';
import '../domain/auth_repository.dart';

/// Surchargé en C3 par l'implémentation Supabase (et dans les tests).
final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => const FakeAuthRepository(),
);

/// Session de l'utilisateur. Faux état local en C2 ; en C3 l'état vient de
/// Supabase (session restaurée = on saute l'accueil).
class SessionController extends Notifier<bool> {
  @override
  bool build() => false;

  void signIn() => state = true;

  void signOut() => state = false;
}

final sessionProvider = NotifierProvider<SessionController, bool>(
  SessionController.new,
);
