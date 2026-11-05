package yt.tamilya.app.connect;

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
final class ConnectApi {
    static final String BASE = "https://tamilya.yt";
    private static final int TIMEOUT_MS = 20_000;
    private static final int MAX_RESPONSE = 64 * 1024;

    private ConnectApi() {}

    /** Enregistre la clé de l'appareil pour le compte connecté (cookies de la WebView) : { deviceId, keyId, publicKey }. */
    static JSONObject registerDevice(String cookies, String publicKey) throws IOException, JSONException {
        JSONObject body = new JSONObject().put("publicKey", publicKey);
        JSONObject answer = new JSONObject(call("POST", "/api/mesh/device", body.toString(), cookies));
        if (answer.optString("deviceId").isEmpty()) throw new IOException("deviceId absent");
        return answer;
    }

    /** Clé publique du serveur : { keyId, publicKey }. */
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
            return call("POST", "/api/mesh/relay", envelope, null);
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
        HttpURLConnection connection = (HttpURLConnection) new URL(BASE + path).openConnection();
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
                        text = read(in);
                    }
                }
                throw new HttpError(status, text);
            }
            try (InputStream in = connection.getInputStream()) {
                return read(in);
            }
        } finally {
            connection.disconnect();
        }
    }

    private static String read(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        for (int n; (n = in.read(buffer)) > 0; ) {
            out.write(buffer, 0, n);
            if (out.size() > MAX_RESPONSE) throw new IOException("réponse trop longue");
        }
        return out.toString("UTF-8");
    }
}
