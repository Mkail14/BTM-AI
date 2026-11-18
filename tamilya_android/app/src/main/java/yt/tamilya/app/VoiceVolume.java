package yt.tamilya.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.util.Log;
import android.view.KeyEvent;

import java.util.Calendar;

/**
 * Volume de Tamilya pendant le vocal, réglé selon l'endroit : casque ou haut-parleur, jour ou nuit.
 * Sans réglage de la personne, elle ne fait que baisser (jamais plus fort que le téléphone).
 * Si la personne touche les boutons de volume pendant le vocal, son choix est gardé pour ce cas
 * (par exemple « casque, la nuit ») et repris la fois suivante. Le volume d'avant revient à la fin.
 */
final class VoiceVolume {
    private static final String TAG = "TamilyaVolume";
    private static final String PREFS = "tamilya_volume";
    /** La voix passe par le son des médias, ou par celui des appels quand le micro est ouvert (écho supprimé). */
    private static final int[] STREAMS = {AudioManager.STREAM_MUSIC, AudioManager.STREAM_VOICE_CALL};

    private final AudioManager audio;
    private final SharedPreferences prefs;
    private final Handler main;
    private final int[] before = new int[STREAMS.length];
    private boolean active;
    /** Vocal en cours, même si l'app est passée en arrière-plan. */
    private boolean wanted;
    private String place;

    private final AudioDeviceCallback devices = new AudioDeviceCallback() {
        @Override public void onAudioDevicesAdded(AudioDeviceInfo[] added) { placeChanged(); }
        @Override public void onAudioDevicesRemoved(AudioDeviceInfo[] removed) { placeChanged(); }
    };

    VoiceVolume(Context context, Handler main) {
        this.audio = context.getSystemService(AudioManager.class);
        this.prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        this.main = main;
    }

    /** Début du vocal : on retient le volume du téléphone, puis on règle celui de Tamilya. */
    void start() {
        wanted = true;
        begin();
    }

    /** Fin du vocal. */
    void end() {
        wanted = false;
        stop();
    }

    /** App quittée : le téléphone retrouve son volume ; il revient au retour si le vocal continue. */
    void pause() {
        stop();
    }

    void resume() {
        if (wanted) begin();
    }

    private void begin() {
        if (audio == null || active) return;
        active = true;
        for (int i = 0; i < STREAMS.length; i++) before[i] = audio.getStreamVolume(STREAMS[i]);
        audio.registerAudioDeviceCallback(devices, main);
        apply();
    }

    /** Le téléphone retrouve son volume d'avant. */
    private void stop() {
        if (audio == null || !active) return;
        active = false;
        audio.unregisterAudioDeviceCallback(devices);
        for (int i = 0; i < STREAMS.length; i++) set(STREAMS[i], before[i]);
        Log.i(TAG, "fin, volume d'avant remis");
    }

    /** Boutons de volume pendant le vocal : c'est la personne qui décide, on retient son choix. */
    void onKey(KeyEvent event) {
        if (!active || event.getAction() != KeyEvent.ACTION_UP) return;
        int code = event.getKeyCode();
        if (code != KeyEvent.KEYCODE_VOLUME_UP && code != KeyEvent.KEYCODE_VOLUME_DOWN) return;
        // Le système change le volume après l'appui : on lit la nouvelle valeur un peu après.
        main.postDelayed(this::remember, 250);
    }

    private void remember() {
        if (!active) return;
        int stream = streamInUse();
        float level = fraction(stream);
        prefs.edit().putFloat(place, level).apply();
        // L'autre son (médias ou appel) suit, pour que la voix garde ce niveau si elle change de chemin.
        for (int s : STREAMS) if (s != stream) set(s, index(s, level));
        Log.i(TAG, "choix de la personne gardé : " + place + " = " + Math.round(level * 100) + " %");
    }

    private void placeChanged() {
        if (active && !placeNow().equals(place)) apply();
    }

    private void apply() {
        place = placeNow();
        float saved = prefs.getFloat(place, -1f);
        for (int i = 0; i < STREAMS.length; i++) {
            int stream = STREAMS[i];
            int target;
            if (saved >= 0f) {
                target = index(stream, saved);
            } else {
                float auto = autoLevel(place);
                // Réglage automatique : seulement plus bas que le téléphone, jamais plus fort.
                target = auto < 0f ? before[i] : Math.min(before[i], index(stream, auto));
            }
            set(stream, target);
        }
        Log.i(TAG, "lieu " + place + (saved >= 0f ? " (choix de la personne)" : " (automatique)")
                + ", volume " + Math.round(fraction(streamInUse()) * 100) + " %");
    }

    /** Niveaux de départ, en part du volume maximal ; -1 = on ne touche à rien. */
    private static float autoLevel(String place) {
        switch (place) {
            case "casque_nuit": return 0.25f;
            case "casque_jour": return 0.40f;
            case "hautparleur_nuit": return 0.40f;
            default: return -1f;
        }
    }

    private String placeNow() {
        return (headphones() ? "casque" : "hautparleur") + (night() ? "_nuit" : "_jour");
    }

    /** De 22 h à 7 h. */
    private static boolean night() {
        int hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY);
        return hour >= 22 || hour < 7;
    }

    private boolean headphones() {
        for (AudioDeviceInfo device : audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
            switch (device.getType()) {
                case AudioDeviceInfo.TYPE_WIRED_HEADSET:
                case AudioDeviceInfo.TYPE_WIRED_HEADPHONES:
                case AudioDeviceInfo.TYPE_BLUETOOTH_A2DP:
                case AudioDeviceInfo.TYPE_BLUETOOTH_SCO:
                case AudioDeviceInfo.TYPE_USB_HEADSET:
                    return true;
                default:
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                            && device.getType() == AudioDeviceInfo.TYPE_BLE_HEADSET) return true;
            }
        }
        return false;
    }

    private int streamInUse() {
        return audio.getMode() == AudioManager.MODE_IN_COMMUNICATION
                ? AudioManager.STREAM_VOICE_CALL : AudioManager.STREAM_MUSIC;
    }

    private float fraction(int stream) {
        int max = audio.getStreamMaxVolume(stream);
        return max <= 0 ? 0f : audio.getStreamVolume(stream) / (float) max;
    }

    private int index(int stream, float level) {
        int max = audio.getStreamMaxVolume(stream);
        // Au moins 1 : Tamilya reste audible.
        return Math.max(1, Math.round(level * max));
    }

    private void set(int stream, int value) {
        try {
            if (audio.getStreamVolume(stream) != value) audio.setStreamVolume(stream, value, 0);
        } catch (SecurityException e) {
            // Mode « Ne pas déranger » : Android peut refuser ; on laisse le volume tel quel.
        }
    }
}
