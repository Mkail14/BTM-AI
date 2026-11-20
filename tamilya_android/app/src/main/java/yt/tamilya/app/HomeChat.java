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
        /** Fenêtre de connexion du site, par-dessus l'accueil web. */
        void signIn();
        /** Lit quelque chose dans la page du site chargée derrière (ce que le site montre à ce compte). */
        /** Le compte n'est plus connecté : l'accueil natif laisse la place à la page de présentation du site. */
        void sessionEnded();
        void siteScript(String script, android.webkit.ValueCallback<String> result);
        /** Sélecteur de photo ou de PDF d'Android. */
        void pickFile(java.util.function.Consumer<Uri> picked);
        /** Appareil photo d'Android : la photo prise est rendue sous forme de Uri. */
        void takePhoto(java.util.function.Consumer<Uri> taken);
    }

    /** 4 Mo : même limite que le site (attachment.ts). */
    private static final int ATTACH_MAX_BYTES = 4 * 1024 * 1024;
    /** Fichier choisi avec le « + », joint à la prochaine question : {name, mimeType, data en base64}. */
    private JSONObject attachment;

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
    /** Solde du portefeuille, ou null si ce compte n'en a pas. */
    private Long balanceCents;
    private boolean demo;
    private int guestSent;
    private boolean trialOver;
    private boolean limitReached;
    private boolean online = true;
    // Cloche : historique du compte (serveur) et événements gardés par le site sur cet appareil.
    private JSONArray bellServer = new JSONArray();
    private JSONArray bellLocal = new JSONArray();
    private final java.util.Set<String> bellHidden = new java.util.HashSet<>();
    private long bellSeen = System.currentTimeMillis();
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
        balanceCents = store.accountBalance();
        demo = store.accountDemo();
        guestSent = store.guestSent();
        screen.setSite(store.siteBadge(), store.siteFood(), store.siteVoice(), store.siteAttach());
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

    /** Retour du vocal : le globe de l'accueil part de la place du gros globe (écran, en pixels). */
    void returnGlobe(float centerX, float centerY, float width) {
        screen.returnGlobe(centerX, centerY, width);
    }

    /** Ouverture du vocal : le globe grandit jusqu'à la place du globe de la page vocale, le reste s'efface. */
    void morphToVoice(float centerX, float centerY, float width) {
        screen.hideKeyboard();
        screen.closeMenu();
        screen.morphToVoice(centerX, centerY, width);
    }

    /** La page vocale est prête derrière : l'accueil s'efface en douceur. */
    void fadeClose() {
        if (!isOpen()) return;
        screen.animate().alpha(0f).setDuration(220).withEndAction(this::close).start();
    }

    void close() {
        if (!isOpen()) return;
        screen.animate().cancel();
        screen.hideKeyboard();
        screen.closeMenu();
        screen.resetVoiceMorph();
        screen.setVisibility(View.GONE);
    }

    boolean menuOpen() {
        return screen.menuOpen() || screen.notificationsOpen() || screen.cardFullScreen();
    }

    /** Bouton retour : carte en plein écran, puis le petit menu ou la fenêtre ouverts dans le menu, puis le menu. */
    void closeMenu() {
        if (screen.cardFullScreen()) screen.closeCardFullScreen();
        else if (screen.notificationsOpen()) screen.closeNotifications();
        else if (!screen.dismissMenuPopup()) screen.closeMenu();
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
        // La page s'anime après son arrivée (micro, idées) : lue un peu plus tard, deux fois.
        main.postDelayed(() -> readBell(false), 1200);
        main.postDelayed(this::readSite, 1500);
        main.postDelayed(this::readSite, 5000);
    }

    /**
     * Ce que l'accueil du site montre à ce compte : pastille des administrateurs, idée « Commander
     * à manger », micro, « + » des documents. L'accueil natif affiche les mêmes éléments.
     */
    private static final String SITE_SCRIPT = "(function(){var v=document.querySelector('[data-chat-view]');"
            + "var l=document.querySelector('[aria-label=\"Idées pour commencer\"]');if(!v)return '';"
            + "var b=document.querySelector('a.fixed[href^=\"/admin\"]');"
            // Une conversation est affichée sur le site : pas d'idées à lire, « food » reste comme avant.
            + "return JSON.stringify({badge:b?b.textContent.trim():'',food:l?l.textContent.indexOf('Commander à manger')>=0:null,"
            + "voice:!!document.querySelector('#composer-form button[aria-label=\"Parler à Tamilya\"]'),"
            + "attach:!!document.querySelector('button[aria-label=\"Photo ou document\"]')});})()";

    private void readSite() {
        if (!online) return;
        host.siteScript(SITE_SCRIPT, value -> {
            try {
                Object text = value == null ? null : new org.json.JSONTokener(value).nextValue();
                if (!(text instanceof String) || ((String) text).isEmpty()) return;
                JSONObject site = new JSONObject((String) text);
                boolean food = site.isNull("food") ? store.siteFood() : site.optBoolean("food");
                store.saveSite(site.optString("badge"), food, site.optBoolean("voice"), site.optBoolean("attach"));
                screen.setSite(store.siteBadge(), store.siteFood(), store.siteVoice(), store.siteAttach());
                render();
            } catch (JSONException ignored) {
                // Page inattendue : on garde ce qu'on savait.
            }
        });
    }

    void destroy() {
        if (call != null) call.cancel();
        // Lectures du site prévues pour plus tard : l'écran n'existe plus (changement de thème…).
        main.removeCallbacksAndMessages(null);
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
                balanceCents = null;
                demo = false;
                history = new JSONArray();
                io.execute(store::clearAccount);
                screen.setSite("", false, false, false);
            }
            // La conversation de l'autre état ne peut pas continuer : on en commence une neuve.
            if (!streaming) {
                messages.clear();
                conversationId = null;
                limitReached = false;
                save();
            }
            render();
            if (!now) {
                host.sessionEnded();
                return;
            }
        }
        if (name.isEmpty() && email.isEmpty()) loadAccount();
    }

    /** Nom, adresse et solde du compte, lus sur le serveur (relus à chaque ouverture du menu, comme sur le site). */
    private void loadAccount() {
        if (!signedIn || accountLoading || !online) return;
        accountLoading = true;
        io.execute(() -> {
            try {
                JSONObject account = ChatApi.account();
                String n = account.isNull("name") ? "" : account.optString("name", "");
                String e = account.isNull("email") ? "" : account.optString("email", "");
                Long cents = account.isNull("balanceCents") ? null : Long.valueOf(account.optLong("balanceCents"));
                boolean d = account.optBoolean("demo");
                store.saveAccount(n, e);
                store.saveBalance(cents, d);
                main.post(() -> {
                    name = n;
                    email = e;
                    balanceCents = cents;
                    demo = d;
                    accountLoading = false;
                    render();
                    if (screen.menuOpen()) showMenu(false);
                });
            } catch (IOException | JSONException e) {
                main.post(() -> accountLoading = false);
            }
        });
    }

    private void render() {
        screen.setSignedIn(signedIn);
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
                if (attachment != null) body.put("attachment", attachment);
                if (conversationId != null) body.put("conversationId", conversationId);
            } else {
                body.put("history", guestHistory());
            }
        } catch (JSONException e) {
            return;
        }
        String shown = attachment != null && signedIn ? "Fichier joint : " + attachment.optString("name") + "\n" + text : text;
        if (signedIn) attachment = null;
        messages.add(new ChatMessage("user", shown, ChatMessage.COMPLETE));
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
    public void signIn() {
        host.signIn();
    }

    @Override
    public void voice() {
        host.openPage("/voix");
    }

    @Override
    public void attachFile() {
        host.pickFile(this::receiveFile);
    }

    @Override
    public void attachPhoto() {
        host.takePhoto(this::receiveFile);
    }

    private void receiveFile(Uri uri) {
        io.execute(() -> {
            JSONObject read = readAttachment(uri);
            main.post(() -> {
                if (read == null) {
                    attachment = null;
                    screen.setNotice("Tamilya lit les photos et les PDF de 4 Mo au plus.");
                } else {
                    attachment = read;
                    screen.setNotice("Fichier joint : " + read.optString("name") + ". Écris ta question.");
                }
            });
        });
    }

    /** Photo (réduite si besoin) ou PDF du téléphone, prêt pour POST /api/chat ; null si Tamilya ne sait pas le lire. */
    private JSONObject readAttachment(Uri uri) {
        try {
            android.content.ContentResolver resolver = activity.getContentResolver();
            String type = resolver.getType(uri);
            if (type == null) return null;
            String fileName = "fichier";
            try (android.database.Cursor cursor = resolver.query(uri, new String[]{android.provider.OpenableColumns.DISPLAY_NAME}, null, null, null)) {
                if (cursor != null && cursor.moveToFirst() && cursor.getString(0) != null) fileName = cursor.getString(0);
            }
            java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
            try (java.io.InputStream in = resolver.openInputStream(uri)) {
                if (in == null) return null;
                byte[] chunk = new byte[16384];
                int n;
                while ((n = in.read(chunk)) > 0) {
                    bytes.write(chunk, 0, n);
                    if (bytes.size() > 40 * 1024 * 1024) return null;
                }
            }
            byte[] data = bytes.toByteArray();
            boolean readable = type.equals("image/jpeg") || type.equals("image/png") || type.equals("image/webp") || type.equals("application/pdf");
            if (type.startsWith("image/") && (!readable || data.length > ATTACH_MAX_BYTES)) {
                android.graphics.Bitmap bitmap = android.graphics.BitmapFactory.decodeByteArray(data, 0, data.length);
                if (bitmap == null) return null;
                float scale = Math.min(1f, 2048f / Math.max(bitmap.getWidth(), bitmap.getHeight()));
                if (scale < 1f) bitmap = android.graphics.Bitmap.createScaledBitmap(bitmap, Math.round(bitmap.getWidth() * scale), Math.round(bitmap.getHeight() * scale), true);
                java.io.ByteArrayOutputStream jpeg = new java.io.ByteArrayOutputStream();
                bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 85, jpeg);
                data = jpeg.toByteArray();
                type = "image/jpeg";
            } else if (!readable) {
                return null;
            }
            if (data.length > ATTACH_MAX_BYTES) return null;
            return new JSONObject().put("name", fileName).put("mimeType", type)
                    .put("data", android.util.Base64.encodeToString(data, android.util.Base64.NO_WRAP));
        } catch (Exception | OutOfMemoryError e) {
            return null;
        }
    }

    @Override
    public void notifications() {
        publishBell(true);
        readBell(false);
    }

    /** Ce que le site garde dans le navigateur (lib/notifications.ts) : événements de l'appareil, dernière ouverture, supprimées. */
    private static final String BELL_SCRIPT = "(function(){try{var L=localStorage,s=L.getItem('btm-notifications-seen');"
            + "if(!s){s=String(Date.now());L.setItem('btm-notifications-seen',s);}"
            + "return JSON.stringify({local:JSON.parse(L.getItem('btm-notifications')||'[]'),seen:Number(s)||0,"
            + "hidden:JSON.parse(L.getItem('btm-notifications-hidden')||'[]')});}catch(e){return '';}})()";

    /** Relit la cloche : la mémoire du site tout de suite, l'historique du compte sur le serveur. */
    private void readBell(boolean show) {
        host.siteScript(BELL_SCRIPT, value -> {
            try {
                Object text = value == null ? null : new org.json.JSONTokener(value).nextValue();
                if (text instanceof String && !((String) text).isEmpty()) {
                    JSONObject kept = new JSONObject((String) text);
                    JSONArray local = kept.optJSONArray("local");
                    bellLocal = local == null ? new JSONArray() : local;
                    bellSeen = kept.optLong("seen", bellSeen);
                    JSONArray hidden = kept.optJSONArray("hidden");
                    bellHidden.clear();
                    for (int i = 0; hidden != null && i < hidden.length(); i++) bellHidden.add(hidden.optString(i));
                }
            } catch (JSONException ignored) {
                // Mémoire illisible : on garde ce qu'on savait.
            }
            publishBell(show);
        });
        if (!online || !signedIn) return;
        io.execute(() -> {
            try {
                JSONArray items = ChatApi.notifications();
                main.post(() -> {
                    bellServer = items;
                    publishBell(false);
                });
            } catch (IOException | JSONException ignored) {
                // Pas de réponse : la cloche garde sa liste.
            }
        });
    }

    /** Liste de la cloche comme sur le site : une seule fois chaque notification, les plus récentes d'abord, sans les supprimées. */
    private void publishBell(boolean show) {
        java.util.Map<String, JSONObject> byId = new java.util.LinkedHashMap<>();
        for (JSONArray source : new JSONArray[]{bellLocal, bellServer}) {
            for (int i = 0; i < source.length(); i++) {
                JSONObject item = source.optJSONObject(i);
                if (item != null && !item.optString("id").isEmpty()) byId.put(item.optString("id"), item);
            }
        }
        List<JSONObject> items = new ArrayList<>();
        for (JSONObject item : byId.values()) if (!bellHidden.contains(item.optString("id"))) items.add(item);
        java.util.Collections.sort(items, (a, b) -> b.optString("at").compareTo(a.optString("at")));
        int unread = 0;
        for (JSONObject item : items) if (HomeScreen.instant(item.optString("at")) > bellSeen) unread++;
        screen.setUnread(signedIn ? unread : 0);
        if (show || screen.notificationsOpen()) screen.showNotifications(items, bellSeen);
    }

    @Override
    public void notificationsSeen() {
        bellSeen = System.currentTimeMillis();
        host.siteScript("(function(){try{localStorage.setItem('btm-notifications-seen',String(Date.now()));"
                + "window.dispatchEvent(new Event('btm-notify'));}catch(e){}return '';})()", null);
        publishBell(false);
    }

    @Override
    public void notificationsDismiss(List<String> ids) {
        if (ids.isEmpty()) return;
        bellHidden.addAll(ids);
        JSONArray left = new JSONArray();
        for (int i = 0; i < bellLocal.length(); i++) {
            JSONObject item = bellLocal.optJSONObject(i);
            if (item != null && !ids.contains(item.optString("id"))) left.put(item);
        }
        bellLocal = left;
        // Même rangement que dismiss() du site : masquées sur cet appareil, retirées des événements gardés.
        host.siteScript("(function(ids){try{var L=localStorage,h=[],l=[];"
                + "try{h=JSON.parse(L.getItem('btm-notifications-hidden')||'[]');}catch(e){}"
                + "h=ids.concat(h).filter(function(id,i,a){return a.indexOf(id)===i;}).slice(0,300);"
                + "L.setItem('btm-notifications-hidden',JSON.stringify(h));"
                + "try{l=JSON.parse(L.getItem('btm-notifications')||'[]');}catch(e){}"
                + "L.setItem('btm-notifications',JSON.stringify(l.filter(function(n){return ids.indexOf(n.id)<0;})));"
                + "window.dispatchEvent(new Event('btm-notify'));}catch(e){}return '';})(" + new JSONArray(ids) + ")", null);
        publishBell(false);
    }

    @Override
    public void admin() {
        host.openPage("/admin");
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
        showMenu(historyLoading || history.length() == 0);
        loadAccount();
        loadHistory();
    }

    private void showMenu(boolean loading) {
        screen.showMenu(history, conversationId, name, email, signedIn, loading, balanceCents, demo);
    }

    /** Suppression confirmée dans le menu : comme sur le site, la liste est mise à jour et la conversation ouverte laisse la place à une neuve. */
    @Override
    public void deleteConversation(String id) {
        if (!signedIn || id == null || id.isEmpty()) return;
        if (!online) {
            screen.alert("La suppression a échoué", "Vérifie ta connexion.");
            return;
        }
        io.execute(() -> {
            boolean done;
            try {
                ChatApi.deleteConversation(id);
                done = true;
            } catch (IOException e) {
                done = false;
            }
            boolean ok = done;
            main.post(() -> {
                if (!ok) {
                    screen.alert("La suppression a échoué", "Réessaie dans un instant.");
                    return;
                }
                JSONArray kept = new JSONArray();
                for (int i = 0; i < history.length(); i++) {
                    JSONObject item = history.optJSONObject(i);
                    if (item != null && !id.equals(item.optString("id"))) kept.put(item);
                }
                history = kept;
                io.execute(() -> store.saveHistory(kept));
                if (id.equals(conversationId)) newConversation();
                if (screen.menuOpen()) showMenu(false);
            });
        });
    }

    private void loadHistory() {
        if (!signedIn || historyLoading || !online) {
            if (screen.menuOpen()) showMenu(false);
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
                if (screen.menuOpen()) showMenu(false);
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
