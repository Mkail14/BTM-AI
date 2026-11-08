package yt.tamilya.app.connect;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.text.InputFilter;
import android.text.InputType;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.security.KeyPair;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import yt.tamilya.app.Perf;

/**
 * Tamilya Connect : écrire à Tamilya sans internet. Le message passe de téléphone en
 * téléphone jusqu'à un téléphone connecté, qui le poste au serveur ; la réponse revient
 * par le même chemin. Le relais continue en arrière-plan (RelayService).
 */
public final class TamilyaConnect implements MeshRelay.Listener, ConnectScreen.Actions {
    /** Une journée : la clé du serveur est relue au plus une fois par jour. */
    private static final long KEY_REFRESH_MS = 24 * 60 * 60 * 1000L;
    private static final int FADE_MS = 200;
    /** Historique relu au plus une fois par minute. */
    private static final long HISTORY_REFRESH_MS = 60_000L;
    /** Conversations récentes gardées sur le téléphone pour les relire sans internet. */
    private static final int THREADS_KEPT = 10;
    /** Sans relais au bout de 3 h, le message est coupé ; on peut le relancer. */
    static final long CUT_MS = 3 * 60 * 60 * 1000L;

    public interface Host {
        void requestConnectPermissions(String[] permissions);
        void onConnectClosed();
        /** Ouvre une page du site dans l'app (« /parametres »). */
        void openPage(String path);
        /** Ouvre la page d'aide de l'app (HelpScreen), sans fermer Connect. */
        void openHelp();
    }

    private final Activity activity;
    private final Host host;
    private final ConnectStore store;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    /** À part : lire l'historique ne doit pas retarder un message. */
    private final ExecutorService historyIo = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    /** Place réservée dans l'activité ; l'écran lui-même n'est construit qu'à la première ouverture. */
    private final android.widget.FrameLayout holder;
    private ConnectScreen screen;
    private int peerCount = -1;
    private final MeshRelay mesh;
    private boolean syncing;

    public TamilyaConnect(Activity activity, Host host) {
        this.activity = activity;
        this.host = host;
        this.store = new ConnectStore(activity);
        // Avant, l'écran (vues, globe, fond) était construit à chaque démarrage, même sans servir.
        this.holder = new android.widget.FrameLayout(activity);
        this.holder.setVisibility(View.GONE);
        this.mesh = MeshRelay.shared(activity);
        this.mesh.setListener(this);
        restorePending();
        // Une fois : les anciennes conversations quittent SharedPreferences pour leurs fichiers, hors du fil principal.
        historyIo.execute(() -> {
            long moving = Perf.start("connect.migration");
            int moved = store.migrateThreads();
            Perf.end("connect.migration " + moved, moving);
        });
    }

    public View view() {
        return holder;
    }

    /** Construit l'écran la première fois qu'il sert. */
    private ConnectScreen screen() {
        if (screen == null) {
            long building = Perf.start("connect.screen");
            screen = new ConnectScreen(activity, this);
            screen.setVisibility(View.GONE);
            if (peerCount >= 0) screen.setPeers(peerCount);
            holder.addView(screen, new android.widget.FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            holder.setVisibility(View.VISIBLE);
            Perf.end("connect.screen", building);
        }
        return screen;
    }

    /** Message en haut de l'écran ; rien à montrer tant que l'écran n'existe pas. */
    private void notice(String message) {
        if (screen != null) screen.setNotice(message);
    }

    public boolean isOpen() {
        return screen != null && screen.getVisibility() == View.VISIBLE && !closing;
    }

    private boolean closing;

    /** Fermeture par le geste : seulement quand la discussion est tout en bas. */
    public boolean atBottom() {
        return screen == null || screen.atBottom();
    }

    /** Permissions de Nearby Connections, selon la version d'Android. */
    public static String[] permissions() {
        List<String> list = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            list.add(Manifest.permission.BLUETOOTH_ADVERTISE);
            list.add(Manifest.permission.BLUETOOTH_CONNECT);
            list.add(Manifest.permission.BLUETOOTH_SCAN);
        } else {
            // Avant Android 12, la recherche Bluetooth passe par la position.
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

    /** Avancée du geste de fermeture : le fond change, le reste ne bouge pas. */
    public void setPull(float progress) {
        if (screen != null) screen.setPull(progress);
    }

    public void open() {
        long opening = Perf.start("connect.open");
        // Simple fondu, sur place : rien ne monte.
        closing = false;
        screen();
        mesh.setEager(true);
        screen.animate().cancel();
        screen.setPull(0f);
        screen.setAlpha(0f);
        screen.setVisibility(View.VISIBLE);
        screen.animate().alpha(1f).setDuration(FADE_MS).withEndAction(null).start();
        render();
        if (!store.ready()) {
            notice("Pour activer Tamilya Connect, ouvre l'app une fois avec internet, en étant connecté à ton compte.");
        } else {
            notice(null);
        }
        if (hasPermissions()) startRelay();
        else host.requestConnectPermissions(permissions());
        Perf.end("connect.open", opening);
        Perf.untilDrawn("connect.open", screen, opening);
    }

    public void onPermissionsResult() {
        if (hasPermissions()) {
            if (store.ready()) notice(null);
            startRelay();
        } else {
            notice("Autorise « Appareils à proximité » pour trouver des téléphones relais.");
        }
    }

    @Override
    public void close() {
        if (!isOpen()) return;
        InputMethodManager keyboard = (InputMethodManager) activity.getSystemService(Context.INPUT_METHOD_SERVICE);
        if (keyboard != null) keyboard.hideSoftInputFromWindow(screen.getWindowToken(), 0);
        // Simple fondu, sur place, comme à l'ouverture.
        closing = true;
        screen.animate().cancel();
        screen.animate().alpha(0f).setDuration(FADE_MS)
                .withEndAction(() -> {
                    screen.setVisibility(View.GONE);
                    mesh.setEager(false);
                    screen.setAlpha(1f);
                    screen.setPull(0f);
                    closing = false;
                })
                .start();
        host.onConnectClosed();
    }

    /** Relais actif tout de suite, et maintenu quand l'app quitte l'écran. */
    private void startRelay() {
        mesh.start();
        RelayService.start(activity);
        askBatteryFreedom();
    }

    /**
     * Une fois : sans cet accord, Android interdit de relancer le relais quand l'app a été tuée.
     * Le relais marche sans ; il s'arrête seulement jusqu'à la prochaine ouverture de l'app.
     */
    private void askBatteryFreedom() {
        PowerManager power = activity.getSystemService(PowerManager.class);
        if (!store.ready() || store.batteryAsked() || power == null || power.isIgnoringBatteryOptimizations(activity.getPackageName())) return;
        store.setBatteryAsked();
        try {
            activity.startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    Uri.parse("package:" + activity.getPackageName())));
        } catch (ActivityNotFoundException e) {
            // Écran absent sur ce téléphone : rien à faire de plus.
        }
    }

    /** App au premier plan : on relaie (pour soi et pour les autres), si c'est permis. */
    public void resume() {
        mesh.setOnScreen(true);
        if (hasPermissions()) {
            startRelay();
        } else if (store.ready() && !store.permissionsAsked()) {
            // Un téléphone relaie même si Connect n'y a jamais été ouvert : on demande une fois.
            store.setPermissionsAsked();
            host.requestConnectPermissions(permissions());
        }
    }

    public void pause() {
        mesh.setOnScreen(false);
        if (!RelayService.isRunning()) mesh.stop();
    }

    public void destroy() {
        mesh.clearListener(this);
        if (!RelayService.isRunning()) mesh.stop();
        io.shutdown();
        historyIo.shutdown();
    }

    public void setOnline(boolean online) {
        mesh.setOnline(online);
    }

    /**
     * En ligne et connecté : enregistre la clé de l'appareil pour le compte et garde la clé
     * du serveur pour le hors ligne. Silencieux en cas d'échec (on réessaie à la prochaine page).
     */
    public void syncAccount(String cookies) {
        refreshHistory(cookies);
        if (syncing) return;
        boolean signedIn = cookies != null && cookies.contains("-auth-token");
        boolean needKey = store.serverKey().isEmpty() || System.currentTimeMillis() - store.keyFetchedAt() > KEY_REFRESH_MS;
        boolean needDevice = signedIn && (store.deviceId().isEmpty() || store.deviceCheck());
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
                    store.setDeviceCheck(false);
                    // Le serveur donne aussi sa clé : rien de plus à demander.
                    if (!answer.optString("keyId").isEmpty() && !answer.optString("publicKey").isEmpty()) {
                        ConnectCrypto.publicKey(answer.getString("publicKey"));
                        store.setServerKey(answer.getString("keyId"), answer.getString("publicKey"), System.currentTimeMillis());
                    }
                }
            } catch (Exception ignored) {
                // Routes pas encore en ligne, ou réseau faible : rien à montrer.
            } finally {
                main.post(() -> {
                    syncing = false;
                    if (activity.hasWindowFocus()) resume();
                });
            }
        });
    }

    // --- Historique

    private volatile String cookies;
    private boolean historySyncing;
    private long historySyncedAt;
    private boolean historyShown;

    /** En ligne et connecté : garde la liste du compte et les dernières conversations pour le hors ligne. */
    private void refreshHistory(String accountCookies) {
        if (accountCookies == null) return;
        if (!accountCookies.contains("-auth-token")) {
            // En ligne mais déconnecté : on oublie le nom et le solde (téléphone prêté ou partagé).
            if (store.account().length() > 0) store.saveAccount(new JSONObject());
            return;
        }
        cookies = accountCookies;
        long now = System.currentTimeMillis();
        if (historySyncing || now - historySyncedAt < HISTORY_REFRESH_MS) return;
        historySyncing = true;
        historyIo.execute(() -> {
            try {
                // D'abord les suppressions faites sans internet.
                for (String gone : store.pendingDeletes()) {
                    ConnectApi.deleteConversation(gone, accountCookies);
                    store.setPendingDelete(gone, false);
                }
                // Nom et solde, gardés pour le menu sans internet (sinon il affichait « Se connecter »
                // alors que le compte était connecté). À part : un échec ne bloque pas l'historique.
                try {
                    store.saveAccount(ConnectApi.account(accountCookies));
                } catch (Exception ignored) {
                    // Dernier compte connu gardé.
                }
                JSONArray server = ConnectApi.conversations(accountCookies);
                store.saveHistory(ConnectHistory.merge(server, store.history()));
                for (int i = 0; i < Math.min(server.length(), THREADS_KEPT); i++) {
                    JSONObject item = server.getJSONObject(i);
                    String id = item.getString("id");
                    String stamp = item.optString("updatedAt");
                    if (id.equals(store.conversationId()) || stamp.equals(store.threadStamp(id))) continue;
                    store.saveThread(id, ConnectHistory.toLocal(ConnectApi.messages(id, accountCookies)), stamp);
                }
            } catch (Exception ignored) {
                // Réseau faible : on garde la dernière liste connue.
            } finally {
                main.post(() -> {
                    historySyncing = false;
                    historySyncedAt = System.currentTimeMillis();
                    if (historyShown && isOpen()) render();
                });
            }
        });
    }

    /** Une réponse attendue revient dans la conversation à l'écran : on n'en change pas d'ici là. */
    private boolean waitingForReply() {
        cutStale();
        JSONArray messages = store.messages();
        for (int i = 0; i < messages.length(); i++) {
            JSONObject message = messages.optJSONObject(i);
            if (message == null) continue;
            String status = message.optString("status");
            if ("searching".equals(status) || "relayed".equals(status) || "retry".equals(status)) return true;
        }
        return false;
    }

    private void showConversation(String id) {
        long showing = Perf.start("connect.conversation");
        store.switchTo(id);
        historyShown = false;
        notice(null);
        render();
        Perf.end("connect.conversation", showing);
        Perf.untilDrawn("connect.conversation", screen, showing);
    }

    /** Les trois barres : le même menu que dans Tamilya (historique, compte, solde). */
    @Override
    public void history() {
        long menu = Perf.start("connect.menu");
        screen.showMenu(store.history(), store.conversationId(), store.account(), menu);
        Perf.end("connect.menu", menu);
    }

    /** Une page du site depuis le menu (Paramètres, Mes documents…) : Connect se ferme, la page s'ouvre. */
    @Override
    public void openPage(String path) {
        close();
        host.openPage(path);
    }

    @Override
    public void help() {
        host.openHelp();
    }

    /** E-mail du compte lu au dernier passage avec internet, ou « ». */
    public String accountEmail() {
        return store.account().optString("email", "");
    }

    @Override
    public void newConversation() {
        if (waitingForReply()) {
            notice("Attends la réponse de Tamilya avant de changer de conversation.");
            return;
        }
        showConversation("");
    }

    @Override
    public void openConversation(String id) {
        if (id.equals(store.conversationId())) {
            historyShown = false;
            render();
            return;
        }
        if (waitingForReply()) {
            notice("Attends la réponse de Tamilya avant de changer de conversation.");
            return;
        }
        if (store.hasThread(id)) {
            showConversation(id);
            return;
        }
        String account = cookies;
        if (account == null) {
            notice("Cette conversation s'ouvrira quand tu auras internet.");
            return;
        }
        historyIo.execute(() -> {
            try {
                JSONArray messages = ConnectHistory.toLocal(ConnectApi.messages(id, account));
                store.saveThread(id, messages, "");
                main.post(() -> showConversation(id));
            } catch (Exception e) {
                main.post(() -> notice("Cette conversation s'ouvrira quand tu auras internet."));
            }
        });
    }

    @Override
    public void deleteConversation(String id) {
        confirm("Supprimer cette conversation ?", "Elle disparaît du téléphone et de ton compte.", () -> {
            if (id.equals(store.conversationId())) {
                cancelPending(store.messages());
                store.switchTo("");
            }
            store.removeConversation(id);
            store.setPendingDelete(id, true);
            render();
            String account = cookies;
            if (account == null) return;
            historyIo.execute(() -> {
                try {
                    ConnectApi.deleteConversation(id, account);
                    store.setPendingDelete(id, false);
                } catch (Exception ignored) {
                    // Pas d'internet : ce sera fait au prochain passage en ligne.
                }
            });
        });
    }

    // --- Messages

    /** Relance un message coupé : nouvelle demande, mêmes mots, l'ancien est retiré. */
    @Override
    public void relaunch(String id) {
        JSONArray messages = store.messages();
        JSONObject message = find(messages, id);
        if (message == null || !ConnectScreen.canRelaunch(message)) return;
        String text = message.optString("text");
        JSONObject content = message.optJSONObject("content");
        try {
            if (content == null) content = new JSONObject().put("kind", "chat").put("text", text);
            if (!content.has("conversationId") && !store.conversationId().isEmpty()) {
                content.put("conversationId", store.conversationId());
            }
        } catch (JSONException e) {
            return;
        }
        if (!store.ready()) {
            notice("Pour activer Tamilya Connect, ouvre l'app une fois avec internet, en étant connecté à ton compte.");
            return;
        }
        removeMessage(id);
        request(content, text);
    }

    @Override
    public void deleteMessage(String id) {
        confirm("Supprimer ce message ?", "Il disparaît de cette conversation.", () -> removeMessage(id));
    }

    private void removeMessage(String id) {
        JSONArray messages = store.messages();
        JSONArray kept = new JSONArray();
        for (int i = 0; i < messages.length(); i++) {
            JSONObject message = messages.optJSONObject(i);
            if (message != null && !id.equals(message.optString("id"))) kept.put(message);
        }
        mesh.cancelOwn(id);
        store.saveMessages(kept);
        render();
    }

    private void cancelPending(JSONArray messages) {
        for (int i = 0; i < messages.length(); i++) {
            JSONObject message = messages.optJSONObject(i);
            if (message != null && "me".equals(message.optString("from"))) mesh.cancelOwn(message.optString("id"));
        }
    }

    /** Sans relais depuis 3 h : le message est coupé et ne part plus. */
    private void cutStale() {
        JSONArray messages = store.messages();
        long now = System.currentTimeMillis();
        boolean changed = false;
        for (int i = 0; i < messages.length(); i++) {
            JSONObject message = messages.optJSONObject(i);
            if (message == null || !"me".equals(message.optString("from"))) continue;
            String status = message.optString("status");
            boolean waiting = "searching".equals(status) || "relayed".equals(status) || "retry".equals(status);
            if (!waiting || now - message.optLong("at") <= CUT_MS) continue;
            try {
                message.put("status", "cut");
                message.remove("note");
                message.remove("json");
                message.remove("replyKey");
                changed = true;
            } catch (JSONException ignored) {
                continue;
            }
            mesh.cancelOwn(message.optString("id"));
        }
        if (changed) store.saveMessages(messages);
    }

    /** Petite fenêtre de confirmation, aux couleurs de Connect. */
    private void confirm(String question, String detail, Runnable yes) {
        int cream = Color.parseColor("#F5F0E6");
        int muted = Color.parseColor("#8E9398");
        int accent = Color.parseColor("#F06A9B");
        LinearLayout card = new LinearLayout(activity);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(24), dp(24), dp(24), dp(20));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#17191B"));
        bg.setCornerRadius(dp(26));
        card.setBackground(bg);

        TextView title = new TextView(activity);
        title.setText(question);
        title.setTextColor(cream);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        title.setTypeface(title.getTypeface(), Typeface.BOLD);
        card.addView(title);
        TextView sub = new TextView(activity);
        sub.setText(detail);
        sub.setTextColor(muted);
        sub.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        sub.setPadding(0, dp(8), 0, 0);
        card.addView(sub);

        AlertDialog dialog = new AlertDialog.Builder(activity).setView(card).create();
        if (dialog.getWindow() != null) dialog.getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        LinearLayout row = new LinearLayout(activity);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.END);
        LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        rowParams.topMargin = dp(18);
        card.addView(row, rowParams);
        TextView cancel = pillButton("Annuler", muted, Color.TRANSPARENT);
        cancel.setOnClickListener(v -> dialog.dismiss());
        row.addView(cancel);
        TextView ok = pillButton("Supprimer", Color.WHITE, accent);
        LinearLayout.LayoutParams okParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        okParams.leftMargin = dp(8);
        ok.setOnClickListener(v -> {
            dialog.dismiss();
            yes.run();
        });
        row.addView(ok, okParams);
        dialog.show();
    }

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
        showPinDialog(actionId, label);
    }

    /** Fenêtre du code de paiement, aux couleurs de Connect (fini la boîte grise du système). */
    private void showPinDialog(String actionId, String label) {
        int ink = Color.parseColor("#17191B");
        int cream = Color.parseColor("#F5F0E6");
        int muted = Color.parseColor("#8E9398");
        int accent = Color.parseColor("#F06A9B");

        LinearLayout card = new LinearLayout(activity);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(24), dp(24), dp(24), dp(20));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(ink);
        bg.setCornerRadius(dp(26));
        card.setBackground(bg);

        TextView title = new TextView(activity);
        title.setText(label);
        title.setTextColor(cream);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        title.setTypeface(title.getTypeface(), Typeface.BOLD);
        card.addView(title);

        TextView sub = new TextView(activity);
        sub.setText("Entre ton code de paiement (le même que pour payer à la voix).");
        sub.setTextColor(muted);
        sub.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        sub.setPadding(0, dp(8), 0, dp(18));
        card.addView(sub);

        EditText pin = new EditText(activity);
        pin.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        pin.setFilters(new InputFilter[]{new InputFilter.LengthFilter(4)});
        pin.setHint("••••");
        pin.setHintTextColor(muted);
        pin.setTextColor(cream);
        pin.setGravity(Gravity.CENTER);
        pin.setTextSize(TypedValue.COMPLEX_UNIT_SP, 28);
        pin.setLetterSpacing(0.5f);
        pin.setPadding(dp(16), dp(14), dp(16), dp(14));
        GradientDrawable field = new GradientDrawable();
        field.setColor(Color.parseColor("#1D1F21"));
        field.setCornerRadius(dp(16));
        pin.setBackground(field);
        card.addView(pin, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        AlertDialog dialog = new AlertDialog.Builder(activity).setView(card).create();
        if (dialog.getWindow() != null) dialog.getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));

        LinearLayout row = new LinearLayout(activity);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.END);
        LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        rowParams.topMargin = dp(18);
        card.addView(row, rowParams);

        TextView cancel = pillButton("Annuler", muted, Color.TRANSPARENT);
        cancel.setOnClickListener(v -> dialog.dismiss());
        row.addView(cancel);

        TextView confirm = pillButton("Payer", Color.WHITE, accent);
        LinearLayout.LayoutParams confirmParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        confirmParams.leftMargin = dp(8);
        confirm.setOnClickListener(v -> {
            String code = pin.getText().toString();
            if (code.matches("\\d{4}")) {
                sendAction(actionId, label, code);
                dialog.dismiss();
            } else {
                notice("Le code fait 4 chiffres.");
            }
        });
        row.addView(confirm, confirmParams);

        dialog.show();
        pin.requestFocus();
    }

    private TextView pillButton(String text, int textColor, int fill) {
        TextView button = new TextView(activity);
        button.setText(text);
        button.setTextColor(textColor);
        button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        button.setTypeface(button.getTypeface(), Typeface.BOLD);
        button.setGravity(Gravity.CENTER);
        button.setPadding(dp(22), dp(11), dp(22), dp(11));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(fill);
        bg.setCornerRadius(dp(22));
        button.setBackground(bg);
        button.setClickable(true);
        return button;
    }

    private int dp(int value) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value,
                activity.getResources().getDisplayMetrics()));
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
            notice("Pour activer Tamilya Connect, ouvre l'app une fois avec internet, en étant connecté à ton compte.");
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
                        JSONObject mine = new JSONObject()
                                .put("id", out.id).put("from", "me").put("text", shown).put("status", "searching")
                                .put("at", System.currentTimeMillis()).put("json", out.json)
                                .put("replyKey", ConnectCrypto.b64(out.replyKey));
                        // Gardé pour « Relancer » : seulement un message écrit, jamais un code de paiement.
                        if ("chat".equals(content.optString("kind"))) mine.put("content", content);
                        messages.put(mine);
                    } catch (JSONException e) {
                        return;
                    }
                    store.saveMessages(messages);
                    render();
                    mesh.sendOwn(out.id, out.json);
                });
            } catch (IllegalArgumentException e) {
                main.post(() -> notice("Message trop long : raccourcis-le."));
            } catch (Exception e) {
                main.post(() -> notice("Impossible de préparer le message. Réessaie."));
            }
        });
    }

    private void restorePending() {
        cutStale();
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
        long drawing = Perf.start("connect.render");
        cutStale();
        JSONArray messages = store.messages();
        if (!isOpen()) {
            Perf.end("connect.render.cache", drawing);
            return;
        }
        if (historyShown) screen.renderHistory(store.history(), store.conversationId());
        else screen.render(messages);
        Perf.end("connect.render", drawing);
    }

    // --- Réseau

    @Override
    public void onPeers(int count) {
        peerCount = count;
        if (screen != null) screen.setPeers(count);
        render();
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
            String conversationId = answer.optString("conversationId");
            if (!conversationId.isEmpty()) {
                if (!conversationId.equals(store.conversationId())) {
                    store.saveHistory(ConnectHistory.addLocal(store.history(), conversationId, mine.optString("text", "Conversation")));
                }
                store.setConversationId(conversationId);
            }
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
            case "unknown_device":
            case "bad_signature":
                // Pas de remise à zéro ici : ce refus passe par les voisins, sans signature.
                store.setDeviceCheck(true);
                delay = -1;
                note = "Tamilya ne reconnaît pas ce téléphone : ouvre l'app une fois avec internet, connecté à ton compte, puis réécris ton message.";
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
        main.postDelayed(() -> {
            // Entre-temps coupé ou supprimé : on ne renvoie pas.
            JSONObject still = find(store.messages(), id);
            if (still != null && "retry".equals(still.optString("status"))) mesh.resend(id, json);
        }, delay);
    }

    @Override
    public void onProblem(String message) {
        notice(message);
    }

    private static JSONObject find(JSONArray messages, String id) {
        for (int i = 0; i < messages.length(); i++) {
            JSONObject message = messages.optJSONObject(i);
            if (message != null && id.equals(message.optString("id"))) return message;
        }
        return null;
    }
}
