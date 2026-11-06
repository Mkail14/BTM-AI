package yt.tamilya.app.connect;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.bluetooth.BluetoothAdapter;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import yt.tamilya.app.MainActivity;

/**
 * Relais en arrière-plan : garde Tamilya Connect actif quand l'app n'est plus à l'écran.
 * Android exige une notification, mais la personne sait déjà que le relais tourne : elle
 * ne doit pas être dérangée. Sans l'autorisation des notifications (retirée du manifeste),
 * Android 13 et plus la cachent ; avant, elle est au niveau le plus discret.
 */
public final class RelayService extends Service {
    private static final String TAG = "TamilyaConnect";
    private static final String CHANNEL = "relais_discret";
    /** Ancien canal, plus visible : retiré des téléphones déjà installés. */
    private static final String OLD_CHANNEL = "relais";
    private static final String ACTION_STOP = "yt.tamilya.app.STOP_RELAY";
    private static final String ACTION_REVIVE = "yt.tamilya.app.REVIVE_RELAY";
    private static final int NOTIFICATION_ID = 7;

    private static volatile boolean running;

    private final Handler main = new Handler(Looper.getMainLooper());
    private ConnectivityManager connectivity;
    private ConnectivityManager.NetworkCallback networkCallback;
    private MeshRelay mesh;
    /** Bluetooth rallumé : personne n'est là pour rouvrir l'app, le relais repart seul. */
    private final BroadcastReceiver radio = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, -1) != BluetoothAdapter.STATE_ON) return;
            Log.i(TAG, "Bluetooth rallumé : le relais repart");
            mesh.stop();
            mesh.start();
        }
    };

    static boolean isRunning() {
        return running;
    }

    /** À appeler quand l'app est à l'écran : Android refuse ce démarrage depuis l'arrière-plan. */
    static void start(Context context) {
        if (running) return;
        try {
            context.startForegroundService(new Intent(context, RelayService.class));
        } catch (RuntimeException e) {
            Log.w(TAG, "Relais d'arrière-plan refusé : " + e.getClass().getSimpleName());
        }
    }

    /** Depuis le gardien : Android ne l'accepte que si l'app n'est pas limitée sur la batterie. */
    static void revive(Context context) {
        if (running) return;
        try {
            context.startForegroundService(new Intent(context, RelayService.class).setAction(ACTION_REVIVE));
        } catch (RuntimeException e) {
            Log.w(TAG, "Relance du relais refusée : " + e.getClass().getSimpleName());
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            RelayWatch.cancel(this);
            stopSelf();
            return START_NOT_STICKY;
        }
        // Relance sans l'app à l'écran : rythme économe, l'écran le remet à son retour.
        boolean revived = intent == null || ACTION_REVIVE.equals(intent.getAction());
        try {
            // Toujours, même déjà actif : Android l'exige après un démarrage au premier plan.
            show();
        } catch (RuntimeException e) {
            // Redémarrage par Android sans l'app à l'écran : refusé ; on reprendra à la prochaine ouverture.
            Log.w(TAG, "Relais d'arrière-plan refusé : " + e.getClass().getSimpleName());
            stopSelf();
            return START_NOT_STICKY;
        }
        if (running) return START_STICKY;
        running = true;
        Log.i(TAG, revived ? "Relais relancé sans l'app" : "Relais d'arrière-plan actif");
        mesh = MeshRelay.shared(this);
        if (revived) mesh.setOnScreen(false);
        mesh.start();
        watchNetwork();
        registerReceiver(radio, new IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED));
        RelayWatch.watch(this);
        return START_STICKY;
    }

    /** L'app est balayée : le service survit en général, mais certains téléphones le tuent juste après. */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        Log.i(TAG, "App balayée : le relais continue");
        RelayWatch.checkSoon(this);
        super.onTaskRemoved(rootIntent);
    }

    private void show() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.deleteNotificationChannel(OLD_CHANNEL);
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Relais Tamilya Connect", NotificationManager.IMPORTANCE_MIN);
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), flags);
        PendingIntent stop = PendingIntent.getService(this, 1,
                new Intent(this, RelayService.class).setAction(ACTION_STOP), flags);
        Notification notification = new Notification.Builder(this, CHANNEL)
                .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
                .setContentTitle("Tamilya Connect")
                .setContentIntent(open)
                .setOngoing(true)
                .setShowWhen(false)
                .setVisibility(Notification.VISIBILITY_SECRET)
                .addAction(new Notification.Action.Builder(null, "Arrêter", stop).build())
                .build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    /** L'app peut être fermée : le relais doit savoir seul s'il a internet. */
    private void watchNetwork() {
        connectivity = getSystemService(ConnectivityManager.class);
        if (connectivity == null) return;
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onCapabilitiesChanged(Network network, NetworkCapabilities caps) {
                boolean validated = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
                main.post(() -> mesh.setOnline(validated));
            }

            @Override
            public void onLost(Network network) {
                main.post(() -> mesh.setOnline(false));
            }
        };
        connectivity.registerDefaultNetworkCallback(networkCallback);
    }

    @Override
    public void onDestroy() {
        if (running) {
            Log.i(TAG, "Relais d'arrière-plan arrêté");
            unregisterReceiver(radio);
        }
        running = false;
        if (connectivity != null && networkCallback != null) connectivity.unregisterNetworkCallback(networkCallback);
        if (mesh != null) mesh.stop();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
