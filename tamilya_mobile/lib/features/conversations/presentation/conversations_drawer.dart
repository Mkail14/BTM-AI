import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.dart';
import '../../../shared/widgets/brand_logo.dart';
import 'conversations_providers.dart';

/// Tiroir latéral : nouvelle conversation, historique, paramètres.
/// Navigation déléguée par callbacks (une fonctionnalité n'importe pas le
/// routeur d'une autre).
class ConversationsDrawer extends ConsumerWidget {
  const ConversationsDrawer({
    super.key,
    this.selectedId,
    required this.onNewConversation,
    required this.onSelect,
    required this.onSettings,
    this.onWallet,
  });

  final String? selectedId;
  final VoidCallback onNewConversation;
  final ValueChanged<String> onSelect;
  final VoidCallback onSettings;
  final VoidCallback? onWallet;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = context.palette;
    final theme = Theme.of(context);
    final conversations = ref.watch(conversationsListProvider);

    return Drawer(
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(Gaps.lg, Gaps.md, Gaps.sm, 0),
              child: Row(
                children: [
                  const BrandLogo(height: 22),
                  const Spacer(),
                  IconButton(
                    tooltip: 'Fermer le menu',
                    icon: const Icon(Icons.close_rounded),
                    onPressed: () => Navigator.of(context).maybePop(),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(Gaps.md),
              child: ListTile(
                leading: const Icon(Icons.add_rounded),
                title: const Text('Nouvelle conversation'),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(Radii.field),
                  side: BorderSide(color: p.border),
                ),
                onTap: onNewConversation,
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(Gaps.lg, Gaps.sm, Gaps.lg, 4),
              child: Text(
                'HISTORIQUE',
                style: theme.textTheme.bodySmall?.copyWith(
                  letterSpacing: 1.2,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            Expanded(
              child: conversations.when(
                skipLoadingOnReload: true,
                data: (items) => items.isEmpty
                    ? Padding(
                        padding: const EdgeInsets.all(Gaps.lg),
                        child: Text(
                          'Aucune conversation pour le moment.',
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: p.fgMuted,
                          ),
                        ),
                      )
                    : ListView(
                        children: [
                          for (final c in items)
                            ListTile(
                              title: Text(
                                c.title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              selected: c.id == selectedId,
                              selectedTileColor: p.accentSoft,
                              selectedColor: p.fg,
                              onTap: () => onSelect(c.id),
                            ),
                        ],
                      ),
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (_, _) => Padding(
                  padding: const EdgeInsets.all(Gaps.lg),
                  child: Text(
                    "L'historique n'a pas pu être chargé.",
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: p.danger,
                    ),
                  ),
                ),
              ),
            ),
            const Divider(),
            if (onWallet != null)
              ListTile(
                leading: const Icon(Icons.account_balance_wallet_outlined),
                title: const Text('Portefeuille'),
                onTap: onWallet,
              ),
            ListTile(
              leading: const Icon(Icons.settings_outlined),
              title: const Text('Paramètres'),
              onTap: onSettings,
            ),
          ],
        ),
      ),
    );
  }
}
