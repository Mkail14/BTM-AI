import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.dart';
import '../../../shared/widgets/awa_orb.dart';
import '../../../shared/widgets/brand_logo.dart';
import '../../../shared/widgets/lagon_background.dart';
import '../../../shared/widgets/typing_indicator.dart';
import 'chat_controller.dart';
import 'composer.dart';
import 'message_bubble.dart';
import 'suggestion_carousel.dart';

/// Écran racine : conversation plein écran + tiroir (pas de barre d'onglets).
///
/// Le contenu du tiroir ([drawerBuilder]) et [onLeaveConversation] sont
/// fournis par le routeur, qui assemble les fonctionnalités (une feature
/// n'importe jamais une autre feature).
class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({
    super.key,
    this.conversationId,
    this.initialMessage,
    required this.drawerBuilder,
    required this.onLeaveConversation,
    required this.onNewConversation,
    this.onConversationsChanged,
  });

  final String? conversationId;

  /// Message à envoyer dès l'ouverture (saisi à l'accueil avant connexion).
  final String? initialMessage;

  /// Construit le tiroir ; le second paramètre ferme le tiroir, le troisième
  /// est la conversation courante (connue après le premier message).
  final Widget Function(
    BuildContext context,
    VoidCallback closeDrawer,
    String? currentId,
  )
  drawerBuilder;

  /// La liste des conversations est peut-être périmée (réponse terminée,
  /// titre généré, tiroir ouvert) : le routeur la recharge.
  final VoidCallback? onConversationsChanged;

  /// Retour depuis une conversation ouverte vers une nouvelle conversation.
  final VoidCallback onLeaveConversation;

  /// Bouton « + » : repart d'une nouvelle conversation.
  final VoidCallback onNewConversation;

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  bool _drawerOpen = false;
  DateTime? _lastBack;
  Timer? _titleTimer;

  @override
  void dispose() {
    _titleTimer?.cancel();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    final first = widget.initialMessage;
    if (first != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _send(first);
      });
    }
  }

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
    final p = context.palette;

    // Fin d'une réponse : recharger la liste, puis 5 s plus tard pour le titre
    // généré par l'IA (ChatView.tsx:412-414).
    ref.listen(chatControllerProvider(id), (previous, next) {
      if (previous != null && previous.isTyping && !next.isTyping) {
        widget.onConversationsChanged?.call();
        if (previous.conversationId == null || id == null) {
          _titleTimer?.cancel();
          _titleTimer = Timer(
            const Duration(seconds: 5),
            () => widget.onConversationsChanged?.call(),
          );
        }
      }
    });

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: _onBack,
      child: Scaffold(
        key: _scaffoldKey,
        backgroundColor: p.personaSurface,
        onDrawerChanged: (open) {
          _drawerOpen = open;
          if (open) widget.onConversationsChanged?.call();
        },
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          leading: Builder(
            builder: (context) => IconButton(
              icon: const Icon(Icons.menu_rounded),
              color: p.fgMuted,
              tooltip: 'Ouvrir le menu',
              onPressed: () => Scaffold.of(context).openDrawer(),
            ),
          ),
          titleSpacing: 0,
          title: const BrandLogo(height: 24),
          actions: [
            if (state.messages.isNotEmpty)
              IconButton(
                icon: const Icon(Icons.add_rounded, size: 22),
                color: p.fgMuted,
                tooltip: 'Nouvelle conversation',
                onPressed: widget.onNewConversation,
              ),
          ],
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(1),
            child: Divider(height: 1, color: p.border),
          ),
        ),
        drawer: widget.drawerBuilder(
          context,
          () => _scaffoldKey.currentState?.closeDrawer(),
          state.conversationId ?? id,
        ),
        body: Stack(
          children: [
            // Halo du haut, filet persona et courbes du lagon (spec C2b §4).
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: RadialGradient(
                    center: const Alignment(0, -1),
                    radius: 1.1,
                    colors: [p.personaGlow, const Color(0x00000000)],
                    stops: const [0, 0.7],
                  ),
                ),
              ),
            ),
            Positioned.fill(
              child: LagonBackground(
                style: LagonStyle.persona,
                colors: [
                  TamilyaPalette.persona,
                  p.isDark ? const Color(0xFF2AD1C4) : const Color(0xFF14A89E),
                ],
                opacity: p.isDark ? 0.20 : 0.12,
                topClear: 0,
              ),
            ),
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      const Color(0x00000000),
                      TamilyaPalette.persona.withValues(alpha: 0.25),
                      TamilyaPalette.persona.withValues(alpha: 0.75),
                      const Color(0x00000000),
                    ],
                    stops: const [0, 0.25, 0.75, 1],
                  ),
                ),
              ),
            ),
            Column(
              children: [
                Expanded(
                  child: _MessageList(
                    state: state,
                    onRetry: controller.retry,
                    onReload: controller.reload,
                    onPick: _send,
                  ),
                ),
                SafeArea(
                  top: false,
                  child: Composer(
                    sending: state.isTyping,
                    enabled: !state.loading && !state.blocked,
                    onSend: _send,
                    onStop: controller.stop,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// « Bonjour » le jour, « Bonsoir » de 18 h à 4 h (heure de Mayotte, UTC+3).
String greeting([DateTime? now]) {
  final hour =
      (now ?? DateTime.now().toUtc().add(const Duration(hours: 3))).hour;
  return (hour >= 18 || hour < 4) ? 'Bonsoir' : 'Bonjour';
}

class _MessageList extends StatelessWidget {
  const _MessageList({
    required this.state,
    required this.onRetry,
    required this.onPick,
    this.onReload,
  });

  final VoidCallback? onReload;
  final ChatState state;
  final VoidCallback? onRetry;
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) {
    if (state.loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (state.loadError != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(Gaps.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(state.loadError!, textAlign: TextAlign.center),
              TextButton(onPressed: onReload, child: const Text('Réessayer')),
            ],
          ),
        ),
      );
    }
    if (state.messages.isEmpty && !state.isTyping) {
      return _EmptyChat(onPick: onPick);
    }
    final showTyping = state.waitingForFirstChunk;
    final count = state.messages.length + (showTyping ? 1 : 0);
    return ListView.separated(
      reverse: true,
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(Gaps.lg, 40, Gaps.lg, 14),
      itemCount: count,
      separatorBuilder: (_, _) => const SizedBox(height: 40),
      itemBuilder: (context, index) {
        if (showTyping && index == 0) {
          return const AssistantRow(child: TypingIndicator());
        }
        final offset = showTyping ? 1 : 0;
        final message =
            state.messages[state.messages.length - 1 - (index - offset)];
        final isLast = identical(message, state.messages.last);
        return MessageBubble(
          message: message,
          onRetry: isLast ? onRetry : null,
        );
      },
    );
  }
}

/// Chat vide : orbe, « Bonjour », sous-texte, suggestions (spec C2b §4).
class _EmptyChat extends StatelessWidget {
  const _EmptyChat({required this.onPick});

  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final theme = Theme.of(context);
    final tall = MediaQuery.sizeOf(context).height >= 560;
    return LayoutBuilder(
      builder: (context, box) => SingleChildScrollView(
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: box.maxHeight),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (tall)
                  AwaOrb(
                    size: (MediaQuery.sizeOf(context).width * 0.34).clamp(
                      0.0,
                      136.0,
                    ),
                  ),
                const SizedBox(height: 20),
                Text(
                  greeting(),
                  style: TextStyle(
                    fontSize: 24,
                    letterSpacing: -0.6,
                    color: p.fg,
                    fontVariations: wght(600),
                  ),
                ),
                const SizedBox(height: 8),
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 320),
                  child: Text(
                    'Je suis Tamilya. Pose-moi ta question, en français ou en shimaoré.',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: p.fgMuted,
                    ),
                  ),
                ),
                const SizedBox(height: 24),
                SuggestionCarousel(onPick: onPick),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
