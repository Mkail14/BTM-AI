import 'package:flutter/widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/presentation/auth_providers.dart';
import '../config/env.dart';
import '../../features/auth/presentation/auth_sheet.dart';
import 'root_screen.dart';
import '../../features/auth/presentation/splash_screen.dart';
import '../../features/chat/presentation/chat_controller.dart';
import '../../features/chat/presentation/chat_screen.dart';
import '../../features/conversations/presentation/conversations_drawer.dart';
import '../../features/legal/presentation/legal_screen.dart';
import '../../features/settings/presentation/settings_providers.dart';
import '../../features/settings/presentation/settings_screen.dart';

/// Routes : /splash -> / (accueil visiteur ou chat selon la session) ;
/// /c/:id ; /settings ; /legal/:page.
///
/// Le garde de session (redirections selon l'état d'authentification et le
/// flag guestMode) arrive avec C3 ; en C2 la navigation est statique.
final appRouterProvider = Provider<GoRouter>((ref) {
  Widget chat(BuildContext context, String? id, [String? initialMessage]) {
    return ChatScreen(
      key: ValueKey(id),
      conversationId: id,
      initialMessage: initialMessage,
      onLeaveConversation: () => context.go('/'),
      onNewConversation: () {
        ref.invalidate(chatControllerProvider(null));
        context.go('/');
      },
      drawerBuilder: (context, closeDrawer) => ConversationsDrawer(
        selectedId: id,
        onNewConversation: () {
          closeDrawer();
          ref.invalidate(chatControllerProvider(null));
          context.go('/');
        },
        onSelect: (convId) {
          closeDrawer();
          context.go('/c/$convId');
        },
        onSettings: () {
          closeDrawer();
          context.push('/settings');
        },
      ),
    );
  }

  final refresh = ValueNotifier<int>(0);
  ref.listen<bool>(sessionProvider, (previous, signedIn) {
    if (!signedIn) ref.invalidate(accountProvider);
    refresh.value++;
  });
  ref.onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: '/splash',
    refreshListenable: refresh,
    redirect: (context, state) {
      final loc = state.matchedLocation;
      if (Env.forceTheme.isNotEmpty && loc == '/recette/chat') {
        // Outil de recette (dépôt factice) : ouvre une session sans réseau.
        ref
            .read(authRepositoryProvider)
            .signIn(email: 'recette@exemple.invalid', password: 'x');
        return '/';
      }
      // Garde : sans session, seuls l'accueil, le lancement et le légal.
      final open =
          loc == '/' ||
          loc == '/splash' ||
          loc.startsWith('/legal') ||
          loc.startsWith('/recette');
      if (!ref.read(sessionProvider) && !open) return '/';
      return null;
    },
    routes: [
      if (Env.forceTheme.isNotEmpty) ...[
        GoRoute(path: '/recette/chat', builder: (c, s) => const SizedBox()),
        GoRoute(
          path: '/recette/auth',
          builder: (c, s) => const _RecetteAuth(reason: false),
        ),
        GoRoute(
          path: '/recette/auth-raison',
          builder: (c, s) => const _RecetteAuth(reason: true),
        ),
      ],
      GoRoute(
        path: '/splash',
        builder: (context, state) =>
            SplashScreen(onDone: () => context.go('/')),
      ),
      GoRoute(
        path: '/',
        builder: (context, state) =>
            RootScreen(chatBuilder: (message) => chat(context, null, message)),
      ),
      GoRoute(
        path: '/c/:id',
        builder: (context, state) => chat(context, state.pathParameters['id']),
      ),
      GoRoute(
        path: '/settings',
        builder: (context, state) => SettingsScreen(
          onOpenLegal: (page) => context.push('/legal/$page'),
          onSignOut: () async {
            await ref.read(authRepositoryProvider).signOut();
            if (context.mounted) context.go('/');
          },
        ),
      ),
      GoRoute(
        path: '/legal/:page',
        builder: (context, state) =>
            LegalScreen(page: state.pathParameters['page'] ?? ''),
      ),
    ],
  );
});

/// Outil de recette visuelle (actif seulement avec `FORCE_THEME`) : ouvre la
/// feuille de connexion par-dessus l'accueil sans interaction.
class _RecetteAuth extends StatefulWidget {
  const _RecetteAuth({required this.reason});

  final bool reason;

  @override
  State<_RecetteAuth> createState() => _RecetteAuthState();
}

class _RecetteAuthState extends State<_RecetteAuth> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        showAuthSheet(context, reason: widget.reason ? kSignupReason : null);
      }
    });
  }

  @override
  Widget build(BuildContext context) =>
      RootScreen(chatBuilder: (_) => const SizedBox());
}
