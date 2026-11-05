import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/config/env.dart';
import '../data/fake_wallet_repository.dart';
import '../domain/wallet.dart';

/// Surchargé au démarrage par `ApiWalletRepository` ; factice sinon.
final walletRepositoryProvider = Provider<WalletRepository>(
  (ref) => FakeWalletRepository(),
);

/// Solde + historique. Invalidé à chaque changement de session.
final walletProvider = FutureProvider<WalletSnapshot>(
  (ref) => ref.watch(walletRepositoryProvider).load(),
  retry: (_, _) => null, // l'erreur s'affiche tout de suite, avec « Réessayer »
);

/// Page du site pour recharger (`/portefeuille`), ou null si l'adresse de
/// l'API n'est pas configurée.
final walletPageUrlProvider = Provider<Uri?>((ref) {
  final base = Env.apiBaseUrl;
  if (base.isEmpty) return null;
  return Uri.parse('${base.replaceFirst(RegExp(r'/+$'), '')}/portefeuille');
});

/// Ouvre une adresse dans le navigateur du système, jamais dans une WebView.
/// Remplaçable dans les tests.
final externalUrlOpenerProvider = Provider<Future<bool> Function(Uri)>(
  (ref) =>
      (uri) => launchUrl(uri, mode: LaunchMode.externalApplication),
);
