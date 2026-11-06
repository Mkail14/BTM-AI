package yt.tamilya.app.connect;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

/**
 * Historique de Tamilya Connect : la liste du compte (la même que sur le site, gardée sur le
 * téléphone pour le hors ligne), plus les conversations nées sans internet et pas encore relues.
 */
final class ConnectHistory {
    static final String CONNECT = "connect";

    private ConnectHistory() {}

    /** Liste du serveur, précédée des conversations locales qu'il ne connaît pas encore. */
    static JSONArray merge(JSONArray server, JSONArray local) throws JSONException {
        Set<String> known = new HashSet<>();
        for (int i = 0; i < server.length(); i++) known.add(server.getJSONObject(i).optString("id"));
        JSONArray merged = new JSONArray();
        for (int i = 0; i < local.length(); i++) {
            JSONObject item = local.getJSONObject(i);
            if (item.optBoolean("local") && !known.contains(item.optString("id"))) merged.put(item);
        }
        for (int i = 0; i < server.length(); i++) merged.put(server.getJSONObject(i));
        return merged;
    }

    /** Conversation née ici, sans internet : en tête de liste, en attendant la prochaine lecture du compte. */
    static JSONArray addLocal(JSONArray list, String id, String title) throws JSONException {
        JSONArray next = new JSONArray();
        next.put(new JSONObject().put("id", id).put("title", title).put("source", CONNECT).put("local", true));
        for (int i = 0; i < list.length(); i++) {
            JSONObject item = list.getJSONObject(i);
            if (!id.equals(item.optString("id"))) next.put(item);
        }
        return next;
    }

    /** Messages du site → bulles de Connect. Les tableaux (paiement, réservation) ne s'ouvrent pas ici. */
    static JSONArray toLocal(JSONArray messages) throws JSONException {
        JSONArray local = new JSONArray();
        for (int i = 0; i < messages.length(); i++) {
            JSONObject message = messages.getJSONObject(i);
            String role = message.optString("role");
            if (!"user".equals(role) && !"assistant".equals(role)) continue;
            String text = clean(message.optString("content"));
            if (text.isEmpty()) continue;
            local.put(new JSONObject()
                    .put("id", message.optString("id"))
                    .put("from", "user".equals(role) ? "me" : "tamilya")
                    .put("text", text)
                    .put("status", "ok"));
        }
        return local;
    }

    /** Retire les blocs de tableau et la mise en forme du site. */
    static String clean(String text) {
        return text.replaceAll("(?s)```.*?(```|$)", "").replace("**", "").trim();
    }
}
