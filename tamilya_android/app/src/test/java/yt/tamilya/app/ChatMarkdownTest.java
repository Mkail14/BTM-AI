package yt.tamilya.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.List;

public class ChatMarkdownTest {
    @Test
    public void separeLesCartesDuTexte() {
        List<ChatMarkdown.Part> parts = ChatMarkdown.split("Voici ton ticket.\n\n```ticket-barge\npieton 1\n```\n\nBon voyage !");
        assertEquals(3, parts.size());
        assertEquals("Voici ton ticket.", parts.get(0).text);
        assertTrue(parts.get(1).isCard());
        assertEquals("ticket-barge", parts.get(1).card);
        assertEquals("pieton 1", parts.get(1).text);
        assertEquals("Bon voyage !", parts.get(2).text);
    }

    @Test
    public void reconnaitUneCarteColleeALaPhrase() {
        List<ChatMarkdown.Part> parts = ChatMarkdown.split("Ok, ticket barge. ```ticket-barge pieton 1\n```");
        assertEquals(2, parts.size());
        assertEquals("Ok, ticket barge.", parts.get(0).text);
        assertEquals("ticket-barge", parts.get(1).card);
    }

    @Test
    public void gardeLeVraiCodeDansLeTexte() {
        List<ChatMarkdown.Part> parts = ChatMarkdown.split("Exemple :\n```js\nconsole.log(1)\n```");
        assertEquals(1, parts.size());
        assertFalse(parts.get(0).isCard());
        assertTrue(parts.get(0).text.contains("console.log(1)"));
    }

    @Test
    public void carteEnCoursSansFinEstUneCarte() {
        List<ChatMarkdown.Part> parts = ChatMarkdown.split("Je prépare.\n```commande-repas\ntacos");
        assertEquals(2, parts.size());
        assertEquals("commande-repas", parts.get(1).card);
        assertEquals("Commande de repas", ChatMarkdown.cardLabel(parts.get(1).card));
    }

    @Test
    public void texteBrutSansMiseEnForme() {
        assertEquals("Merci se dit marahaba. Vois le site",
                ChatMarkdown.plain("**Merci** se dit [[marahaba]]. Vois [le site](https://tamilya.yt)\n```ticket-barge\nx\n```"));
    }
}
