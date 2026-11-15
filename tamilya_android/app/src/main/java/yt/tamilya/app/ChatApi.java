package yt.tamilya.app;

import android.webkit.CookieManager;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.Reader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/**
 * Appels de la conversation native aux mêmes routes que le site : POST /api/chat (réponse en
 * flux), GET /api/conversations, GET /api/conversations/{id}, GET /api/mesh/account. La clé
 * de l'IA reste sur le serveur : l'app n'envoie que le message et les cookies de la WebView
 * (compte connecté, essai sans compte). À lancer hors du fil principal.
 */
final class ChatApi {
    static final String BASE = "https://tamilya.yt";
    private static final String AGENT = "TamilyaApp/1.2.1 (Android)";
    private static final int CONNECT_TIMEOUT_MS = 20_000;
    private static final int READ_TIMEOUT_MS = 125_000;
    private static final int MAX_JSON = 1024 * 1024;

    private ChatApi() {}

    /** Événement du flux (sur le fil de lecture, pas celui de l'écran). */
    interface Listener {
        void onEvent(JSONObject event);
    }

    /** Le serveur a refusé : code et message du site ({ error: { code, message } }). */
    static final class Refused extends IOException {
        final int status;
        final String code;
        final String message;

        Refused(int status, String code, String message) {
            super("HTTP " + status + " " + code);
            this.status = status;
            this.code = code;
            this.message = message;
        }
    }

    /** Un appel en cours, que l'écran peut arrêter (bouton stop). */
    static final class Call {
        private volatile HttpURLConnection connection;
        volatile boolean cancelled;

        void cancel() {
            cancelled = true;
            HttpURLConnection c = connection;
            if (c != null) c.disconnect();
        }
    }

    /** Cookies de la WebView pour cette adresse (session du compte, cookie d'essai btm_device). */
    static String cookies(String url) {
        try {
            String value = CookieManager.getInstance().getCookie(url);
            return value == null ? "" : value;
        } catch (RuntimeException e) {
            return "";
        }
    }

    /** Le compte est connecté sur ce téléphone (cookie de session du site). */
    static boolean signedIn() {
        return cookies(BASE + "/").contains("-auth-token");
    }

    /** Envoie un message et lit la réponse en flux. Bloque jusqu'à la fin ; lève Refused si le serveur refuse. */
    static void chat(Call call, JSONObject body, Listener listener) throws IOException {
        String url = BASE + "/api/chat";
        HttpURLConnection connection = open("POST", url);
        call.connection = connection;
        try {
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream out = connection.getOutputStream()) {
                out.write(bytes);
            }
            int status = connection.getResponseCode();
            keepCookies(connection, url);
            if (status < 200 || status >= 300) throw refused(connection, status);
            ChatStream stream = new ChatStream();
            char[] buffer = new char[2048];
            try (Reader in = new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8)) {
                for (int n; (n = in.read(buffer)) > 0; ) {
                    if (call.cancelled) return;
                    for (JSONObject event : stream.push(new String(buffer, 0, n))) listener.onEvent(event);
                }
            }
            for (JSONObject event : stream.flush()) listener.onEvent(event);
        } finally {
            connection.disconnect();
        }
    }

    /** Conversations du compte, comme la barre latérale du site. */
    static JSONArray conversations() throws IOException, JSONException {
        return new JSONObject(get("/api/conversations")).getJSONArray("conversations");
    }

    /** Messages d'une conversation du compte : [{ id, role, content, status, createdAt }]. */
    static JSONArray messages(String id) throws IOException, JSONException {
        return new JSONObject(get("/api/conversations/" + id)).getJSONArray("messages");
    }

    /** Historique de la cloche (paiements, recharges, réservations du code) : [{ id, emoji, title, subtitle, at, href }]. */
    static JSONArray notifications() throws IOException, JSONException {
        return new JSONObject(get("/api/notifications")).getJSONArray("items");
    }

    /** Nom et adresse du compte : { name, email, balanceCents, demo }. 401 : pas connecté. */
    static JSONObject account() throws IOException, JSONException {
        return new JSONObject(get("/api/mesh/account"));
    }

    /** Supprime une conversation du compte. Déjà absente : c'est fait aussi. */
    static void deleteConversation(String id) throws IOException {
        String url = BASE + "/api/conversations/" + id;
        HttpURLConnection connection = open("DELETE", url);
        try {
            int status = connection.getResponseCode();
            keepCookies(connection, url);
            if ((status < 200 || status >= 300) && status != 404) throw refused(connection, status);
        } finally {
            connection.disconnect();
        }
    }

    private static String get(String path) throws IOException {
        String url = BASE + path;
        HttpURLConnection connection = open("GET", url);
        try {
            int status = connection.getResponseCode();
            keepCookies(connection, url);
            if (status < 200 || status >= 300) throw refused(connection, status);
            try (InputStream in = connection.getInputStream()) {
                return read(in);
            }
        } finally {
            connection.disconnect();
        }
    }

    private static HttpURLConnection open(String method, String url) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setRequestMethod(method);
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        connection.setReadTimeout(READ_TIMEOUT_MS);
        connection.setInstanceFollowRedirects(false);
        connection.setUseCaches(false);
        connection.setRequestProperty("Accept", "application/json, application/x-ndjson");
        connection.setRequestProperty("User-Agent", AGENT);
        String cookies = cookies(url);
        if (!cookies.isEmpty()) connection.setRequestProperty("Cookie", cookies);
        return connection;
    }

    /**
     * Cookies posés par le serveur (session rafraîchie, cookie d'essai sans compte) : rangés
     * avec ceux de la WebView, pour que le site et l'écran natif partagent la même session.
     */
    private static void keepCookies(HttpURLConnection connection, String url) {
        Map<String, List<String>> headers = connection.getHeaderFields();
        if (headers == null) return;
        CookieManager jar = CookieManager.getInstance();
        for (Map.Entry<String, List<String>> header : headers.entrySet()) {
            if (header.getKey() == null || !header.getKey().equalsIgnoreCase("Set-Cookie")) continue;
            for (String cookie : header.getValue()) jar.setCookie(url, cookie);
        }
        jar.flush();
    }

    private static Refused refused(HttpURLConnection connection, int status) {
        String code = status == 401 ? "unauthorized" : "internal";
        String message = "";
        InputStream error = connection.getErrorStream();
        if (error != null) {
            try (InputStream in = error) {
                Object detail = new JSONObject(read(in)).opt("error");
                if (detail instanceof JSONObject) {
                    code = ((JSONObject) detail).optString("code", code);
                    message = ((JSONObject) detail).optString("message", "");
                } else if (detail instanceof String) {
                    // Site fermé (maintenance, attente d'un partenaire) : le proxy répond { error: "texte" }.
                    code = "closed";
                    message = (String) detail;
                }
            } catch (IOException | JSONException | RuntimeException ignored) {
                // Corps illisible : le code HTTP suffit.
            }
        }
        return new Refused(status, code, message);
    }

    private static String read(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        for (int n; (n = in.read(buffer)) > 0; ) {
            out.write(buffer, 0, n);
            if (out.size() > MAX_JSON) throw new IOException("réponse trop longue");
        }
        return out.toString("UTF-8");
    }
}
