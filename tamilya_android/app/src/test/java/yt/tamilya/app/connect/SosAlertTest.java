package yt.tamilya.app.connect;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class SosAlertTest {
    @Test
    public void seulLeMotSosDeclencheLAlerte() {
        assertTrue(SosAlert.isSos("SOS"));
        assertTrue(SosAlert.isSos("sos"));
        assertTrue(SosAlert.isSos(" S O S ! "));
        assertTrue(SosAlert.isSos("Sos."));
        assertFalse(SosAlert.isSos("c'est quoi SOS Médecins ?"));
        assertFalse(SosAlert.isSos("sosie"));
        assertFalse(SosAlert.isSos(""));
        assertFalse(SosAlert.isSos(null));
    }
}
