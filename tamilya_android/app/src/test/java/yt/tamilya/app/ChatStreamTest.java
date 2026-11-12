package yt.tamilya.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Test;

import java.util.List;

public class ChatStreamTest {
    @Test
    public void litLesLignesCompletesEtGardeLeReste() throws Exception {
        ChatStream stream = new ChatStream();
        List<JSONObject> first = stream.push("{\"type\":\"meta\",\"conversationId\":\"abc\"}\n{\"type\":\"delta\",\"te");
        assertEquals(1, first.size());
        assertEquals("abc", first.get(0).getString("conversationId"));
        List<JSONObject> second = stream.push("xt\":\"Bonjour\"}\n");
        assertEquals(1, second.size());
        assertEquals("Bonjour", second.get(0).getString("text"));
    }

    @Test
    public void ignoreLesLignesIllisiblesEtLesTypesInconnus() throws Exception {
        ChatStream stream = new ChatStream();
        List<JSONObject> events = stream.push("pas du json\n{\"type\":\"autre\"}\n\n{\"type\":\"done\",\"finishReason\":\"stop\"}\n");
        assertEquals(1, events.size());
        assertEquals("done", events.get(0).getString("type"));
    }

    @Test
    public void flushRendLaDerniereLigneSansRetour() throws Exception {
        ChatStream stream = new ChatStream();
        assertTrue(stream.push("{\"type\":\"delta\",\"text\":\"fin\"}").isEmpty());
        List<JSONObject> rest = stream.flush();
        assertEquals(1, rest.size());
        assertEquals("fin", rest.get(0).getString("text"));
        assertTrue(stream.flush().isEmpty());
    }
}
