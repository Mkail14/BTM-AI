package yt.tamilya.app.connect;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.util.LinkedHashMap;

public class BargeTableTest {
    private static JSONObject choice(JSONArray cart) throws Exception {
        return new JSONObject().put("id", "x".repeat(24)).put("table", "barge").put("cart", cart);
    }

    private static JSONObject line(String id, int quantity) throws Exception {
        return new JSONObject().put("ticketId", id).put("quantity", quantity);
    }

    @Test
    public void leTableauReprendLesTicketsDemandesEtIgnoreLesInconnus() throws Exception {
        LinkedHashMap<String, Integer> cart = BargeTable.cartOf(choice(new JSONArray()
                .put(line("pieton", 2)).put(line("fusee", 1)).put(line("voiture", 99)).put(line("moto", 0))));
        assertEquals(2, cart.size());
        assertEquals(Integer.valueOf(2), cart.get("pieton"));
        assertEquals(Integer.valueOf(BargeTable.MAX_QUANTITY), cart.get("voiture"));
        assertNull(cart.get("moto"));
    }

    @Test
    public void totalEtResumeCommeLeSite() throws Exception {
        LinkedHashMap<String, Integer> cart = new LinkedHashMap<>();
        cart.put("pieton", 2);
        cart.put("voiture", 1);
        assertEquals(1700, BargeTable.total(cart));
        assertEquals(3, BargeTable.count(cart));
        assertEquals("Barge Mamoudzou → Dzaoudzi : 2× Piéton, 1× Voiture · 17 €", BargeTable.summary(cart));
        assertEquals("2,50 €", BargeTable.euros(250));
    }

    @Test
    public void leServeurNeRecoitQueDesTicketsJamaisDePrix() throws Exception {
        LinkedHashMap<String, Integer> cart = new LinkedHashMap<>();
        cart.put("pl-15", 1);
        JSONArray sent = BargeTable.toJson(cart);
        assertEquals(1, sent.length());
        assertEquals("pl-15", sent.getJSONObject(0).getString("ticketId"));
        assertFalse(sent.getJSONObject(0).has("priceCents"));
    }
}
