import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/fake_account_repository.dart';
import '../domain/account_repository.dart';
import '../domain/profile.dart';

/// Surchargé au démarrage par `ApiAccountRepository` quand l'application est
/// configurée ; factice sinon (mode maquette, tests).
final accountRepositoryProvider = Provider<AccountRepository>(
  (ref) => FakeAccountRepository(),
);

/// `GET /api/me`. L'écran n'est atteignable qu'avec une session (garde du
/// routeur, qui invalide ce provider à la déconnexion).
class AccountController extends AsyncNotifier<AccountData> {
  @override
  Future<AccountData> build() async {
    return ref.watch(accountRepositoryProvider).load();
  }

  Future<String?> saveName(String name) async {
    final current = state.value;
    if (current == null) return null;
    final updated = await ref
        .read(accountRepositoryProvider)
        .updateDisplayName(name);
    state = AsyncData(current.withProfile(updated));
    return updated.displayName;
  }

  Future<void> savePersonality(String id) async {
    final current = state.value;
    if (current == null) return;
    final updated = await ref
        .read(accountRepositoryProvider)
        .updatePersonality(id);
    state = AsyncData(current.withProfile(updated));
  }
}

final accountProvider = AsyncNotifierProvider<AccountController, AccountData>(
  AccountController.new,
);

/// Profil seul (compatibilité avec l'écran Paramètres).
final profileProvider = Provider<AsyncValue<Profile>>(
  (ref) => ref.watch(accountProvider).whenData((d) => d.profile),
);
