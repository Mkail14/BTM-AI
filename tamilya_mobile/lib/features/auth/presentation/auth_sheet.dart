import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/feature_flags.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.dart';

import '../../../shared/widgets/lagon_background.dart';
import '../../../shared/widgets/primary_button.dart';
import 'auth_forms.dart';

/// Texte du web quand la connexion est demandée au premier envoi.
const String kSignupReason =
    'Crée ton compte gratuit pour continuer à parler avec Tamilya.';

/// Ouvre la feuille de connexion / inscription. Renvoie vrai si l'utilisateur
/// s'est connecté. Feuille du bas (rayon haut 26, fond bgSubtle, poignée).
Future<bool> showAuthSheet(
  BuildContext context, {
  String? reason,
  bool signup = false,
}) async {
  final result = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    barrierColor: const Color(0x8C000000),
    builder: (_) => AuthSheet(reason: reason, signup: signup),
  );
  return result ?? false;
}

class AuthSheet extends ConsumerStatefulWidget {
  const AuthSheet({super.key, this.reason, this.signup = false});

  final String? reason;
  final bool signup;

  @override
  ConsumerState<AuthSheet> createState() => _AuthSheetState();
}

class _AuthSheetState extends ConsumerState<AuthSheet> {
  late bool _signup = widget.signup;
  bool _form = false;

  void _soon() {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(const SnackBar(content: Text('Bientôt disponible.')));
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final height = MediaQuery.sizeOf(context).height;
    return ClipRRect(
      borderRadius: const BorderRadius.vertical(
        top: Radius.circular(Radii.sheet),
      ),
      child: Material(
        color: p.bgSubtle,
        child: SizedBox(
          height: height - 44,
          child: Stack(
            children: [
              Positioned.fill(
                child: LagonBackground(
                  style: LagonStyle.persona,
                  colors: [p.accent, p.accent],
                  opacity: p.isDark ? 0.14 : 0.10,
                  topClear: 0,
                ),
              ),
              Positioned(
                top: 10,
                left: 0,
                right: 0,
                child: Center(
                  child: Container(
                    width: 36,
                    height: 4,
                    decoration: BoxDecoration(
                      color: p.fg.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
              ),
              _form
                  ? AuthFormView(
                      key: ValueKey(_signup),
                      initialMode: _signup ? AuthMode.signUp : AuthMode.signIn,
                      onSignedIn: () => Navigator.of(context).pop(true),
                      onBack: () => setState(() => _form = false),
                    )
                  : _welcome(context, p),
              Positioned(
                top: 14,
                right: 14,
                child: IconButton(
                  tooltip: 'Fermer',
                  style: IconButton.styleFrom(
                    fixedSize: const Size(40, 40),
                    backgroundColor: p.fg.withValues(alpha: 0.08),
                  ),
                  icon: const Icon(Icons.close_rounded, size: 18),
                  onPressed: () => Navigator.of(context).pop(false),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _welcome(BuildContext context, TamilyaPalette p) {
    final theme = Theme.of(context);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 56, 24, 16),
        child: Column(
          children: [
            const Spacer(),
            Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(24),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x40111111),
                    blurRadius: 30,
                    offset: Offset(0, 14),
                  ),
                ],
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(24),
                child: Image.asset(
                  'assets/brand/icone-192.png',
                  width: 78,
                  height: 78,
                  errorBuilder: (_, _, _) =>
                      const SizedBox(width: 78, height: 78),
                ),
              ),
            ),
            const SizedBox(height: 28),
            Text(
              _signup ? 'Rejoins\nBTM AI' : 'Bienvenue chez\nBTM AI',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 36,
                height: 0.95,
                letterSpacing: -1.2,
                color: p.fg,
                fontVariations: wght(700),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'Pose tes questions à Tamilya.\nRetrouve tes conversations partout.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyLarge?.copyWith(
                fontSize: 15,
                color: p.fgMuted,
              ),
            ),
            if (widget.reason != null) ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 10,
                ),
                decoration: BoxDecoration(
                  color: p.accentSoft,
                  border: Border.all(color: p.border),
                  borderRadius: BorderRadius.circular(Radii.field),
                ),
                child: Text(
                  widget.reason!,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontVariations: wght(500),
                  ),
                ),
              ),
            ],
            const Spacer(),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: Column(
                children: [
                  PrimaryButton(
                    label: _signup
                        ? "S'inscrire avec l'e-mail"
                        : "Continuer avec l'e-mail",
                    onPressed: () => setState(() => _form = true),
                  ),
                  if (FeatureFlags.googleSignIn) ...[
                    const SizedBox(height: 10),
                    PrimaryButton(
                      label: _signup
                          ? "S'inscrire avec Google"
                          : 'Continuer avec Google',
                      variant: PrimaryButtonVariant.outline,
                      onPressed: _soon,
                    ),
                  ],
                  if (FeatureFlags.appleSignIn) ...[
                    const SizedBox(height: 10),
                    PrimaryButton(
                      label: 'Continuer avec Apple',
                      variant: PrimaryButtonVariant.outline,
                      onPressed: _soon,
                    ),
                  ],
                  const SizedBox(height: 14),
                  Text.rich(
                    TextSpan(
                      text: _signup
                          ? 'Déjà un compte ? '
                          : 'Pas encore de compte ? ',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: p.fgMuted,
                      ),
                      children: [
                        WidgetSpan(
                          alignment: PlaceholderAlignment.baseline,
                          baseline: TextBaseline.alphabetic,
                          child: GestureDetector(
                            onTap: () => setState(() => _signup = !_signup),
                            child: Text(
                              _signup ? 'Se connecter' : 'Créer un compte',
                              style: theme.textTheme.bodyMedium?.copyWith(
                                color: p.accent,
                                fontVariations: wght(600),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 320),
                    child: Text(
                      "En continuant, tu acceptes les règles de confidentialité de BTM AI.",
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: p.fgMuted.withValues(alpha: 0.8),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
