import 'package:flutter/material.dart';

import '../../../core/config/limits.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.dart';

/// Zone de saisie. Décision D9 : Entrée = saut de ligne, jamais d'envoi ;
/// l'envoi passe uniquement par le bouton.
class Composer extends StatefulWidget {
  const Composer({
    super.key,
    required this.onSend,
    this.onStop,
    this.sending = false,
    this.enabled = true,
  });

  /// Reçoit le texte nettoyé (non vide).
  final ValueChanged<String> onSend;

  /// Appelé par le bouton « Arrêter » quand [sending] est vrai.
  final VoidCallback? onStop;
  final bool sending;
  final bool enabled;

  @override
  State<Composer> createState() => _ComposerState();
}

class _ComposerState extends State<Composer> {
  final TextEditingController _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    widget.onSend(text);
    _controller.clear();
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Padding(
      padding: const EdgeInsets.fromLTRB(Gaps.md, Gaps.sm, Gaps.md, Gaps.md),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          ValueListenableBuilder<TextEditingValue>(
            valueListenable: _controller,
            builder: (context, value, _) {
              final n = value.text.length;
              if (n <= kMaxUserMessageChars * kCounterThreshold) {
                return const SizedBox.shrink();
              }
              final tooLong = n > kMaxUserMessageChars;
              return Semantics(
                liveRegion: true,
                child: Padding(
                  padding: const EdgeInsets.only(
                    right: Gaps.sm,
                    bottom: Gaps.xs,
                  ),
                  child: Text(
                    '$n / $kMaxUserMessageChars caractères',
                    style: Theme.of(context).textTheme.bodySmall
                        ?.copyWith(color: tooLong ? p.danger : p.fgMuted),
                  ),
                ),
              );
            },
          ),
          _box(context, p),
        ],
      ),
    );
  }

  Widget _box(BuildContext context, TamilyaPalette p) {
    return Container(
      decoration: BoxDecoration(
        color: p.bg,
        border: Border.all(color: p.composerBorder),
        borderRadius: BorderRadius.circular(Radii.composer),
        boxShadow: const [
          BoxShadow(
            color: Color(0x40000000),
            blurRadius: 30,
            spreadRadius: -12,
            offset: Offset(0, 8),
          ),
        ],
      ),
      padding: const EdgeInsets.fromLTRB(Gaps.lg, 4, 4, 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: TextField(
              controller: _controller,
              enabled: widget.enabled,
              minLines: 1,
              maxLines: 6,
              keyboardType: TextInputType.multiline,
              textInputAction: TextInputAction.newline,
              textCapitalization: TextCapitalization.sentences,
              style: Theme.of(context).textTheme.bodyLarge,
              decoration: const InputDecoration(
                hintText: 'Écris à Tamilya…',
                filled: false,
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                contentPadding: EdgeInsets.symmetric(vertical: 12),
              ),
            ),
          ),
          const SizedBox(width: Gaps.sm),
          ValueListenableBuilder<TextEditingValue>(
            valueListenable: _controller,
            builder: (context, value, _) {
              final hasText = value.text.trim().isNotEmpty;
              final tooLong = value.text.length > kMaxUserMessageChars;
              final canSend =
                  widget.enabled && hasText && !tooLong && !widget.sending;
              final VoidCallback? action = widget.sending
                  ? widget.onStop
                  : (canSend ? _submit : null);
              return IconButton.filled(
                onPressed: action,
                tooltip: widget.sending
                    ? 'Arrêter la génération'
                    : 'Envoyer le message',
                style: IconButton.styleFrom(
                  fixedSize: const Size(48, 48),
                  backgroundColor: p.accent,
                  foregroundColor: p.accentFg,
                  disabledBackgroundColor: p.bgMuted,
                  disabledForegroundColor: p.fgMuted,
                ),
                icon: Icon(
                  widget.sending
                      ? Icons.stop_rounded
                      : Icons.arrow_upward_rounded,
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}
