package yt.tamilya.app;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Lecture du flux de POST /api/chat : une ligne JSON par événement (NDJSON), comme
 * src/lib/chat/stream-protocol.ts du site. Les morceaux reçus peuvent couper une ligne en deux.
 */
final class ChatStream {
    private static final Set<String> TYPES = new HashSet<>(Arrays.asList(
            "meta", "delta", "replace", "speech", "timing", "team", "learned", "remembered", "done", "error"));

    private final StringBuilder buffer = new StringBuilder();

    /** Événements complets contenus dans ce morceau (et le reste du précédent). */
    List<JSONObject> push(String chunk) {
        buffer.append(chunk);
        List<JSONObject> events = new ArrayList<>();
        int start = 0;
        for (int end; (end = buffer.indexOf("\n", start)) >= 0; start = end + 1) {
            JSONObject event = parse(buffer.substring(start, end));
            if (event != null) events.add(event);
        }
        buffer.delete(0, start);
        return events;
    }

    /** Fin du flux : la dernière ligne, si elle n'a pas de retour à la ligne. */
    List<JSONObject> flush() {
        JSONObject rest = parse(buffer.toString());
        buffer.setLength(0);
        List<JSONObject> events = new ArrayList<>();
        if (rest != null) events.add(rest);
        return events;
    }

    private static JSONObject parse(String line) {
        String trimmed = line.trim();
        if (trimmed.isEmpty()) return null;
        try {
            JSONObject value = new JSONObject(trimmed);
            return TYPES.contains(value.optString("type")) ? value : null;
        } catch (JSONException e) {
            // Ligne illisible : ignorée, comme sur le site.
            return null;
        }
    }
}
