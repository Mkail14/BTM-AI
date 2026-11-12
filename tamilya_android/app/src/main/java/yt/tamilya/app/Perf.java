package yt.tamilya.app;

import android.os.SystemClock;
import android.os.Trace;
import android.util.Log;
import android.view.View;
import android.view.ViewTreeObserver;

/**
 * Mesures de vitesse, seulement dans la version de test (APK debug) : temps écrits dans
 * logcat sous « TamilyaPerf ». La version publiée ne mesure rien et n'écrit rien.
 */
public final class Perf {
    private static final String TAG = "TamilyaPerf";
    /** Allumé par MainActivity quand l'app est une version de test. */
    static boolean on;

    private Perf() {}

    public static long start(String what) {
        if (!on) return 0L;
        Trace.beginSection(what);
        return SystemClock.elapsedRealtimeNanos();
    }

    public static void end(String what, long startNs) {
        if (!on) return;
        Trace.endSection();
        Log.i(TAG, what + " " + ms(startNs) + " ms");
    }

    /** Étape repérée depuis un départ (sans section de trace) : ex. « page.visible 812 ms ». */
    public static void mark(String what, long startNs) {
        if (!on || startNs == 0L) return;
        Log.i(TAG, what + " " + ms(startNs) + " ms");
    }

    /** Temps jusqu'au prochain dessin de cette vue : ce que la personne voit vraiment. */
    public static void untilDrawn(String what, View view, long startNs) {
        if (!on || view == null) return;
        ViewTreeObserver tree = view.getViewTreeObserver();
        tree.addOnDrawListener(new ViewTreeObserver.OnDrawListener() {
            private boolean done;

            @Override
            public void onDraw() {
                if (done) return;
                done = true;
                Log.i(TAG, what + " dessine " + ms(startNs) + " ms");
                // Impossible de se retirer pendant le dessin : juste après.
                view.post(() -> view.getViewTreeObserver().removeOnDrawListener(this));
            }
        });
        view.invalidate();
    }

    private static String ms(long startNs) {
        return String.format(java.util.Locale.ROOT, "%.1f", (SystemClock.elapsedRealtimeNanos() - startNs) / 1e6);
    }
}
