package yt.tamilya.app.connect;

import static org.junit.Assert.assertEquals;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class ConnectHistoryTest {
    private static JSONObject item(String id, boolean local) throws Exception {
        JSONObject item = new JSONObject().put("id", id).put("title", id).put("source", "tamilya");
        return local ? item.put("local", true) : item;
    }

    @Test
    public void lesConversationsLocalesRestentJusquaCeQueLeCompteLesConnaisse() throws Exception {
        JSONArray local = new JSONArray().put(item("hors-ligne", true)).put(item("deja-lue", true)).put(item("supprimee", false));
        JSONArray server = new JSONArray().put(item("deja-lue", false)).put(item("autre", false));
        JSONArray merged = ConnectHistory.merge(server, local);
        assertEquals(3, merged.length());
        assertEquals("hors-ligne", merged.getJSONObject(0).getString("id"));
        assertEquals("deja-lue", merged.getJSONObject(1).getString("id"));
        assertEquals("autre", merged.getJSONObject(2).getString("id"));
    }

    @Test
    public void uneConversationNeeIciPasseEnTeteSansDoublon() throws Exception {
        JSONArray list = ConnectHistory.addLocal(new JSONArray().put(item("a", false)).put(item("b", false)), "b", "Barge");
        assertEquals(2, list.length());
        assertEquals("b", list.getJSONObject(0).getString("id"));
        assertEquals("connect", list.getJSONObject(0).getString("source"));
    }

    @Test
    public void lesMessagesDuSiteDeviennentDesBullesLisibles() throws Exception {
        JSONArray server = new JSONArray()
                .put(new JSONObject().put("id", "1").put("role", "user").put("content", "Bonjour"))
                .put(new JSONObject().put("id", "2").put("role", "assistant").put("content", "Voici **ton** billet\n\n```ticket-barge\npieton 1\n```"))
                .put(new JSONObject().put("id", "3").put("role", "assistant").put("content", "```attestation-hebergement\nformulaire\n```"))
                .put(new JSONObject().put("id", "4").put("role", "system").put("content", "caché"));
        JSONArray local = ConnectHistory.toLocal(server);
        assertEquals(2, local.length());
        assertEquals("me", local.getJSONObject(0).getString("from"));
        assertEquals("tamilya", local.getJSONObject(1).getString("from"));
        assertEquals("Voici ton billet", local.getJSONObject(1).getString("text"));
    }
}
