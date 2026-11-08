package yt.tamilya.app.connect;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class FrameAssemblerTest {

    private static byte[] bytes(String text) {
        return text.getBytes(java.nio.charset.StandardCharsets.UTF_8);
    }

    @Test
    public void recolleLesMorceauxDansLOrdre() {
        FrameAssembler a = new FrameAssembler(100);
        assertNull(a.add(1, 1, 3, bytes("lo ")));
        assertNull(a.add(1, 0, 3, bytes("Hel")));
        assertArrayEquals(bytes("Hello Mayotte"), a.add(1, 2, 3, bytes("Mayotte")));
        assertEquals(0, a.pendingCount());
    }

    @Test
    public void unSeulMorceauSuffit() {
        FrameAssembler a = new FrameAssembler(100);
        assertArrayEquals(bytes("ok"), a.add(9, 0, 1, bytes("ok")));
    }

    @Test
    public void refuseLesMorceauxImpossibles() {
        FrameAssembler a = new FrameAssembler(100);
        assertNull(a.add(1, 0, 0, bytes("x")));
        assertNull(a.add(1, 3, 3, bytes("x")));
        assertNull(a.add(1, -1, 3, bytes("x")));
        assertNull(a.add(1, 0, 101, bytes("x")));
        assertNull(a.add(1, 0, 2, null));
        assertEquals(0, a.pendingCount());
    }

    /** Avant : chaque numéro de message ouvrait une case gardée pour toujours. */
    @Test
    public void lesMessagesIncompletsNeRemplissentPasLaMemoire() {
        FrameAssembler a = new FrameAssembler(100);
        for (int message = 0; message < 10_000; message++) a.add(message, 0, 50, bytes("x"));
        assertEquals(FrameAssembler.MAX_PENDING, a.pendingCount());
    }

    @Test
    public void lePlusAncienPartEnPremier() {
        FrameAssembler a = new FrameAssembler(100);
        a.add(0, 0, 2, bytes("a"));
        for (int message = 1; message <= FrameAssembler.MAX_PENDING; message++) a.add(message, 0, 2, bytes("b"));
        // Le message 0 a été oublié : son deuxième morceau seul ne suffit plus.
        assertNull(a.add(0, 1, 2, bytes("c")));
        // Le plus récent est toujours là.
        assertArrayEquals(bytes("bd"), a.add(FrameAssembler.MAX_PENDING, 1, 2, bytes("d")));
    }

    @Test
    public void unMessageTropGrosEstAbandonne() {
        FrameAssembler a = new FrameAssembler(10);
        assertNull(a.add(1, 0, 2, bytes("123456")));
        assertNull(a.add(1, 1, 2, bytes("789012")));
        assertEquals(0, a.pendingCount());
    }

    @Test
    public void unMorceauRecuDeuxFoisNeCompteQuUneFois() {
        FrameAssembler a = new FrameAssembler(10);
        assertNull(a.add(1, 0, 2, bytes("12345")));
        assertNull(a.add(1, 0, 2, bytes("12345")));
        assertArrayEquals(bytes("1234567890"), a.add(1, 1, 2, bytes("67890")));
    }

    @Test
    public void unAutreNombreDeMorceauxRepartDeZero() {
        FrameAssembler a = new FrameAssembler(100);
        a.add(1, 0, 3, bytes("a"));
        assertArrayEquals(bytes("z"), a.add(1, 0, 1, bytes("z")));
    }
}
