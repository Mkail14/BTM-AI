import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/presentation/auth_providers.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/auth/presentation/splash_screen.dart';
import '../../features/chat/presentation/chat_controller.dart';
import '../../features/chat/presentation/chat_screen.dart';
import '../../features/conversations/presentation/conversations_drawer.dart';
import '../../features/legal/presentation/legal_screen.dart';
import '../../features/settings/presentation/settings_screen.dart';

/// Routes : /splash -> /login -> / (chat) ; /c/:id ; /settings ; /legal/:page.
///
/// Le garde de session (redirections selon l'état d'authentification et le
/// flag guestMode) arrive avec C3 ; en C2 la navigation est statique.
final appRouterProvider = Provider<GoRouter>((ref) {
  Widget chat(BuildContext context, String? id) {
    return ChatScreen(
      key: ValueKey(id),
      conversationId: id,
      onLeaveConversation: () => context.go('/'),
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

  return GoRouter(
    initialLocation: '/splash',
    routes: [
      GoRoute(
        path: '/splash',
        builder: (context, state) =>
            SplashScreen(onDone: () => context.go('/login')),
      ),
      GoRoute(
        path: '/login',
        builder: (context, state) =>
            LoginScreen(onSignedIn: () => context.go('/')),
      ),
      GoRoute(path: '/', builder: (context, state) => chat(context, null)),
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
            if (context.mounted) context.go('/login');
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
