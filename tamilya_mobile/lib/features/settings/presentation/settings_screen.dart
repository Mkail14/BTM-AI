import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.dart';
import '../../../shared/widgets/brand_logo.dart';
import '../../../core/errors/app_failure.dart';
import '../domain/profile.dart';
import 'settings_providers.dart';

/// Paramètres : libellés repris du web (03-uiux.md §5). Les sous-écrans
/// arrivent avec C3 ; ici, simples entrées de liste.
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({
    super.key,
    required this.onOpenLegal,
    required this.onOpenWallet,
    required this.onSignOut,
  });

  final ValueChanged<String> onOpenLegal;
  final VoidCallback onOpenWallet;
  final VoidCallback onSignOut;

  void _soon(BuildContext context) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(const SnackBar(content: Text('Bientôt disponible.')));
  }

  void _fail(BuildContext context, Object e) {
    if (!context.mounted) return;
    final message = e is AppFailure ? e.message : 'Une erreur est survenue.';
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _editName(BuildContext context, WidgetRef ref) async {
    final current = ref.read(profileProvider).value?.displayName ?? '';
    final controller = TextEditingController(text: current);
    final name = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Ton nom'),
        content: TextField(
          key: const Key('settings-name'),
          controller: controller,
          maxLength: 60,
          autofocus: true,
          decoration: const InputDecoration(
            hintText: 'Comment on t\'appelle ?',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Annuler'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, controller.text),
            child: const Text('Enregistrer'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (name == null || name.trim() == current) return;
    try {
      await ref.read(accountProvider.notifier).saveName(name);
    } catch (e) {
      if (context.mounted) _fail(context, e);
    }
  }

  Future<void> _pickPersonality(BuildContext context, WidgetRef ref) async {
    final data = ref.read(accountProvider).value;
    if (data == null) return;
    final chosen = data.profile.personality ?? data.defaultPersonality;
    final id = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            for (final PersonalityCard c in data.personalities)
              ListTile(
                leading: Text(c.emoji, style: const TextStyle(fontSize: 24)),
                title: Text(c.label),
                subtitle: Text(c.description),
                trailing: c.id == chosen
                    ? const Icon(Icons.check_rounded)
                    : null,
                onTap: () => Navigator.pop(ctx, c.id),
              ),
          ],
        ),
      ),
    );
    if (id == null || id == chosen) return;
    try {
      await ref.read(accountProvider.notifier).savePersonality(id);
    } catch (e) {
      if (context.mounted) _fail(context, e);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = context.palette;
    final theme = Theme.of(context);
    final profile = ref.watch(profileProvider);

    Widget section(String title) => Padding(
      padding: const EdgeInsets.fromLTRB(Gaps.lg, Gaps.xl, Gaps.lg, Gaps.xs),
      child: Text(
        title,
        style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
      ),
    );

    Widget tile(
      IconData icon,
      String title,
      String subtitle, {
      VoidCallback? onTap,
      Color? color,
    }) => Padding(
      padding: const EdgeInsets.fromLTRB(Gaps.lg, 4, Gaps.lg, 4),
      child: Material(
        color: p.bg,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: p.border),
        ),
        child: ListTile(
          leading: Icon(icon, color: color),
          title: Text(title, style: TextStyle(color: color)),
          subtitle: Text(subtitle),
          trailing: const Icon(Icons.chevron_right_rounded),
          onTap: onTap ?? () => _soon(context),
        ),
      ),
    );

    return Scaffold(
      backgroundColor: p.bgSubtle,
      appBar: AppBar(
        backgroundColor: p.bgSubtle,
        titleSpacing: 0,
        title: Row(
          children: [
            const BrandLogo(height: 24),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Text('/', style: TextStyle(color: p.border)),
            ),
            const Text('Paramètres', style: TextStyle(fontSize: 14)),
          ],
        ),
      ),
      body: SafeArea(
        child: ListView(
          children: [
            Padding(
              padding: const EdgeInsets.all(Gaps.lg),
              child: profile.when(
                data: (data) => Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(data.displayName, style: theme.textTheme.titleLarge),
                    Text(
                      data.email,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: p.fgMuted,
                      ),
                    ),
                  ],
                ),
                loading: () => const LinearProgressIndicator(),
                error: (e, _) => Text(
                  e is AppFailure
                      ? e.message
                      : "Le profil n'a pas pu être chargé.",
                ),
              ),
            ),
            section('Compte'),
            tile(
              Icons.person_outline_rounded,
              'Profil',
              'Ton nom et ton téléphone',
              onTap: () => _editName(context, ref),
            ),
            tile(
              Icons.auto_awesome_outlined,
              'Tamilya',
              "Sa personnalité et ce qu'elle retient",
              onTap: () => _pickPersonality(context, ref),
            ),
            tile(
              Icons.account_balance_wallet_outlined,
              'Portefeuille',
              'Ton solde et ton historique',
              onTap: onOpenWallet,
            ),
            tile(
              Icons.lock_outline_rounded,
              'Sécurité',
              'E-mail, mot de passe, session',
            ),
            tile(
              Icons.delete_outline_rounded,
              'Supprimer le compte',
              'Effacer ton compte et tes données',
              color: p.danger,
            ),
            section('Informations légales'),
            tile(
              Icons.privacy_tip_outlined,
              'Confidentialité',
              'Comment tes données sont utilisées',
              onTap: () => onOpenLegal('confidentialite'),
            ),
            tile(
              Icons.description_outlined,
              "Conditions d'utilisation",
              "Les règles d'usage de Tamilya",
              onTap: () => onOpenLegal('conditions'),
            ),
            const SizedBox(height: Gaps.lg),
            ListTile(
              leading: const Icon(Icons.logout_rounded),
              title: const Text('Se déconnecter'),
              onTap: onSignOut,
            ),
          ],
        ),
      ),
    );
  }
}
