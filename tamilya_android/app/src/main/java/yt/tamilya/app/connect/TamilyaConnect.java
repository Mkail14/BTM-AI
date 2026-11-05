package yt.tamilya.app.connect;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.text.InputFilter;
import android.text.InputType;
import android.view.View;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.security.KeyPair;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Tamilya Connect : écrire à Tamilya sans internet. Le message passe de téléphone en
 * téléphone jusqu'à un téléphone connecté, qui le poste au serveur ; la réponse revient
 * par le même chemin. Relais seulement quand l'app est ouverte.
 */
public final class TamilyaConnect implements MeshRelay.Listener, ConnectScreen.Actions {
    /** Une journée : la clé du serveur est relue au plus une fois par jour. */
    private static final long KEY_REFRESH_MS = 24 * 60 * 60 * 1000L;

    public interface Host {
        void requestConnectPermissions(String[] permissions);
        void onConnectClosed();
    }

    private final Activity activity;
    private final Host host;
    private final ConnectStore store;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ConnectScreen screen;
    private final MeshRelay mesh;
    private boolean syncing;

    public TamilyaConnect(Activity activity, Host host) {
        this.activity = activity;
        this.host = host;
        this.store = new ConnectStore(activity);
        this.screen = new ConnectScreen(activity, this);
        this.screen.setVisibility(View.GONE);
        this.mesh = new MeshRelay(activity, this, io);
        restorePending();
    }

    public View view() {
        return screen;
    }

    public boolean isOpen() {
        return screen.getVisibility() == View.VISIBLE && !closing;
    }

    private boolean closing;

    /** Fermeture par le geste : seulement quand la discussion est tout en bas. */
    public boolean atBottom() {
        return screen.atBottom();
    }

    /** Permissions de Nearby Connections, selon la version d'Android. */
    public static String[] permissions() {
        List<String> list = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            list.add(Manifest.permission.BLUETOOTH_ADVERTISE);
            list.add(Manifest.permission.BLUETOOTH_CONNECT);
            list.add(Manifest.permission.BLUETOOTH_SCAN);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            list.add(Manifest.permission.NEARBY_WIFI_DEVICES);
        } else {
            list.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }
        return list.toArray(new String[0]);
    }

    public boolean hasPermissions() {
        for (String permission : permissions()) {
            if (activity.checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) return false;
        }
        return true;
    }

    public void open() {
        // Apparition douce : l'écran monte un peu, grandit et s'éclaire.
        closing = false;
        screen.animate().cancel();
        screen.setAlpha(0f);
        screen.setScaleX(0.94f);
        screen.setScaleY(0.94f);
        screen.setTranslationY(screen.getResources().getDisplayMetrics().density * 56);
        screen.setVisibility(View.VISIBLE);
        screen.animate().alpha(1f).scaleX(1f).scaleY(1f).translationY(0f).setDuration(420)
                .setInterpolator(new android.view.animation.OvershootInterpolator(0.8f)).withEndAction(null).start();
        render();
        if (!store.ready()) {
            screen.setNotice("Pour activer Tamilya Connect, ouvre l'app une fois avec internet, en étant connecté à ton compte.");
        } else {
            screen.setNotice(null);
        }
        if (hasPermissions()) mesh.start();
        else host.requestConnectPermissions(permissions());
    }

    public void onPermissionsResult() {
        if (hasPermissions()) {
            if (store.ready()) screen.setNotice(null);
            mesh.start();
        } else {
            screen.setNotice("Autorise « Appareils à proximité » pour trouver des téléphones relais.");
        }
    }

    @Override
    public void close() {
        if (!isOpen()) return;
        InputMethodManager keyboard = (InputMethodManager) activity.getSystemService(Context.INPUT_METHOD_SERVICE);
        if (keyboard != null) keyboard.hideSoftInputFromWindow(screen.getWindowToken(), 0);
        // Départ doux : l'écran s'envole vers le haut et s'efface (depuis là où le doigt l'a laissé).
        closing = true;
        screen.animate().cancel();
        float density = screen.getResources().getDisplayMetrics().density;
        screen.animate().alpha(0f).scaleX(0.94f).scaleY(0.94f).translationY(-density * 72).setDuration(300)
                .setInterpolator(new android.view.animation.AccelerateInterpolator(1.4f))
                .withEndAction(() -> {
                    screen.setVisibility(View.GONE);
                    screen.setAlpha(1f);
                    screen.setScaleX(1f);
                    screen.setScaleY(1f);
                    screen.setTranslationY(0f);
                    closing = false;
                })
                .start();
        host.onConnectClosed();
    }

    /** App au premier plan : on relaie (pour soi et pour les autres), si c'est permis. */
    public void resume() {
        if (hasPermissions()) mesh.start();
    }

    public void pause() {
        mesh.stop();
    }

    public void destroy() {
        mesh.stop();
        io.shutdown();
    }

    public void setOnline(boolean online) {
        mesh.setOnline(online);
    }

    /**
     * En ligne et connecté : enregistre la clé de l'appareil pour le compte et garde la clé
     * du serveur pour le hors ligne. Silencieux en cas d'échec (on réessaie à la prochaine page).
     */
    public void syncAccount(String cookies) {
        if (syncing) return;
        boolean signedIn = cookies != null && cookies.contains("-auth-token");
        boolean needKey = store.serverKey().isEmpty() || System.currentTimeMillis() - store.keyFetchedAt() > KEY_REFRESH_MS;
        boolean needDevice = signedIn && store.deviceId().isEmpty();
        if (!needKey && !needDevice) return;
        syncing = true;
        io.execute(() -> {
            try {
                if (needKey) {
                    JSONObject key = ConnectApi.serverKey();
                    ConnectCrypto.publicKey(key.getString("publicKey"));
                    store.setServerKey(key.getString("keyId"), key.getString("publicKey"), System.currentTimeMillis());
                }
                if (needDevice) {
                    KeyPair device = DeviceKeys.get();
                    JSONObject answer = ConnectApi.registerDevice(cookies, ConnectCrypto.b64(device.getPublic().getEncoded()));
                    store.setDeviceId(answer.getString("deviceId"));
                    // Le serveur donne aussi sa clé : rien de plus à demander.
                    if (!answer.optString("keyId").isEmpty() && !answer.optString("publicKey").isEmpty()) {
                        ConnectCrypto.publicKey(answer.getString("publicKey"));
                        store.setServerKey(answer.getString("keyId"), answer.getString("publicKey"), System.currentTimeMillis());
                    }
                }
            } catch (Exception ignored) {
                // Routes pas encore en ligne, ou réseau faible : rien à montrer.
            } finally {
                main.post(() -> syncing = false);
            }
        });
    }

    // --- Messages

    @Override
    public void send(String text) {
        JSONObject content = new JSONObject();
        try {
            content.put("kind", "chat").put("text", text);
            if (!store.conversationId().isEmpty()) content.put("conversationId", store.conversationId());
        } catch (JSONException e) {
            return;
        }
        request(content, text);
    }

    @Override
    public void action(String actionId, String label, boolean pay) {
        if (!pay) {
            sendAction(actionId, label, null);
            return;
        }
        EditText pin = new EditText(activity);
        pin.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        pin.setFilters(new InputFilter[]{new InputFilter.LengthFilter(4)});
        pin.setHint("Code à 4 chiffres");
        new AlertDialog.Builder(activity)
                .setTitle(label)
                .setMessage("Ton code de paiement (le même que pour payer à la voix).")
                .setView(pin)
                .setNegativeButton("Annuler", null)
                .setPositiveButton("Payer", (dialog, which) -> {
                    String code = pin.getText().toString();
                    if (code.matches("\\d{4}")) sendAction(actionId, label, code);
                    else screen.setNotice("Le code fait 4 chiffres.");
                })
                .show();
    }

    private void sendAction(String actionId, String label, String pin) {
        JSONObject content = new JSONObject();
        try {
            content.put("kind", "action").put("actionId", actionId);
            if (pin != null) content.put("pin", pin);
        } catch (JSONException e) {
            return;
        }
        markActionUsed(actionId);
        request(content, pin != null ? "Payer : " + label : label);
    }

    private void request(JSONObject content, String shown) {
        if (!store.ready()) {
            screen.setNotice("Pour activer Tamilya Connect, ouvre l'app une fois avec internet, en étant connecté à ton compte.");
            return;
        }
        String deviceId = store.deviceId();
        String keyId = store.keyId();
        String serverKey = store.serverKey();
        io.execute(() -> {
            try {
                KeyPair device = DeviceKeys.get();
                Envelopes.Outgoing out = Envelopes.request(content, deviceId, keyId, ConnectCrypto.publicKey(serverKey),
                        data -> ConnectCrypto.sign(device.getPrivate(), data), System.currentTimeMillis());
                main.post(() -> {
                    JSONArray messages = store.messages();
                    try {
                        messages.put(new JSONObject()
                                .put("id", out.id).put("from", "me").put("text", shown).put("status", "searching")
                                .put("at", System.currentTimeMillis()).put("json", out.json)
                                .put("replyKey", ConnectCrypto.b64(out.replyKey)));
                    } catch (JSONException e) {
                        return;
                    }
                    store.saveMessages(messages);
                    render();
                    mesh.sendOwn(out.id, out.json);
                });
            } catch (IllegalArgumentException e) {
                main.post(() -> screen.setNotice("Message trop long : raccourcis-le."));
            } catch (Exception e) {
                main.post(() -> screen.setNotice("Impossible de préparer le message. Réessaie."));
            }
        });
    }

    private void restorePending() {
        JSONArray messages = store.messages();
        for (int i = 0; i < messages.length(); i++) {
            JSONObject message = messages.optJSONObject(i);
            if (message == null || !"me".equals(message.optString("from"))) continue;
            String status = message.optString("status");
            if (("searching".equals(status) || "relayed".equals(status) || "retry".equals(status))
                    && !message.optString("json").isEmpty()) {
                mesh.restoreOwn(message.optString("id"), message.optString("json"), message.optLong("at"));
            }
        }
    }

    private void markActionUsed(String actionId) {
        JSONArray messages = store.messages();
        for (int i = 0; i < messages.length(); i++) {
            JSONObject message = messages.optJSONObject(i);
            JSONArray choices = message == null ? null : message.optJSONArray("actions");
            for (int j = 0; choices != null && j < choices.length(); j++) {
                JSONObject choice = choices.optJSONObject(j);
                if (choice != null && actionId.equals(choice.optString("id"))) {
                    try {
                        message.put("used", true);
                    } catch (JSONException ignored) {
                        // Rien à faire : les boutons resteront affichés.
                    }
                }
            }
        }
        store.saveMessages(messages);
    }

    private void render() {
        JSONArray messages = store.messages();
        long now = System.currentTimeMillis();
        for (int i = 0; i < messages.length(); i++) {
            JSONObject message = messages.optJSONObject(i);
            if (message == null || !"me".equals(message.optString("from"))) continue;
            String status = message.optString("status");
            boolean waiting = "searching".equals(status) || "relayed".equals(status) || "retry".equals(status);
            if (waiting && now - message.optLong("at") > RelayTable.TTL_MS) {
                try {
                    message.put("status", "expired");
                } catch (JSONException ignored) {
                    // Affiché comme « cherche un relais ».
                }
            }
        }
        store.saveMessages(messages);
        if (isOpen()) screen.render(messages);
    }

    // --- Réseau

    @Override
    public void onPeers(int count) {
        screen.setPeers(count);
    }

    @Override
    public void onRelayed(String id) {
        JSONArray messages = store.messages();
        JSONObject message = find(messages, id);
        if (message == null || !"searching".equals(message.optString("status"))) return;
        try {
            message.put("status", "relayed");
        } catch (JSONException e) {
            return;
        }
        store.saveMessages(messages);
        render();
    }

    @Override
    public void onReply(String id, JSONObject reply) {
        JSONArray messages = store.messages();
        JSONObject mine = find(messages, id);
        if (mine == null || mine.optString("replyKey").isEmpty()) return;
        try {
            JSONObject answer = Envelopes.openReply(reply, ConnectCrypto.unb64(mine.getString("replyKey")));
            mine.put("status", "answered");
            mine.remove("json");
            mine.remove("replyKey");
            JSONObject theirs = new JSONObject()
                    .put("id", id + ":reply").put("from", "tamilya")
                    .put("text", answer.optString("text"))
                    .put("status", "error".equals(answer.optString("status")) ? "error" : "ok")
                    .put("at", System.currentTimeMillis());
            JSONArray choices = answer.optJSONArray("actions");
            if (choices != null) theirs.put("actions", choices);
            messages.put(theirs);
            if (!answer.optString("conversationId").isEmpty()) store.setConversationId(answer.optString("conversationId"));
            store.saveMessages(messages);
            render();
        } catch (Exception ignored) {
            // Réponse illisible (pas la bonne clé) : on l'ignore, la demande reste en attente.
        }
    }

    /** Nombre de nouveaux essais pour une même demande (pending, rate_limited, unavailable). */
    private static final int MAX_RETRIES = 5;

    @Override
    public void onRefused(String id, String code) {
        JSONArray messages = store.messages();
        JSONObject mine = find(messages, id);
        if (mine == null) return;
        long delay;
        String note = null;
        switch (code) {
            case "pending":
            case "unavailable":
                delay = 30_000;
                break;
            case "rate_limited":
                delay = 120_000;
                break;
            case "key_changed":
                // La clé du serveur a changé : il faut internet pour relire la nouvelle.
                store.setServerKey(store.keyId(), store.serverKey(), 0);
                delay = -1;
                note = "Tamilya a changé de clé : ouvre l'app une fois avec internet, puis réécris ton message.";
                break;
            case "bad_signature":
                delay = -1;
                note = "Message refusé par Tamilya : réécris-le.";
                break;
            case "stale":
                delay = -1;
                note = "Message trop ancien : réécris-le.";
                break;
            default:
                delay = -1;
                note = "Message refusé : réécris-le.";
        }
        int tries = mine.optInt("tries") + 1;
        if (delay > 0 && tries > MAX_RETRIES) {
            delay = -1;
            note = "Pas de réponse : réessaie plus tard.";
        }
        try {
            mine.put("tries", tries);
            if (delay > 0) {
                mine.put("status", "retry");
                mine.remove("note");
            } else {
                mine.put("status", "failed").put("note", note);
                mine.remove("json");
                mine.remove("replyKey");
            }
        } catch (JSONException e) {
            return;
        }
        String json = mine.optString("json");
        store.saveMessages(messages);
        render();
        if (delay <= 0) return;
        // Même id : le serveur rend la même réponse, jamais deux paiements.
        main.postDelayed(() -> mesh.resend(id, json), delay);
    }

    @Override
    public void onProblem(String message) {
        screen.setNotice(message);
    }

    private static JSONObject find(JSONArray messages, String id) {
        for (int i = 0; i < messages.length(); i++) {
            JSONObject message = messages.optJSONObject(i);
            if (message != null && id.equals(message.optString("id"))) return message;
        }
        return null;
    }
}
