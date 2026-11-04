import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.dart';
import '../../../shared/models/chat_message.dart';

/// Bulle de message. Utilisateur : bulle teintée à droite ; Tamilya : texte
/// pleine largeur. États : complete, streaming, interrupted, error.
class MessageBubble extends StatelessWidget {
  const MessageBubble({super.key, required this.message, this.onRetry});

  final ChatMessage message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return message.role == MessageRole.user
        ? _UserBubble(message: message)
        : _AssistantMessage(message: message, onRetry: onRetry);
  }
}

class _UserBubble extends StatelessWidget {
  const _UserBubble({required this.message});

  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Align(
      alignment: Alignment.centerRight,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width * 0.85,
        ),
        child: Semantics(
          container: true,
          label: 'Tu as écrit :',
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: BoxDecoration(
              color: p.accentSoft,
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(Radii.bubble),
                topRight: Radius.circular(Radii.bubble),
                bottomLeft: Radius.circular(Radii.bubble),
                bottomRight: Radius.circular(Radii.bubbleTail),
              ),
            ),
            child: SelectableText(
              message.text,
              style: Theme.of(context).textTheme.bodyLarge,
            ),
          ),
        ),
      ),
    );
  }
}

class _AssistantMessage extends StatelessWidget {
  const _AssistantMessage({required this.message, this.onRetry});

  final ChatMessage message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final theme = Theme.of(context);
    final isError = message.status == MessageStatus.error;
    final text = isError && message.text.isEmpty
        ? "La réponse n'a pas pu être générée."
        : message.text;

    return Semantics(
      container: true,
      label: 'Tamilya a répondu :',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (isError)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(Gaps.md),
              decoration: BoxDecoration(
                color: p.dangerSoft,
                borderRadius: BorderRadius.circular(Radii.field),
              ),
              child: Text(
                text,
                style: theme.textTheme.bodyLarge?.copyWith(color: p.danger),
              ),
            )
          else
            SelectableText(
              message.status == MessageStatus.streaming ? '$text▍' : text,
              style: theme.textTheme.bodyLarge,
            ),
          if (message.status == MessageStatus.interrupted)
            Padding(
              padding: const EdgeInsets.only(top: Gaps.xs),
              child: Text(
                'Réponse interrompue.',
                style: theme.textTheme.bodySmall,
              ),
            ),
          if (isError && onRetry != null)
            TextButton(onPressed: onRetry, child: const Text('Réessayer')),
        ],
      ),
    );
  }
}
