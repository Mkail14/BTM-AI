package yt.tamilya.app.connect;

import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Recolle les morceaux d'un message reçu d'un voisin. Java pur : testé sur l'ordinateur.
 *
 * Bornes : avant, chaque numéro de message inconnu ouvrait une case gardée pour toujours.
 * Des morceaux perdus (ou un téléphone mal intentionné à côté) remplissaient la mémoire
 * jusqu'à faire tomber l'app. Ici : peu de messages en cours par liaison (le plus ancien
 * part), et un message plus gros qu'une enveloppe est abandonné.
 */
final class FrameAssembler {
    /** Messages commencés en même temps sur une liaison : un seul à la fois en pratique. */
    static final int MAX_PENDING = 8;

    private final int maxBytes;
    private final Map<Integer, Pending> pending = new LinkedHashMap<>();

    private static final class Pending {
        final byte[][] parts;
        int bytes;

        Pending(int total) {
            parts = new byte[total][];
        }
    }

    /** maxBytes : taille la plus grande d'un message entier (contrôle compris). */
    FrameAssembler(int maxBytes) {
        this.maxBytes = maxBytes;
    }

    /** Ajoute un morceau. Renvoie le message entier quand il est complet, sinon null. */
    byte[] add(int message, int index, int total, byte[] body) {
        if (body == null || total <= 0 || index < 0 || index >= total || total > maxBytes) return null;
        Pending entry = pending.get(message);
        if (entry == null || entry.parts.length != total) {
            if (entry != null) pending.remove(message);
            dropOldestIfFull();
            entry = new Pending(total);
            pending.put(message, entry);
        }
        if (entry.parts[index] != null) entry.bytes -= entry.parts[index].length;
        entry.parts[index] = body;
        entry.bytes += body.length;
        if (entry.bytes > maxBytes) {
            // Plus gros qu'une enveloppe : ce n'en est pas une.
            pending.remove(message);
            return null;
        }
        for (byte[] part : entry.parts) if (part == null) return null;
        pending.remove(message);
        byte[] whole = new byte[entry.bytes];
        int at = 0;
        for (byte[] part : entry.parts) {
            System.arraycopy(part, 0, whole, at, part.length);
            at += part.length;
        }
        return whole;
    }

    int pendingCount() {
        return pending.size();
    }

    private void dropOldestIfFull() {
        Iterator<Integer> oldest = pending.keySet().iterator();
        while (pending.size() >= MAX_PENDING && oldest.hasNext()) {
            oldest.next();
            oldest.remove();
        }
    }
}
