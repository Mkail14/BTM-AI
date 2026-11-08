package yt.tamilya.app;

/**
 * Évite la boucle sans fin quand le moteur d'affichage s'arrête à chaque ouverture
 * de la même page : au-delà de quelques arrêts rapprochés, on ne relance plus.
 * Gardé en mémoire du processus de l'app (recreate() ne le tue pas).
 */
final class CrashGuard {
    static final int MAX_RESTARTS = 3;
    static final long WINDOW_MS = 60_000;

    private final long[] times = new long[MAX_RESTARTS];
    private int count;

    /** Vrai si l'on peut relancer l'écran après un arrêt survenu à {@code now}. */
    synchronized boolean allowRestart(long now) {
        int recent = 0;
        for (int i = 0; i < Math.min(count, MAX_RESTARTS); i++) {
            if (now - times[i] < WINDOW_MS) recent++;
        }
        times[count % MAX_RESTARTS] = now;
        count++;
        return recent < MAX_RESTARTS;
    }
}
