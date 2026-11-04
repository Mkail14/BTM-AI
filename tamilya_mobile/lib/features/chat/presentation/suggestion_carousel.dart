import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

class _Suggestion {
  const _Suggestion(this.emoji, this.title, this.subtitle);

  final String emoji;
  final String title;
  final String subtitle;
}

const List<_Suggestion> _suggestions = [
  _Suggestion(
    '🚗',
    'Passer le code',
    'Le bureau le plus proche et ses créneaux',
  ),
  _Suggestion('🗣️', 'Parler shimaoré', 'Bonjour, merci, compter…'),
  _Suggestion('💼', 'Trouver un emploi', 'Les offres du moment à Mayotte'),
  _Suggestion('📰', "L'actu de Mayotte", "Ce qui se passe aujourd'hui"),
];

/// Une suggestion à la fois, qui change toutes les 5 s pendant un tour ;
/// un appui l'envoie (ChatView.tsx:58-62).
class SuggestionCarousel extends StatefulWidget {
  const SuggestionCarousel({super.key, required this.onPick});

  final ValueChanged<String> onPick;

  @override
  State<SuggestionCarousel> createState() => _SuggestionCarouselState();
}

class _SuggestionCarouselState extends State<SuggestionCarousel> {
  Timer? _timer;
  int _index = 0;
  int _shown = 1;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_timer == null && !MediaQuery.disableAnimationsOf(context)) {
      _timer = Timer.periodic(const Duration(seconds: 5), (t) {
        if (!mounted) return;
        if (_shown >= _suggestions.length) {
          t.cancel();
          return;
        }
        setState(() {
          _index = (_index + 1) % _suggestions.length;
          _shown++;
        });
      });
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final theme = Theme.of(context);
    final s = _suggestions[_index];
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 340),
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 260),
            child: Material(
              key: ValueKey(_index),
              color: p.bg.withValues(alpha: 0.6),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
                side: BorderSide(color: p.border),
              ),
              child: InkWell(
                borderRadius: BorderRadius.circular(16),
                onTap: () => widget.onPick(s.title),
                child: Padding(
                  padding: const EdgeInsets.all(10),
                  child: Row(
                    children: [
                      Container(
                        width: 36,
                        height: 36,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: p.userBubble,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          s.emoji,
                          style: const TextStyle(fontSize: 18),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              s.title,
                              style: theme.textTheme.bodyMedium?.copyWith(
                                fontVariations: wght(500),
                              ),
                            ),
                            Text(
                              s.subtitle,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: theme.textTheme.bodySmall,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (var i = 0; i < _suggestions.length; i++)
              GestureDetector(
                onTap: () => setState(() => _index = i),
                child: Container(
                  width: 24,
                  height: 24,
                  alignment: Alignment.center,
                  color: Colors.transparent,
                  child: Container(
                    width: 6,
                    height: 6,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: i == _index
                          ? p.accent
                          : p.fgMuted.withValues(alpha: 0.4),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ],
    );
  }
}
