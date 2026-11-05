package yt.tamilya.app.connect;

import android.content.Context;
import android.graphics.Color;
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
    }

    private static final int INK = Color.parseColor("#111111");
    private static final int CREAM = Color.parseColor("#F5F0E6");
    private static final int MUTED = Color.parseColor("#8E9398");
    private static final int ACCENT = Color.parseColor("#F06A9B");
    private static final int MINE = Color.parseColor("#3A1626");
    private static final int THEIRS = Color.parseColor("#1D1F21");

    private final Actions actions;
    private final TextView peers;
    private final TextView notice;
    private final ScrollView scroll;
    private final LinearLayout list;
    private final EditText input;
    private final GreyGlobe globe;

    ConnectScreen(Context context, Actions actions) {
        super(context);
        this.actions = actions;
        setOrientation(VERTICAL);
        setBackground(new LagonDrawable(context, INK));
        setClickable(true);

        LinearLayout header = new LinearLayout(context);
        header.setOrientation(HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(20), dp(16), dp(8), dp(8));
        LinearLayout titles = new LinearLayout(context);
        titles.setOrientation(VERTICAL);
        TextView title = text("Tamilya Connect", 20, CREAM);
        title.setTypeface(title.getTypeface(), android.graphics.Typeface.BOLD);
        titles.addView(title);
        peers = text("Sans internet · par les téléphones autour", 13, MUTED);
        titles.addView(peers);
        header.addView(titles, new LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        Button close = new Button(context);
        close.setText("✕");
        close.setTextColor(CREAM);
        close.setBackgroundColor(Color.TRANSPARENT);
        close.setContentDescription("Fermer Tamilya Connect");
        close.setOnClickListener(v -> actions.close());
        header.addView(close, new LayoutParams(dp(48), dp(48)));
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

        LinearLayout bar = new LinearLayout(context);
        bar.setOrientation(HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(12), dp(8), dp(12), dp(12));
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
            TextView status = text(note.isEmpty() ? statusLabel(message.optString("status")) : note, 12,
                    "failed".equals(message.optString("status")) ? ACCENT : MUTED);
            status.setPadding(0, dp(4), dp(4), 0);
            LayoutParams statusParams = new LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            statusParams.gravity = Gravity.END;
            box.addView(status, statusParams);
        }

        JSONArray choices = message.optJSONArray("actions");
        boolean used = message.optBoolean("used");
        for (int i = 0; choices != null && !used && i < choices.length(); i++) {
            JSONObject choice = choices.optJSONObject(i);
            if (choice == null) continue;
            Button button = new Button(getContext());
            String label = choice.optString("label");
            boolean pay = choice.optBoolean("pay");
            button.setText(pay ? label + "  · payer" : label);
            button.setAllCaps(false);
            button.setTextColor(CREAM);
            button.setBackground(round(MINE, 16));
            String actionId = choice.optString("id");
            button.setOnClickListener(v -> actions.action(actionId, label, pay));
            LayoutParams params = new LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            params.topMargin = dp(6);
            box.addView(button, params);
        }
        return box;
    }

    static String statusLabel(String status) {
        switch (status) {
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
