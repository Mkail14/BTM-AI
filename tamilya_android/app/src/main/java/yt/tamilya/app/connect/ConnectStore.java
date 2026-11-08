package yt.tamilya.app.connect;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;

/** Ce que Tamilya Connect garde sur le téléphone, pour marcher sans internet. */
final class ConnectStore {
    private static final int MAX_MESSAGES = 60;

    private final SharedPreferences prefs;
    /** Une conversation par fichier (voir ThreadFiles) ; les anciennes clés « thread: » y sont déplacées. */
    private final ThreadFiles threads;

    ConnectStore(Context context) {
        prefs = context.getSharedPreferences("tamilya-connect", Context.MODE_PRIVATE);
        threads = new ThreadFiles(new java.io.File(context.getFilesDir(), "connect-threads"));
    }

    /** À lancer hors du fil principal : déplace les anciennes conversations vers les fichiers. */
    int migrateThreads() {
        return threads.migrate(new ThreadFiles.Legacy() {
            @Override
            public java.util.Map<String, ?> all() {
                return prefs.getAll();
            }

            @Override
            public boolean remove(java.util.List<String> keys) {
                SharedPreferences.Editor edit = prefs.edit();
                for (String key : keys) edit.remove(key);
                return edit.commit();
            }
        });
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

    /** Nom et solde du compte, pour le bas du menu : { name, email, balanceCents, demo }. */
    org.json.JSONObject account() {
        try {
            return new org.json.JSONObject(prefs.getString("account", "{}"));
        } catch (JSONException e) {
            return new org.json.JSONObject();
        }
    }

    void saveAccount(org.json.JSONObject account) {
        prefs.edit().putString("account", account.toString()).apply();
    }

    /** Historique du compte, gardé pour le relire sans internet. */
    JSONArray history() {
        return array("history");
    }

    void saveHistory(JSONArray history) {
        prefs.edit().putString("history", history.toString()).apply();
    }

    boolean hasThread(String id) { return threads.has(id) || prefs.contains("thread:" + id); }
    /** Date de la dernière version gardée : inutile de relire une conversation qui n'a pas bougé. */
    String threadStamp(String id) {
        return threads.has(id) ? threads.stamp(id) : prefs.getString("stamp:" + id, "");
    }

    void saveThread(String id, JSONArray messages, String stamp) {
        keepThread(id, messages.toString(), stamp);
    }

    /** Écrit la conversation dans son fichier ; si le disque refuse, elle reste à l'ancienne place. */
    private void keepThread(String id, String messages, String stamp) {
        try {
            threads.save(id, messages, stamp);
            if (prefs.contains("thread:" + id) || prefs.contains("stamp:" + id)) {
                prefs.edit().remove("thread:" + id).remove("stamp:" + id).apply();
            }
        } catch (java.io.IOException e) {
            prefs.edit().putString("thread:" + id, messages).putString("stamp:" + id, stamp).apply();
        }
    }

    /** Messages gardés d'une conversation : son fichier, sinon l'ancienne clé pas encore déplacée. */
    private JSONArray thread(String id) {
        String kept = threads.messages(id);
        if (kept == null) return array("thread:" + id);
        try {
            return new JSONArray(kept);
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    /** Retire une conversation du téléphone : de la liste et de ce qui est gardé. */
    void removeConversation(String id) {
        JSONArray kept = new JSONArray();
        JSONArray list = history();
        for (int i = 0; i < list.length(); i++) {
            org.json.JSONObject item = list.optJSONObject(i);
            if (item != null && !id.equals(item.optString("id"))) kept.put(item);
        }
        threads.remove(id);
        prefs.edit().putString("history", kept.toString()).remove("thread:" + id).remove("stamp:" + id).apply();
    }

    /** Conversations supprimées ici, pas encore supprimées du compte (pas d'internet). */
    java.util.Set<String> pendingDeletes() {
        return new java.util.HashSet<>(prefs.getStringSet("pendingDeletes", new java.util.HashSet<>()));
    }

    void setPendingDelete(String id, boolean pending) {
        java.util.Set<String> set = pendingDeletes();
        if (pending) set.add(id);
        else set.remove(id);
        prefs.edit().putStringSet("pendingDeletes", set).apply();
    }

    /** Ouvre une conversation (vide : une nouvelle) et range celle qui était à l'écran. */
    void switchTo(String id) {
        String current = conversationId();
        // Date vide : la version du compte sera relue au prochain passage en ligne, comme avant.
        if (!current.isEmpty()) keepThread(current, messages().toString(), "");
        prefs.edit().putString("conversationId", id).putString("messages", id.isEmpty() ? "[]" : thread(id).toString()).apply();
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
