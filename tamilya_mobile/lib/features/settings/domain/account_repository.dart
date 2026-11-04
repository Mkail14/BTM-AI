import 'profile.dart';

/// Compte utilisateur. GET/PATCH/DELETE /api/me en C3.
abstract interface class AccountRepository {
  Future<Profile> profile();
}
