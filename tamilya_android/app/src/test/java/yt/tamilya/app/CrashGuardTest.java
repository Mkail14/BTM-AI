package yt.tamilya.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class CrashGuardTest {
    @Test
    public void relanceLesPremiersArrets() {
        CrashGuard guard = new CrashGuard();
        assertTrue(guard.allowRestart(0));
        assertTrue(guard.allowRestart(1_000));
        assertTrue(guard.allowRestart(2_000));
    }

    @Test
    public void arreteLaBoucleApresTroisArretsEnUneMinute() {
        CrashGuard guard = new CrashGuard();
        guard.allowRestart(0);
        guard.allowRestart(1_000);
        guard.allowRestart(2_000);
        assertFalse(guard.allowRestart(3_000));
    }

    @Test
    public void repartAZeroQuandLesArretsSontEspaces() {
        CrashGuard guard = new CrashGuard();
        guard.allowRestart(0);
        guard.allowRestart(1_000);
        guard.allowRestart(2_000);
        assertTrue(guard.allowRestart(120_000));
    }
}
