import 'dart:ui';

/// Jeu de couleurs Tamilya. Source : docs/audit/03-uiux.md §1
/// (reprise de `src/app/globals.css` du dépôt web). Unique fichier de couleurs.
class TamilyaPalette {
  const TamilyaPalette({
    required this.bg,
    required this.bgSubtle,
    required this.bgMuted,
    required this.fg,
    required this.fgMuted,
    required this.border,
    required this.accent,
    required this.accentHover,
    required this.accentFg,
    required this.accentSoft,
    required this.danger,
    required this.dangerSoft,
    required this.warning,
    required this.warningSoft,
    required this.success,
    required this.successSoft,
    required this.focus,
    required this.onDanger,
    required this.isDark,
  });

  final Color bg;
  final Color bgSubtle;
  final Color bgMuted;
  final Color fg;
  final Color fgMuted;
  final Color border;
  final Color accent;
  final Color accentHover;
  final Color accentFg;
  final Color accentSoft;
  final Color danger;
  final Color dangerSoft;
  final Color warning;
  final Color warningSoft;
  final Color success;
  final Color successSoft;
  final Color focus;
  final Color onDanger;
  final bool isDark;

  /// Persona par défaut du web (`--persona`), identique dans les deux thèmes.
  static const Color persona = Color(0xFFC8295F);

  /// Fond de conversation : persona à 4 % (clair) / 7 % (sombre) sur `bg`.
  Color get personaSurface => Color.lerp(bg, persona, isDark ? 0.07 : 0.04)!;

  /// Bulle utilisateur, avatar : persona à 11 % / 22 % (globals.css:94-125).
  Color get userBubble => Color.lerp(bg, persona, isDark ? 0.22 : 0.11)!;

  /// Bordure du composer : persona à 30 % / 45 % sur `border`.
  Color get composerBorder =>
      Color.lerp(border, persona, isDark ? 0.45 : 0.30)!;

  /// Halo du haut de conversation : persona à 11 % / 20 %.
  Color get personaGlow => persona.withValues(alpha: isDark ? 0.20 : 0.11);

  /// Couleurs « Google » des courbes et du mot en dégradé.
  List<Color> get rainbow => isDark
      ? const [
          Color(0xFF4285F4),
          Color(0xFF9B72CB),
          Color(0xFFEA4335),
          Color(0xFFFBBC05),
          Color(0xFF34A853),
        ]
      : const [
          Color(0xFF1A73E8),
          Color(0xFF8E5BC4),
          Color(0xFFD93025),
          Color(0xFFE37400),
          Color(0xFF188038),
        ];

  static const TamilyaPalette light = TamilyaPalette(
    bg: Color(0xFFFFFFFF),
    bgSubtle: Color(0xFFF7F7F5),
    bgMuted: Color(0xFFEFEFEC),
    fg: Color(0xFF16191B),
    fgMuted: Color(0xFF5D6468),
    border: Color(0xFFE3E3DF),
    accent: Color(0xFFC8295F),
    accentHover: Color(0xFFA91F4F),
    accentFg: Color(0xFFFFFFFF),
    accentSoft: Color(0xFFFCEAF1),
    danger: Color(0xFFB42318),
    dangerSoft: Color(0xFFFDECEA),
    warning: Color(0xFFB45309),
    warningSoft: Color(0xFFFFF6E0),
    success: Color(0xFF15803D),
    successSoft: Color(0xFFE8F6ED),
    focus: Color(0xFFC8295F),
    onDanger: Color(0xFFFFFFFF),
    isDark: false,
  );

  static const TamilyaPalette dark = TamilyaPalette(
    bg: Color(0xFF131516),
    bgSubtle: Color(0xFF1A1D1E),
    bgMuted: Color(0xFF24282A),
    fg: Color(0xFFECEDEE),
    fgMuted: Color(0xFF9BA3A7),
    border: Color(0xFF2D3234),
    accent: Color(0xFFF06A9B),
    accentHover: Color(0xFFF58BB2),
    accentFg: Color(0xFF2A0815),
    accentSoft: Color(0xFF3A1626),
    danger: Color(0xFFF97066),
    dangerSoft: Color(0xFF3A1B18),
    warning: Color(0xFFF5B84A),
    warningSoft: Color(0xFF352C14),
    success: Color(0xFF4CCB7A),
    successSoft: Color(0xFF14301F),
    focus: Color(0xFFF58BB2),
    onDanger: Color(0xFF131516),
    isDark: true,
  );
}

/// Couleurs de marque (écran de lancement : crème sur encre).
abstract final class BrandColors {
  static const Color ink = Color(0xFF111111);
  static const Color cream = Color(0xFFF5EAD9);
}

/// Rayons en dp (03-uiux.md §1).
abstract final class Radii {
  static const double bubble = 24;
  static const double bubbleTail = 8;
  static const double composer = 25.6;
  static const double field = 12;
  static const double sheet = 26;
  static const double dialog = 24;
}

/// Échelle d'espacement de 4 dp.
abstract final class Gaps {
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;
}

/// Largeur du tiroir : 288 dp (85 % de l'écran au plus, géré par le Drawer).
const double kDrawerWidth = 288;
