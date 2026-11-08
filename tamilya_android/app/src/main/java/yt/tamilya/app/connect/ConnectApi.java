package yt.tamilya.app.connect;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** Appels au site pour Tamilya Connect. À lancer hors du fil principal. */
public final class ConnectApi {
    static final String BASE = "https://tamilya.yt";
    /**
     * Où poster les messages relayés. Version de test seulement : « adb shell setprop
     * debug.tamilya.relay http://127.0.0.1:3100 » (+ adb reverse) les envoie au site lancé sur
     * l'ordinateur, pour essayer une correction du serveur avant sa mise en ligne.
     */
    private static volatile String relayBase = BASE;

    /** Appelé au démarrage de la version de test uniquement (MainActivity). */
    public static void useTestRelay() {
        try {
            String value = (String) Class.forName("android.os.SystemProperties").getMethod("get", String.class).invoke(null, "debug.tamilya.relay");
            // Seulement l'ordinateur branché (adb reverse) : jamais un autre serveur.
            if (value != null && value.matches("http://(127\\.0\\.0\\.1|localhost):\\d{2,5}")) relayBase = value;
        } catch (Exception ignored) {
            // Propriété illisible : le vrai site.
        }
    }
    private static final int TIMEOUT_MS = 20_000;
    private static final int MAX_RESPONSE = 64 * 1024;
    /** Une conversation entière pèse plus qu'une enveloppe du relais. */
    private static final int MAX_HISTORY_RESPONSE = 1024 * 1024;

    private ConnectApi() {}

    /** Enregistre la clé de l'appareil pour le compte connecté (cookies de la WebView) : { deviceId, keyId, publicKey }. */
    static JSONObject registerDevice(String cookies, String publicKey) throws IOException, JSONException {
        JSONObject body = new JSONObject().put("publicKey", publicKey);
        JSONObject answer = new JSONObject(call("POST", "/api/mesh/device", body.toString(), cookies));
        if (answer.optString("deviceId").isEmpty()) throw new IOException("deviceId absent");
        return answer;
    }

    /** Historique du compte (cookies de la WebView), le même que sur le site. */
    static JSONArray conversations(String cookies) throws IOException, JSONException {
        return new JSONObject(call("GET", "/api/conversations", null, cookies, MAX_HISTORY_RESPONSE)).getJSONArray("conversations");
    }

    /** Nom et solde du compte, pour le menu : { name, email, balanceCents, demo }. */
    static JSONObject account(String cookies) throws IOException, JSONException {
        return new JSONObject(call("GET", "/api/mesh/account", null, cookies));
    }

    /** Messages d'une conversation du compte. */
    static JSONArray messages(String id, String cookies) throws IOException, JSONException {
        return new JSONObject(call("GET", "/api/conversations/" + id, null, cookies, MAX_HISTORY_RESPONSE)).getJSONArray("messages");
    }

    /** Clé publique du serveur : { keyId, publicKey }. */
    /** Supprime une conversation du compte. Déjà absente : c'est fait aussi. */
    static void deleteConversation(String id, String cookies) throws IOException {
        try {
            call("DELETE", "/api/conversations/" + id, null, cookies);
        } catch (HttpError e) {
            if (e.status != 404) throw e;
        }
    }

    static JSONObject serverKey() throws IOException, JSONException {
        JSONObject key = new JSONObject(call("GET", "/api/mesh/key", null, null));
        if (key.optString("keyId").isEmpty() || key.optString("publicKey").isEmpty()) throw new IOException("clé absente");
        return key;
    }

    /**
     * Un relais connecté poste une demande (sans cookies). Renvoie l'enveloppe de réponse, ou
     * une enveloppe d'erreur { type: "error", error: code } quand le serveur refuse. Lève
     * IOException seulement si le serveur n'a pas répondu (on réessaiera).
     */
    static String relay(String envelope) throws IOException {
        try {
            return call("POST", relayBase, "/api/mesh/relay", envelope, null, MAX_RESPONSE);
        } catch (HttpError e) {
            String code = "unavailable";
            try {
                if (!e.body.isEmpty()) code = new JSONObject(e.body).optString("error", code);
                String id = new JSONObject(envelope).getString("id");
                return Envelopes.error(id, code.isEmpty() ? "unavailable" : code);
            } catch (JSONException bad) {
                throw new IOException("réponse illisible", bad);
            }
        }
    }

    /** Le serveur a répondu, mais par un refus. */
    static final class HttpError extends IOException {
        final int status;
        final String body;

        HttpError(int status, String body) {
            super("HTTP " + status);
            this.status = status;
            this.body = body;
        }
    }

    private static String call(String method, String path, String body, String cookies) throws IOException {
        return call(method, path, body, cookies, MAX_RESPONSE);
    }

    private static String call(String method, String path, String body, String cookies, int maxResponse) throws IOException {
        return call(method, BASE, path, body, cookies, maxResponse);
    }

    private static String call(String method, String base, String path, String body, String cookies, int maxResponse) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(base + path).openConnection();
        try {
            connection.setRequestMethod(method);
            connection.setConnectTimeout(TIMEOUT_MS);
            connection.setReadTimeout(TIMEOUT_MS);
            connection.setInstanceFollowRedirects(false);
            connection.setUseCaches(false);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("User-Agent", "TamilyaApp Connect");
            if (cookies != null && !cookies.isEmpty()) connection.setRequestProperty("Cookie", cookies);
            if (body != null) {
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setFixedLengthStreamingMode(bytes.length);
                try (OutputStream out = connection.getOutputStream()) {
                    out.write(bytes);
                }
            }
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                InputStream error = connection.getErrorStream();
                String text = "";
                if (error != null) {
                    try (InputStream in = error) {
                        text = read(in, maxResponse);
                    }
                }
                throw new HttpError(status, text);
            }
            try (InputStream in = connection.getInputStream()) {
                return read(in, maxResponse);
            }
        } finally {
            connection.disconnect();
        }
    }

    private static String read(InputStream in, int maxResponse) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        for (int n; (n = in.read(buffer)) > 0; ) {
            out.write(buffer, 0, n);
            if (out.size() > maxResponse) throw new IOException("réponse trop longue");
        }
        return out.toString("UTF-8");
    }
}
