package yt.tamilya.app.connect;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.drawable.GradientDrawable;
import android.text.InputFilter;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

/** Écran de Tamilya Connect : la discussion, un champ de texte, l'état de chaque message. */
final class ConnectScreen extends LinearLayout {
    /** Même limite que le serveur (MESH_MAX_TEXT). */
    static final int MAX_TEXT = 1000;

    interface Actions {
        void send(String text);
        void action(String actionId, String label, boolean pay);
        void close();
        void history();
        void newConversation();
        void openConversation(String id);
        void deleteConversation(String id);
        void relaunch(String id);
        void deleteMessage(String id);
        /** Page du site choisie dans le menu (« /parametres »). */
        void openPage(String path);
        /** « Obtenir de l'aide » : la page d'aide de l'app, par-dessus Connect. */
        void help();
    }

    private static final int INK = Color.parseColor("#111111");
    private static final int CREAM = Color.parseColor("#F5F0E6");
    private static final int MUTED = Color.parseColor("#8E9398");
    private static final int ACCENT = Color.parseColor("#F06A9B");
    private static final int MINE = Color.parseColor("#3A1626");
    private static final int THEIRS = Color.parseColor("#1D1F21");
    private static final int SURFACE = Color.parseColor("#2B2E33");

    private final Actions actions;
    private final TextView peers;
    private final TextView notice;
    private final ScrollView scroll;
    private final LinearLayout list;
    private final EditText input;
    private final GreyGlobe globe;
    private final LinearLayout bar;
    private final Paint ringPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint hintPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF ringBounds = new RectF();
    private float pull;

    ConnectScreen(Context context, Actions actions) {
        super(context);
        this.actions = actions;
        setOrientation(VERTICAL);
        setBackground(new LagonDrawable(context, INK));
        setClickable(true);
        ringPaint.setStyle(Paint.Style.STROKE);
        ringPaint.setStrokeCap(Paint.Cap.ROUND);
        ringPaint.setStrokeWidth(dp(2));
        ringPaint.setColor(MUTED);
        hintPaint.setColor(MUTED);
        hintPaint.setTextAlign(Paint.Align.CENTER);
        hintPaint.setTextSize(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, 14, getResources().getDisplayMetrics()));

        LinearLayout header = new LinearLayout(context);
        header.setOrientation(HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        // Comme Tamilya : les trois barres à gauche ouvrent le menu. Pas de croix : on quitte Connect par le geste.
        header.setPadding(dp(4), dp(16), dp(8), dp(8));
        header.addView(headerButton("☰", "Ouvrir le menu", v -> actions.history()), new LayoutParams(dp(48), dp(48)));
        LinearLayout titles = new LinearLayout(context);
        titles.setOrientation(VERTICAL);
        titles.setPadding(dp(4), 0, 0, 0);
        TextView title = text("Tamilya Connect", 20, CREAM);
        title.setTypeface(title.getTypeface(), android.graphics.Typeface.BOLD);
        titles.addView(title);
        peers = text("Sans internet · par les téléphones autour", 13, MUTED);
        titles.addView(peers);
        header.addView(titles, new LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        header.addView(headerButton("+", "Nouvelle conversation", v -> actions.newConversation()), new LayoutParams(dp(44), dp(48)));
        addView(header);

        notice = text("", 14, ACCENT);
        notice.setPadding(dp(20), 0, dp(20), dp(8));
        notice.setVisibility(GONE);
        addView(notice);

        scroll = new ScrollView(context);
        scroll.setFillViewport(true);
        list = new LinearLayout(context);
        list.setOrientation(VERTICAL);
        list.setPadding(dp(16), dp(8), dp(16), dp(8));
        scroll.addView(list);
        addView(scroll, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        bar = new LinearLayout(context);
        bar.setOrientation(HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        // Même hauteur que la barre d'écriture de la conversation : elle ne saute pas à l'ouverture.
        bar.setPadding(dp(12), dp(8), dp(12), dp(38));
        input = new EditText(context);
        input.setHint("Écris à Tamilya…");
        input.setHintTextColor(MUTED);
        input.setTextColor(CREAM);
        input.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        input.setMaxLines(4);
        input.setFilters(new InputFilter[]{new InputFilter.LengthFilter(MAX_TEXT)});
        input.setImeOptions(EditorInfo.IME_ACTION_SEND);
        input.setBackground(round(THEIRS, 24));
        input.setPadding(dp(16), dp(10), dp(16), dp(10));
        bar.addView(input, new LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        Button send = new Button(context);
        send.setText("↑");
        send.setTextColor(Color.WHITE);
        send.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        send.setBackground(round(ACCENT, 24));
        send.setContentDescription("Envoyer");
        send.setOnClickListener(v -> submit());
        LayoutParams sendParams = new LayoutParams(dp(48), dp(48));
        sendParams.leftMargin = dp(8);
        bar.addView(send, sendParams);
        addView(bar);

        // Comme sur le site quand la voix n'est pas disponible : le globe ouvre la zone de saisie.
        globe = new GreyGlobe(context);
        globe.setOnClickListener(v -> {
            globe.pop();
            input.requestFocus();
            InputMethodManager keyboard = context.getSystemService(InputMethodManager.class);
            if (keyboard != null) input.post(() -> keyboard.showSoftInput(input, 0));
        });
    }

    private void submit() {
        String text = input.getText().toString().trim();
        if (text.isEmpty()) return;
        input.setText("");
        actions.send(text);
    }

    /** Geste de fermeture : les messages montent, le rond se remplit, la barre ne bouge pas. */
    void setPull(float progress) {
        pull = progress;
        list.setTranslationY(-dp(112) * progress);
        invalidate();
    }

    @Override
    protected void dispatchDraw(Canvas canvas) {
        super.dispatchDraw(canvas);
        if (pull <= 0f) return;
        int alpha = Math.round(255 * Math.min(1f, pull * 3));
        ringPaint.setAlpha(alpha);
        hintPaint.setAlpha(alpha);
        float cx = getWidth() / 2f;
        float textY = bar.getTop() - dp(8);
        float radius = dp(16);
        float cy = textY - dp(30) - radius;
        ringBounds.set(cx - radius, cy - radius, cx + radius, cy + radius);
        canvas.drawArc(ringBounds, -90, 360 * pull, false, ringPaint);
        canvas.drawText("Balaye vers le haut pour fermer Tamilya Connect", cx, textY, hintPaint);
    }

    /** Fermeture par le même geste : seulement si la discussion est déjà tout en bas. */
    boolean atBottom() {
        return !scroll.canScrollVertically(1);
    }

    void setPeers(int count) {
        peers.setText(count == 0 ? "Aucun téléphone autour pour l'instant"
                : count == 1 ? "1 téléphone autour" : count + " téléphones autour");
    }

    void setNotice(String message) {
        notice.setText(message == null ? "" : message);
        notice.setVisibility(message == null || message.isEmpty() ? GONE : VISIBLE);
    }

    private Button headerButton(String label, String description, OnClickListener click) {
        Button button = new Button(getContext());
        button.setText(label);
        button.setTextColor(CREAM);
        button.setBackgroundColor(Color.TRANSPARENT);
        button.setContentDescription(description);
        button.setOnClickListener(click);
        return button;
    }

    /** Le même historique que sur le site, avec la marque de chaque conversation. */
    void renderHistory(JSONArray history, String currentId) {
        list.removeAllViews();
        list.setGravity(Gravity.TOP);
        list.addView(text("Historique", 17, CREAM));
        if (history.length() == 0) {
            TextView empty = text("Tes conversations apparaîtront ici. Il faut internet une première fois pour les récupérer.", 15, MUTED);
            empty.setPadding(0, dp(12), 0, dp(12));
            list.addView(empty);
        }
        for (int i = 0; i < history.length(); i++) {
            JSONObject item = history.optJSONObject(i);
            if (item != null) list.addView(historyRow(item, item.optString("id").equals(currentId)));
        }
        scroll.post(() -> scroll.scrollTo(0, 0));
    }

    /** Les trois barres : le menu de Tamilya, glissé depuis la gauche (ConnectMenu). */
    void showMenu(JSONArray history, String currentId, JSONObject account) {
        new ConnectMenu(getContext(), this, actions).show(history, currentId, account);
    }

    View historyRow(JSONObject item, boolean current) {
        boolean connect = ConnectHistory.CONNECT.equals(item.optString("source"));
        LinearLayout row = new LinearLayout(getContext());
        row.setOrientation(HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        // Comme l'historique du site (ConversationItem.tsx) : une ligne simple, sans cadre ; seule la
        // conversation ouverte est surlignée. Plus de mot « Tamilya » sur chaque ligne ni de corbeille
        // partout : on supprime par un appui long (avec confirmation), comme sur le site au doigt.
        row.setPadding(dp(12), dp(11), dp(12), dp(11));
        if (current) row.setBackground(round(THEIRS, 10));
        row.setClickable(true);
        row.setOnClickListener(v -> actions.openConversation(item.optString("id")));
        row.setOnLongClickListener(v -> {
            v.performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS);
            actions.deleteConversation(item.optString("id"));
            return true;
        });
        String name = item.optString("title", "Conversation");
        row.setContentDescription(name + (connect ? ", Tamilya Connect" : "") + ". Appui long pour supprimer.");

        TextView title = text(name, 15, current ? CREAM : Color.parseColor("#D9D4CB"));
        if (current) title.setTypeface(title.getTypeface(), android.graphics.Typeface.BOLD);
        title.setSingleLine(true);
        title.setEllipsize(android.text.TextUtils.TruncateAt.END);
        row.addView(title, new LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        if (connect) {
            // Petite marque discrète, comme sur le site.
            TextView tag = text("Connect", 10, MUTED);
            tag.setPadding(dp(6), dp(1), dp(6), dp(1));
            android.graphics.drawable.GradientDrawable pill = new android.graphics.drawable.GradientDrawable();
            pill.setCornerRadius(dp(10));
            pill.setStroke(dp(1), SURFACE);
            tag.setBackground(pill);
            LayoutParams tagParams = new LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            tagParams.leftMargin = dp(8);
            row.addView(tag, tagParams);
        }

        LinearLayout box = new LinearLayout(getContext());
        box.setPadding(0, dp(1), 0, dp(1));
        box.addView(row, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        return box;
    }

    void render(JSONArray messages) {
        list.removeAllViews();
        list.setGravity(messages.length() == 0 ? Gravity.CENTER : Gravity.TOP);
        if (messages.length() == 0) {
            LayoutParams globeParams = new LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            globeParams.gravity = Gravity.CENTER_HORIZONTAL;
            list.addView(globe, globeParams);
            TextView empty = text("Pas d'internet ? Écris quand même : ton message passe de téléphone en téléphone "
                    + "jusqu'à quelqu'un qui a internet. Écrit seulement, pas de voix.", 15, MUTED);
            empty.setGravity(Gravity.CENTER);
            empty.setPadding(dp(12), 0, dp(12), dp(12));
            list.addView(empty);
        }
        for (int i = 0; i < messages.length(); i++) {
            JSONObject message = messages.optJSONObject(i);
            if (message != null) list.addView(bubble(message));
        }
        scroll.post(() -> scroll.fullScroll(View.FOCUS_DOWN));
    }

    private View bubble(JSONObject message) {
        boolean mine = "me".equals(message.optString("from"));
        boolean error = "error".equals(message.optString("status"));
        LinearLayout box = new LinearLayout(getContext());
        box.setOrientation(VERTICAL);
        box.setGravity(mine ? Gravity.END : Gravity.START);
        box.setPadding(0, dp(6), 0, dp(6));

        TextView body = text(message.optString("text"), 16, error ? ACCENT : CREAM);
        body.setBackground(round(mine ? MINE : THEIRS, 18));
        body.setPadding(dp(14), dp(10), dp(14), dp(10));
        LayoutParams bodyParams = new LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        bodyParams.gravity = mine ? Gravity.END : Gravity.START;
        box.addView(body, bodyParams);

        if (mine) {
            String note = message.optString("note");
            String state = message.optString("status");
            TextView status = text(note.isEmpty() ? statusLabel(state) : note, 12,
                    stopped(state) ? ACCENT : MUTED);
            status.setPadding(0, dp(4), dp(4), 0);
            LayoutParams statusParams = new LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            statusParams.gravity = Gravity.END;
            box.addView(status, statusParams);
            if (stopped(state)) box.addView(stoppedButtons(message), statusParams);
        }

        JSONArray choices = message.optJSONArray("actions");
        boolean used = message.optBoolean("used");
        for (int i = 0; choices != null && !used && i < choices.length(); i++) {
            JSONObject choice = choices.optJSONObject(i);
            if (choice == null) continue;
            String label = choice.optString("label");
            boolean pay = choice.optBoolean("pay");
            // Choix de commande : pastille pleine, pleine largeur ; le choix qui paie passe en rose.
            TextView button = new TextView(getContext());
            button.setText(label);
            button.setTextColor(pay ? Color.WHITE : CREAM);
            button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
            if (pay) button.setTypeface(button.getTypeface(), android.graphics.Typeface.BOLD);
            button.setGravity(Gravity.CENTER_VERTICAL | Gravity.START);
            button.setPadding(dp(16), dp(13), dp(16), dp(13));
            button.setBackground(round(pay ? ACCENT : SURFACE, 16));
            button.setClickable(true);
            String actionId = choice.optString("id");
            button.setOnClickListener(v -> actions.action(actionId, label, pay));
            LayoutParams params = new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            params.topMargin = dp(8);
            box.addView(button, params);
        }
        return box;
    }

    /** Message arrêté (coupé, sans réponse, refusé) : on peut le relancer ou le supprimer. */
    static boolean stopped(String status) {
        return "cut".equals(status) || "expired".equals(status) || "failed".equals(status);
    }

    /** Relancer : seulement un message écrit (jamais un paiement), coupé faute de réponse. */
    static boolean canRelaunch(JSONObject message) {
        String status = message.optString("status");
        if (!"cut".equals(status) && !"expired".equals(status)) return false;
        JSONObject content = message.optJSONObject("content");
        if (content != null) return "chat".equals(content.optString("kind"));
        return !message.optString("text").startsWith("Payer : ");
    }

    private View stoppedButtons(JSONObject message) {
        LinearLayout row = new LinearLayout(getContext());
        row.setOrientation(HORIZONTAL);
        row.setPadding(0, dp(6), 0, 0);
        String id = message.optString("id");
        if (canRelaunch(message)) {
            TextView relaunch = smallButton("Relancer", Color.WHITE, ACCENT);
            relaunch.setContentDescription("Relancer la recherche de relais");
            relaunch.setOnClickListener(v -> actions.relaunch(id));
            row.addView(relaunch);
        }
        TextView delete = smallButton("Supprimer", CREAM, SURFACE);
        delete.setContentDescription("Supprimer ce message");
        delete.setOnClickListener(v -> actions.deleteMessage(id));
        LayoutParams params = new LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.leftMargin = row.getChildCount() > 0 ? dp(8) : 0;
        row.addView(delete, params);
        return row;
    }

    private TextView smallButton(String label, int textColor, int fill) {
        TextView button = text(label, 14, textColor);
        button.setTypeface(button.getTypeface(), android.graphics.Typeface.BOLD);
        button.setGravity(Gravity.CENTER);
        button.setPadding(dp(16), dp(9), dp(16), dp(9));
        button.setBackground(round(fill, 18));
        button.setClickable(true);
        return button;
    }

    static String statusLabel(String status) {
        switch (status) {
            case "cut": return "Aucun relais trouvé en 3 h : message coupé";
            case "relayed": return "Relayé";
            case "answered": return "Répondu";
            case "expired": return "Pas de réponse : réessaie plus tard";
            case "retry": return "Relayé · nouvel essai dans un instant";
            case "failed": return "Pas envoyé";
            default: return "Cherche un relais…";
        }
    }

    private TextView text(String value, int sp, int color) {
        TextView view = new TextView(getContext());
        view.setText(value);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        view.setTextColor(color);
        return view;
    }

    private GradientDrawable round(int color, int radiusDp) {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(color);
        shape.setCornerRadius(dp(radiusDp));
        return shape;
    }

    private int dp(int value) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics()));
    }
}
