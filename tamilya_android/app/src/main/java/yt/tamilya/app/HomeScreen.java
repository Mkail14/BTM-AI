package yt.tamilya.app;

import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.text.Editable;
import android.text.InputFilter;
import android.text.InputType;
import android.text.TextWatcher;
import android.text.method.LinkMovementMethod;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Accueil et conversation natifs : le même écran que ChatView.tsx du site (en-tête avec le
 * menu et le logo, Tamilya au centre avec « Bonjour » et des idées, puis les bulles et la barre
 * d'écriture avec le bouton rose plein). Les cartes du site (ticket de barge, commande…)
 * deviennent un bouton qui ouvre la conversation sur le site.
 */
final class HomeScreen extends FrameLayout {
    static final int MAX_TEXT = 4000;

    interface Actions {
        void send(String text);
        void stop();
        void newConversation();
        void openConversation(String id);
        /** Conversation en cours ouverte sur le site (cartes que seul le site affiche). */
        void openOnSite();
        void openPage(String path);
        void openLink(Uri uri);
        void help();
        void connect();
        void signIn();
        void retry();
        /** Menu ouvert : la liste des conversations est relue sur le serveur. */
        void menuOpened();
    }

    /** Idées de l'accueil (SUGGESTIONS du site), avec une icône au lieu de l'emoji. */
    private static final String[][] SUGGESTIONS = {
            {"Passer le code", "Le bureau le plus proche et ses créneaux", "Où passer le code près de chez moi ?"},
            {"Parler shimaoré", "Bonjour, merci, compter…", "Apprends-moi à dire bonjour en shimaoré"},
            {"Trouver un emploi", "Les offres du moment à Mayotte", "Quelles offres d'emploi à Mayotte ?"},
            {"L'actu de Mayotte", "Ce qui se passe aujourd'hui", "Quoi de neuf à Mayotte aujourd'hui ?"},
    };
    private static final int[] SUGGESTION_ICONS = {R.drawable.ic_idee_voiture, R.drawable.ic_idee_parole, R.drawable.ic_idee_emploi, R.drawable.ic_idee_actu};

    private final SiteTheme theme;
    private final Actions actions;
    private final LinearLayout column;
    private final View plus;
    private final ScrollView scroll;
    private final LinearLayout list;
    private final TextView notice;
    private final TextView offline;
    private final LinearLayout banner;
    private final TextView bannerTitle;
    private final TextView bannerText;
    private final TextView bannerButton;
    private final EditText input;
    private final FrameLayout sendBox;
    private final Glyph sendGlyph;
    private final TextView hint;
    private final LinearLayout bar;
    private final FrameLayout menu;
    private final LinearLayout menuPanel;
    private final Paint ringPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint hintPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF ringBounds = new RectF();
    private float pull;
    private boolean streaming;
    private boolean canSend = true;
    /** Dernière réponse à l'écran : remplie au fil du flux sans tout redessiner. */
    private LinearLayout lastAnswer;
    private String lastAnswerText;
    private String shownKey;

    HomeScreen(Context context, Actions actions) {
        super(context);
        this.actions = actions;
        theme = SiteTheme.of(context);
        setBackgroundColor(theme.bg);
        setClickable(true);
        ringPaint.setStyle(Paint.Style.STROKE);
        ringPaint.setStrokeCap(Paint.Cap.ROUND);
        ringPaint.setStrokeWidth(dp(2));
        ringPaint.setColor(theme.fgMuted);
        hintPaint.setColor(theme.fgMuted);
        hintPaint.setTextAlign(Paint.Align.CENTER);
        hintPaint.setTextSize(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, 14, getResources().getDisplayMetrics()));

        column = new LinearLayout(context);
        column.setOrientation(LinearLayout.VERTICAL);
        addView(column, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // En-tête du site : menu, logo, « + » à droite dès qu'il y a des messages.
        LinearLayout header = new LinearLayout(context);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(8), dp(6), dp(8), dp(6));
        header.addView(iconButton(Glyph.MENU, "Ouvrir le menu", v -> openMenu()), new LinearLayout.LayoutParams(dp(44), dp(44)));
        LinearLayout.LayoutParams logoParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        logoParams.leftMargin = dp(4);
        header.addView(brand(22), logoParams);
        header.addView(new View(context), new LinearLayout.LayoutParams(0, 1, 1f));
        plus = iconButton(Glyph.PLUS, "Nouvelle conversation", v -> actions.newConversation());
        plus.setVisibility(GONE);
        header.addView(plus, new LinearLayout.LayoutParams(dp(44), dp(44)));
        column.addView(header, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(56)));
        column.addView(rule(), new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 1));

        scroll = new ScrollView(context);
        scroll.setFillViewport(true);
        scroll.setOverScrollMode(OVER_SCROLL_NEVER);
        scroll.setVerticalScrollBarEnabled(false);
        list = new LinearLayout(context);
        list.setOrientation(LinearLayout.VERTICAL);
        list.setPadding(dp(16), dp(12), dp(16), dp(12));
        scroll.addView(list, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        column.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        // Bas de l'écran : message éventuel, bandeau (fin d'essai…), barre d'écriture, petite ligne.
        LinearLayout bottom = new LinearLayout(context);
        bottom.setOrientation(LinearLayout.VERTICAL);
        bottom.setPadding(dp(12), 0, dp(12), 0);
        offline = text("Tu es hors ligne. Tes messages pourront être envoyés au retour de la connexion.", 14, theme.fg);
        offline.setBackground(round(theme.warningSoft, 10));
        offline.setPadding(dp(12), dp(8), dp(12), dp(8));
        offline.setVisibility(GONE);
        bottom.addView(offline, spaced(8));
        notice = text("", 14, theme.danger);
        notice.setBackground(round(theme.dangerSoft, 10));
        notice.setPadding(dp(12), dp(8), dp(12), dp(8));
        notice.setVisibility(GONE);
        bottom.addView(notice, spaced(8));

        banner = new LinearLayout(context);
        banner.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable bannerShape = round(theme.bgSubtle, 16);
        bannerShape.setStroke(dp(1), theme.border);
        banner.setBackground(bannerShape);
        banner.setPadding(dp(16), dp(14), dp(16), dp(14));
        bannerTitle = text("", 15, theme.fg);
        bannerTitle.setTypeface(Typeface.DEFAULT_BOLD);
        banner.addView(bannerTitle);
        bannerText = text("", 13, theme.fgMuted);
        bannerText.setPadding(0, dp(2), 0, 0);
        banner.addView(bannerText);
        bannerButton = pinkButton("Créer mon compte");
        LinearLayout.LayoutParams bannerButtonParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        bannerButtonParams.topMargin = dp(10);
        banner.addView(bannerButton, bannerButtonParams);
        banner.setVisibility(GONE);
        bottom.addView(banner, spaced(8));

        bar = new LinearLayout(context);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.BOTTOM);
        bar.setPadding(0, dp(8), 0, dp(4));
        LinearLayout pill = new LinearLayout(context);
        pill.setGravity(Gravity.CENTER_VERTICAL);
        GradientDrawable pillShape = round(theme.bg, 26);
        pillShape.setStroke(dp(1), theme.border);
        pill.setBackground(pillShape);
        pill.setMinimumHeight(dp(50));
        pill.setPadding(dp(16), dp(6), dp(12), dp(6));
        input = new EditText(context);
        input.setHint("Demande-moi ce que tu veux…");
        input.setHintTextColor(theme.fgMuted);
        input.setTextColor(theme.fg);
        input.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        input.setMaxLines(5);
        input.setFilters(new InputFilter[]{new InputFilter.LengthFilter(MAX_TEXT)});
        input.setImeOptions(EditorInfo.IME_ACTION_SEND);
        input.setBackground(null);
        input.setPadding(0, dp(6), 0, dp(6));
        input.setOnEditorActionListener((v, id, event) -> {
            if (id != EditorInfo.IME_ACTION_SEND) return false;
            submit();
            return true;
        });
        pill.addView(input, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        bar.addView(pill, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        // Bouton rose plein du site : flèche quand on écrit, carré d'arrêt pendant la réponse.
        sendGlyph = new Glyph(context, Glyph.ARROW, Color.WHITE);
        sendBox = new FrameLayout(context);
        sendBox.setBackground(round(theme.accent, 27));
        sendBox.setContentDescription("Envoyer");
        sendBox.setClickable(true);
        sendBox.setOnClickListener(v -> {
            if (streaming) actions.stop();
            else submit();
        });
        sendBox.addView(sendGlyph, new LayoutParams(dp(22), dp(22), Gravity.CENTER));
        LinearLayout.LayoutParams sendParams = new LinearLayout.LayoutParams(dp(50), dp(50));
        sendParams.leftMargin = dp(8);
        bar.addView(sendBox, sendParams);
        input.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) { }
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) { }
            @Override public void afterTextChanged(Editable s) { updateSendButton(); }
        });
        bottom.addView(bar);

        hint = text("Tamilya peut se tromper. Vérifie les informations importantes.", 11, theme.fgMuted);
        hint.setGravity(Gravity.CENTER);
        hint.setPadding(0, 0, 0, dp(8));
        bottom.addView(hint);
        column.addView(bottom);

        // Menu (barre latérale du site), par-dessus tout, fermé au départ.
        menu = new FrameLayout(context);
        menu.setBackgroundColor(0x66000000);
        menu.setClickable(true);
        menu.setOnClickListener(v -> closeMenu());
        menu.setVisibility(GONE);
        menuPanel = new LinearLayout(context);
        menuPanel.setOrientation(LinearLayout.VERTICAL);
        menuPanel.setBackgroundColor(theme.bgSubtle);
        menuPanel.setClickable(true);
        int panelWidth = Math.min(dp(320), Math.round(getResources().getDisplayMetrics().widthPixels * 0.86f));
        menu.addView(menuPanel, new LayoutParams(panelWidth, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.START));
        addView(menu, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        updateSendButton();
    }

    private void submit() {
        String text = input.getText().toString().trim();
        if (text.isEmpty() || streaming || !canSend) return;
        input.setText("");
        actions.send(text);
    }

    private void updateSendButton() {
        boolean filled = !input.getText().toString().trim().isEmpty();
        sendBox.setAlpha(streaming || (filled && canSend) ? 1f : 0.45f);
        sendGlyph.setKind(streaming ? Glyph.STOP : Glyph.ARROW);
        sendBox.setContentDescription(streaming ? "Arrêter" : "Envoyer");
    }

    /** Barre d'écriture coupée (fin d'essai, conversation pleine) ou rendue. */
    void setCanSend(boolean value, String reason) {
        canSend = value;
        input.setEnabled(value);
        input.setHint(value ? "Demande-moi ce que tu veux…" : reason);
        updateSendButton();
    }

    void focusInput() {
        input.requestFocus();
        InputMethodManager keyboard = getContext().getSystemService(InputMethodManager.class);
        if (keyboard != null) input.post(() -> keyboard.showSoftInput(input, 0));
    }

    void hideKeyboard() {
        InputMethodManager keyboard = getContext().getSystemService(InputMethodManager.class);
        if (keyboard != null) keyboard.hideSoftInputFromWindow(getWindowToken(), 0);
    }

    void setNotice(String message) {
        notice.setText(message == null ? "" : message);
        notice.setVisibility(message == null || message.isEmpty() ? GONE : VISIBLE);
    }

    /** Bandeau du bas : fin de l'essai sans compte, ou conversation pleine. */
    void setBanner(String title, String text, String button, OnClickListener click) {
        if (title == null) {
            banner.setVisibility(GONE);
            return;
        }
        bannerTitle.setText(title);
        bannerText.setText(text);
        bannerButton.setVisibility(button == null ? GONE : VISIBLE);
        bannerButton.setText(button == null ? "" : button);
        bannerButton.setOnClickListener(click);
        banner.setVisibility(VISIBLE);
    }

    /** Petite ligne sous la barre ; cliquable pour un visiteur (créer son compte). */
    void setHint(String value, OnClickListener click) {
        hint.setText(value);
        hint.setClickable(click != null);
        hint.setOnClickListener(click);
        hint.setTextColor(click != null ? theme.accent : theme.fgMuted);
    }

    void setOffline(boolean value) {
        offline.setVisibility(value ? VISIBLE : GONE);
    }

    /**
     * Redessine la liste si sa structure a changé (nombre de messages, statuts). Pendant la
     * réponse, seul le texte de la dernière réponse est mis à jour (updateLastAnswer).
     */
    void render(List<ChatMessage> messages, boolean streaming, String name) {
        this.streaming = streaming;
        updateSendButton();
        StringBuilder key = new StringBuilder(name == null ? "" : name).append('|');
        for (ChatMessage m : messages) key.append(m.role.charAt(0)).append(m.status.charAt(0)).append(m.notice == null ? 0 : m.notice.hashCode()).append(';');
        String wanted = key.toString();
        if (wanted.equals(shownKey)) {
            if (streaming) updateLastAnswer(messages);
            return;
        }
        shownKey = wanted;
        boolean wasAtBottom = atBottom();
        list.removeAllViews();
        lastAnswer = null;
        lastAnswerText = null;
        plus.setVisibility(messages.isEmpty() ? GONE : VISIBLE);
        if (messages.isEmpty()) {
            fillHome(name);
            return;
        }
        list.setGravity(Gravity.TOP);
        for (int i = 0; i < messages.size(); i++) {
            ChatMessage message = messages.get(i);
            boolean last = i == messages.size() - 1;
            list.addView(message.mine() ? bubble(message) : answer(message, last));
        }
        if (wasAtBottom || streaming) scrollDown();
    }

    /** Texte de la dernière réponse pendant le flux, sans tout reconstruire. */
    void updateLastAnswer(List<ChatMessage> messages) {
        if (lastAnswer == null || messages.isEmpty()) return;
        ChatMessage last = messages.get(messages.size() - 1);
        if (last.mine()) return;
        String text = last.text();
        if (text.equals(lastAnswerText)) return;
        boolean wasAtBottom = atBottom();
        lastAnswerText = text;
        bindAnswer(lastAnswer, text, true);
        if (wasAtBottom) scrollDown();
    }

    private void scrollDown() {
        scroll.post(() -> scroll.fullScroll(View.FOCUS_DOWN));
    }

    /** Accueil du site : Tamilya au centre, « Bonjour », la phrase, puis quatre idées. Tout tient dans l'écran. */
    private void fillHome(String name) {
        list.setGravity(Gravity.CENTER);
        LinearLayout middle = new LinearLayout(getContext());
        middle.setOrientation(LinearLayout.VERTICAL);
        middle.setGravity(Gravity.CENTER);
        Orb orb = new Orb(getContext(), theme);
        orb.setOnClickListener(v -> focusInput());
        orb.setContentDescription("Écrire à Tamilya");
        LinearLayout.LayoutParams orbParams = new LinearLayout.LayoutParams(dp(112), dp(112));
        orbParams.gravity = Gravity.CENTER_HORIZONTAL;
        middle.addView(orb, orbParams);
        TextView hello = text(greeting() + (name == null || name.isEmpty() ? "" : ", " + name), 26, theme.fg);
        hello.setTypeface(Typeface.create("sans-serif-medium", Typeface.BOLD));
        hello.setGravity(Gravity.CENTER);
        hello.setPadding(0, dp(20), 0, 0);
        middle.addView(hello, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        TextView intro = text("Je suis Tamilya. Pose-moi ta question, en français ou en shimaoré.", 15, theme.fgMuted);
        intro.setGravity(Gravity.CENTER);
        intro.setPadding(dp(24), dp(8), dp(24), 0);
        middle.addView(intro, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        list.addView(middle, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        // Idées, deux par ligne, juste au-dessus de la barre d'écriture.
        LinearLayout grid = new LinearLayout(getContext());
        grid.setOrientation(LinearLayout.VERTICAL);
        for (int row = 0; row < 2; row++) {
            LinearLayout line = new LinearLayout(getContext());
            line.setOrientation(LinearLayout.HORIZONTAL);
            for (int col = 0; col < 2; col++) {
                int index = row * 2 + col;
                LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f);
                if (col == 1) params.leftMargin = dp(10);
                line.addView(suggestion(index), params);
            }
            LinearLayout.LayoutParams lineParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            if (row == 1) lineParams.topMargin = dp(10);
            grid.addView(line, lineParams);
        }
        list.addView(grid, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
    }

    private View suggestion(int index) {
        String[] s = SUGGESTIONS[index];
        LinearLayout card = new LinearLayout(getContext());
        card.setOrientation(LinearLayout.HORIZONTAL);
        card.setGravity(Gravity.CENTER_VERTICAL);
        GradientDrawable shape = round(theme.bg, 16);
        shape.setStroke(dp(1), theme.border);
        card.setBackground(shape);
        card.setPadding(dp(10), dp(10), dp(10), dp(10));
        card.setClickable(true);
        card.setContentDescription(s[0] + ". " + s[1]);
        card.setOnClickListener(v -> {
            if (!streaming && canSend) actions.send(s[2]);
        });
        ImageView icon = new ImageView(getContext());
        icon.setImageResource(SUGGESTION_ICONS[index]);
        icon.setColorFilter(theme.fg);
        icon.setBackground(round(SiteTheme.mix(theme.accent, theme.dark ? 0.22f : 0.11f, theme.bg), 12));
        icon.setPadding(dp(8), dp(8), dp(8), dp(8));
        card.addView(icon, new LinearLayout.LayoutParams(dp(38), dp(38)));
        LinearLayout words = new LinearLayout(getContext());
        words.setOrientation(LinearLayout.VERTICAL);
        TextView title = text(s[0], 14, theme.fg);
        title.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        title.setMaxLines(1);
        title.setEllipsize(android.text.TextUtils.TruncateAt.END);
        words.addView(title);
        TextView sub = text(s[1], 12, theme.fgMuted);
        sub.setMaxLines(1);
        sub.setEllipsize(android.text.TextUtils.TruncateAt.END);
        words.addView(sub);
        LinearLayout.LayoutParams wordsParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        wordsParams.leftMargin = dp(10);
        card.addView(words, wordsParams);
        return card;
    }

    /** « Bonjour » ou « Bonsoir » à l'heure de Mayotte, comme greeting() du site. */
    static String greeting() {
        java.util.Calendar now = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("Indian/Mayotte"));
        int hour = now.get(java.util.Calendar.HOUR_OF_DAY);
        return hour >= 18 || hour < 4 ? "Bonsoir" : "Bonjour";
    }

    /** Bulle de la personne : bg-muted, coins arrondis sauf en bas à droite, 88 % de large au plus. */
    private View bubble(ChatMessage message) {
        LinearLayout box = new LinearLayout(getContext());
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.END);
        box.setPadding(0, dp(10), 0, dp(10));
        TextView body = text(message.text(), 16, theme.fg);
        body.setLineSpacing(0, 1.3f);
        body.setMaxWidth(Math.round(getResources().getDisplayMetrics().widthPixels * 0.88f) - dp(32));
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(theme.bgMuted);
        float big = dp(24), small = dp(8);
        shape.setCornerRadii(new float[]{big, big, big, big, small, small, big, big});
        body.setBackground(shape);
        body.setPadding(dp(16), dp(10), dp(16), dp(10));
        body.setTextIsSelectable(true);
        LinearLayout.LayoutParams bodyParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        bodyParams.gravity = Gravity.END;
        box.addView(body, bodyParams);
        return box;
    }

    /** Réponse de Tamilya : le globe à gauche, le texte à droite, sans bulle (comme le site). */
    private View answer(ChatMessage message, boolean last) {
        LinearLayout row = new LinearLayout(getContext());
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setPadding(0, dp(10), 0, dp(10));
        View avatar = new View(getContext());
        avatar.setBackground(Orb.ball(theme, dp(26)));
        avatar.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        row.addView(avatar, new LinearLayout.LayoutParams(dp(32), dp(32)));

        LinearLayout content = new LinearLayout(getContext());
        content.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        params.leftMargin = dp(10);
        params.topMargin = dp(4);
        row.addView(content, params);

        boolean inProgress = ChatMessage.STREAMING.equals(message.status);
        LinearLayout body = new LinearLayout(getContext());
        body.setOrientation(LinearLayout.VERTICAL);
        content.addView(body, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        bindAnswer(body, message.text(), inProgress);
        if (last) {
            lastAnswer = body;
            lastAnswerText = message.text();
        }
        if (message.notice != null && !message.notice.isEmpty()) {
            boolean error = ChatMessage.ERROR.equals(message.status);
            TextView note = text(message.notice, 13, error ? theme.danger : theme.fgMuted);
            if (error) {
                note.setBackground(round(theme.dangerSoft, 10));
                note.setPadding(dp(12), dp(8), dp(12), dp(8));
            }
            content.addView(note, spaced(6));
        }
        if (last && !inProgress && (ChatMessage.ERROR.equals(message.status) || ChatMessage.INTERRUPTED.equals(message.status))) {
            TextView retry = outlinedButton("Réessayer");
            retry.setOnClickListener(v -> actions.retry());
            content.addView(retry, spaced(8));
        }
        return row;
    }

    /** Remplit le texte d'une réponse : morceaux de texte mis en forme, cartes en bouton. */
    private void bindAnswer(LinearLayout body, String markdown, boolean inProgress) {
        body.removeAllViews();
        List<ChatMarkdown.Part> parts = ChatMarkdown.split(markdown);
        if (parts.isEmpty()) {
            if (inProgress) body.addView(thinking());
            return;
        }
        for (ChatMarkdown.Part part : parts) {
            if (part.isCard()) {
                TextView card = outlinedButton(ChatMarkdown.cardLabel(part.card) + "  ›");
                card.setOnClickListener(v -> actions.openOnSite());
                body.addView(card, spaced(6));
                continue;
            }
            TextView view = text("", 16, theme.fg);
            view.setLineSpacing(0, 1.3f);
            view.setText(MarkdownSpans.render(part.text, theme, dp(1), actions::openLink));
            view.setMovementMethod(LinkMovementMethod.getInstance());
            view.setTextIsSelectable(!inProgress);
            body.addView(view, spaced(body.getChildCount() == 0 ? 0 : 6));
        }
    }

    /** Trois points qui sautillent jusqu'au premier mot. */
    private View thinking() {
        LinearLayout dots = new LinearLayout(getContext());
        dots.setOrientation(LinearLayout.HORIZONTAL);
        dots.setGravity(Gravity.CENTER_VERTICAL);
        dots.setMinimumHeight(dp(24));
        dots.setContentDescription("Tamilya rédige une réponse");
        List<ObjectAnimator> moves = new ArrayList<>();
        for (int i = 0; i < 3; i++) {
            View dot = new View(getContext());
            dot.setBackground(round(theme.fgMuted, 3));
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(dp(6), dp(6));
            if (i > 0) params.leftMargin = dp(4);
            dots.addView(dot, params);
            ObjectAnimator move = ObjectAnimator.ofFloat(dot, View.TRANSLATION_Y, 0f, -dp(4), 0f);
            move.setDuration(600);
            move.setStartDelay(i * 120L);
            move.setRepeatCount(ValueAnimator.INFINITE);
            moves.add(move);
        }
        dots.addOnAttachStateChangeListener(new OnAttachStateChangeListener() {
            @Override public void onViewAttachedToWindow(View v) { for (ObjectAnimator m : moves) m.start(); }
            @Override public void onViewDetachedFromWindow(View v) { for (ObjectAnimator m : moves) m.cancel(); }
        });
        return dots;
    }

    // ----- Menu -----

    boolean menuOpen() {
        return menu.getVisibility() == VISIBLE;
    }

    private void openMenu() {
        hideKeyboard();
        menu.setAlpha(0f);
        menu.setVisibility(VISIBLE);
        menu.animate().alpha(1f).setDuration(160).start();
        menuPanel.setTranslationX(-dp(40));
        menuPanel.animate().translationX(0f).setDuration(200).start();
        actions.menuOpened();
    }

    void closeMenu() {
        if (!menuOpen()) return;
        menu.animate().alpha(0f).setDuration(140).withEndAction(() -> menu.setVisibility(GONE)).start();
    }

    /** Contenu du menu : nouvelle conversation, historique du compte, pages du site, compte. */
    void showMenu(JSONArray history, String currentId, String name, String email, boolean signedIn, boolean loading) {
        menuPanel.removeAllViews();
        LinearLayout top = new LinearLayout(getContext());
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(dp(16), dp(10), dp(8), dp(4));
        top.addView(brand(20), new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        top.addView(new View(getContext()), new LinearLayout.LayoutParams(0, 1, 1f));
        top.addView(iconButton(Glyph.CLOSE, "Fermer le menu", v -> closeMenu()), new LinearLayout.LayoutParams(dp(44), dp(44)));
        menuPanel.addView(top, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(56)));

        TextView fresh = menuRow(Glyph.PLUS, "Nouvelle conversation");
        fresh.setOnClickListener(v -> {
            closeMenu();
            actions.newConversation();
        });
        menuPanel.addView(fresh);

        ScrollView middle = new ScrollView(getContext());
        middle.setVerticalScrollBarEnabled(false);
        LinearLayout items = new LinearLayout(getContext());
        items.setOrientation(LinearLayout.VERTICAL);
        items.setPadding(0, dp(8), 0, dp(8));
        TextView title = text("HISTORIQUE", 12, theme.fgMuted);
        title.setLetterSpacing(0.06f);
        title.setPadding(dp(20), dp(8), dp(20), dp(6));
        items.addView(title);
        if (!signedIn) {
            TextView empty = text("Connecte-toi pour retrouver tes conversations sur tous tes appareils.", 14, theme.fgMuted);
            empty.setPadding(dp(20), dp(4), dp(20), dp(10));
            items.addView(empty);
        } else if (history.length() == 0) {
            TextView empty = text(loading ? "Chargement…" : "Tes conversations apparaîtront ici.", 14, theme.fgMuted);
            empty.setPadding(dp(20), dp(4), dp(20), dp(10));
            items.addView(empty);
        }
        for (int i = 0; i < history.length(); i++) {
            JSONObject conversation = history.optJSONObject(i);
            if (conversation == null) continue;
            String id = conversation.optString("id");
            String label = conversation.optString("title");
            if (label.isEmpty()) label = "Conversation";
            TextView row = text(label, 15, id.equals(currentId) ? theme.fg : theme.fgMuted);
            row.setMaxLines(1);
            row.setEllipsize(android.text.TextUtils.TruncateAt.END);
            row.setPadding(dp(20), dp(11), dp(20), dp(11));
            if (id.equals(currentId)) {
                row.setTypeface(row.getTypeface(), Typeface.BOLD);
                row.setBackground(round(theme.bgMuted, 10));
            } else {
                row.setBackground(ripple());
            }
            row.setClickable(true);
            row.setOnClickListener(v -> {
                closeMenu();
                actions.openConversation(id);
            });
            LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            rowParams.leftMargin = dp(8);
            rowParams.rightMargin = dp(8);
            items.addView(row, rowParams);
        }
        middle.addView(items);
        menuPanel.addView(middle, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        menuPanel.addView(rule(), new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 1));

        TextView settings = menuRow(Glyph.GEAR, "Paramètres");
        settings.setOnClickListener(v -> {
            closeMenu();
            actions.openPage("/parametres");
        });
        menuPanel.addView(settings);
        TextView help = menuRow(Glyph.HELP, "Obtenir de l'aide");
        help.setOnClickListener(v -> {
            closeMenu();
            actions.help();
        });
        menuPanel.addView(help);
        TextView connect = menuRow(Glyph.WAVES, "Tamilya Connect");
        connect.setOnClickListener(v -> {
            closeMenu();
            actions.connect();
        });
        menuPanel.addView(connect);
        TextView site = menuRow(Glyph.GLOBE, "Le site tamilya.yt");
        site.setOnClickListener(v -> {
            closeMenu();
            actions.openPage("/utilisation");
        });
        menuPanel.addView(site);
        menuPanel.addView(rule(), new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 1));

        // Bas du menu : le compte, ou le bouton rose pour se connecter.
        LinearLayout account = new LinearLayout(getContext());
        account.setOrientation(LinearLayout.VERTICAL);
        account.setPadding(dp(20), dp(12), dp(20), dp(16));
        if (signedIn) {
            TextView who = text(name == null || name.isEmpty() ? (email == null || email.isEmpty() ? "Mon compte" : email) : name, 15, theme.fg);
            who.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
            who.setMaxLines(1);
            who.setEllipsize(android.text.TextUtils.TruncateAt.END);
            account.addView(who);
            if (name != null && !name.isEmpty() && email != null && !email.isEmpty()) {
                TextView mail = text(email, 12, theme.fgMuted);
                mail.setMaxLines(1);
                mail.setEllipsize(android.text.TextUtils.TruncateAt.END);
                account.addView(mail);
            }
            account.setClickable(true);
            account.setBackground(ripple());
            account.setOnClickListener(v -> {
                closeMenu();
                actions.openPage("/parametres");
            });
        } else {
            TextView login = pinkButton("Se connecter");
            login.setOnClickListener(v -> {
                closeMenu();
                actions.signIn();
            });
            account.addView(login, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        }
        menuPanel.addView(account);
    }

    private TextView menuRow(int glyph, String label) {
        TextView row = text(label, 15, theme.fg);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(20), dp(12), dp(20), dp(12));
        row.setCompoundDrawablePadding(dp(14));
        Glyph icon = new Glyph(getContext(), glyph, theme.fgMuted);
        android.graphics.drawable.Drawable drawable = icon.asDrawable(dp(20));
        row.setCompoundDrawablesRelative(drawable, null, null, null);
        row.setClickable(true);
        row.setBackground(ripple());
        return row;
    }

    // ----- Geste vers Tamilya Connect -----

    /** Le doigt monte : les messages suivent, le rond se remplit au-dessus de la barre. */
    void setPull(float progress) {
        pull = progress;
        scroll.setTranslationY(-dp(112) * progress);
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
        int[] barAt = new int[2];
        int[] meAt = new int[2];
        bar.getLocationInWindow(barAt);
        getLocationInWindow(meAt);
        float textY = barAt[1] - meAt[1] - dp(8);
        float radius = dp(16);
        float cy = textY - dp(30) - radius;
        ringBounds.set(cx - radius, cy - radius, cx + radius, cy + radius);
        canvas.drawArc(ringBounds, -90, 360 * pull, false, ringPaint);
        canvas.drawText("Balaye vers le haut pour activer Tamilya Connect", cx, textY, hintPaint);
    }

    boolean atBottom() {
        return !scroll.canScrollVertically(1);
    }

    // ----- Petits éléments -----

    /** Logo du site (BrandLogo.tsx) en texte : « BTM » puis le badge rose « AI ». */
    private View brand(int heightDp) {
        LinearLayout row = new LinearLayout(getContext());
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setContentDescription("BTM AI — Tamilya");
        TextView btm = text("BTM", heightDp - 2, theme.fg);
        btm.setTypeface(Typeface.create("sans-serif-black", Typeface.BOLD));
        btm.setLetterSpacing(-0.02f);
        btm.setIncludeFontPadding(false);
        row.addView(btm);
        TextView badge = text("AI", Math.round(heightDp * 0.5f), theme.accentFg);
        badge.setTypeface(Typeface.DEFAULT_BOLD);
        badge.setLetterSpacing(0.05f);
        badge.setIncludeFontPadding(false);
        badge.setPadding(dp(5), dp(2), dp(5), dp(2));
        badge.setBackground(round(theme.accent, 4));
        LinearLayout.LayoutParams badgeParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        badgeParams.leftMargin = dp(6);
        row.addView(badge, badgeParams);
        return row;
    }

    private View rule() {
        View rule = new View(getContext());
        rule.setBackgroundColor(theme.border);
        return rule;
    }

    private View iconButton(int glyph, String description, OnClickListener click) {
        FrameLayout button = new FrameLayout(getContext());
        button.setContentDescription(description);
        button.setClickable(true);
        button.setOnClickListener(click);
        button.setBackground(ripple());
        button.addView(new Glyph(getContext(), glyph, theme.fgMuted), new LayoutParams(dp(22), dp(22), Gravity.CENTER));
        return button;
    }

    private android.graphics.drawable.Drawable ripple() {
        TypedValue value = new TypedValue();
        getContext().getTheme().resolveAttribute(android.R.attr.selectableItemBackground, value, true);
        return value.resourceId != 0 ? getContext().getDrawable(value.resourceId) : null;
    }

    /** Bouton rose plein du site (btn-rose) : rond, texte blanc en gras. */
    private TextView pinkButton(String label) {
        TextView button = text(label, 15, Color.WHITE);
        button.setTypeface(Typeface.DEFAULT_BOLD);
        button.setGravity(Gravity.CENTER);
        button.setPadding(dp(20), dp(11), dp(20), dp(11));
        button.setBackground(round(theme.accent, 24));
        button.setClickable(true);
        return button;
    }

    private TextView outlinedButton(String label) {
        TextView button = text(label, 14, theme.fg);
        button.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        button.setGravity(Gravity.CENTER_VERTICAL);
        button.setPadding(dp(14), dp(9), dp(14), dp(9));
        GradientDrawable shape = round(theme.bg, 12);
        shape.setStroke(dp(1), theme.border);
        button.setBackground(shape);
        button.setClickable(true);
        return button;
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

    private LinearLayout.LayoutParams spaced(int topDp) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.topMargin = dp(topDp);
        return params;
    }

    private int dp(int value) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics()));
    }

    /** Globe de Tamilya (awa-blob du site) : boule rose dégradée qui respire doucement. */
    static final class Orb extends View {
        Orb(Context context, SiteTheme theme) {
            super(context);
            setBackground(ball(theme, Math.round(56 * context.getResources().getDisplayMetrics().density)));
            setClickable(true);
            ObjectAnimator breathe = ObjectAnimator.ofPropertyValuesHolder(this,
                    android.animation.PropertyValuesHolder.ofFloat(View.SCALE_X, 1f, 1.04f, 1f),
                    android.animation.PropertyValuesHolder.ofFloat(View.SCALE_Y, 1f, 1.04f, 1f));
            breathe.setDuration(3600);
            breathe.setRepeatCount(ValueAnimator.INFINITE);
            addOnAttachStateChangeListener(new OnAttachStateChangeListener() {
                @Override public void onViewAttachedToWindow(View v) { breathe.start(); }
                @Override public void onViewDetachedFromWindow(View v) { breathe.cancel(); }
            });
        }

        static GradientDrawable ball(SiteTheme theme, int radiusPx) {
            GradientDrawable ball = new GradientDrawable();
            ball.setShape(GradientDrawable.OVAL);
            ball.setGradientType(GradientDrawable.RADIAL_GRADIENT);
            ball.setGradientCenter(0.32f, 0.28f);
            ball.setGradientRadius(radiusPx);
            ball.setColors(new int[]{SiteTheme.mix(theme.accent, 0.55f, 0xFFFFE3EF), theme.accent,
                    SiteTheme.mix(theme.accent, 0.70f, 0xFF2A0614)});
            return ball;
        }
    }

    /** Icônes du site (trait de 2, bouts ronds, grille de 24), dessinées à la main. */
    static final class Glyph extends View {
        static final int MENU = 0, PLUS = 1, ARROW = 2, STOP = 3, CLOSE = 4, GEAR = 5, HELP = 6, WAVES = 7, GLOBE = 8;
        private int kind;
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

        void setKind(int value) {
            if (kind == value) return;
            kind = value;
            invalidate();
        }

        /** La même icône, pour un drawable (icônes des lignes du menu). */
        android.graphics.drawable.Drawable asDrawable(int sizePx) {
            android.graphics.Bitmap bitmap = android.graphics.Bitmap.createBitmap(sizePx, sizePx, android.graphics.Bitmap.Config.ARGB_8888);
            draw(new Canvas(bitmap), sizePx, sizePx);
            android.graphics.drawable.BitmapDrawable drawable = new android.graphics.drawable.BitmapDrawable(getResources(), bitmap);
            drawable.setBounds(0, 0, sizePx, sizePx);
            return drawable;
        }

        @Override
        protected void onDraw(Canvas canvas) {
            draw(canvas, getWidth(), getHeight());
        }

        private void draw(Canvas canvas, int width, int height) {
            float u = Math.min(width, height) / 24f;
            paint.setStrokeWidth(2 * u);
            paint.setStyle(Paint.Style.STROKE);
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
                case STOP:
                    paint.setStyle(Paint.Style.FILL);
                    canvas.drawRoundRect(7 * u, 7 * u, 17 * u, 17 * u, 2 * u, 2 * u, paint);
                    break;
                case CLOSE:
                    canvas.drawLine(6 * u, 6 * u, 18 * u, 18 * u, paint);
                    canvas.drawLine(18 * u, 6 * u, 6 * u, 18 * u, paint);
                    break;
                case GEAR:
                    canvas.drawCircle(12 * u, 12 * u, 3 * u, paint);
                    for (int i = 0; i < 8; i++) {
                        double a = Math.PI / 4 * i;
                        canvas.drawLine((float) (12 * u + Math.cos(a) * 6.5 * u), (float) (12 * u + Math.sin(a) * 6.5 * u),
                                (float) (12 * u + Math.cos(a) * 9.5 * u), (float) (12 * u + Math.sin(a) * 9.5 * u), paint);
                    }
                    canvas.drawCircle(12 * u, 12 * u, 6.5f * u, paint);
                    break;
                case HELP:
                    canvas.drawCircle(12 * u, 12 * u, 9 * u, paint);
                    android.graphics.Path q = new android.graphics.Path();
                    q.moveTo(9.5f * u, 9.5f * u);
                    q.cubicTo(9.5f * u, 7.5f * u, 14.5f * u, 7.5f * u, 14.5f * u, 9.5f * u);
                    q.cubicTo(14.5f * u, 11.5f * u, 12 * u, 11 * u, 12 * u, 13.5f * u);
                    canvas.drawPath(q, paint);
                    canvas.drawPoint(12 * u, 17 * u, paint);
                    break;
                case WAVES:
                    for (int i = 0; i < 3; i++) {
                        float r = (4 + 4 * i) * u;
                        canvas.drawArc(12 * u - r, 14 * u - r, 12 * u + r, 14 * u + r, 215, 110, false, paint);
                    }
                    canvas.drawPoint(12 * u, 15 * u, paint);
                    break;
                case GLOBE:
                    canvas.drawCircle(12 * u, 12 * u, 9 * u, paint);
                    canvas.drawLine(3 * u, 12 * u, 21 * u, 12 * u, paint);
                    canvas.drawOval(8 * u, 3 * u, 16 * u, 21 * u, paint);
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
