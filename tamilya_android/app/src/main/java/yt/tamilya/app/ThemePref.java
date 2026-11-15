package yt.tamilya.app;

import android.content.Context;
import android.content.res.Configuration;

/**
 * Choix de Paramètres › Apparence du site (« Comme mon appareil », « Clair », « Sombre »), retenu
 * par l'app pour que l'accueil, la conversation et Tamilya Connect natifs aient le même thème que
 * les pages du site. Le site le garde dans son localStorage (clé btm-theme) ; pageScript le
 * transmet à chaque page et à chaque changement.
 */
final class ThemePref {
    private static final String PREFS = "tamilya-theme";
    private static final String KEY = "choice";

    private ThemePref() {}

    private static String choice(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "system");
    }

    /** Retient le choix ; vrai s'il a changé. */
    static boolean save(Context context, String choice) {
        String value = "dark".equals(choice) || "light".equals(choice) ? choice : "system";
        if (value.equals(choice(context))) return false;
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, value).apply();
        return true;
    }

    /** Thème voulu : le choix, sinon celui du téléphone. */
    static boolean dark(Context context) {
        String choice = choice(context);
        if ("dark".equals(choice)) return true;
        if ("light".equals(choice)) return false;
        // Le contexte de l'application n'est pas forcé : il donne le réglage du téléphone.
        return night(context.getApplicationContext());
    }

    /** Thème du contexte donné (celui de l'écran, une fois forcé par forced()). */
    static boolean night(Context context) {
        int mode = context.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return mode == Configuration.UI_MODE_NIGHT_YES;
    }

    /** Réglage à imposer à l'écran (clair ou sombre choisi), ou null pour suivre le téléphone. */
    static Configuration forced(Context base) {
        String choice = choice(base);
        if (!"dark".equals(choice) && !"light".equals(choice)) return null;
        Configuration forced = new Configuration();
        forced.uiMode = "dark".equals(choice) ? Configuration.UI_MODE_NIGHT_YES : Configuration.UI_MODE_NIGHT_NO;
        return forced;
    }
}
