import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.dart';
import 'settings_providers.dart';

/// Paramètres : libellés repris du web (03-uiux.md §5). Les sous-écrans
/// arrivent avec C3 ; ici, simples entrées de liste.
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({
    super.key,
    required this.onOpenLegal,
    required this.onSignOut,
  });

  final ValueChanged<String> onOpenLegal;
  final VoidCallback onSignOut;

  void _soon(BuildContext context) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(const SnackBar(content: Text('Bientôt disponible.')));
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
    }) => ListTile(
      leading: Icon(icon, color: color),
      title: Text(title, style: TextStyle(color: color)),
      subtitle: Text(subtitle),
      trailing: const Icon(Icons.chevron_right_rounded),
      onTap: onTap ?? () => _soon(context),
    );

    return Scaffold(
      appBar: AppBar(title: const Text('Paramètres')),
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
                error: (_, _) =>
                    const Text("Le profil n'a pas pu être chargé."),
              ),
            ),
            section('Compte'),
            tile(
              Icons.person_outline_rounded,
              'Profil',
              'Ton nom et ton téléphone',
            ),
            tile(
              Icons.auto_awesome_outlined,
              'Tamilya',
              "Sa personnalité et ce qu'elle retient",
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
