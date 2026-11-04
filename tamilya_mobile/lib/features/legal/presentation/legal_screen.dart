import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.dart';
import '../../../shared/widgets/empty_state.dart';

/// Pages légales. En V1 (C3), le texte officiel s'ouvre dans le navigateur
/// système (url_launcher) ; ici, un emplacement par page.
class LegalScreen extends StatelessWidget {
  const LegalScreen({super.key, required this.page});

  final String page;

  static const Map<String, String> titles = {
    'confidentialite': 'Confidentialité',
    'conditions': "Conditions d'utilisation",
  };

  @override
  Widget build(BuildContext context) {
    final title = titles[page];
    return Scaffold(
      appBar: AppBar(title: Text(title ?? 'Page introuvable')),
      body: SafeArea(
        child: title == null
            ? const EmptyState(
                icon: Icons.search_off_rounded,
                title: 'Page introuvable',
              )
            : Padding(
                padding: const EdgeInsets.all(Gaps.xl),
                child: Text(
                  'Le texte officiel sera affiché depuis le site de Tamilya.',
                  style: Theme.of(context).textTheme.bodyLarge
                      ?.copyWith(color: context.palette.fgMuted),
                ),
              ),
      ),
    );
  }
}
