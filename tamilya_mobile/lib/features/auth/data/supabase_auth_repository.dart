import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/network/session_tokens.dart';
import '../domain/app_user.dart';
import '../domain/auth_messages.dart';
import '../domain/auth_repository.dart';
import '../domain/signup_rules.dart';

/// Authentification réelle par Supabase (e-mail + mot de passe).
/// Seul fichier de la fonctionnalité qui connaît `supabase_flutter`.
class SupabaseAuthRepository implements AuthRepository, SessionTokens {
  SupabaseAuthRepository(this._client);

  final SupabaseClient _client;
  Future<bool>? _refreshing;

  GoTrueClient get _auth => _client.auth;

  @override
  bool get hasSession => _auth.currentSession != null;

  @override
  Stream<bool> get sessionChanges =>
      _auth.onAuthStateChange.map((s) => s.session != null).distinct();

  AppUser _user(User user) => AppUser(
    id: user.id,
    displayName: (user.userMetadata?['display_name'] as String?) ?? '',
  );

  /// Convertit une exception Supabase en [AppFailure] sans fuite de détails.
  AppFailure _failure(Object error) {
    if (error is AuthException) {
      // Erreur sans code ni statut : le serveur n'a pas répondu.
      if (error.code == null && error.statusCode == null) {
        return const NetworkFailure(kAuthNetworkMessage);
      }
      return AuthFailure(describeAuthError(error.code), code: error.code);
    }
    return const NetworkFailure(kAuthNetworkMessage);
  }

  @override
  Future<AppUser> signIn({
    required String email,
    required String password,
  }) async {
    try {
      final res = await _auth.signInWithPassword(
        email: normalizeEmail(email),
        password: password,
      );
      final user = res.user;
      if (user == null) throw const AuthFailure('');
      return _user(user);
    } catch (e) {
      if (e is AppFailure) rethrow;
      throw _failure(e);
    }
  }

  @override
  Future<SignUpOutcome> signUp({
    required String email,
    required String password,
    required String displayName,
    required String commune,
    required String addressLine,
  }) async {
    try {
      final res = await _auth.signUp(
        email: normalizeEmail(email),
        password: password,
        // Recopiés dans le profil par la base (handle_new_user), qui les
        // revérifie (AuthDialog.tsx:651-658).
        data: {
          'display_name': normalizeDisplayName(displayName),
          'address_commune': commune,
          'address_line': normalizeAddressLine(addressLine),
        },
      );
      return (res.session != null && res.user != null)
          ? SignUpOutcome.signedIn
          : SignUpOutcome.confirmationSent;
    } catch (e) {
      throw _failure(e);
    }
  }

  @override
  Future<void> requestPasswordReset(String email) async {
    try {
      await _auth.resetPasswordForEmail(normalizeEmail(email));
    } catch (e) {
      final failure = _failure(e);
      // Même issue que le compte existe ou non ; seuls la saturation et le
      // réseau sont signalés (ForgotPasswordForm.tsx:24-27).
      if (failure is NetworkFailure ||
          (failure is AuthFailure &&
              (failure.code == 'over_email_send_rate_limit' ||
                  failure.code == 'over_request_rate_limit'))) {
        throw failure;
      }
    }
  }

  @override
  Future<void> resendConfirmation(String email) async {
    try {
      await _auth.resend(type: OtpType.signup, email: normalizeEmail(email));
    } catch (e) {
      throw _failure(e);
    }
  }

  @override
  Future<AppUser> signInWithGoogle() =>
      throw UnimplementedError('Connexion Google désactivée (flag).');

  @override
  Future<void> signOut() async {
    try {
      await _auth.signOut(scope: SignOutScope.local);
    } catch (_) {
      // Même si le serveur est injoignable, la session locale est effacée.
    }
  }

  // --- SessionTokens (utilisé par l'intercepteur dio) ---

  @override
  Future<String?> currentAccessToken() async {
    final session = _auth.currentSession;
    if (session == null) return null;
    final expiresAt = session.expiresAt;
    if (expiresAt != null) {
      final left = DateTime.fromMillisecondsSinceEpoch(expiresAt * 1000)
          .difference(DateTime.now());
      if (left < const Duration(seconds: 30)) {
        await refresh();
        return _auth.currentSession?.accessToken;
      }
    }
    return session.accessToken;
  }

  @override
  Future<bool> refresh() {
    return _refreshing ??= () async {
      try {
        final res = await _auth.refreshSession();
        return res.session != null;
      } catch (_) {
        return false;
      } finally {
        _refreshing = null;
      }
    }();
  }

  @override
  Future<void> expire() => signOut();
}
