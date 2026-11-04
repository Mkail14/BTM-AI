import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.dart';
import '../../../shared/widgets/app_text_field.dart';
import '../../../shared/widgets/primary_button.dart';
import '../domain/auth_messages.dart';
import '../domain/auth_repository.dart';
import '../domain/signup_rules.dart';
import 'auth_providers.dart';

enum AuthMode { signIn, signUp, forgot }

/// Formulaires de la feuille de connexion : connexion, inscription (nom,
/// commune et adresse obligatoires, comme le web), mot de passe oublié.
/// Le même écran de confirmation s'affiche que l'adresse existe ou non
/// (pas d'énumération des comptes).
class AuthFormView extends ConsumerStatefulWidget {
  const AuthFormView({
    super.key,
    required this.initialMode,
    required this.onSignedIn,
    required this.onBack,
  });

  final AuthMode initialMode;

  /// Appelé après une connexion ou une inscription avec session immédiate.
  final VoidCallback onSignedIn;
  final VoidCallback onBack;

  @override
  ConsumerState<AuthFormView> createState() => _AuthFormViewState();
}

class _AuthFormViewState extends ConsumerState<AuthFormView> {
  late AuthMode _mode = widget.initialMode;
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _address = TextEditingController();
  final _password = TextEditingController();
  String? _commune;
  bool _consent = false;
  bool _pending = false;
  bool _submitted = false;
  String? _error;
  bool _needsConfirmation = false;

  /// Écran « e-mail envoyé » : confirmation d'inscription ou réinitialisation.
  String? _sentNotice;
  String? _sentTitle;

  @override
  void initState() {
    super.initState();
    _password.addListener(() => setState(() {}));
    _email.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _address.dispose();
    _password.dispose();
    super.dispose();
  }

  void _switch(AuthMode mode) => setState(() {
    _mode = mode;
    _error = null;
    _submitted = false;
    _needsConfirmation = false;
  });

  /// Vrai si le formulaire est valide ; sinon fixe le premier message
  /// (même ordre de contrôle que le web, AuthDialog.tsx:677-702).
  bool _validate() {
    String? error;
    if (!looksLikeEmail(_email.text)) {
      error = "Cette adresse e-mail n'est pas valide.";
    } else if (_mode == AuthMode.signIn && _password.text.isEmpty) {
      error = 'Saisis ton mot de passe.';
    } else if (_mode == AuthMode.signUp) {
      final addr = addressFieldErrors(commune: _commune, line: _address.text);
      if (normalizeDisplayName(_name.text).isEmpty) {
        error = "Indique comment tu veux qu'on t'appelle.";
      } else if (addr.commune != null || addr.line != null) {
        error = addr.commune ?? addr.line;
      } else if (!isPasswordValid(_password.text, _email.text)) {
        error = 'Le mot de passe ne respecte pas encore tous les critères.';
      } else if (!_consent) {
        error = 'Accepte les règles de confidentialité pour créer ton compte.';
      }
    }
    setState(() {
      _submitted = true;
      _error = error;
    });
    return error == null;
  }

  Future<void> _submit() async {
    if (_pending || !_validate()) return;
    setState(() {
      _pending = true;
      _error = null;
      _needsConfirmation = false;
    });
    final repo = ref.read(authRepositoryProvider);
    try {
      switch (_mode) {
        case AuthMode.signIn:
          await repo.signIn(email: _email.text, password: _password.text);
          if (mounted) widget.onSignedIn();
        case AuthMode.signUp:
          final outcome = await repo.signUp(
            email: _email.text,
            password: _password.text,
            displayName: _name.text,
            commune: _commune!,
            addressLine: _address.text,
          );
          if (!mounted) return;
          if (outcome == SignUpOutcome.signedIn) {
            widget.onSignedIn();
          } else {
            setState(() {
              _sentTitle = 'Confirme ton adresse e-mail';
              _sentNotice =
                  'Si cette adresse peut créer un compte, un e-mail de '
                  'confirmation vient d\'être envoyé à ${_email.text.trim()}. '
                  'Clique sur le lien reçu pour finir ton inscription.';
            });
          }
        case AuthMode.forgot:
          await repo.requestPasswordReset(_email.text);
          if (!mounted) return;
          setState(() {
            _sentTitle = 'Regarde tes e-mails';
            _sentNotice =
                'Si un compte existe pour ${_email.text.trim()}, un e-mail '
                'contenant un lien de réinitialisation vient d\'être envoyé.';
          });
      }
    } on AuthFailure catch (e) {
      if (mounted) {
        setState(() {
          _error = e.message;
          _needsConfirmation = e.emailNotConfirmed;
        });
      }
    } on AppFailure catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = kAuthNetworkMessage);
    } finally {
      if (mounted) setState(() => _pending = false);
    }
  }

  Future<void> _resend() async {
    try {
      await ref.read(authRepositoryProvider).resendConfirmation(_email.text);
      if (mounted) {
        setState(() {
          _error = null;
          _needsConfirmation = false;
          _sentTitle = 'Regarde tes e-mails';
          _sentNotice =
              'Un nouvel e-mail de confirmation vient d\'être envoyé.';
        });
      }
    } on AppFailure catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final theme = Theme.of(context);
    final signUp = _mode == AuthMode.signUp;
    final title = switch (_mode) {
      AuthMode.signIn => 'Connexion',
      AuthMode.signUp => 'Créer un compte',
      AuthMode.forgot => 'Mot de passe oublié',
    };

    return SafeArea(
      child: SingleChildScrollView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: EdgeInsets.fromLTRB(
          20,
          72,
          20,
          20 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: _sentNotice != null
            ? _sent(theme, p)
            : Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    title,
                    style: theme.textTheme.titleLarge?.copyWith(fontSize: 28),
                  ),
                  if (_mode == AuthMode.forgot) ...[
                    const SizedBox(height: 8),
                    Text(
                      "Indique l'adresse e-mail de ton compte. On t'enverra un lien pour choisir un nouveau mot de passe.",
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: p.fgMuted,
                      ),
                    ),
                  ],
                  const SizedBox(height: 24),
                  if (signUp) ...[
                    AppTextField(
                      fieldKey: const Key('signup-name'),
                      label: 'Ton prénom',
                      controller: _name,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.givenName],
                    ),
                    const SizedBox(height: 16),
                  ],
                  AppTextField(
                    fieldKey: const Key('auth-email'),
                    label: 'Adresse e-mail',
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                    autofillHints: const [AutofillHints.email],
                  ),
                  if (signUp) ...[
                    const SizedBox(height: 16),
                    _communeField(theme, p),
                    const SizedBox(height: 16),
                    AppTextField(
                      fieldKey: const Key('signup-address'),
                      label: 'Adresse',
                      hint: 'Rue, quartier, repère',
                      controller: _address,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.fullStreetAddress],
                    ),
                  ],
                  if (_mode != AuthMode.forgot) ...[
                    const SizedBox(height: 16),
                    AppTextField(
                      fieldKey: const Key('auth-password'),
                      label: 'Mot de passe',
                      controller: _password,
                      obscureText: true,
                      textInputAction: TextInputAction.done,
                      onSubmitted: (_) => _submit(),
                      autofillHints: [
                        signUp
                            ? AutofillHints.newPassword
                            : AutofillHints.password,
                      ],
                    ),
                  ],
                  if (signUp) ...[
                    const SizedBox(height: 8),
                    for (final c in passwordChecks(_password.text, _email.text))
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Row(
                          children: [
                            Icon(
                              c.ok
                                  ? Icons.check_circle_rounded
                                  : Icons.circle_outlined,
                              size: 16,
                              color: c.ok ? p.success : p.fgMuted,
                            ),
                            const SizedBox(width: 8),
                            Flexible(
                              child: Text(
                                c.label,
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: c.ok ? p.success : p.fgMuted,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    CheckboxListTile(
                      key: const Key('signup-consent'),
                      contentPadding: EdgeInsets.zero,
                      controlAffinity: ListTileControlAffinity.leading,
                      value: _consent,
                      onChanged: (v) => setState(() => _consent = v ?? false),
                      title: Text(
                        "J'accepte les règles de confidentialité de BTM AI.",
                        style: theme.textTheme.bodySmall,
                      ),
                    ),
                  ],
                  if (_mode == AuthMode.signIn)
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                        onPressed: () => _switch(AuthMode.forgot),
                        child: const Text('Mot de passe oublié ?'),
                      ),
                    ),
                  if (_error != null) ...[
                    const SizedBox(height: 8),
                    _ErrorBox(
                      message: _error!,
                      action: _needsConfirmation
                          ? TextButton(
                              onPressed: _resend,
                              child: const Text("Renvoyer l'e-mail"),
                            )
                          : null,
                    ),
                  ],
                  const SizedBox(height: 12),
                  PrimaryButton(
                    label: switch (_mode) {
                      AuthMode.signIn => 'Se connecter',
                      AuthMode.signUp => 'Créer mon compte',
                      AuthMode.forgot => 'Envoyer le lien',
                    },
                    loading: _pending,
                    onPressed: _submit,
                  ),
                  TextButton(
                    onPressed: _mode == AuthMode.signIn
                        ? widget.onBack
                        : () => _switch(AuthMode.signIn),
                    child: Text(
                      _mode == AuthMode.signIn
                          ? 'Retour'
                          : 'Retour à la connexion',
                    ),
                  ),
                ],
              ),
      ),
    );
  }

  Widget _communeField(ThemeData theme, TamilyaPalette p) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Ta commune', style: theme.textTheme.bodyMedium),
        const SizedBox(height: 6),
        DropdownButtonFormField<String>(
          key: const Key('signup-commune'),
          initialValue: _commune,
          isExpanded: true,
          hint: const Text('Choisis ta commune'),
          items: [
            for (final c in kMayotteCommunes)
              DropdownMenuItem(value: c, child: Text(c)),
          ],
          onChanged: (v) => setState(() => _commune = v),
          decoration: InputDecoration(
            errorText: _submitted && _commune == null
                ? 'Choisis ta commune.'
                : null,
          ),
        ),
      ],
    );
  }

  Widget _sent(ThemeData theme, TamilyaPalette p) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          _sentTitle!,
          style: theme.textTheme.titleLarge?.copyWith(fontSize: 28),
        ),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(Gaps.lg),
          decoration: BoxDecoration(
            color: p.accentSoft,
            borderRadius: BorderRadius.circular(Radii.field),
          ),
          child: Text(
            _sentNotice!,
            key: const Key('auth-sent'),
            style: theme.textTheme.bodyMedium,
          ),
        ),
        const SizedBox(height: 16),
        PrimaryButton(
          label: 'Retour à la connexion',
          onPressed: () => setState(() {
            _sentNotice = null;
            _mode = AuthMode.signIn;
          }),
        ),
      ],
    );
  }
}

class _ErrorBox extends StatelessWidget {
  const _ErrorBox({required this.message, this.action});

  final String message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Semantics(
      liveRegion: true,
      child: Container(
        key: const Key('auth-error'),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: p.dangerSoft,
          borderRadius: BorderRadius.circular(Radii.field),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              message,
              style: Theme.of(context).textTheme.bodyMedium
                  ?.copyWith(color: p.danger),
            ),
            ?action,
          ],
        ),
      ),
    );
  }
}
