package yt.tamilya.app.connect;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;

import com.google.android.gms.nearby.Nearby;
import com.google.android.gms.nearby.connection.AdvertisingOptions;
import com.google.android.gms.nearby.connection.ConnectionInfo;
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback;
import com.google.android.gms.nearby.connection.ConnectionResolution;
import com.google.android.gms.nearby.connection.ConnectionsClient;
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo;
import com.google.android.gms.nearby.connection.DiscoveryOptions;
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback;
import com.google.android.gms.nearby.connection.Payload;
import com.google.android.gms.nearby.connection.PayloadCallback;
import com.google.android.gms.nearby.connection.PayloadTransferUpdate;
import com.google.android.gms.nearby.connection.Strategy;

import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;

/**
 * Réseau entre téléphones (Google Nearby Connections, P2P_CLUSTER). Chaque téléphone
 * avec l'app ouverte relaie : sans internet il passe les demandes aux voisins (5 sauts
 * au plus), avec internet il les poste au serveur et renvoie la réponse par le même chemin.
 * Les relais ne lisent rien : tout est chiffré pour le serveur et signé par l'appareil d'origine.
 */
final class MeshRelay {
    static final String SERVICE_ID = "yt.tamilya.connect";

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

    private final ConnectionsClient client;
    private final Listener listener;
    private final ExecutorService io;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final RelayTable table = new RelayTable();
    private final Set<String> peers = new HashSet<>();
    /** Nom annoncé aux voisins : au hasard, sans rien sur la personne. */
    private final String name = UUID.randomUUID().toString().substring(0, 8);
    private boolean running;
    private boolean online;

    MeshRelay(Context context, Listener listener, ExecutorService io) {
        this.client = Nearby.getConnectionsClient(context);
        this.listener = listener;
        this.io = io;
    }

    void start() {
        if (running) return;
        running = true;
        Strategy strategy = Strategy.P2P_CLUSTER;
        client.startAdvertising(name, SERVICE_ID, lifecycle, new AdvertisingOptions.Builder().setStrategy(strategy).build())
                .addOnFailureListener(e -> listener.onProblem("Active le Bluetooth et la localisation pour trouver des relais."));
        client.startDiscovery(SERVICE_ID, discovery, new DiscoveryOptions.Builder().setStrategy(strategy).build())
                .addOnFailureListener(e -> listener.onProblem("Active le Bluetooth et la localisation pour trouver des relais."));
    }

    void stop() {
        if (!running) return;
        running = false;
        client.stopAdvertising();
        client.stopDiscovery();
        client.stopAllEndpoints();
        peers.clear();
        listener.onPeers(0);
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
            entry.sentTo.add(peer);
            client.sendPayload(peer, Payload.fromBytes(json.getBytes(StandardCharsets.UTF_8)));
            if (entry.own()) listener.onRelayed(entry.id);
        } catch (JSONException ignored) {
            // Enveloppe déjà vérifiée à la réception : ne devrait pas arriver.
        }
    }

    private void post(RelayTable.Entry entry) {
        if (entry.posted || entry.answered) return;
        entry.posted = true;
        if (entry.own()) listener.onRelayed(entry.id);
        io.execute(() -> {
            try {
                String reply = ConnectApi.relay(entry.json);
                byte[] bytes = reply.getBytes(StandardCharsets.UTF_8);
                // Pas une enveloppe (route absente, page d'erreur…) : on réessaiera plus tard.
                if (Envelopes.parse(bytes) == null) throw new java.io.IOException("réponse inattendue");
                main.post(() -> onReply(bytes, null));
            } catch (Exception e) {
                // Serveur injoignable : on réessaiera au prochain retour d'internet.
                main.post(() -> entry.posted = false);
            }
        });
    }

    private void onRequest(JSONObject envelope, String from) {
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
        entry.answered = true;
        boolean refused = "error".equals(type);
        // Refus : on oublie la demande ici, pour que son renvoi puisse repasser par ce téléphone.
        if (refused && !entry.own()) table.forget(id);
        if (entry.own()) {
            if (refused) listener.onRefused(id, reply.optString("error"));
            else listener.onReply(id, reply);
        } else if (peers.contains(entry.from)) {
            client.sendPayload(entry.from, Payload.fromBytes(bytes));
        }
    }

    private void onPayload(String from, byte[] bytes) {
        JSONObject envelope = Envelopes.parse(bytes);
        if (envelope == null) return;
        if ("request".equals(envelope.optString("type"))) onRequest(envelope, from);
        else onReply(bytes, from);
    }

    private final PayloadCallback payloads = new PayloadCallback() {
        @Override
        public void onPayloadReceived(String endpointId, Payload payload) {
            if (payload.getType() == Payload.Type.BYTES) onPayload(endpointId, payload.asBytes());
        }

        @Override
        public void onPayloadTransferUpdate(String endpointId, PayloadTransferUpdate update) { }
    };

    private final ConnectionLifecycleCallback lifecycle = new ConnectionLifecycleCallback() {
        @Override
        public void onConnectionInitiated(String endpointId, ConnectionInfo info) {
            // Pas de code à comparer : le contenu est chiffré et signé, un voisin ne peut rien en faire.
            client.acceptConnection(endpointId, payloads);
        }

        @Override
        public void onConnectionResult(String endpointId, ConnectionResolution resolution) {
            if (!resolution.getStatus().isSuccess()) return;
            peers.add(endpointId);
            listener.onPeers(peers.size());
            if (!online) for (RelayTable.Entry entry : table.open(now())) forward(entry, endpointId);
        }

        @Override
        public void onDisconnected(String endpointId) {
            peers.remove(endpointId);
            listener.onPeers(peers.size());
        }
    };

    private final EndpointDiscoveryCallback discovery = new EndpointDiscoveryCallback() {
        @Override
        public void onEndpointFound(String endpointId, DiscoveredEndpointInfo info) {
            // Un seul des deux demande la connexion, pour ne pas se croiser.
            if (name.compareTo(info.getEndpointName()) < 0) client.requestConnection(name, endpointId, lifecycle);
        }

        @Override
        public void onEndpointLost(String endpointId) { }
    };
}
