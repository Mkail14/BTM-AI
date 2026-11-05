package yt.tamilya.app.connect;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Réseau entre téléphones, sur les liens Bluetooth de BleMesh. Une seule instance par
 * application : elle survit à l'écran, et RelayService la garde active en arrière-plan.
 * Chaque téléphone relaie : sans internet il passe les demandes aux voisins (5 sauts
 * au plus), avec internet il les poste au serveur et renvoie la réponse par le même chemin.
 * Les relais ne lisent rien : tout est chiffré pour le serveur et signé par l'appareil d'origine.
 */
final class MeshRelay implements BleMesh.Events {
    interface Listener {
        void onPeers(int count);
        /** Une demande écrite ici a été passée à un voisin ou au serveur. */
        void onRelayed(String id);
        /** Réponse à une demande écrite ici. */
        void onReply(String id, JSONObject reply);
        /** Refus du serveur pour une demande écrite ici (code : key_changed, pending…). */
        void onRefused(String id, String code);
        void onProblem(String message);
    }

    private static final String TAG = "TamilyaConnect";
    private static final String RADIO_HELP = "Active le Bluetooth pour trouver des relais.";
    private static final Listener NOBODY = new Listener() {
        @Override public void onPeers(int count) { }
        @Override public void onRelayed(String id) { }
        @Override public void onReply(String id, JSONObject reply) { }
        @Override public void onRefused(String id, String code) { }
        @Override public void onProblem(String message) { }
    };
    /** Le temps d'un envoi au serveur, écran éteint. */
    private static final long POST_WAKE_MS = 30_000;
    /** Sans réponse, on redonne sa demande au voisin (il garde la réponse s'il l'a déjà). */
    private static final long RESEND_MS = 20_000;
    private static final int MAX_SENDS = 5;
    private static MeshRelay shared;

    private Listener listener = NOBODY;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final PowerManager.WakeLock wake;
    private final BleMesh ble;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final RelayTable table = new RelayTable();
    private final Set<String> peers = new HashSet<>();
    private boolean running;
    private boolean online;

    private MeshRelay(Context context) {
        PowerManager power = context.getSystemService(PowerManager.class);
        this.wake = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "tamilya:relais");
        this.wake.setReferenceCounted(false);
        // Nom donné aux voisins : au hasard à chaque lancement, sans rien sur la personne.
        this.ble = new BleMesh(context, UUID.randomUUID().toString().substring(0, 8), this);
    }

    static synchronized MeshRelay shared(Context context) {
        if (shared == null) shared = new MeshRelay(context.getApplicationContext());
        return shared;
    }

    /** L'écran de Connect qui reçoit les nouvelles. */
    void setListener(Listener listener) {
        this.listener = listener;
        listener.onPeers(peers.size());
    }

    /** L'écran disparaît ; un nouvel écran a pu prendre sa place entre-temps. */
    void clearListener(Listener listener) {
        if (this.listener == listener) this.listener = NOBODY;
    }

    void start() {
        if (running) return;
        running = true;
        listener.onPeers(peers.size());
        ble.start();
    }

    void stop() {
        if (!running) return;
        running = false;
        ble.stop();
        peers.clear();
        listener.onPeers(0);
    }

    void setOnScreen(boolean value) {
        ble.setOnScreen(value);
    }

    boolean running() {
        return running;
    }

    void setOnline(boolean online) {
        this.online = online;
        if (online) for (RelayTable.Entry entry : table.open(now())) post(entry);
    }

    /** Une demande écrite ici. */
    void sendOwn(String id, String json) {
        RelayTable.Entry entry = table.admit(id, null, json, 0, now());
        if (entry != null) spread(entry);
    }

    /** Renvoie une demande écrite ici (même id : le serveur ne la traite jamais deux fois). */
    void resend(String id, String json) {
        table.forget(id);
        sendOwn(id, json);
    }

    /** Demande écrite avant un redémarrage de l'app, encore sans réponse. */
    void restoreOwn(String id, String json, long at) {
        // Si le relais a survécu à l'écran, on repart de zéro : la réponse a pu arriver sans personne pour la lire.
        table.forget(id);
        RelayTable.Entry entry = table.restore(id, json, at, now());
        if (entry != null) spread(entry);
    }

    private static long now() {
        return System.currentTimeMillis();
    }

    private void spread(RelayTable.Entry entry) {
        if (online) post(entry);
        else for (String peer : peers) forward(entry, peer);
    }

    /** Passe la demande à un voisin, avec un saut de plus (sauf la sienne, qui part à 0). */
    private void forward(RelayTable.Entry entry, String peer) {
        if (entry.answered || peer.equals(entry.from) || entry.sentTo.contains(peer)) return;
        int hops = entry.own() ? 0 : entry.hops + 1;
        if (!entry.own() && !RelayTable.canForward(entry.hops)) return;
        try {
            String json = entry.own() ? entry.json : Envelopes.withHops(new JSONObject(entry.json), hops);
            if (!ble.send(peer, json.getBytes(StandardCharsets.UTF_8))) return;
            entry.sentTo.add(peer);
            Log.i(TAG, "Demande passée à un voisin");
            if (entry.own()) {
                listener.onRelayed(entry.id);
                if (++entry.sends < MAX_SENDS) main.postDelayed(() -> resendTo(entry, peer), RESEND_MS);
            }
        } catch (JSONException ignored) {
            // Enveloppe déjà vérifiée à la réception : ne devrait pas arriver.
        }
    }

    /** Un morceau a pu se perdre en route : rien ne le signale, seule l'absence de réponse le montre. */
    private void resendTo(RelayTable.Entry entry, String peer) {
        if (entry.answered || !peers.contains(peer)) return;
        entry.sentTo.remove(peer);
        forward(entry, peer);
    }

    private void post(RelayTable.Entry entry) {
        if (entry.posted || entry.answered) return;
        entry.posted = true;
        wake.acquire(POST_WAKE_MS);
        Log.i(TAG, entry.own() ? "Demande envoyée au serveur" : "Demande d'un voisin envoyée au serveur");
        if (entry.own()) listener.onRelayed(entry.id);
        io.execute(() -> {
            try {
                String reply = ConnectApi.relay(entry.json);
                byte[] bytes = reply.getBytes(StandardCharsets.UTF_8);
                // Pas une enveloppe (route absente, page d'erreur…) : on réessaiera plus tard.
                if (Envelopes.parse(bytes) == null) throw new java.io.IOException("réponse inattendue");
                Log.i(TAG, "Réponse du serveur reçue");
                main.post(() -> onReply(bytes, null));
            } catch (Exception e) {
                // Serveur injoignable : on réessaiera au prochain retour d'internet.
                main.post(() -> {
                    entry.posted = false;
                    // Internet annoncé mais serveur injoignable : un voisin aura peut-être plus de chance.
                    for (String peer : peers) forward(entry, peer);
                });
            } finally {
                wake.release();
            }
        });
    }

    private void onRequest(JSONObject envelope, String from) {
        RelayTable.Entry known = table.get(envelope.optString("id"), now());
        if (known != null && !known.own()) {
            // Le voisin redemande : la connexion a sauté. La réponse repart par le nouveau chemin.
            known.from = from;
            if (known.reply != null) ble.send(from, known.reply);
            return;
        }
        RelayTable.Entry entry = table.admit(envelope.optString("id"), from, envelope.toString(),
                envelope.optInt("hops"), now());
        if (entry != null) spread(entry);
    }

    /** Réponse du serveur (from = null) ou d'un voisin : on la rend à qui l'avait demandée. */
    private void onReply(byte[] bytes, String from) {
        JSONObject reply = Envelopes.parse(bytes);
        if (reply == null) return;
        String type = reply.optString("type");
        if (!"reply".equals(type) && !"error".equals(type)) return;
        String id = reply.optString("id");
        RelayTable.Entry entry = table.get(id, now());
        if (entry == null || entry.answered) return;
        // Écrite ici, mais plus d'écran pour la lire : elle reste en attente, l'app la redemandera.
        if (entry.own() && listener == NOBODY) return;
        entry.answered = true;
        boolean refused = "error".equals(type);
        // Refus : on oublie la demande ici, pour que son renvoi puisse repasser par ce téléphone.
        if (refused && !entry.own()) table.forget(id);
        if (entry.own()) {
            if (refused) listener.onRefused(id, reply.optString("error"));
            else listener.onReply(id, reply);
        } else {
            entry.reply = refused ? null : bytes;
            if (peers.contains(entry.from)) {
                Log.i(TAG, "Réponse rendue au voisin");
                ble.send(entry.from, bytes);
            }
        }
    }

    // --- Événements Bluetooth

    @Override
    public void onData(String peer, byte[] data) {
        JSONObject envelope = Envelopes.parse(data);
        if (envelope == null) return;
        if ("request".equals(envelope.optString("type"))) onRequest(envelope, peer);
        else onReply(data, peer);
    }

    @Override
    public void onPeerUp(String peer) {
        peers.add(peer);
        listener.onPeers(peers.size());
        for (RelayTable.Entry entry : table.open(now())) if (!entry.posted) forward(entry, peer);
    }

    @Override
    public void onPeerDown(String peer) {
        peers.remove(peer);
        // Un voisin revenu n'a peut-être rien reçu : il pourra tout redemander.
        for (RelayTable.Entry entry : table.open(now())) entry.sentTo.remove(peer);
        listener.onPeers(peers.size());
    }

    @Override
    public void onRadioProblem() {
        // On repart de zéro au prochain retour dans l'app (Bluetooth rallumé entre-temps, par exemple).
        stop();
        listener.onProblem(RADIO_HELP);
    }
}
