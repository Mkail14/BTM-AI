package yt.tamilya.app;

import android.app.Activity;
import android.content.Context;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Rect;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.PixelCopy;
import android.view.View;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Image de la dernière page vue, montrée dès l'ouverture de l'app à la place du logo,
 * le temps que tamilya.yt réponde (1 à 2 s depuis Mayotte). Rien n'est cliquable dessus :
 * elle disparaît en fondu dès que la vraie page s'affiche, comme l'écran d'accueil avant.
 *
 * Gardée dans le cache privé de l'app. Une seule image, liée au sens de l'écran, à sa
 * taille et au thème : si l'un change, elle n'est pas montrée.
 */
final class LastPage {
    private static final String TAG = "TamilyaLastPage";
    private static final String PREFIX = "derniere-page-";
    /** Trois quarts de la taille de l'écran : décodage rapide, texte encore net. */
    private static final float SCALE = 0.75f;

    private static final ExecutorService io = Executors.newSingleThreadExecutor();

    private LastPage() {}

    /** Nom lié à l'écran actuel : sens, taille en dp et thème. */
    private static String name(Context context) {
        Configuration c = context.getResources().getConfiguration();
        boolean night = (c.uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        return String.format(Locale.ROOT, "%s%d-%dx%d-%s.jpg", PREFIX, c.orientation,
                c.screenWidthDp, c.screenHeightDp, night ? "n" : "j");
    }

    /** Lit l'image hors du fil de l'écran et la rend sur celui-ci (null si aucune ne convient). */
    static void load(Context context, Callback done) {
        File file = new File(context.getCacheDir(), name(context));
        Handler main = new Handler(Looper.getMainLooper());
        io.execute(() -> {
            Bitmap image = null;
            if (file.isFile()) {
                long t = Perf.start("lastpage.load");
                BitmapFactory.Options o = new BitmapFactory.Options();
                o.inPreferredConfig = Bitmap.Config.RGB_565;
                image = BitmapFactory.decodeFile(file.getPath(), o);
                Perf.end("lastpage.load", t);
            }
            Bitmap result = image;
            main.post(() -> done.loaded(result));
        });
    }

    /** Photographie la page telle qu'elle est à l'écran, puis l'enregistre en arrière-plan. */
    static void save(Activity activity, View page) {
        int w = Math.round(page.getWidth() * SCALE);
        int h = Math.round(page.getHeight() * SCALE);
        if (w <= 0 || h <= 0 || activity.getWindow() == null) return;
        int[] at = new int[2];
        page.getLocationInWindow(at);
        Rect area = new Rect(at[0], at[1], at[0] + page.getWidth(), at[1] + page.getHeight());
        File dir = activity.getCacheDir();
        String name = name(activity);
        Bitmap image;
        try {
            image = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        } catch (OutOfMemoryError e) {
            return;
        }
        try {
            PixelCopy.request(activity.getWindow(), area, image, result -> {
                if (result != PixelCopy.SUCCESS) {
                    image.recycle();
                    return;
                }
                io.execute(() -> write(dir, name, image));
            }, new Handler(Looper.getMainLooper()));
        } catch (IllegalArgumentException e) {
            // Fenêtre déjà retirée de l'écran : pas d'image cette fois.
            image.recycle();
        }
    }

    /** Efface l'image (déconnexion, page en erreur…). */
    static void forget(Context context) {
        File dir = context.getCacheDir();
        io.execute(() -> deleteAll(dir, null));
    }

    private static void write(File dir, String name, Bitmap image) {
        File tmp = new File(dir, name + ".tmp");
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            image.compress(Bitmap.CompressFormat.JPEG, 82, out);
        } catch (IOException e) {
            Log.w(TAG, "image non enregistrée", e);
            tmp.delete();
            return;
        } finally {
            image.recycle();
        }
        deleteAll(dir, name);
        if (!tmp.renameTo(new File(dir, name))) tmp.delete();
    }

    private static void deleteAll(File dir, String keep) {
        File[] files = dir.listFiles((d, n) -> n.startsWith(PREFIX) && !n.equals(keep) && !n.equals(keep + ".tmp"));
        if (files == null) return;
        for (File f : files) f.delete();
    }

    interface Callback {
        void loaded(Bitmap image);
    }
}
