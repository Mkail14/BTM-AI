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

    /** Prêt à écrire hors ligne : appareil enregistré et clé du serveur connue. */
    boolean ready() {
        return !deviceId().isEmpty() && !keyId().isEmpty() && !serverKey().isEmpty();
    }

    JSONArray messages() {
        try {
            return new JSONArray(prefs.getString("messages", "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    void saveMessages(JSONArray messages) {
        JSONArray kept = new JSONArray();
        for (int i = Math.max(0, messages.length() - MAX_MESSAGES); i < messages.length(); i++) {
            kept.put(messages.opt(i));
        }
        prefs.edit().putString("messages", kept.toString()).apply();
    }
}
