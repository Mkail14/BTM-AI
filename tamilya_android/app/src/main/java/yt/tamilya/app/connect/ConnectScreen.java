package yt.tamilya.app.connect;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.Editable;
import android.text.InputFilter;
import android.text.InputType;
import android.text.TextWatcher;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Écran de Tamilya Connect. Il doit être le même que la conversation du site (ChatView.tsx,
 * MessageItem.tsx, Composer.tsx) : mêmes couleurs, même en-tête, mêmes bulles, même barre
 * d'écriture. Seule différence voulue : le bandeau « hors ligne » du site, qui dit ici que
 * les messages passent par les téléphones autour.
 */
final class ConnectScreen extends LinearLayout {
    /** Même limite que le serveur (MESH_MAX_TEXT). */
    static final int MAX_TEXT = 1000;

    interface Actions {
        void send(String text);
        void action(String actionId, String label, boolean pay);
        /** « Payer » dans le tableau de barge : tickets choisis, jamais de prix (le serveur le recalcule). */
        void bargePay(String actionId, JSONArray cart, String label);
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

    private final ConnectTheme theme;
    private final Actions actions;
    private final View plus;
    private final TextView offline;
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
    private int peerCount = -1;
    /** Ce qui est déjà à l'écran : on ne reconstruit la liste que si ça a changé. */
    private String shown;
    /** Tickets choisis dans chaque tableau de barge (par choix) : gardés si la liste est redessinée. */
    private final java.util.Map<String, java.util.LinkedHashMap<String, Integer>> bargeCarts = new java.util.HashMap<>();

    ConnectScreen(Context context, Actions actions) {
        super(context);
        this.actions = actions;
        theme = ConnectTheme.of(context);
        setOrientation(VERTICAL);
        setBackgroundColor(theme.bg);
        setClickable(true);
        ringPaint.setStyle(Paint.Style.STROKE);
        ringPaint.setStrokeCap(Paint.Cap.ROUND);
        ringPaint.setStrokeWidth(dp(2));
        ringPaint.setColor(theme.fgMuted);
        hintPaint.setColor(theme.fgMuted);
        hintPaint.setTextAlign(Paint.Align.CENTER);
        hintPaint.setTextSize(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, 14, getResources().getDisplayMetrics()));

        // En-tête du site : les trois barres, le logo, puis le « + » à droite (dès qu'il y a des messages).
        LinearLayout header = new LinearLayout(context);
        header.setOrientation(HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(12), dp(16), dp(12), 0);
        header.addView(iconButton(Glyph.MENU, "Ouvrir le menu", v -> actions.history()), new LayoutParams(dp(40), dp(40)));
        LayoutParams logoParams = new LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(22));
        logoParams.leftMargin = dp(8);
        header.addView(logo(context, theme.fg, 22), logoParams);
        header.addView(new View(context), new LayoutParams(0, 1, 1f));
        plus = iconButton(Glyph.PLUS, "Nouvelle conversation", v -> actions.newConversation());
        plus.setVisibility(GONE);
        header.addView(plus, new LayoutParams(dp(40), dp(40)));
        LinearLayout headerBox = new LinearLayout(context);
        headerBox.setOrientation(VERTICAL);
        headerBox.addView(header, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(56) + dp(16) - dp(8)));
        View rule = new View(context);
        rule.setBackgroundColor(theme.border);
        headerBox.addView(rule, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 1));
        addView(headerBox);

        scroll = new ScrollView(context);
        scroll.setFillViewport(true);
        list = new LinearLayout(context);
        list.setOrientation(VERTICAL);
        list.setPadding(dp(16), dp(16), dp(16), dp(16));
        scroll.addView(list);
        addView(scroll, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        // Bas de l'écran, comme sur le site : bandeau « hors ligne », message éventuel, puis la barre d'écriture.
        LinearLayout bottom = new LinearLayout(context);
        bottom.setOrientation(VERTICAL);
        bottom.setPadding(dp(16), 0, dp(16), 0);
        offline = banner(theme.warningSoft, theme.fg);
        bottom.addView(offline, bannerParams());
        notice = banner(theme.dangerSoft, theme.danger);
        notice.setVisibility(GONE);
        bottom.addView(notice, bannerParams());
        addView(bottom);
        setPeers(0);

        bar = new LinearLayout(context);
        bar.setOrientation(HORIZONTAL);
        bar.setGravity(Gravity.BOTTOM);
        // Même hauteur que la barre d'écriture de la conversation : elle ne saute pas à l'ouverture.
        bar.setPadding(dp(12), dp(8), dp(12), dp(38));

        // Zone de saisie du site : pilule bordée (rounded-[1.6rem], border, bg), texte 16, 4 lignes au plus.
        LinearLayout pill = new LinearLayout(context);
        pill.setGravity(Gravity.CENTER_VERTICAL);
        GradientDrawable pillShape = round(theme.bg, 26);
        pillShape.setStroke(dp(1), theme.border);
        pill.setBackground(pillShape);
        pill.setMinimumHeight(dp(50));
        pill.setPadding(dp(12), dp(6), dp(12), dp(6));
        input = new EditText(context);
        input.setHint("Écris à Tamilya…");
        input.setHintTextColor(theme.fgMuted);
        input.setTextColor(theme.fg);
        input.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        input.setMaxLines(4);
        input.setFilters(new InputFilter[]{new InputFilter.LengthFilter(MAX_TEXT)});
        input.setImeOptions(EditorInfo.IME_ACTION_SEND);
        input.setBackground(null);
        input.setPadding(0, dp(6), 0, dp(6));
        pill.addView(input, new LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        bar.addView(pill, new LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        // Bouton d'envoi du site : rond plein de la couleur d'accent, flèche blanche, pâle tant que c'est vide.
        Glyph arrow = new Glyph(context, Glyph.ARROW, Color.WHITE);
        LinearLayout sendBox = new LinearLayout(context);
        sendBox.setGravity(Gravity.CENTER);
        sendBox.setBackground(round(theme.accent, 27));
        sendBox.setContentDescription("Envoyer");
        sendBox.setClickable(true);
        sendBox.setOnClickListener(v -> submit());
        sendBox.addView(arrow, new LayoutParams(dp(22), dp(22)));
        LayoutParams sendParams = new LayoutParams(dp(50), dp(50));
        sendParams.leftMargin = dp(8);
        bar.addView(sendBox, sendParams);
        sendBox.setAlpha(0.45f);
        input.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) { }
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) { }
            @Override public void afterTextChanged(Editable s) {
                sendBox.setAlpha(s.toString().trim().isEmpty() ? 0.45f : 1f);
            }
        });
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

    /** Logo du site (BrandLogo.tsx) : la forme BTM teintée comme le texte, puis le badge « AI ». */
    static View logo(Context context, int color, int heightDp) {
        ConnectTheme theme = ConnectTheme.of(context);
        float density = context.getResources().getDisplayMetrics().density;
        int height = Math.round(heightDp * density);
        LinearLayout row = new LinearLayout(context);
        row.setOrientation(HORIZONTAL);
        row.setGravity(Gravity.BOTTOM);
        row.setContentDescription("BTM AI — GROUPE BTM");
        ImageView mark = new ImageView(context);
        mark.setImageResource(yt.tamilya.app.R.drawable.connect_logo);
        mark.setColorFilter(color, PorterDuff.Mode.SRC_IN);
        mark.setScaleType(ImageView.ScaleType.FIT_CENTER);
        row.addView(mark, new LayoutParams(Math.round(height * 1039f / 483f), height));
        TextView badge = new TextView(context);
        badge.setText("AI");
        badge.setTextColor(theme.accentFg);
        badge.setTextSize(TypedValue.COMPLEX_UNIT_PX, height * 0.36f);
        badge.setTypeface(Typeface.DEFAULT_BOLD);
        badge.setLetterSpacing(0.05f);
        badge.setIncludeFontPadding(false);
        int padX = Math.round(height * 0.22f), padY = Math.round(height * 0.06f);
        badge.setPadding(padX, padY, padX, padY);
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(theme.accent);
        shape.setCornerRadius(height * 0.18f);
        badge.setBackground(shape);
        LayoutParams badgeParams = new LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        badgeParams.leftMargin = Math.round(height * 0.35f);
        row.addView(badge, badgeParams);
        return row;
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
        canvas.drawText("Balaye vers le haut pour revenir à Tamilya", cx, textY, hintPaint);
    }

    /** Fermeture par le même geste : seulement si la discussion est déjà tout en bas. */
    boolean atBottom() {
        return !scroll.canScrollVertically(1);
    }

    /** Le bandeau « hors ligne » du site, avec le nombre de téléphones qui peuvent relayer. */
    void setPeers(int count) {
        if (count == peerCount) return;
        peerCount = count;
        offline.setText(count == 0
                ? "Tu es hors ligne. Ton message passera par le premier téléphone autour qui a internet."
                : "Tu es hors ligne. Tes messages passent par les téléphones autour ("
                        + count + (count == 1 ? " téléphone)." : " téléphones)."));
    }

    void setNotice(String message) {
        notice.setText(message == null ? "" : message);
        notice.setVisibility(message == null || message.isEmpty() ? GONE : VISIBLE);
    }

    private TextView banner(int fill, int color) {
        TextView view = text("", 14, color);
        view.setBackground(round(fill, 8));
        view.setPadding(dp(12), dp(8), dp(12), dp(8));
        return view;
    }

    private LayoutParams bannerParams() {
        LayoutParams params = new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.topMargin = dp(8);
        return params;
    }

    private View iconButton(int glyph, String description, OnClickListener click) {
        LinearLayout button = new LinearLayout(getContext());
        button.setGravity(Gravity.CENTER);
        button.setContentDescription(description);
        button.setClickable(true);
        button.setOnClickListener(click);
        android.util.TypedValue ripple = new android.util.TypedValue();
        getContext().getTheme().resolveAttribute(android.R.attr.selectableItemBackgroundBorderless, ripple, true);
        if (ripple.resourceId != 0) button.setBackgroundResource(ripple.resourceId);
        button.addView(new Glyph(getContext(), glyph, theme.fgMuted), new LayoutParams(dp(22), dp(22)));
        return button;
    }

    /** Le même historique que sur le site, avec la marque de chaque conversation. */
    void renderHistory(JSONArray history, String currentId) {
        String wanted = "h" + currentId + "\n" + history;
        if (!wanted.equals(shown)) {
            shown = wanted;
            fillHistory(history, currentId);
        }
        scroll.post(() -> scroll.scrollTo(0, 0));
    }

    private void fillHistory(JSONArray history, String currentId) {
        list.removeAllViews();
        list.setGravity(Gravity.TOP);
        plus.setVisibility(VISIBLE);
        TextView title = text("HISTORIQUE", 12, theme.fgMuted);
        title.setLetterSpacing(0.08f);
        title.setPadding(dp(4), 0, 0, dp(8));
        list.addView(title);
        if (history.length() == 0) {
            TextView empty = text("Tes conversations apparaîtront ici. Il faut internet une première fois pour les récupérer.", 15, theme.fgMuted);
            empty.setPadding(0, dp(12), 0, dp(12));
            list.addView(empty);
        }
        for (int i = 0; i < history.length(); i++) {
            JSONObject item = history.optJSONObject(i);
            if (item != null) list.addView(historyRow(item, item.optString("id").equals(currentId)));
        }
    }

    /** Les trois barres : le menu de Tamilya, glissé depuis la gauche (ConnectMenu). */
    void showMenu(JSONArray history, String currentId, JSONObject account, long since) {
        new ConnectMenu(getContext(), this, actions).show(history, currentId, account, since);
    }

    View historyRow(JSONObject item, boolean current) {
        LinearLayout row = new LinearLayout(getContext());
        row.setOrientation(HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        // Comme l'historique du site (ConversationItem.tsx) : une ligne simple, sans cadre ; seule la
        // conversation ouverte est surlignée. On supprime par un appui long (avec confirmation).
        // Pas de marque « Connect » : une conversation est la même, qu'elle soit partie avec ou sans internet.
        row.setPadding(dp(12), dp(11), dp(12), dp(11));
        if (current) row.setBackground(round(theme.bgMuted, 8));
        row.setClickable(true);
        row.setOnClickListener(v -> actions.openConversation(item.optString("id")));
        row.setOnLongClickListener(v -> {
            v.performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS);
            actions.deleteConversation(item.optString("id"));
            return true;
        });
        String name = item.optString("title", "Conversation");
        row.setContentDescription(name + ". Appui long pour supprimer.");

        TextView title = text(name, 14, current ? theme.fg : theme.fgMuted);
        if (current) title.setTypeface(title.getTypeface(), Typeface.BOLD);
        title.setSingleLine(true);
        title.setEllipsize(android.text.TextUtils.TruncateAt.END);
        row.addView(title, new LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        LinearLayout box = new LinearLayout(getContext());
        box.setPadding(0, dp(1), 0, dp(1));
        box.addView(row, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        return box;
    }

    void render(JSONArray messages) {
        // Appelé à chaque changement du nombre de voisins, de statut… : souvent rien n'a bougé.
        String wanted = "m" + messages;
        if (!wanted.equals(shown)) {
            shown = wanted;
            fillMessages(messages);
        }
        scroll.post(() -> scroll.fullScroll(View.FOCUS_DOWN));
    }

    private void fillMessages(JSONArray messages) {
        list.removeAllViews();
        plus.setVisibility(messages.length() > 0 ? VISIBLE : GONE);
        list.setGravity(messages.length() == 0 ? Gravity.CENTER : Gravity.TOP);
        if (messages.length() == 0) {
            // Accueil du site : Tamilya (globe) au centre, « Bonjour », puis la phrase de présentation.
            LayoutParams globeParams = new LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            globeParams.gravity = Gravity.CENTER_HORIZONTAL;
            list.addView(globe, globeParams);
            TextView hello = text(greeting(), 24, theme.fg);
            hello.setTypeface(Typeface.create("sans-serif-medium", Typeface.BOLD));
            hello.setGravity(Gravity.CENTER);
            hello.setPadding(0, dp(20), 0, 0);
            list.addView(hello, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
            TextView intro = text("Je suis Tamilya. Pose-moi ta question, en français ou en shimaoré.", 14, theme.fgMuted);
            intro.setGravity(Gravity.CENTER);
            intro.setPadding(dp(24), dp(8), dp(24), 0);
            list.addView(intro, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        }
        for (int i = 0; i < messages.length(); i++) {
            JSONObject message = messages.optJSONObject(i);
            if (message != null) list.addView(bubble(message));
        }
        // Dernier message envoyé encore sans réponse : Tamilya « réfléchit », comme les trois points du site.
        JSONObject last = messages.length() > 0 ? messages.optJSONObject(messages.length() - 1) : null;
        if (last != null && "me".equals(last.optString("from")) && WAITING.contains(last.optString("status"))) list.addView(thinking());
    }

    /** « Bonjour » ou « Bonsoir » à l'heure de Mayotte, comme greeting() du site. */
    private static String greeting() {
        java.util.Calendar now = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("Indian/Mayotte"));
        int hour = now.get(java.util.Calendar.HOUR_OF_DAY);
        return hour >= 18 || hour < 4 ? "Bonsoir" : "Bonjour";
    }

    /** Statuts d'un message parti mais pas encore répondu. */
    private static final java.util.Set<String> WAITING = new java.util.HashSet<>(java.util.Arrays.asList("searching", "relayed", "retry"));

    /** Petit globe de Tamilya devant ses réponses (awa-avatar du site, 32 px). */
    private View avatar() {
        View dot = new View(getContext());
        GradientDrawable ball = new GradientDrawable();
        ball.setShape(GradientDrawable.OVAL);
        ball.setGradientType(GradientDrawable.RADIAL_GRADIENT);
        ball.setGradientCenter(0.32f, 0.28f);
        ball.setGradientRadius(dp(26));
        ball.setColors(new int[]{ConnectTheme.mix(theme.accent, 0.55f, 0xFFFFE3EF), theme.accent,
                ConnectTheme.mix(theme.accent, 0.70f, 0xFF2A0614)});
        dot.setBackground(ball);
        dot.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        return dot;
    }

    /** Ligne d'une réponse de Tamilya : le globe à gauche, le contenu à droite (sans bulle, comme le site). */
    private LinearLayout answerRow(View content) {
        LinearLayout row = new LinearLayout(getContext());
        row.setOrientation(HORIZONTAL);
        row.setPadding(0, dp(10), 0, dp(10));
        row.addView(avatar(), new LayoutParams(dp(32), dp(32)));
        LayoutParams params = new LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        params.leftMargin = dp(10);
        params.topMargin = dp(4);
        row.addView(content, params);
        return row;
    }

    /** Trois points qui sautillent à côté du globe, jusqu'à l'arrivée de la réponse. */
    private View thinking() {
        LinearLayout dots = new LinearLayout(getContext());
        dots.setOrientation(HORIZONTAL);
        dots.setGravity(Gravity.CENTER_VERTICAL);
        dots.setMinimumHeight(dp(24));
        dots.setContentDescription("Tamilya rédige une réponse");
        java.util.List<android.animation.Animator> moves = new java.util.ArrayList<>();
        for (int i = 0; i < 3; i++) {
            View dot = new View(getContext());
            dot.setBackground(round(theme.fgMuted, 3));
            LayoutParams params = new LayoutParams(dp(6), dp(6));
            if (i > 0) params.leftMargin = dp(4);
            dots.addView(dot, params);
            android.animation.ObjectAnimator move = android.animation.ObjectAnimator.ofFloat(dot, View.TRANSLATION_Y, 0f, -dp(4), 0f);
            move.setDuration(600);
            move.setStartDelay(i * 120L);
            move.setRepeatCount(android.animation.ValueAnimator.INFINITE);
            moves.add(move);
        }
        // Les points ne bougent que tant qu'ils sont à l'écran (batterie).
        dots.addOnAttachStateChangeListener(new OnAttachStateChangeListener() {
            @Override public void onViewAttachedToWindow(View v) { for (android.animation.Animator m : moves) m.start(); }
            @Override public void onViewDetachedFromWindow(View v) { for (android.animation.Animator m : moves) m.cancel(); }
        });
        return answerRow(dots);
    }

    private View bubble(JSONObject message) {
        boolean mine = "me".equals(message.optString("from"));
        boolean error = "error".equals(message.optString("status"));
        LinearLayout box = new LinearLayout(getContext());
        box.setOrientation(VERTICAL);

        if (mine) {
            // Bulle du site : bg-muted, coins arrondis sauf en bas à droite, 88 % de large au plus.
            box.setGravity(Gravity.END);
            box.setPadding(0, dp(10), 0, dp(10));
            TextView body = text(message.optString("text"), 16, theme.fg);
            body.setLineSpacing(0, 1.3f);
            body.setMaxWidth(Math.round(getResources().getDisplayMetrics().widthPixels * 0.88f) - dp(32));
            GradientDrawable shape = new GradientDrawable();
            shape.setColor(theme.bgMuted);
            float big = dp(24), small = dp(8);
            shape.setCornerRadii(new float[]{big, big, big, big, small, small, big, big});
            body.setBackground(shape);
            body.setPadding(dp(16), dp(10), dp(16), dp(10));
            LayoutParams bodyParams = new LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            bodyParams.gravity = Gravity.END;
            box.addView(body, bodyParams);

            String note = message.optString("note");
            String state = message.optString("status");
            TextView status = text(note.isEmpty() ? statusLabel(state) : note, 12,
                    stopped(state) ? theme.danger : theme.fgMuted);
            status.setPadding(0, dp(4), dp(4), 0);
            LayoutParams statusParams = new LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            statusParams.gravity = Gravity.END;
            box.addView(status, statusParams);
            if (stopped(state)) box.addView(stoppedButtons(message), statusParams);
            return box;
        }

        // Réponse de Tamilya : texte simple à côté du globe ; une erreur dans le cadre rouge du site.
        TextView body = text(message.optString("text"), 16, error ? theme.danger : theme.fg);
        body.setLineSpacing(0, 1.3f);
        if (error) {
            body.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
            body.setBackground(round(theme.dangerSoft, 12));
            body.setPadding(dp(12), dp(8), dp(12), dp(8));
        }
        box.addView(body, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        // Tickets de barge payés : la carte (rangée dans l'APK), le QR code et le ticket.
        JSONArray tickets = message.optJSONArray("tickets");
        if (tickets != null && tickets.length() > 0) {
            LayoutParams ticketParams = new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            ticketParams.topMargin = dp(10);
            box.addView(BargePasses.list(getContext(), tickets, () -> actions.send("Je veux un ticket de barge")), ticketParams);
        }

        JSONArray choices = message.optJSONArray("actions");
        boolean used = message.optBoolean("used");
        for (int i = 0; choices != null && !used && i < choices.length(); i++) {
            JSONObject choice = choices.optJSONObject(i);
            if (choice == null) continue;
            String label = choice.optString("label");
            boolean pay = choice.optBoolean("pay");
            if ("barge".equals(choice.optString("table"))) {
                // Tableau rangé dans l'APK, rempli avec les tickets demandés.
                String actionId = choice.optString("id");
                java.util.LinkedHashMap<String, Integer> cart = bargeCarts.get(actionId);
                if (cart == null) {
                    cart = BargeTable.cartOf(choice);
                    bargeCarts.put(actionId, cart);
                }
                BargeTable table = new BargeTable(getContext(), cart, (lines, summary) -> actions.bargePay(actionId, lines, summary));
                LayoutParams params = new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
                params.topMargin = dp(8);
                box.addView(table.view(), params);
                continue;
            }
            // Choix proposés par Tamilya (ChoiceOption.tsx) : bouton bordé ; celui qui paie est plein, couleur d'accent.
            TextView button = new TextView(getContext());
            button.setText(label);
            button.setTextColor(pay ? Color.WHITE : theme.fg);
            button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
            if (pay) button.setTypeface(button.getTypeface(), Typeface.BOLD);
            button.setGravity(Gravity.CENTER_VERTICAL | Gravity.START);
            button.setPadding(dp(16), dp(12), dp(16), dp(12));
            GradientDrawable shape = round(pay ? theme.accent : theme.bg, 12);
            if (!pay) shape.setStroke(dp(1), theme.border);
            button.setBackground(shape);
            button.setClickable(true);
            String actionId = choice.optString("id");
            button.setOnClickListener(v -> actions.action(actionId, label, pay));
            LayoutParams params = new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            params.topMargin = dp(8);
            box.addView(button, params);
        }
        return answerRow(box);
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
            TextView relaunch = smallButton("Réessayer", Color.WHITE, theme.accent, false);
            relaunch.setContentDescription("Relancer la recherche de relais");
            relaunch.setOnClickListener(v -> actions.relaunch(id));
            row.addView(relaunch);
        }
        TextView delete = smallButton("Supprimer", theme.fg, theme.bg, true);
        delete.setContentDescription("Supprimer ce message");
        delete.setOnClickListener(v -> actions.deleteMessage(id));
        LayoutParams params = new LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.leftMargin = row.getChildCount() > 0 ? dp(8) : 0;
        row.addView(delete, params);
        return row;
    }

    private TextView smallButton(String label, int textColor, int fill, boolean outlined) {
        TextView button = text(label, 14, textColor);
        button.setTypeface(button.getTypeface(), Typeface.BOLD);
        button.setGravity(Gravity.CENTER);
        button.setPadding(dp(14), dp(7), dp(14), dp(7));
        GradientDrawable shape = round(fill, 8);
        if (outlined) shape.setStroke(dp(1), theme.border);
        button.setBackground(shape);
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

    /** Icônes du site (trait de 2, bouts ronds, grille de 24) : menu, plus, flèche d'envoi. */
    static final class Glyph extends View {
        static final int MENU = 0, PLUS = 1, ARROW = 2;
        private final int kind;
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);

        Glyph(Context context, int kind, int color) {
            super(context);
            this.kind = kind;
            paint.setColor(color);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeCap(Paint.Cap.ROUND);
            paint.setStrokeJoin(Paint.Join.ROUND);
            setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        }

        @Override
        protected void onDraw(Canvas canvas) {
            float u = Math.min(getWidth(), getHeight()) / 24f;
            paint.setStrokeWidth(2 * u);
            switch (kind) {
                case MENU:
                    canvas.drawLine(4 * u, 6 * u, 20 * u, 6 * u, paint);
                    canvas.drawLine(4 * u, 12 * u, 20 * u, 12 * u, paint);
                    canvas.drawLine(4 * u, 18 * u, 20 * u, 18 * u, paint);
                    break;
                case PLUS:
                    canvas.drawLine(12 * u, 5 * u, 12 * u, 19 * u, paint);
                    canvas.drawLine(5 * u, 12 * u, 19 * u, 12 * u, paint);
                    break;
                default:
                    paint.setStrokeWidth(2.4f * u);
                    canvas.drawLine(12 * u, 19 * u, 12 * u, 5 * u, paint);
                    canvas.drawLine(5 * u, 12 * u, 12 * u, 5 * u, paint);
                    canvas.drawLine(19 * u, 12 * u, 12 * u, 5 * u, paint);
            }
        }
    }
}
