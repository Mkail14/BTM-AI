package yt.tamilya.app;

import android.content.Context;
import android.content.res.Configuration;
import android.graphics.Typeface;
import android.os.Build;

/**
 * Couleurs et police du site (src/app/globals.css, layout.tsx), en clair ou en sombre comme le
 * téléphone. L'accueil et la conversation natifs doivent être exactement le site : même rose
 * (--persona de la personnalité « professionnelle », #c8295f, qui teinte la zone de
 * conversation, le globe, le bouton d'envoi), mêmes gris, même police Geist.
 */
final class SiteTheme {
    final boolean dark;
    /** Écran d'au moins 640 dp de large (préfixe « sm: » de Tailwind) : tablette. */
    final boolean wide;
    final int bg, bgSubtle, bgMuted, fg, fgMuted, border, accent, accentFg, accentSoft;
    final int danger, dangerSoft, warning, warningFg, warningSoft, success;
    /** --persona : couleur de Tamilya, la même en clair et en sombre (personality-looks.ts). */
    final int persona = 0xFFC8295F;
    /** Fond de la conversation, teinté par --persona (.persona-surface). */
    final int personaSurface;
    /** Fond des bulles de la personne et des icônes des idées (--persona-soft). */
    final int personaSoft;
    /** Bord de la barre d'écriture et du « + » (--persona-border). */
    final int personaBorder;
    /** Halo rose en haut de la conversation (--persona-glow) : part de --persona à cette opacité. */
    final float personaGlow;
    /** Couleur des courbes du lagon (.fond-lagon) et leur opacité. */
    final int lagon;
    final float lagonOpacity;

    /** Geist : la famille (400, 500, 600, 700, italique), puis chaque graisse à part. */
    final Typeface sans, medium, semibold, bold, mono;

    private SiteTheme(Context context, boolean dark, boolean wide) {
        this.dark = dark;
        this.wide = wide;
        if (dark) {
            bg = 0xFF131516; bgSubtle = 0xFF1A1D1E; bgMuted = 0xFF24282A;
            fg = 0xFFECEDEE; fgMuted = 0xFF9BA3A7; border = 0xFF2D3234;
            accent = 0xFFF06A9B; accentFg = 0xFF2A0815; accentSoft = 0xFF3A1626;
            danger = 0xFFF97066; dangerSoft = 0xFF3A1B18;
            warning = 0xFFF5B84A; warningFg = 0xFF2A1A03; warningSoft = 0xFF352C14;
            success = 0xFF4CCB7A;
            personaSurface = mix(persona, 0.07f, bg);
            personaSoft = mix(persona, 0.22f, bg);
            personaBorder = mix(persona, 0.45f, border);
            personaGlow = 0.20f;
            lagon = 0xFF2AD1C4;
            lagonOpacity = 0.20f;
        } else {
            bg = 0xFFFFFFFF; bgSubtle = 0xFFF7F7F5; bgMuted = 0xFFEFEFEC;
            fg = 0xFF16191B; fgMuted = 0xFF5D6468; border = 0xFFE3E3DF;
            accent = 0xFFC8295F; accentFg = 0xFFFFFFFF; accentSoft = 0xFFFCEAF1;
            danger = 0xFFB42318; dangerSoft = 0xFFFDECEA;
            warning = 0xFFB45309; warningFg = 0xFFFFFFFF; warningSoft = 0xFFFFF6E0;
            success = 0xFF15803D;
            personaSurface = mix(persona, 0.04f, bg);
            personaSoft = mix(persona, 0.11f, bg);
            personaBorder = mix(persona, 0.30f, border);
            personaGlow = 0.11f;
            lagon = 0xFF14A89E;
            lagonOpacity = 0.12f;
        }
        sans = font(context, R.font.geist);
        medium = weight(context, 500, R.font.geist_medium);
        semibold = weight(context, 600, R.font.geist_semibold);
        bold = weight(context, 700, R.font.geist_bold);
        mono = font(context, R.font.geist_mono);
    }

    static SiteTheme of(Context context) {
        Configuration c = context.getResources().getConfiguration();
        int mode = c.uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return new SiteTheme(context, mode == Configuration.UI_MODE_NIGHT_YES, c.screenWidthDp >= 640);
    }

    private static Typeface font(Context context, int id) {
        try {
            Typeface font = context.getResources().getFont(id);
            if (font != null) return font;
        } catch (RuntimeException ignored) {
            // Police absente : celle du téléphone.
        }
        return Typeface.SANS_SERIF;
    }

    private Typeface weight(Context context, int weight, int fallbackId) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && sans != Typeface.SANS_SERIF) {
            return Typeface.create(sans, weight, false);
        }
        return font(context, fallbackId);
    }

    /** color-mix(in srgb, a p%, b) du CSS. */
    static int mix(int a, float p, int b) {
        int r = Math.round(((a >> 16) & 0xFF) * p + ((b >> 16) & 0xFF) * (1 - p));
        int g = Math.round(((a >> 8) & 0xFF) * p + ((b >> 8) & 0xFF) * (1 - p));
        int bl = Math.round((a & 0xFF) * p + (b & 0xFF) * (1 - p));
        return 0xFF000000 | (r << 16) | (g << 8) | bl;
    }

    /** Une couleur avec une opacité (rgb(... / a) du CSS). */
    static int alpha(int color, float a) {
        return (Math.round(a * 255f) << 24) | (color & 0xFFFFFF);
    }
}
