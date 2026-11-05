import 'package:supabase_flutter/supabase_flutter.dart';

import '../errors/app_failure.dart';
import '../network/api_client.dart';

/// Convertit une erreur de lecture Supabase en [AppFailure]
/// (ARCHITECTURE §7) : jeton expiré -> session expirée, le reste -> réseau.
/// Les messages techniques ne sont jamais affichés.
AppFailure supabaseToFailure(Object error) {
  if (error is AppFailure) return error;
  if (error is PostgrestException) {
    final jwt = (error.message).toLowerCase().contains('jwt');
    if (error.code == 'PGRST301' || error.code == '401' || jwt) {
      return const SessionExpiredFailure();
    }
    return const NetworkFailure();
  }
  if (error is AuthException) {
    return error.statusCode == '401'
        ? const SessionExpiredFailure()
        : const NetworkFailure();
  }
  final converted = toFailure(error);
  return converted is UnknownFailure ? const NetworkFailure() : converted;
}
