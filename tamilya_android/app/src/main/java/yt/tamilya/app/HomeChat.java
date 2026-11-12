package yt.tamilya.app;

import android.app.Activity;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.View;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Accueil et conversation natifs de l'app : la même conversation que le site (POST /api/chat,
 * même compte via les cookies de la WebView, même essai sans compte), sans page web. Le reste
 * du site (paramètres, documents, cartes…) reste dans la WebView, ouvert par l'hôte.
 */
final class HomeChat implements HomeScreen.Actions {
    interface Host {
        /** Ouvre une page du site dans la WebView ; l'accueil natif se cache. */
        void openPage(String path);
        /** Lien d'une réponse (autre site, mail, téléphone). */
        void openLink(Uri uri);
        void openHelp();
        void openConnect();
        /** Fenêtre de connexion du site, par-dessus l'accueil web. */
        void signIn();
    }

    private static final int GUEST_TRIAL = 5;
    private static final int GUEST_MAX_TURNS = 10;
    private static final int GUEST_MAX_CHARS = 60_000;
    /** Le texte qui arrive est redessiné au plus toutes les 80 ms. */
    private static final long REDRAW_MS = 80;

    private final Activity activity;
    private final Host host;
    private final HomeScreen screen;
    private final ChatStore store;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    private final List<ChatMessage> messages = new ArrayList<>();
    private String conversationId;
    private boolean signedIn;
    private String name = "";
    private String email = "";
    private int guestSent;
    private boolean trialOver;
    private boolean limitReached;
    private boolean online = true;
    private boolean loaded;

    private boolean streaming;
    private ChatApi.Call call;
    private long lastRedraw;
    private boolean redrawPlanned;

    private JSONArray history = new JSONArray();
    private boolean historyLoading;
    private boolean accountLoading;

    HomeChat(Activity activity, Host host) {
        this.activity = activity;
        this.host = host;
        store = new ChatStore(activity);
        screen = new HomeScreen(activity, this);
        screen.setVisibility(View.GONE);
        signedIn = ChatApi.signedIn();
        name = store.accountName();
        email = store.accountEmail();
        guestSent = store.guestSent();
        render();
        // Conversation de la dernière fois, lue hors du fil de l'écran.
        io.execute(() -> {
            JSONObject saved = store.conversation();
            JSONArray savedHistory = store.history();
            main.post(() -> restore(saved, savedHistory));
        });
    }

    private void restore(JSONObject saved, JSONArray savedHistory) {
        loaded = true;
        history = savedHistory;
        // Conversation commencée dans l'autre état (sans compte, puis connecté…) : on repart à zéro.
        if (saved.optBoolean("signedIn") == signedIn && messages.isEmpty() && !streaming) {
            JSONArray list = saved.optJSONArray("messages");
            for (int i = 0; list != null && i < list.length(); i++) {
                JSONObject json = list.optJSONObject(i);
                if (json != null) messages.add(ChatMessage.fromJson(json));
            }
            String id = saved.optString("id");
            conversationId = id.isEmpty() ? null : id;
        }
        render();
    }

    View view() {
        return screen;
    }

    boolean isOpen() {
        return screen.getVisibility() == View.VISIBLE;
    }

    void open() {
        if (isOpen()) {
            refreshAccount();
            return;
        }
        screen.setAlpha(0f);
        screen.setVisibility(View.VISIBLE);
        screen.animate().alpha(1f).setDuration(180).start();
        refreshAccount();
        render();
    }

    void close() {
        if (!isOpen()) return;
        screen.hideKeyboard();
        screen.closeMenu();
        screen.setVisibility(View.GONE);
    }

    boolean menuOpen() {
        return screen.menuOpen();
    }

    void closeMenu() {
        screen.closeMenu();
    }

    void setPull(float progress) {
        screen.setPull(progress);
    }

    boolean atBottom() {
        return screen.atBottom();
    }

    void setOnline(boolean value) {
        online = value;
        screen.setOffline(!value);
    }

    /** Le site vient de charger une page dans la WebView : la session a pu changer (connexion…). */
    void onSiteLoaded() {
        refreshAccount();
    }

    void destroy() {
        if (call != null) call.cancel();
        io.shutdown();
    }

    /** Compte connecté ou non d'après les cookies ; nom lu sur le serveur si besoin. */
    private void refreshAccount() {
        boolean now = ChatApi.signedIn();
        if (now != signedIn) {
            signedIn = now;
            if (!now) {
                name = "";
                email = "";
                history = new JSONArray();
                io.execute(store::clearAccount);
            }
            // La conversation de l'autre état ne peut pas continuer : on en commence une neuve.
            if (!streaming) {
                messages.clear();
                conversationId = null;
                limitReached = false;
                save();
            }
            render();
        }
        if (signedIn && name.isEmpty() && email.isEmpty() && !accountLoading && online) {
            accountLoading = true;
            io.execute(() -> {
                try {
                    JSONObject account = ChatApi.account();
                    String n = account.isNull("name") ? "" : account.optString("name", "");
                    String e = account.isNull("email") ? "" : account.optString("email", "");
                    store.saveAccount(n, e);
                    main.post(() -> {
                        name = n;
                        email = e;
                        accountLoading = false;
                        render();
                    });
                } catch (IOException | JSONException e) {
                    main.post(() -> accountLoading = false);
                }
            });
        }
    }

    private void render() {
        screen.render(messages, streaming, firstName());
        if (trialOver) {
            screen.setBanner("Tu as utilisé tes " + GUEST_TRIAL + " messages d'essai",
                    "Crée ton compte gratuit pour continuer avec Tamilya et retrouver tes conversations.",
                    "Créer mon compte", v -> host.signIn());
            screen.setCanSend(false, "Crée ton compte pour continuer");
        } else if (limitReached) {
            screen.setBanner("Cette conversation a atteint sa longueur maximale.",
                    "Démarre une nouvelle conversation pour continuer.", null, null);
            screen.setCanSend(false, "Conversation terminée");
        } else {
            screen.setBanner(null, null, null, null);
            screen.setCanSend(true, null);
        }
        if (!signedIn && !trialOver && guestSent > 0) {
            int left = Math.max(0, GUEST_TRIAL - guestSent);
            screen.setHint("Encore " + left + (left > 1 ? " messages" : " message") + " sans compte · Créer mon compte gratuit", v -> host.signIn());
        } else {
            screen.setHint("Tamilya peut se tromper. Vérifie les informations importantes.", null);
        }
    }

    private String firstName() {
        if (!signedIn || name.isEmpty()) return "";
        return name.trim();
    }

    // ----- Actions de l'écran -----

    @Override
    public void send(String text) {
        if (streaming || text.trim().isEmpty()) return;
        if (!online) {
            screen.setNotice("Tu es hors ligne. Vérifie ta connexion internet.");
            return;
        }
        screen.setNotice(null);
        signedIn = ChatApi.signedIn();
        JSONObject body = new JSONObject();
        try {
            body.put("message", text);
            if (signedIn) {
                if (conversationId != null) body.put("conversationId", conversationId);
            } else {
                body.put("history", guestHistory());
            }
        } catch (JSONException e) {
            return;
        }
        messages.add(new ChatMessage("user", text, ChatMessage.COMPLETE));
        ChatMessage reply = new ChatMessage("assistant", "", ChatMessage.STREAMING);
        messages.add(reply);
        streaming = true;
        render();
        save();

        ChatApi.Call current = new ChatApi.Call();
        call = current;
        boolean guest = !signedIn;
        new Thread(() -> {
            boolean[] settled = {false};
            try {
                ChatApi.chat(current, body, event -> main.post(() -> {
                    if (call != current) return;
                    if (handle(reply, event)) settled[0] = true;
                }));
                if (guest) main.post(() -> {
                    guestSent++;
                    store.setGuestSent(guestSent);
                });
            } catch (ChatApi.Refused refused) {
                main.post(() -> {
                    if (call != current) return;
                    settled[0] = true;
                    refusedReply(reply, refused);
                });
            } catch (IOException e) {
                main.post(() -> {
                    if (call != current) return;
                    if (current.cancelled) return;
                    settled[0] = true;
                    reply.status = reply.text().isEmpty() ? ChatMessage.ERROR : ChatMessage.INTERRUPTED;
                    reply.notice = online ? "La connexion avec le serveur a été interrompue." : "Tu es hors ligne. Vérifie ta connexion internet.";
                });
            } finally {
                main.post(() -> {
                    if (call != current) return;
                    finish(reply, settled[0], current.cancelled);
                });
            }
        }, "tamilya-chat").start();
    }

    /** Échanges réussis, à renvoyer au serveur pour un visiteur sans compte (comme buildModelHistory du site). */
    private JSONArray guestHistory() throws JSONException {
        List<ChatMessage> settled = new ArrayList<>();
        for (ChatMessage m : messages) if (m.settled()) settled.add(m);
        int chars = 0;
        int from = settled.size();
        while (from > 0 && settled.size() - from < GUEST_MAX_TURNS && chars + settled.get(from - 1).text().length() <= GUEST_MAX_CHARS) {
            from--;
            chars += settled.get(from).text().length();
        }
        JSONArray history = new JSONArray();
        for (int i = from; i < settled.size(); i++) {
            history.put(new JSONObject().put("role", settled.get(i).role).put("content", settled.get(i).text()));
        }
        return history;
    }

    /** Un événement du flux. Renvoie vrai quand la réponse est terminée (done ou error). */
    private boolean handle(ChatMessage reply, JSONObject event) {
        switch (event.optString("type")) {
            case "meta":
                String id = event.optString("conversationId");
                if (!id.isEmpty()) conversationId = id;
                return false;
            case "delta":
                reply.content.append(event.optString("text"));
                redrawSoon();
                return false;
            case "replace":
                reply.content.setLength(0);
                reply.content.append(event.optString("text"));
                redrawSoon();
                return false;
            case "done":
                if ("length".equals(event.optString("finishReason"))) {
                    reply.status = ChatMessage.INTERRUPTED;
                    reply.notice = "Réponse tronquée : longueur maximale atteinte.";
                } else {
                    reply.status = ChatMessage.COMPLETE;
                }
                return true;
            case "error":
                reply.status = reply.text().isEmpty() ? ChatMessage.ERROR : ChatMessage.INTERRUPTED;
                reply.notice = event.optString("message", defaultMessage(event.optString("code")));
                return true;
            default:
                // speech, timing, team, learned, remembered : rien à montrer ici pour l'instant.
                return false;
        }
    }

    private void redrawSoon() {
        long now = SystemClock.uptimeMillis();
        if (now - lastRedraw >= REDRAW_MS) {
            lastRedraw = now;
            screen.updateLastAnswer(messages);
            return;
        }
        if (redrawPlanned) return;
        redrawPlanned = true;
        main.postDelayed(() -> {
            redrawPlanned = false;
            lastRedraw = SystemClock.uptimeMillis();
            screen.updateLastAnswer(messages);
        }, REDRAW_MS - (now - lastRedraw));
    }

    private void refusedReply(ChatMessage reply, ChatApi.Refused refused) {
        reply.status = ChatMessage.ERROR;
        reply.notice = refused.message.isEmpty() ? defaultMessage(refused.code) : refused.message;
        switch (refused.code) {
            case "signup_required":
                trialOver = true;
                guestSent = Math.max(guestSent, GUEST_TRIAL);
                store.setGuestSent(guestSent);
                break;
            case "conversation_too_long":
                limitReached = true;
                break;
            case "unauthorized":
            case "not_found":
                // Session expirée ou conversation disparue : la suite repart sans conversation.
                signedIn = ChatApi.signedIn();
                conversationId = null;
                break;
            default:
                break;
        }
    }

    private void finish(ChatMessage reply, boolean settled, boolean cancelled) {
        if (!settled) {
            reply.status = reply.text().isEmpty() && !cancelled ? ChatMessage.ERROR : ChatMessage.INTERRUPTED;
            reply.notice = cancelled ? "Génération arrêtée." : "Réponse interrompue.";
        }
        if (ChatMessage.STREAMING.equals(reply.status)) reply.status = ChatMessage.COMPLETE;
        streaming = false;
        call = null;
        render();
        save();
        // Le titre de la conversation est donné par le serveur juste après la réponse : liste relue plus tard.
        if (signedIn) main.postDelayed(this::loadHistory, 5000);
    }

    /** Messages du site pour un code d'erreur sans message (src/lib/chat/errors.ts). */
    private static String defaultMessage(String code) {
        switch (code) {
            case "rate_limited": return "Tu as atteint la limite d'utilisation pour le moment. Réessaie un peu plus tard.";
            case "signup_required": return "Tes " + GUEST_TRIAL + " messages d'essai sont utilisés. Crée ton compte gratuit pour continuer à parler avec Tamilya.";
            case "conversation_too_long": return "Cette conversation a atteint sa longueur maximale. Démarre une nouvelle conversation.";
            case "unauthorized": return "Ta session a expiré. Reconnecte-toi pour continuer.";
            case "not_found": return "Conversation introuvable.";
            case "timeout": return "La réponse a pris trop de temps. Réessaie.";
            case "provider_overloaded": return "Le service d'IA est momentanément surchargé. Réessaie dans quelques instants.";
            case "flow_cut": return "Tamilya est en pause pour le moment. Réessaie un peu plus tard.";
            case "refusal": return "Tamilya ne peut pas répondre à cette demande.";
            default: return "Une erreur inattendue s'est produite. Réessaie.";
        }
    }

    @Override
    public void stop() {
        if (call != null) call.cancel();
    }

    @Override
    public void newConversation() {
        if (streaming) stop();
        messages.clear();
        conversationId = null;
        limitReached = false;
        screen.setNotice(null);
        render();
        save();
    }

    @Override
    public void openConversation(String id) {
        if (id == null || id.isEmpty() || !signedIn) return;
        if (streaming) stop();
        if (id.equals(conversationId)) return;
        conversationId = id;
        messages.clear();
        limitReached = false;
        screen.setNotice(null);
        render();
        io.execute(() -> {
            try {
                JSONArray list = ChatApi.messages(id);
                List<ChatMessage> loaded = new ArrayList<>();
                for (int i = 0; i < list.length(); i++) {
                    JSONObject json = list.optJSONObject(i);
                    if (json == null) continue;
                    String status = json.optString("status", ChatMessage.COMPLETE);
                    loaded.add(new ChatMessage(json.optString("role", "assistant"), json.optString("content", ""),
                            ChatMessage.ERROR.equals(status) ? ChatMessage.ERROR : ChatMessage.INTERRUPTED.equals(status) ? ChatMessage.INTERRUPTED : ChatMessage.COMPLETE));
                }
                main.post(() -> {
                    if (!id.equals(conversationId) || streaming) return;
                    messages.clear();
                    messages.addAll(loaded);
                    render();
                    save();
                });
            } catch (IOException | JSONException e) {
                main.post(() -> {
                    if (id.equals(conversationId)) screen.setNotice("Impossible de lire cette conversation. Réessaie.");
                });
            }
        });
    }

    @Override
    public void openOnSite() {
        if (conversationId != null) host.openPage("/c/" + conversationId);
        else screen.setNotice("Connecte-toi pour ouvrir cette carte sur le site.");
    }

    @Override
    public void openPage(String path) {
        host.openPage(path);
    }

    @Override
    public void openLink(Uri uri) {
        host.openLink(uri);
    }

    @Override
    public void help() {
        host.openHelp();
    }

    @Override
    public void connect() {
        host.openConnect();
    }

    @Override
    public void signIn() {
        host.signIn();
    }

    @Override
    public void retry() {
        if (streaming || messages.size() < 2) return;
        ChatMessage last = messages.get(messages.size() - 1);
        ChatMessage before = messages.get(messages.size() - 2);
        if (last.mine() || !before.mine()) return;
        messages.remove(messages.size() - 1);
        messages.remove(messages.size() - 1);
        send(before.text());
    }

    @Override
    public void menuOpened() {
        screen.showMenu(history, conversationId, name, email, signedIn, historyLoading || history.length() == 0);
        loadHistory();
    }

    private void loadHistory() {
        if (!signedIn || historyLoading || !online) {
            if (screen.menuOpen()) screen.showMenu(history, conversationId, name, email, signedIn, false);
            return;
        }
        historyLoading = true;
        io.execute(() -> {
            JSONArray list = null;
            try {
                list = ChatApi.conversations();
                store.saveHistory(list);
            } catch (IOException | JSONException e) {
                // Liste gardée telle quelle.
            }
            JSONArray got = list;
            main.post(() -> {
                historyLoading = false;
                if (got != null) history = got;
                if (screen.menuOpen()) screen.showMenu(history, conversationId, name, email, signedIn, false);
            });
        });
    }

    private void save() {
        if (!loaded) return;
        try {
            JSONArray list = new JSONArray();
            for (ChatMessage m : messages) list.put(m.toJson());
            JSONObject json = new JSONObject().put("id", conversationId == null ? "" : conversationId)
                    .put("signedIn", signedIn).put("messages", list);
            io.execute(() -> store.saveConversation(json));
        } catch (JSONException ignored) {
            // Impossible avec ces valeurs.
        }
    }
}
