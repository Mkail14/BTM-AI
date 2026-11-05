package yt.tamilya.app.connect;

import static org.junit.Assume.assumeTrue;

import org.json.JSONObject;
import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.KeyPair;

/**
 * Échange croisé avec WebCrypto (tools/connect-interop.mjs), comme le fera le serveur.
 * Ne tourne que si TAMILYA_INTEROP désigne un dossier préparé par ce script.
 */
public class InteropTest {
    private static Path dir() {
        String value = System.getenv("TAMILYA_INTEROP");
        assumeTrue("échange croisé non demandé", value != null && !value.isEmpty());
        return Paths.get(value);
    }

    private static String read(Path file) throws Exception {
        return new String(Files.readAllBytes(file), StandardCharsets.UTF_8).trim();
    }

    private static void write(Path file, String text) throws Exception {
        Files.write(file, text.getBytes(StandardCharsets.UTF_8));
    }

    @Test
    public void etape1_lAppEcritUneDemande() throws Exception {
        Path dir = dir();
        assumeTrue(Files.exists(dir.resolve("server.pub")) && !Files.exists(dir.resolve("reply.json")));
        KeyPair device = ConnectCrypto.newKeyPair();
        JSONObject content = new JSONObject().put("kind", "chat").put("text", "Je veux un billet de barge pour demain")
                .put("conversationId", "conv-42");
        Envelopes.Outgoing out = Envelopes.request(content, "dev-interop", read(dir.resolve("server.kid")),
                ConnectCrypto.publicKey(read(dir.resolve("server.pub"))),
                data -> ConnectCrypto.sign(device.getPrivate(), data), System.currentTimeMillis());
        write(dir.resolve("request.json"), out.json);
        write(dir.resolve("device.pub"), ConnectCrypto.b64(device.getPublic().getEncoded()));
        write(dir.resolve("replykey.txt"), ConnectCrypto.b64(out.replyKey));
    }

    @Test
    public void etape2_lAppLitLaReponse() throws Exception {
        Path dir = dir();
        assumeTrue(Files.exists(dir.resolve("reply.json")));
        JSONObject reply = Envelopes.parse(read(dir.resolve("reply.json")));
        if (reply == null) throw new AssertionError("enveloppe de réponse refusée");
        JSONObject opened = Envelopes.openReply(reply, ConnectCrypto.unb64(read(dir.resolve("replykey.txt"))));
        write(dir.resolve("opened.json"), opened.toString());
    }
}
