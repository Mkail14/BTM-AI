import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/auth/presentation/auth_providers.dart';
import '../../features/auth/presentation/auth_sheet.dart';
import '../../features/chat/presentation/home_screen.dart';

/// Racine `/` : accueil du site pour un visiteur, chat pour une session.
///
/// Le message tapé à l'accueil est gardé ; la feuille de connexion s'ouvre au
/// premier envoi ; après connexion, fondu de 560 ms vers le chat qui envoie le
/// message. Une session existante saute l'accueil.
class RootScreen extends ConsumerStatefulWidget {
  const RootScreen({super.key, required this.chatBuilder});

  /// Construit le chat ; reçoit le message à envoyer à l'ouverture.
  final Widget Function(String? initialMessage) chatBuilder;

  @override
  ConsumerState<RootScreen> createState() => _RootScreenState();
}

class _RootScreenState extends ConsumerState<RootScreen> {
  String? _pending;

  Future<void> _openAuth({String? message}) async {
    _pending = message;
    final ok = await showAuthSheet(
      context,
      reason: message == null ? null : kSignupReason,
    );
    if (ok && mounted) ref.read(sessionProvider.notifier).signIn();
  }

  @override
  Widget build(BuildContext context) {
    final signedIn = ref.watch(sessionProvider);
    final pending = _pending;
    _pending = null;
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 560),
      child: signedIn
          ? widgetKeyed('chat', widget.chatBuilder(pending))
          : HomeScreen(
              key: const ValueKey('home'),
              onSubmit: (text) => _openAuth(message: text),
              onOpenAuth: _openAuth,
            ),
    );
  }

  Widget widgetKeyed(String key, Widget child) =>
      KeyedSubtree(key: ValueKey(key), child: child);
}
