import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'tokens.dart';

/// Extension donnant accès aux tokens non couverts par `ColorScheme`.
@immutable
class TamilyaColors extends ThemeExtension<TamilyaColors> {
  const TamilyaColors(this.palette);

  final TamilyaPalette palette;

  @override
  TamilyaColors copyWith({TamilyaPalette? palette}) =>
      TamilyaColors(palette ?? this.palette);

  // Pas d'animation de palette en C2 : bascule franche entre clair et sombre.
  @override
  TamilyaColors lerp(ThemeExtension<TamilyaColors>? other, double t) =>
      other is TamilyaColors && t >= 0.5 ? other : this;
}

extension TamilyaThemeContext on BuildContext {
  TamilyaPalette get palette =>
      Theme.of(this).extension<TamilyaColors>()!.palette;
}

/// Police : Geist n'est pas embarquée en C2 (voir docs/missions/C2-flutter.md).
/// Renseigner ici le nom de la famille quand les fichiers seront ajoutés.
const String? kFontFamily = null;

abstract final class AppTheme {
  static ThemeData get light => _build(TamilyaPalette.light, Brightness.light);
  static ThemeData get dark => _build(TamilyaPalette.dark, Brightness.dark);

  static ThemeData _build(TamilyaPalette p, Brightness brightness) {
    final isLight = brightness == Brightness.light;
    final scheme = ColorScheme(
      brightness: brightness,
      primary: p.accent,
      onPrimary: p.accentFg,
      secondary: p.accent,
      onSecondary: p.accentFg,
      error: p.danger,
      onError: p.onDanger,
      surface: p.bg,
      onSurface: p.fg,
      onSurfaceVariant: p.fgMuted,
      outline: p.border,
      outlineVariant: p.border,
      primaryContainer: p.accentSoft,
      onPrimaryContainer: p.fg,
      errorContainer: p.dangerSoft,
      onErrorContainer: p.danger,
      surfaceContainerLowest: p.bg,
      surfaceContainerLow: p.bgSubtle,
      surfaceContainer: p.bgSubtle,
      surfaceContainerHigh: p.bgMuted,
      surfaceContainerHighest: p.bgMuted,
    );

    final overlay = isLight
        ? SystemUiOverlayStyle.dark
        : SystemUiOverlayStyle.light;
    final fieldBorder = OutlineInputBorder(
      borderRadius: BorderRadius.circular(Radii.field),
      borderSide: BorderSide(color: p.border),
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      fontFamily: kFontFamily,
      scaffoldBackgroundColor: p.bg,
      dividerColor: p.border,
      focusColor: p.focus,
      extensions: [TamilyaColors(p)],
      textTheme: _textTheme(p),
      appBarTheme: AppBarTheme(
        backgroundColor: p.bg,
        foregroundColor: p.fg,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        systemOverlayStyle: overlay.copyWith(
          statusBarColor: const Color(0x00000000),
        ),
      ),
      drawerTheme: DrawerThemeData(
        backgroundColor: p.bgSubtle,
        width: kDrawerWidth,
      ),
      dividerTheme: DividerThemeData(color: p.border, space: 1, thickness: 1),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: p.bg,
        hintStyle: TextStyle(color: p.fgMuted),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: Gaps.lg,
          vertical: 14,
        ),
        border: fieldBorder,
        enabledBorder: fieldBorder,
        focusedBorder: fieldBorder.copyWith(
          borderSide: BorderSide(color: p.focus, width: 2),
        ),
        errorBorder: fieldBorder.copyWith(
          borderSide: BorderSide(color: p.danger),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: p.accent,
          foregroundColor: p.accentFg,
          minimumSize: const Size.fromHeight(48),
          shape: const StadiumBorder(),
        ),
      ),
      listTileTheme: ListTileThemeData(
        iconColor: p.fgMuted,
        textColor: p.fg,
        minTileHeight: 48,
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: p.fg,
        contentTextStyle: TextStyle(color: p.bg),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  /// Corps 16, secondaire 14, légendes 12 (03-uiux.md §1).
  static TextTheme _textTheme(TamilyaPalette p) => TextTheme(
    titleLarge: TextStyle(
      fontSize: 20,
      fontWeight: FontWeight.w600,
      color: p.fg,
    ),
    titleMedium: TextStyle(
      fontSize: 16,
      fontWeight: FontWeight.w600,
      color: p.fg,
    ),
    bodyLarge: TextStyle(fontSize: 16, height: 1.6, color: p.fg),
    bodyMedium: TextStyle(fontSize: 14, height: 1.5, color: p.fg),
    bodySmall: TextStyle(fontSize: 12, color: p.fgMuted),
    labelLarge: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
  );
}
