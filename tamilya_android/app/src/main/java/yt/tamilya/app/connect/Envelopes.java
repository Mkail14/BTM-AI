package yt.tamilya.app.connect;

import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.PublicKey;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Enveloppes de Tamilya Connect : ce qui passe de téléphone en téléphone.
 * Le format suit exactement celui du serveur (/api/mesh/relay).
 */
public final class Envelopes {
    public static final int VERSION = 1;
    public static final int MAX_BYTES = 8 * 1024;
    public static final int MAX_HOPS = 5;

    private static final Pattern UUID_V4 =
            Pattern.compile("^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$");
    private static final String[] REQUEST_FIELDS = {"deviceId", "keyId", "epk", "nonce", "ct", "sig"};

    private Envelopes() {}

    /** Signe la demande avec la clé de l'appareil (Android Keystore dans l'app). */
    public interface Signer {
        byte[] sign(String data) throws GeneralSecurityException;
    }

    /** Une demande prête à partir, et la clé qui ouvrira sa réponse. */
    public static final class Outgoing {
        public final String id;
        public final String json;
        public final byte[] replyKey;

        Outgoing(String id, String json, byte[] replyKey) {
            this.id = id;
            this.json = json;
            this.replyKey = replyKey;
        }
    }

    /** Chaîne signée : « v|id|deviceId|createdAt|keyId|epk|nonce|ct », valeurs telles qu'écrites. */
    public static String signedText(String id, String deviceId, long createdAt, String keyId,
                                    String epk, String nonce, String ct) {
        return VERSION + "|" + id + "|" + deviceId + "|" + createdAt + "|" + keyId + "|" + epk + "|" + nonce + "|" + ct;
    }

    /**
     * Construit une demande. `content` est le contenu en clair (kind, text…) ; replyKey y est
     * ajoutée ici. Lève IllegalArgumentException si l'enveloppe dépasse 8 Ko.
     */
    public static Outgoing request(JSONObject content, String deviceId, String keyId, PublicKey serverKey,
                                   Signer signer, long createdAt) throws GeneralSecurityException, JSONException {
        byte[] replyKey = ConnectCrypto.random(ConnectCrypto.KEY_BYTES);
        JSONObject inner = new JSONObject(content.toString());
        inner.put("replyKey", ConnectCrypto.b64(replyKey));
        ConnectCrypto.Sealed sealed = ConnectCrypto.seal(serverKey, inner.toString().getBytes(StandardCharsets.UTF_8));

        String id = UUID.randomUUID().toString();
        String sig = ConnectCrypto.b64(signer.sign(
                signedText(id, deviceId, createdAt, keyId, sealed.epk, sealed.nonce, sealed.ct)));

        JSONObject envelope = new JSONObject();
        envelope.put("v", VERSION);
        envelope.put("type", "request");
        envelope.put("id", id);
        envelope.put("deviceId", deviceId);
        envelope.put("createdAt", createdAt);
        envelope.put("hops", 0);
        envelope.put("keyId", keyId);
        envelope.put("epk", sealed.epk);
        envelope.put("nonce", sealed.nonce);
        envelope.put("ct", sealed.ct);
        envelope.put("sig", sig);
        String json = envelope.toString();
        if (json.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) throw new IllegalArgumentException("Message trop long.");
        return new Outgoing(id, json, replyKey);
    }

    /** Enveloppe reçue d'un voisin ou du serveur : null si elle n'est pas valable. */
    public static JSONObject parse(byte[] bytes) {
        if (bytes == null || bytes.length == 0 || bytes.length > MAX_BYTES) return null;
        try {
            JSONObject envelope = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
            if (envelope.optInt("v", -1) != VERSION) return null;
            if (!UUID_V4.matcher(envelope.optString("id")).matches()) return null;
            String type = envelope.optString("type");
            if ("request".equals(type)) {
                int hops = envelope.optInt("hops", -1);
                if (hops < 0 || hops > MAX_HOPS) return null;
                if (!(envelope.opt("createdAt") instanceof Number)) return null;
                for (String field : REQUEST_FIELDS) {
                    if (envelope.optString(field).isEmpty()) return null;
                }
                return envelope;
            }
            if ("reply".equals(type)) {
                if (envelope.optString("nonce").isEmpty() || envelope.optString("ct").isEmpty()) return null;
                return envelope;
            }
            // Refus du serveur, renvoyé par le relais au téléphone d'origine.
            if ("error".equals(type)) {
                String code = envelope.optString("error");
                if (code.isEmpty() || code.length() > 40) return null;
                return envelope;
            }
            return null;
        } catch (JSONException e) {
            return null;
        }
    }

    public static JSONObject parse(String json) {
        return json == null ? null : parse(json.getBytes(StandardCharsets.UTF_8));
    }

    /** Refus du serveur, à renvoyer par le même chemin que la réponse. */
    public static String error(String id, String code) throws JSONException {
        return new JSONObject().put("v", VERSION).put("type", "error").put("id", id).put("error", code).toString();
    }

    /** Copie de la demande avec un saut de plus (le champ hops n'est pas signé). */
    public static String withHops(JSONObject request, int hops) throws JSONException {
        JSONObject copy = new JSONObject(request.toString());
        copy.put("hops", hops);
        return copy.toString();
    }

    /** Ouvre la réponse du serveur avec la replyKey gardée à l'envoi. */
    public static JSONObject openReply(JSONObject reply, byte[] replyKey) throws GeneralSecurityException, JSONException {
        byte[] plain = ConnectCrypto.decrypt(replyKey, ConnectCrypto.unb64(reply.getString("nonce")),
                ConnectCrypto.unb64(reply.getString("ct")));
        return new JSONObject(new String(plain, StandardCharsets.UTF_8));
    }
}
