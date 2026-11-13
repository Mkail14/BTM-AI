package yt.tamilya.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Ce que l'accueil natif garde sur le téléphone : la conversation en cours (pour la retrouver à
 * la prochaine ouverture), la liste des conversations du compte, le nom du compte et le nombre
 * de messages d'essai envoyés sans compte. Lecture et écriture hors du fil principal.
 */
final class ChatStore {
    private static final int MAX_FILE = 2 * 1024 * 1024;

    private final SharedPreferences prefs;
    private final File dir;

    ChatStore(Context context) {
        prefs = context.getSharedPreferences("tamilya-accueil", Context.MODE_PRIVATE);
        dir = new File(context.getFilesDir(), "accueil");
    }

    /** Conversation en cours : { id, signedIn, messages: [{ role, content, status, notice }] }, ou vide. */
    JSONObject conversation() {
        return readJson(new File(dir, "conversation.json"));
    }

    void saveConversation(JSONObject conversation) {
        writeJson(new File(dir, "conversation.json"), conversation.toString());
    }

    /** Liste des conversations du compte, telle que le serveur l'a donnée la dernière fois. */
    JSONArray history() {
        JSONObject box = readJson(new File(dir, "historique.json"));
        JSONArray list = box.optJSONArray("conversations");
        return list == null ? new JSONArray() : list;
    }

    void saveHistory(JSONArray conversations) {
        try {
            writeJson(new File(dir, "historique.json"), new JSONObject().put("conversations", conversations).toString());
        } catch (JSONException ignored) {
            // Impossible avec un tableau valide.
        }
    }

    String accountName() { return prefs.getString("accountName", ""); }
    String accountEmail() { return prefs.getString("accountEmail", ""); }

    void saveAccount(String name, String email) {
        prefs.edit().putString("accountName", name == null ? "" : name).putString("accountEmail", email == null ? "" : email).apply();
    }

    /** Ce que l'accueil du site montre à ce compte (lu dans la page, voir HomeChat.readSite). */
    String siteBadge() { return prefs.getString("siteBadge", ""); }
    boolean siteFood() { return prefs.getBoolean("siteFood", false); }
    boolean siteVoice() { return prefs.getBoolean("siteVoice", false); }
    boolean siteAttach() { return prefs.getBoolean("siteAttach", false); }

    void saveSite(String badge, boolean food, boolean voice, boolean attach) {
        prefs.edit().putString("siteBadge", badge == null ? "" : badge).putBoolean("siteFood", food)
                .putBoolean("siteVoice", voice).putBoolean("siteAttach", attach).apply();
    }

    void clearAccount() {
        prefs.edit().remove("accountName").remove("accountEmail").remove("siteBadge").remove("siteFood").remove("siteVoice").remove("siteAttach").apply();
        new File(dir, "historique.json").delete();
    }

    /** Messages d'essai envoyés sans compte (le serveur compte aussi, voir GUEST_TRIAL du site). */
    int guestSent() { return prefs.getInt("guestSent", 0); }
    void setGuestSent(int count) { prefs.edit().putInt("guestSent", count).apply(); }

    private JSONObject readJson(File file) {
        if (!file.isFile() || file.length() > MAX_FILE) return new JSONObject();
        try (InputStream in = new FileInputStream(file)) {
            byte[] bytes = new byte[(int) file.length()];
            int read = 0;
            for (int n; read < bytes.length && (n = in.read(bytes, read, bytes.length - read)) > 0; ) read += n;
            return new JSONObject(new String(bytes, 0, read, StandardCharsets.UTF_8));
        } catch (IOException | JSONException e) {
            return new JSONObject();
        }
    }

    private void writeJson(File file, String json) {
        if (!dir.isDirectory() && !dir.mkdirs()) return;
        File tmp = new File(dir, file.getName() + ".tmp");
        try (OutputStream out = new FileOutputStream(tmp)) {
            out.write(json.getBytes(StandardCharsets.UTF_8));
        } catch (IOException e) {
            tmp.delete();
            return;
        }
        if (!tmp.renameTo(file)) {
            file.delete();
            tmp.renameTo(file);
        }
    }
}
