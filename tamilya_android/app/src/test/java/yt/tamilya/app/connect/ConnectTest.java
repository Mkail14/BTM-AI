package yt.tamilya.app.connect;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;

public class ConnectTest {

    private static byte[] hex(String text) {
        byte[] out = new byte[text.length() / 2];
        for (int i = 0; i < out.length; i++) out[i] = (byte) Integer.parseInt(text.substring(2 * i, 2 * i + 2), 16);
        return out;
    }

    /** RFC 5869, cas 3 : sel et info vides (le cas de Tamilya Connect pour le sel). */
    @Test
    public void hkdfSuitLaNorme() throws Exception {
        byte[] ikm = new byte[22];
        java.util.Arrays.fill(ikm, (byte) 0x0b);
        byte[] okm = ConnectCrypto.hkdf(ikm, new byte[0], new byte[0], 42);
        assertArrayEquals(hex("8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8"), okm);
    }

    @Test
    public void seulLeServeurLitLaDemande() throws Exception {
        KeyPair server = ConnectCrypto.newKeyPair();
        byte[] plain = "{\"kind\":\"chat\",\"text\":\"Salut\"}".getBytes(StandardCharsets.UTF_8);
        ConnectCrypto.Sealed sealed = ConnectCrypto.seal(server.getPublic(), plain);
        assertEquals(12, ConnectCrypto.unb64(sealed.nonce).length);
        assertArrayEquals(plain, ConnectCrypto.unseal(server.getPrivate(), sealed.epk, sealed.nonce, sealed.ct));

        KeyPair stranger = ConnectCrypto.newKeyPair();
        try {
            ConnectCrypto.unseal(stranger.getPrivate(), sealed.epk, sealed.nonce, sealed.ct);
            throw new AssertionError("un relais ne doit pas pouvoir lire");
        } catch (java.security.GeneralSecurityException expected) {
            // Bonne nouvelle : illisible sans la clé du serveur.
        }
    }

    @Test
    public void laDemandeEstSigneeEtAuBonFormat() throws Exception {
        KeyPair server = ConnectCrypto.newKeyPair();
        KeyPair device = ConnectCrypto.newKeyPair();
        JSONObject content = new JSONObject().put("kind", "chat").put("text", "Je veux un billet pour demain");
        Envelopes.Outgoing out = Envelopes.request(content, "dev-1", "key-1", server.getPublic(),
                data -> ConnectCrypto.sign(device.getPrivate(), data), 1_730_000_000_000L);

        JSONObject envelope = Envelopes.parse(out.json);
        assertNotNull(envelope);
        assertEquals(1, envelope.getInt("v"));
        assertEquals("request", envelope.getString("type"));
        assertEquals(out.id, envelope.getString("id"));
        assertEquals(0, envelope.getInt("hops"));
        assertEquals(1_730_000_000_000L, envelope.getLong("createdAt"));

        String signed = "1|" + out.id + "|dev-1|1730000000000|key-1|" + envelope.getString("epk") + "|"
                + envelope.getString("nonce") + "|" + envelope.getString("ct");
        assertEquals(signed, Envelopes.signedText(out.id, "dev-1", 1_730_000_000_000L, "key-1",
                envelope.getString("epk"), envelope.getString("nonce"), envelope.getString("ct")));
        assertTrue(ConnectCrypto.verify(device.getPublic(), signed, ConnectCrypto.unb64(envelope.getString("sig"))));
        // Un relais qui touche au texte chiffré casse la signature.
        assertFalse(ConnectCrypto.verify(device.getPublic(), signed + "x", ConnectCrypto.unb64(envelope.getString("sig"))));

        JSONObject inner = new JSONObject(new String(ConnectCrypto.unseal(server.getPrivate(), envelope.getString("epk"),
                envelope.getString("nonce"), envelope.getString("ct")), StandardCharsets.UTF_8));
        assertEquals("Je veux un billet pour demain", inner.getString("text"));
        assertArrayEquals(out.replyKey, ConnectCrypto.unb64(inner.getString("replyKey")));
    }

    @Test
    public void laReponseSOuvreAvecReplyKey() throws Exception {
        byte[] replyKey = ConnectCrypto.random(32);
        byte[] nonce = ConnectCrypto.random(12);
        String content = "{\"text\":\"Voici les billets\",\"conversationId\":\"c1\",\"actions\":[{\"id\":\"a1\",\"label\":\"Billet 8 h 30 · 2 €\",\"pay\":true}],\"status\":\"ok\"}";
        JSONObject reply = new JSONObject().put("v", 1).put("type", "reply").put("id", "2f1d3c4b-5a69-4788-9abc-def012345678")
                .put("nonce", ConnectCrypto.b64(nonce))
                .put("ct", ConnectCrypto.b64(ConnectCrypto.encrypt(replyKey, nonce, content.getBytes(StandardCharsets.UTF_8))));
        assertNotNull(Envelopes.parse(reply.toString()));
        JSONObject opened = Envelopes.openReply(reply, replyKey);
        assertEquals("Voici les billets", opened.getString("text"));
        assertTrue(opened.getJSONArray("actions").getJSONObject(0).getBoolean("pay"));
    }

    @Test
    public void lesEnveloppesDouteusesSontRefusees() throws Exception {
        String ok = "{\"v\":1,\"type\":\"request\",\"id\":\"2f1d3c4b-5a69-4788-9abc-def012345678\",\"deviceId\":\"d\",\"createdAt\":1,"
                + "\"hops\":%d,\"keyId\":\"k\",\"epk\":\"e\",\"nonce\":\"n\",\"ct\":\"c\",\"sig\":\"s\"}";
        assertNotNull(Envelopes.parse(String.format(ok, 5)));
        assertNull(Envelopes.parse(String.format(ok, 6)));
        assertNull(Envelopes.parse(String.format(ok, 0).replace("\"v\":1", "\"v\":2")));
        assertNull(Envelopes.parse(String.format(ok, 0).replace("2f1d3c4b", "pas-un-uuid")));
        assertNull(Envelopes.parse(String.format(ok, 0).replace("\"sig\":\"s\"", "\"sig\":\"\"")));
        assertNull(Envelopes.parse(new byte[Envelopes.MAX_BYTES + 1]));
        assertEquals(3, new JSONObject(Envelopes.withHops(Envelopes.parse(String.format(ok, 2)), 3)).getInt("hops"));
    }

    @Test
    public void unRefusDuServeurRevientAuTelephoneDOrigine() throws Exception {
        String id = "2f1d3c4b-5a69-4788-9abc-def012345678";
        JSONObject refused = Envelopes.parse(Envelopes.error(id, "pending"));
        assertNotNull(refused);
        assertEquals("error", refused.getString("type"));
        assertEquals(id, refused.getString("id"));
        assertEquals("pending", refused.getString("error"));
        assertNull(Envelopes.parse("{\"v\":1,\"type\":\"error\",\"id\":\"" + id + "\",\"error\":\"\"}"));

        RelayTable table = new RelayTable();
        assertNotNull(table.admit(id, "voisin", "{}", 1, 0));
        table.forget(id);
        // Après un refus, le renvoi du même message repasse.
        assertNotNull(table.admit(id, "voisin", "{}", 1, 10));
    }

    @Test
    public void unMessageTropLongNePartPas() throws Exception {
        KeyPair server = ConnectCrypto.newKeyPair();
        KeyPair device = ConnectCrypto.newKeyPair();
        StringBuilder text = new StringBuilder();
        for (int i = 0; i < 7000; i++) text.append('a');
        try {
            Envelopes.request(new JSONObject().put("kind", "chat").put("text", text), "d", "k", server.getPublic(),
                    data -> ConnectCrypto.sign(device.getPrivate(), data), 1);
            throw new AssertionError("plus de 8 Ko ne doit pas partir");
        } catch (IllegalArgumentException expected) {
            // Refusé avant l'envoi.
        }
        // La limite de l'écran (1 000 caractères, même accentués) tient dans 8 Ko.
        StringBuilder max = new StringBuilder();
        for (int i = 0; i < ConnectScreen.MAX_TEXT; i++) max.append('é');
        Envelopes.request(new JSONObject().put("kind", "chat").put("text", max).put("conversationId", "c1"), "d", "k",
                server.getPublic(), data -> ConnectCrypto.sign(device.getPrivate(), data), 1);
    }

    @Test
    public void leRelaisIgnoreLesDoublonsEtOublieApresDixMinutes() {
        RelayTable table = new RelayTable();
        assertNotNull(table.admit("a", "voisin-1", "{}", 1, 0));
        assertNull(table.admit("a", "voisin-2", "{}", 1, 1000));
        assertEquals("voisin-1", table.get("a", 2000).from);
        assertNull(table.get("a", RelayTable.TTL_MS + 1));
        assertNotNull(table.admit("a", "voisin-2", "{}", 1, RelayTable.TTL_MS + 2));
        assertTrue(RelayTable.canForward(4));
        assertFalse(RelayTable.canForward(5));
        RelayTable.Entry answered = table.admit("b", null, "{}", 0, RelayTable.TTL_MS + 3);
        answered.answered = true;
        assertEquals(1, table.open(RelayTable.TTL_MS + 4).size());
    }
}
