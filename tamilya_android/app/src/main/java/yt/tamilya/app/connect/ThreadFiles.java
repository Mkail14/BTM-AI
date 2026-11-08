package yt.tamilya.app.connect;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Conversations gardées pour le hors ligne : un petit fichier par conversation.
 * Avant, tout était dans un seul SharedPreferences (185 Ko sur la tablette de test, 53 conversations) :
 * tout relu au démarrage, tout réécrit à chaque message. Ici, on ne lit et n'écrit que la conversation
 * qui sert. Le texte est gardé tel quel, sans relecture : rien ne peut se perdre au passage.
 */
final class ThreadFiles {
    static final String THREAD = "thread:";
    static final String STAMP = "stamp:";

    /** Les anciennes clés (SharedPreferences), lues seulement pour les déplacer. */
    interface Legacy {
        Map<String, ?> all();
        /** Retire ces clés et dit si c'est bien écrit sur le disque. */
        boolean remove(List<String> keys);
    }

    private final File dir;

    ThreadFiles(File dir) {
        this.dir = dir;
    }

    /** Nom de fichier sûr, sans collision : l'identifiant en hexadécimal. */
    static String fileName(String id) {
        StringBuilder hex = new StringBuilder();
        for (byte b : id.getBytes(StandardCharsets.UTF_8)) hex.append(String.format("%02x", b));
        return hex + ".json";
    }

    private File file(String id) {
        return new File(dir, fileName(id));
    }

    synchronized boolean has(String id) {
        return file(id).isFile();
    }

    /** Messages gardés (texte JSON brut), ou null si rien. */
    synchronized String messages(String id) {
        String[] parts = read(id);
        return parts == null ? null : parts[1];
    }

    synchronized String stamp(String id) {
        String[] parts = read(id);
        return parts == null ? "" : parts[0];
    }

    /** Écrit d'abord à côté, puis remplace : un arrêt brutal laisse l'ancienne version entière. */
    synchronized void save(String id, String messages, String stamp) throws IOException {
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("Dossier impossible : " + dir);
        String safeStamp = stamp == null ? "" : stamp.replace('\n', ' ').replace('\r', ' ');
        File target = file(id);
        File temp = new File(dir, target.getName() + ".tmp");
        try (FileOutputStream out = new FileOutputStream(temp)) {
            out.write((safeStamp + "\n" + messages).getBytes(StandardCharsets.UTF_8));
            out.getFD().sync();
        }
        if (!temp.renameTo(target)) {
            temp.delete();
            throw new IOException("Renommage impossible : " + target);
        }
    }

    /** Comme save, sauf si une version plus récente est déjà en fichier : vérifié et écrit d'un seul bloc. */
    synchronized boolean saveIfAbsent(String id, String messages, String stamp) throws IOException {
        if (has(id)) return false;
        save(id, messages, stamp);
        return true;
    }

    synchronized void remove(String id) {
        file(id).delete();
    }

    private String[] read(String id) {
        File target = file(id);
        if (!target.isFile()) return null;
        try (InputStream in = new FileInputStream(target)) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream((int) target.length());
            byte[] buffer = new byte[8192];
            for (int n; (n = in.read(buffer)) > 0; ) bytes.write(buffer, 0, n);
            String all = new String(bytes.toByteArray(), StandardCharsets.UTF_8);
            int cut = all.indexOf('\n');
            if (cut < 0) return new String[]{"", all};
            return new String[]{all.substring(0, cut), all.substring(cut + 1)};
        } catch (IOException e) {
            return null;
        }
    }

    /**
     * Déplace les anciennes conversations vers les fichiers. Une clé n'est retirée qu'une fois son
     * fichier écrit ; en cas d'échec, elle reste où elle était et on réessaie au prochain lancement.
     * Une version déjà en fichier n'est pas écrasée : elle est plus récente que l'ancienne clé.
     * Rend le nombre de conversations déplacées.
     */
    int migrate(Legacy legacy) {
        Map<String, ?> all = legacy.all();
        List<String> done = new ArrayList<>();
        int moved = 0;
        for (Map.Entry<String, ?> entry : all.entrySet()) {
            String key = entry.getKey();
            if (!key.startsWith(THREAD) || !(entry.getValue() instanceof String)) continue;
            String id = key.substring(THREAD.length());
            Object stamp = all.get(STAMP + id);
            try {
                if (saveIfAbsent(id, (String) entry.getValue(), stamp instanceof String ? (String) stamp : "")) moved++;
                done.add(key);
                if (stamp != null) done.add(STAMP + id);
            } catch (IOException e) {
                // Gardé dans l'ancien stockage : rien n'est perdu.
            }
        }
        // Dates seules (conversation déjà déplacée ou sans messages) : sans utilité, on les laisse
        // seulement si leur conversation est encore dans l'ancien stockage.
        for (String key : all.keySet()) {
            if (key.startsWith(STAMP) && !all.containsKey(THREAD + key.substring(STAMP.length())) && has(key.substring(STAMP.length()))) {
                done.add(key);
            }
        }
        if (!done.isEmpty()) legacy.remove(done);
        return moved;
    }
}
