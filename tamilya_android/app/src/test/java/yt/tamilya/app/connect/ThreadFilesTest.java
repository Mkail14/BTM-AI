package yt.tamilya.app.connect;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.File;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;

/** Déplacement des conversations de SharedPreferences vers les fichiers : rien ne doit se perdre. */
public class ThreadFilesTest {
    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    /** Faux SharedPreferences : une simple table. */
    private static final class FakePrefs implements ThreadFiles.Legacy {
        final Map<String, Object> map = new HashMap<>();
        boolean refuse;

        @Override
        public Map<String, ?> all() {
            return new HashMap<>(map);
        }

        @Override
        public boolean remove(List<String> keys) {
            if (refuse) return false;
            for (String key : keys) map.remove(key);
            return true;
        }
    }

    private static final String BIG = bigThread();

    private static String bigThread() {
        StringBuilder s = new StringBuilder("[");
        for (int i = 0; i < 60; i++) {
            if (i > 0) s.append(',');
            s.append("{\"id\":\"m").append(i).append("\",\"from\":\"tamilya\",\"text\":\"Réponse é à ç ü 🌴\\\"guillemets\\\"\\nligne ")
                    .append(i).append("\",\"status\":\"ok\"}");
        }
        return s.append(']').toString();
    }

    @Test
    public void migrationGardeChaqueConversationAuCaractèrePrès() throws Exception {
        FakePrefs prefs = new FakePrefs();
        prefs.map.put("deviceId", "abc");
        prefs.map.put("history", "[{\"id\":\"a\"}]");
        prefs.map.put("messages", "[]");
        prefs.map.put("batteryAsked", true);
        prefs.map.put("thread:a", BIG);
        prefs.map.put("stamp:a", "2026-11-08T08:00:00.000Z");
        prefs.map.put("thread:b", "[{\"id\":\"x\",\"text\":\"sans date\"}]");
        // Texte abîmé : gardé tel quel, jamais jeté.
        prefs.map.put("thread:c", "{pas du json");
        prefs.map.put("stamp:c", "");
        // Identifiant inattendu : ne doit pas sortir du dossier.
        prefs.map.put("thread:../../x", "[1]");

        ThreadFiles files = new ThreadFiles(new File(tmp.getRoot(), "connect-threads"));
        assertEquals(4, files.migrate(prefs));

        assertEquals(BIG, files.messages("a"));
        assertEquals("2026-11-08T08:00:00.000Z", files.stamp("a"));
        assertEquals("[{\"id\":\"x\",\"text\":\"sans date\"}]", files.messages("b"));
        assertEquals("", files.stamp("b"));
        assertEquals("{pas du json", files.messages("c"));
        assertEquals("[1]", files.messages("../../x"));
        File[] written = new File(tmp.getRoot(), "connect-threads").listFiles();
        assertEquals(4, written.length);

        // Les anciennes clés de conversation sont parties, le reste est intact.
        assertEquals(new HashSet<>(java.util.Arrays.asList("deviceId", "history", "messages", "batteryAsked")), prefs.map.keySet());
        assertEquals("abc", prefs.map.get("deviceId"));
    }

    @Test
    public void migrationRelancéeNeChangeRien() throws Exception {
        FakePrefs prefs = new FakePrefs();
        prefs.map.put("thread:a", BIG);
        ThreadFiles files = new ThreadFiles(tmp.newFolder("t"));
        assertEquals(1, files.migrate(prefs));
        assertEquals(0, files.migrate(prefs));
        assertEquals(BIG, files.messages("a"));
    }

    @Test
    public void siLesAnciennesClésNePartentPasOnRéessaieSansPerte() throws Exception {
        FakePrefs prefs = new FakePrefs();
        prefs.refuse = true;
        prefs.map.put("thread:a", BIG);
        ThreadFiles files = new ThreadFiles(tmp.newFolder("t"));
        files.migrate(prefs);
        assertEquals(BIG, prefs.map.get("thread:a"));
        assertEquals(BIG, files.messages("a"));
        prefs.refuse = false;
        files.migrate(prefs);
        assertFalse(prefs.map.containsKey("thread:a"));
        assertEquals(BIG, files.messages("a"));
    }

    @Test
    public void uneVersionPlusRécenteEnFichierNestPasÉcrasée() throws Exception {
        ThreadFiles files = new ThreadFiles(tmp.newFolder("t"));
        files.save("a", "[\"nouveau\"]", "2");
        FakePrefs prefs = new FakePrefs();
        prefs.map.put("thread:a", "[\"ancien\"]");
        prefs.map.put("stamp:a", "1");
        assertEquals(0, files.migrate(prefs));
        assertEquals("[\"nouveau\"]", files.messages("a"));
        assertEquals("2", files.stamp("a"));
        assertTrue(prefs.map.isEmpty());
    }

    @Test
    public void dossierImpossibleLaisseToutÀSaPlace() throws Exception {
        File blocked = tmp.newFile("pas-un-dossier");
        ThreadFiles files = new ThreadFiles(new File(blocked, "connect-threads"));
        FakePrefs prefs = new FakePrefs();
        prefs.map.put("thread:a", BIG);
        prefs.map.put("stamp:a", "1");
        assertEquals(0, files.migrate(prefs));
        assertEquals(BIG, prefs.map.get("thread:a"));
        assertEquals("1", prefs.map.get("stamp:a"));
    }

    @Test
    public void enregistrerRelireSupprimer() throws Exception {
        ThreadFiles files = new ThreadFiles(new File(tmp.getRoot(), "neuf"));
        assertFalse(files.has("a"));
        assertNull(files.messages("a"));
        assertEquals("", files.stamp("a"));
        files.save("a", BIG, "date\navec retour");
        assertTrue(files.has("a"));
        assertEquals(BIG, files.messages("a"));
        assertEquals("date avec retour", files.stamp("a"));
        files.remove("a");
        assertFalse(files.has("a"));
    }
}
