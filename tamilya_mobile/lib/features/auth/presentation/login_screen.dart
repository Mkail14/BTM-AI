import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/feature_flags.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.dart';
import '../../../shared/widgets/app_text_field.dart';
import '../../../shared/widgets/primary_button.dart';
import 'auth_providers.dart';

/// Écran de connexion (statique en C2 : le dépôt factice accepte tout).
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key, required this.onSignedIn});

  final VoidCallback onSignedIn;

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final TextEditingController _email = TextEditingController();
  final TextEditingController _password = TextEditingController();
  bool _pending = false;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _signIn() async {
    setState(() => _pending = true);
    await ref
        .read(authRepositoryProvider)
        .signIn(email: _email.text.trim(), password: _password.text);
    if (!mounted) return;
    setState(() => _pending = false);
    widget.onSignedIn();
  }

  void _soon() {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(const SnackBar(content: Text('Bientôt disponible.')));
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.all(Gaps.xl),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Tamilya',
                    style: theme.textTheme.titleLarge?.copyWith(
                      fontSize: 32,
                      color: p.accent,
                    ),
                  ),
                  const SizedBox(height: Gaps.sm),
                  Text(
                    "Tamilya, l'assistante qui apprend le shimaoré.",
                    style: theme.textTheme.bodyLarge?.copyWith(
                      color: p.fgMuted,
                    ),
                  ),
                  const SizedBox(height: Gaps.xl),
                  AppTextField(
                    label: 'Adresse e-mail',
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                    autofillHints: const [AutofillHints.email],
                  ),
                  const SizedBox(height: Gaps.lg),
                  AppTextField(
                    label: 'Mot de passe',
                    controller: _password,
                    obscureText: true,
                    textInputAction: TextInputAction.done,
                    autofillHints: const [AutofillHints.password],
                  ),
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton(
                      onPressed: _soon,
                      child: const Text('Mot de passe oublié ?'),
                    ),
                  ),
                  const SizedBox(height: Gaps.sm),
                  PrimaryButton(
                    label: 'Se connecter',
                    loading: _pending,
                    onPressed: _signIn,
                  ),
                  const SizedBox(height: Gaps.md),
                  PrimaryButton(
                    label: 'Créer un compte',
                    variant: PrimaryButtonVariant.outline,
                    onPressed: _soon,
                  ),
                  if (FeatureFlags.googleSignIn) ...[
                    const SizedBox(height: Gaps.md),
                    PrimaryButton(
                      label: 'Continuer avec Google',
                      variant: PrimaryButtonVariant.outline,
                      onPressed: _soon,
                    ),
                  ],
                  if (FeatureFlags.appleSignIn) ...[
                    const SizedBox(height: Gaps.md),
                    PrimaryButton(
                      label: 'Continuer avec Apple',
                      variant: PrimaryButtonVariant.outline,
                      onPressed: _soon,
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
