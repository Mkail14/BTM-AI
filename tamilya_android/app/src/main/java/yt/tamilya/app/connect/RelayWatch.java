package yt.tamilya.app.connect;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;

/**
 * Gardien du relais : Android le lance même si l'app a été tuée (balayage sur certains
 * téléphones, manque de mémoire) ou si le téléphone a redémarré. Il rallume RelayService.
 * Android ne l'autorise depuis l'arrière-plan que si l'app n'est pas limitée par
 * l'économie de batterie (demandé une fois, voir TamilyaConnect).
 */
public final class RelayWatch extends JobService {
    private static final int EVERY_15_MIN = 71;
    private static final int RIGHT_NOW = 72;
    private static final long PERIOD_MS = 15 * 60 * 1000L;
    private static final long SOON_MS = 5_000;

    /** Le relais tourne : le gardien veille, redémarrage du téléphone compris. */
    static void watch(Context context) {
        JobScheduler jobs = context.getSystemService(JobScheduler.class);
        if (jobs == null || jobs.getPendingJob(EVERY_15_MIN) != null) return;
        jobs.schedule(new JobInfo.Builder(EVERY_15_MIN, new ComponentName(context, RelayWatch.class))
                .setPeriodic(PERIOD_MS)
                .setPersisted(true)
                .build());
    }

    /** L'app vient d'être balayée : on vérifie tout de suite, sans attendre le quart d'heure. */
    static void checkSoon(Context context) {
        JobScheduler jobs = context.getSystemService(JobScheduler.class);
        if (jobs == null) return;
        jobs.schedule(new JobInfo.Builder(RIGHT_NOW, new ComponentName(context, RelayWatch.class))
                .setMinimumLatency(SOON_MS)
                .setOverrideDeadline(SOON_MS * 2)
                .build());
    }

    /** « Arrêter » dans la notification : le relais ne revient plus de lui-même. */
    static void cancel(Context context) {
        JobScheduler jobs = context.getSystemService(JobScheduler.class);
        if (jobs != null) jobs.cancelAll();
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        RelayService.revive(this);
        return false;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return false;
    }
}
