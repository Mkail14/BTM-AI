import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/tokens.dart';
import '../../../shared/widgets/empty_state.dart';
import '../../../shared/widgets/typing_indicator.dart';
import 'chat_controller.dart';
import 'composer.dart';
import 'message_bubble.dart';

/// Écran racine : conversation plein écran + tiroir (pas de barre d'onglets).
///
/// Le contenu du tiroir ([drawerBuilder]) et [onLeaveConversation] sont
/// fournis par le routeur, qui assemble les fonctionnalités (une feature
/// n'importe jamais une autre feature).
class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({
    super.key,
    this.conversationId,
    required this.drawerBuilder,
    required this.onLeaveConversation,
  });

  final String? conversationId;

  /// Construit le tiroir ; le second paramètre ferme le tiroir.
  final Widget Function(BuildContext context, VoidCallback closeDrawer)
  drawerBuilder;

  /// Retour depuis une conversation ouverte vers une nouvelle conversation.
  final VoidCallback onLeaveConversation;

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  bool _drawerOpen = false;
  DateTime? _lastBack;

  /// Retour Android : ferme le tiroir ; sinon quitte la conversation ouverte ;
  /// sur la racine, deux retours en 2 s pour quitter.
  void _onBack(bool didPop, Object? result) {
    if (didPop) return;
    if (_drawerOpen) {
      _scaffoldKey.currentState?.closeDrawer();
      return;
    }
    if (widget.conversationId != null) {
      widget.onLeaveConversation();
      return;
    }
    final now = DateTime.now();
    final last = _lastBack;
    if (last != null && now.difference(last) < const Duration(seconds: 2)) {
      SystemNavigator.pop();
      return;
    }
    _lastBack = now;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        const SnackBar(content: Text('Appuie encore pour quitter.')),
      );
  }

  void _send(String text) {
    if (defaultTargetPlatform == TargetPlatform.iOS) {
      HapticFeedback.lightImpact();
    }
    ref.read(chatControllerProvider(widget.conversationId).notifier).send(text);
  }

  @override
  Widget build(BuildContext context) {
    final id = widget.conversationId;
    final state = ref.watch(chatControllerProvider(id));
    final controller = ref.read(chatControllerProvider(id).notifier);

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: _onBack,
      child: Scaffold(
        key: _scaffoldKey,
        onDrawerChanged: (open) => _drawerOpen = open,
        appBar: AppBar(
          leading: Builder(
            builder: (context) => IconButton(
              icon: const Icon(Icons.menu_rounded),
              tooltip: 'Ouvrir le menu',
              onPressed: () => Scaffold.of(context).openDrawer(),
            ),
          ),
          title: const Text('Tamilya'),
        ),
        drawer: widget.drawerBuilder(
          context,
          () => _scaffoldKey.currentState?.closeDrawer(),
        ),
        body: Column(
          children: [
            Expanded(child: _MessageList(state: state, onRetry: null)),
            Composer(
              sending: state.isTyping,
              enabled: !state.loading,
              onSend: _send,
              onStop: controller.stop,
            ),
          ],
        ),
      ),
    );
  }
}

class _MessageList extends StatelessWidget {
  const _MessageList({required this.state, required this.onRetry});

  final ChatState state;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    if (state.loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (state.messages.isEmpty && !state.isTyping) {
      return const EmptyState(
        icon: Icons.chat_bubble_outline_rounded,
        title: 'Parle shimaoré avec Tamilya',
        message: 'Écris ton premier message pour commencer.',
      );
    }
    final showTyping = state.waitingForFirstChunk;
    final count = state.messages.length + (showTyping ? 1 : 0);
    return ListView.separated(
      reverse: true,
      padding: const EdgeInsets.symmetric(
        horizontal: Gaps.lg,
        vertical: Gaps.lg,
      ),
      itemCount: count,
      separatorBuilder: (_, _) => const SizedBox(height: Gaps.lg),
      itemBuilder: (context, index) {
        if (showTyping && index == 0) {
          return const Align(
            alignment: Alignment.centerLeft,
            child: TypingIndicator(),
          );
        }
        final offset = showTyping ? 1 : 0;
        final message =
            state.messages[state.messages.length - 1 - (index - offset)];
        return MessageBubble(message: message, onRetry: onRetry);
      },
    );
  }
}
