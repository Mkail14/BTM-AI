package yt.tamilya.app.connect;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Mémoire du relais : chaque demande vue est gardée 10 minutes au plus, avec le voisin
 * d'où elle venait (pour renvoyer la réponse par le même chemin). Une demande déjà vue
 * n'est pas relancée, mais sa réponse reste disponible si la connexion a sauté entre-temps.
 * Pas d'Android ici : testable sur l'ordinateur.
 */
final class RelayTable {
    static final long TTL_MS = 10 * 60 * 1000L;
    static final int MAX_ENTRIES = 500;

    static final class Entry {
        final String id;
        /** Voisin d'où vient la demande ; null quand elle a été écrite sur ce téléphone. */
        String from;
        final long at;
        final String json;
        final int hops;
        final Set<String> sentTo = new HashSet<>();
        boolean posted;
        boolean answered;
        /** Réponse du serveur, gardée pour le voisin s'il redemande après une coupure. */
        byte[] reply;

        Entry(String id, String from, String json, int hops, long at) {
            this.id = id;
            this.from = from;
            this.json = json;
            this.hops = hops;
            this.at = at;
        }

        boolean own() {
            return from == null;
        }
    }

    private final Map<String, Entry> entries = new LinkedHashMap<>();

    /** Nouvelle demande : son entrée. Déjà vue : null. */
    Entry admit(String id, String from, String json, int hops, long now) {
        prune(now);
        if (entries.containsKey(id)) return null;
        if (entries.size() >= MAX_ENTRIES) {
            Iterator<String> oldest = entries.keySet().iterator();
            oldest.next();
            oldest.remove();
        }
        Entry entry = new Entry(id, from, json, hops, now);
        entries.put(id, entry);
        return entry;
    }

    /** Demande reprise après un redémarrage de l'app (garde son heure d'origine). */
    Entry restore(String id, String json, long at, long now) {
        if (now - at > TTL_MS || entries.containsKey(id)) return null;
        Entry entry = new Entry(id, null, json, 0, at);
        entries.put(id, entry);
        return entry;
    }

    /** Oublie une demande refusée : son renvoi (même id) pourra repasser. */
    void forget(String id) {
        entries.remove(id);
    }

    Entry get(String id, long now) {
        prune(now);
        return entries.get(id);
    }

    /** Demandes encore sans réponse, à transmettre aux nouveaux voisins ou au serveur. */
    List<Entry> open(long now) {
        prune(now);
        List<Entry> list = new ArrayList<>();
        for (Entry entry : entries.values()) if (!entry.answered) list.add(entry);
        return list;
    }

    void prune(long now) {
        entries.values().removeIf(entry -> now - entry.at > TTL_MS);
    }

    /** Peut-on la passer à un voisin ? Au plus 5 sauts. */
    static boolean canForward(int hops) {
        return hops < Envelopes.MAX_HOPS;
    }
}
