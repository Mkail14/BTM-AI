package yt.tamilya.app.connect;

import android.content.Context;
import android.content.res.Configuration;

/**
 * Couleurs de Tamilya Connect : exactement celles du site (src/app/globals.css), en clair ou en sombre
 * comme le téléphone. Connect ne doit pas avoir l'air d'une autre app : seule la connexion change.
 */
final class ConnectTheme {
    final boolean dark;
    final int bg, bgSubtle, bgMuted, fg, fgMuted, border, accent, accentFg, accentSoft;
    final int danger, dangerSoft, warning, warningSoft;

    private ConnectTheme(boolean dark) {
        this.dark = dark;
        if (dark) {
            bg = 0xFF131516; bgSubtle = 0xFF1A1D1E; bgMuted = 0xFF24282A;
            fg = 0xFFECEDEE; fgMuted = 0xFF9BA3A7; border = 0xFF2D3234;
            accent = 0xFFF06A9B; accentFg = 0xFF2A0815; accentSoft = 0xFF3A1626;
            danger = 0xFFF97066; dangerSoft = 0xFF3A1B18;
            warning = 0xFFF5B84A; warningSoft = 0xFF352C14;
        } else {
            bg = 0xFFFFFFFF; bgSubtle = 0xFFF7F7F5; bgMuted = 0xFFEFEFEC;
            fg = 0xFF16191B; fgMuted = 0xFF5D6468; border = 0xFFE3E3DF;
            accent = 0xFFC8295F; accentFg = 0xFFFFFFFF; accentSoft = 0xFFFCEAF1;
            danger = 0xFFB42318; dangerSoft = 0xFFFDECEA;
            warning = 0xFFB45309; warningSoft = 0xFFFFF6E0;
        }
    }

    static ConnectTheme of(Context context) {
        int mode = context.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return new ConnectTheme(mode == Configuration.UI_MODE_NIGHT_YES);
    }

    /** color-mix(in srgb, a p%, b) du CSS. */
    static int mix(int a, float p, int b) {
        int r = Math.round(((a >> 16) & 0xFF) * p + ((b >> 16) & 0xFF) * (1 - p));
        int g = Math.round(((a >> 8) & 0xFF) * p + ((b >> 8) & 0xFF) * (1 - p));
        int bl = Math.round((a & 0xFF) * p + (b & 0xFF) * (1 - p));
        return 0xFF000000 | (r << 16) | (g << 8) | bl;
    }
}
