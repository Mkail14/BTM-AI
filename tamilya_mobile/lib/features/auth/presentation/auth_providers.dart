import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/fake_auth_repository.dart';
import '../domain/auth_repository.dart';

/// Surchargé en C3 par l'implémentation Supabase (et dans les tests).
final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => const FakeAuthRepository(),
);
