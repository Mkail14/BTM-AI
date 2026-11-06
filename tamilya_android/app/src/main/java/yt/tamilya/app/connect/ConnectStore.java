package yt.tamilya.app.connect;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;

/** Ce que Tamilya Connect garde sur le téléphone, pour marcher sans internet. */
final class ConnectStore {
    private static final int MAX_MESSAGES = 60;

    private final SharedPreferences prefs;

    ConnectStore(Context context) {
        prefs = context.getSharedPreferences("tamilya-connect", Context.MODE_PRIVATE);
    }

    String deviceId() { return prefs.getString("deviceId", ""); }
    void setDeviceId(String id) { prefs.edit().putString("deviceId", id).apply(); }

    /** Le serveur n'a pas reconnu cet appareil : à réenregistrer au prochain passage en ligne. */
    boolean deviceCheck() { return prefs.getBoolean("deviceCheck", false); }
    void setDeviceCheck(boolean value) { prefs.edit().putBoolean("deviceCheck", value).apply(); }

    String keyId() { return prefs.getString("keyId", ""); }
    String serverKey() { return prefs.getString("serverKey", ""); }
    long keyFetchedAt() { return prefs.getLong("keyFetchedAt", 0); }

    void setServerKey(String keyId, String publicKey, long now) {
        prefs.edit().putString("keyId", keyId).putString("serverKey", publicKey).putLong("keyFetchedAt", now).apply();
    }

    String conversationId() { return prefs.getString("conversationId", ""); }
    void setConversationId(String id) { prefs.edit().putString("conversationId", id).apply(); }

    boolean permissionsAsked() { return prefs.getBoolean("permissionsAsked", false); }
    void setPermissionsAsked() { prefs.edit().putBoolean("permissionsAsked", true).apply(); }


    boolean batteryAsked() { return prefs.getBoolean("batteryAsked", false); }
    void setBatteryAsked() { prefs.edit().putBoolean("batteryAsked", true).apply(); }

    /** Prêt à écrire hors ligne : appareil enregistré et clé du serveur connue. */
    boolean ready() {
        return !deviceId().isEmpty() && !keyId().isEmpty() && !serverKey().isEmpty();
    }

    /** Historique du compte, gardé pour le relire sans internet. */
    JSONArray history() {
        return array("history");
    }

    void saveHistory(JSONArray history) {
        prefs.edit().putString("history", history.toString()).apply();
    }

    boolean hasThread(String id) { return prefs.contains("thread:" + id); }
    /** Date de la dernière version gardée : inutile de relire une conversation qui n'a pas bougé. */
    String threadStamp(String id) { return prefs.getString("stamp:" + id, ""); }

    void saveThread(String id, JSONArray messages, String stamp) {
        prefs.edit().putString("thread:" + id, messages.toString()).putString("stamp:" + id, stamp).apply();
    }

    /** Ouvre une conversation (vide : une nouvelle) et range celle qui était à l'écran. */
    void switchTo(String id) {
        String current = conversationId();
        SharedPreferences.Editor edit = prefs.edit();
        if (!current.isEmpty()) edit.putString("thread:" + current, messages().toString()).remove("stamp:" + current);
        edit.putString("conversationId", id).putString("messages", id.isEmpty() ? "[]" : array("thread:" + id).toString()).apply();
    }

    private JSONArray array(String key) {
        try {
            return new JSONArray(prefs.getString(key, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    JSONArray messages() {
        return array("messages");
    }

    void saveMessages(JSONArray messages) {
        JSONArray kept = new JSONArray();
        for (int i = Math.max(0, messages.length() - MAX_MESSAGES); i < messages.length(); i++) {
            kept.put(messages.opt(i));
        }
        prefs.edit().putString("messages", kept.toString()).apply();
    }
}
