package yt.tamilya.app;

import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.InputFilter;
import android.text.InputType;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.text.method.LinkMovementMethod;
import android.text.style.ForegroundColorSpan;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.PathInterpolator;
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

import yt.tamilya.app.connect.GreyGlobe;

/**
 * Accueil et conversation natifs : le même écran que ChatView.tsx du site, aux mêmes mesures
 * (les « px » du CSS sont des dp ici). En-tête avec le menu, le logo et la cloche, Tamilya au
 * centre avec « Bonjour » et les idées, puis les bulles et la barre d'écriture avec le bouton
 * rose plein. Les cartes du site (ticket de barge, commande…) deviennent un bouton qui ouvre
 * la conversation sur le site.
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
        /** Micro de la barre d'écriture, ou globe quand la voix est disponible. */
        void voice();
        /** « + » à gauche de la barre : photo ou document. */
        void attach();
        void notifications();
        /** Pastille des administrateurs (« Mode démo »…). */
        void admin();
    }

    /** Idées de l'accueil (SUGGESTIONS du site) : titre, précision, message envoyé. */
    private static final String[][] SUGGESTIONS = {
            {"Passer le code", "Le bureau le plus proche et ses créneaux", "Où passer le code près de chez moi ?"},
            {"Parler shimaoré", "Bonjour, merci, compter…", "Apprends-moi à dire bonjour en shimaoré"},
            {"Trouver un emploi", "Les offres du moment à Mayotte", "Quelles offres d'emploi à Mayotte ?"},
            {"L'actu de Mayotte", "Ce qui se passe aujourd'hui", "Quoi de neuf à Mayotte aujourd'hui ?"},
    };
    private static final int[] SUGGESTION_ICONS = {R.drawable.ic_idee_voiture, R.drawable.ic_idee_parole, R.drawable.ic_idee_emploi, R.drawable.ic_idee_actu};
    /** Commande de repas : proposée aux comptes qui y ont accès (FOOD_SUGGESTION du site). */
    private static final String[] FOOD_SUGGESTION = {"Commander à manger", "Tacos, pizza, plats mahorais…", "Je veux un tacos près de chez moi"};
    private static final String PLACEHOLDER = "Demande-moi ce que tu veux…";
    /** Exemples qui défilent dans le champ vide (EXAMPLES du site). */
    private static final String[] EXAMPLES = {
            "Comment dit-on « merci » en shimaoré ?",
            "Où passer le code de la route à Mamoudzou ?",
            "Aide-moi à écrire mon CV",
            "Quelles offres d'emploi en ce moment ?",
    };
    private static final String FOOD_EXAMPLE = "Commande-moi un tacos";
    private static final long EXAMPLE_MS = 3200;
    private static final long CARD_MS = 5000;

    private final SiteTheme theme;
    private final Actions actions;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final PathInterpolator rise = new PathInterpolator(0.2f, 0.8f, 0.2f, 1f);
    private final LinearLayout column;
    private final TextView badge;
    private final View bell;
    private final FrameLayout body;
    private final LinearLayout homeBox;
    private final ScrollView scroll;
    private final LinearLayout list;
    private final LinearLayout dock;
    private final TextView notice;
    private final LinearLayout offline;
    private final LinearLayout banner;
    private final TextView bannerTitle;
    private final TextView bannerText;
    private final TextView bannerButton;
    private final View plusButton;
    private final View mic;
    private final EditText input;
    private final TextView example;
    private final FrameLayout sendBox;
    private final ImageView sendIcon;
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
    private boolean isOffline;
    private boolean empty = true;
    private String disabledReason;
    // Ce que le site montre à ce compte (lu sur le site, gardé pour la prochaine ouverture).
    private boolean food;
    private boolean voice;
    private boolean attach;
    private boolean signedIn;
    private int exampleIndex;
    private View globeBox;
    private TextView hello;
    /** Dernière réponse à l'écran : remplie au fil du flux sans tout redessiner. */
    private LinearLayout lastAnswer;
    private String lastAnswerText;
    private String shownKey;
    private final Runnable nextExample = this::showNextExample;

    HomeScreen(Context context, Actions actions) {
        super(context);
        this.actions = actions;
        theme = SiteTheme.of(context);
        setBackground(new HomeBackground(context, theme));
        setClickable(true);
        setClipChildren(false);
        ringPaint.setStyle(Paint.Style.STROKE);
        ringPaint.setStrokeCap(Paint.Cap.ROUND);
        ringPaint.setStrokeWidth(dp(2));
        ringPaint.setColor(theme.fgMuted);
        hintPaint.setColor(theme.fgMuted);
        hintPaint.setTextAlign(Paint.Align.CENTER);
        hintPaint.setTypeface(theme.sans);
        hintPaint.setTextSize(dp(14));

        column = new LinearLayout(context);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setClipChildren(false);
        addView(column, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // En-tête du site : h 3.5rem, px-3, gap-2, filet dessous ; menu, logo, puis la cloche à droite.
        LinearLayout header = new LinearLayout(context);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(12), 0, dp(12), 0);
        header.addView(iconButton(R.drawable.ic_site_menu, 18, 34, 8, "Ouvrir le menu", v -> openMenu()));
        LinearLayout.LayoutParams logoParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        logoParams.leftMargin = dp(8);
        header.addView(brand(22), logoParams);
        header.addView(new View(context), new LinearLayout.LayoutParams(0, 1, 1f));
        bell = iconButton(R.drawable.ic_site_bell, 22, 38, 19, "Notifications", v -> actions.notifications());
        bell.setVisibility(GONE);
        header.addView(bell);
        FrameLayout headerBox = new FrameLayout(context);
        headerBox.addView(header, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(56)));
        // Pastille des administrateurs : fixed top-2, centrée, rounded-full bg-warning px-3 py-1 text-[11px] font-semibold.
        badge = text("", 11, 16.5f, theme.warningFg, theme.semibold);
        pad(badge, 12, 4, 12, 4);
        badge.setBackground(round(theme.warning, 999));
        badge.setElevation(dp(3));
        badge.setClickable(true);
        badge.setOnClickListener(v -> actions.admin());
        badge.setVisibility(GONE);
        LayoutParams badgeParams = new LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.CENTER_HORIZONTAL);
        badgeParams.topMargin = dp(8);
        headerBox.addView(badge, badgeParams);
        column.addView(headerBox, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(56)));
        View headerRule = new View(context);
        headerRule.setBackgroundColor(theme.border);
        column.addView(headerRule, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Math.max(1, dp(1))));

        body = new FrameLayout(context);
        body.setClipChildren(false);
        // Accueil : mx-auto max-w-3xl px-4 sm:px-6, sans défilement (le haut se resserre).
        homeBox = new LinearLayout(context);
        homeBox.setOrientation(LinearLayout.VERTICAL);
        homeBox.setClipChildren(false);
        homeBox.setClipToPadding(false);
        body.addView(homeBox, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        scroll = new ScrollView(context);
        scroll.setFillViewport(true);
        scroll.setOverScrollMode(OVER_SCROLL_NEVER);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setVisibility(GONE);
        // Conversation : px-3.5 pt-4 pb-10, sm:px-6 sm:pt-6 sm:pb-12.
        list = new LinearLayout(context);
        list.setOrientation(LinearLayout.VERTICAL);
        list.setClipChildren(false);
        list.setClipToPadding(false);
        scroll.addView(list, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        body.addView(scroll, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        column.addView(body, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        // Bas de l'écran (composer-dock) : px-2.5 sm:px-6, pb 0.5rem sm:0.75rem, blocs espacés de 0.5rem.
        dock = new LinearLayout(context);
        dock.setOrientation(LinearLayout.VERTICAL);
        dock.setClipChildren(false);
        dock.setClipToPadding(false);

        // « Hors ligne » : flex items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm.
        offline = new LinearLayout(context);
        offline.setOrientation(LinearLayout.HORIZONTAL);
        offline.setGravity(Gravity.CENTER_VERTICAL);
        offline.setBackground(round(theme.warningSoft, 8));
        offline.setPadding(dp(12), dp(8), dp(12), dp(8));
        offline.addView(icon(R.drawable.ic_site_offline, theme.fg), new LinearLayout.LayoutParams(dp(16), dp(16)));
        TextView offlineText = text("Tu es hors ligne. Tes messages pourront être envoyés au retour de la connexion.", 14, 20, theme.fg, theme.sans);
        LinearLayout.LayoutParams offlineTextParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        offlineTextParams.leftMargin = dp(8);
        offline.addView(offlineText, offlineTextParams);
        offline.setVisibility(GONE);
        dock.addView(offline, block());

        // Erreur passagère : mb-2 text-center text-sm text-danger.
        notice = text("", 14, 20, theme.danger, theme.sans);
        notice.setGravity(Gravity.CENTER);
        notice.setVisibility(GONE);
        dock.addView(notice, block());

        // Fin de l'essai ou conversation pleine : rounded-2xl border p-5, bouton rond de la couleur de Tamilya.
        banner = new LinearLayout(context);
        banner.setOrientation(LinearLayout.VERTICAL);
        banner.setGravity(Gravity.CENTER_HORIZONTAL);
        GradientDrawable bannerShape = round(theme.personaSurface, 16);
        bannerShape.setStroke(dp(1), theme.personaBorder);
        banner.setBackground(bannerShape);
        banner.setPadding(dp(20), dp(20), dp(20), dp(20));
        bannerTitle = text("", 16, 24, theme.fg, theme.semibold);
        bannerTitle.setGravity(Gravity.CENTER);
        banner.addView(bannerTitle);
        bannerText = text("", 14, 20, theme.fgMuted, theme.sans);
        bannerText.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams bannerTextParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        bannerTextParams.topMargin = dp(2);
        banner.addView(bannerText, bannerTextParams);
        bannerButton = text("", 14, 20, Color.WHITE, theme.semibold);
        pad(bannerButton, 16, 8, 16, 8);
        bannerButton.setBackground(round(theme.persona, 999));
        bannerButton.setClickable(true);
        LinearLayout.LayoutParams bannerButtonParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        bannerButtonParams.topMargin = dp(12);
        banner.addView(bannerButton, bannerButtonParams);
        banner.setVisibility(GONE);
        dock.addView(banner, block());

        // Ligne de saisie : le « + » dans sa bulle, la barre, puis le bouton rond (flex items-end gap-2).
        bar = new LinearLayout(context);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.BOTTOM);
        bar.setClipChildren(false);
        int round = 54;

        FrameLayout plusBox = new FrameLayout(context);
        GradientDrawable plusShape = round(theme.bg, 999);
        plusShape.setStroke(dp(1), theme.border);
        plusBox.setBackground(plusShape);
        plusBox.setContentDescription("Photo ou document");
        plusBox.setClickable(true);
        plusBox.setOnClickListener(v -> actions.attach());
        plusBox.addView(icon(R.drawable.ic_site_plus, theme.fgMuted), new LayoutParams(dp(18), dp(18), Gravity.CENTER));
        plusButton = plusBox;
        plusButton.setVisibility(GONE);
        LinearLayout.LayoutParams plusParams = new LinearLayout.LayoutParams(dp(round), dp(round));
        plusParams.rightMargin = dp(8);
        bar.addView(plusButton, plusParams);

        // .composer : rounded-[1.6rem] border p-1.5 gap-1.5, bord de la couleur de Tamilya, fond du site.
        LinearLayout pill = new LinearLayout(context);
        pill.setOrientation(LinearLayout.HORIZONTAL);
        pill.setGravity(Gravity.BOTTOM);
        GradientDrawable pillShape = new GradientDrawable();
        pillShape.setColor(theme.bg);
        pillShape.setCornerRadius(dpf(25.6f));
        pillShape.setStroke(dp(1), theme.personaBorder);
        pill.setBackground(pillShape);
        pill.setPadding(dp(7), dp(7), dp(7), dp(7));

        // Champ : px-2, py-1.5, text-base leading-6 ; les exemples défilent par-dessus tant qu'il est vide.
        FrameLayout field = new FrameLayout(context);
        input = new EditText(context);
        input.setTextColor(theme.fg);
        input.setHintTextColor(theme.fgMuted);
        input.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 16);
        input.setTypeface(theme.sans);
        input.setIncludeFontPadding(false);
        // Entrée envoie, comme sur le site ; le texte long passe quand même à la ligne.
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        input.setHorizontallyScrolling(false);
        input.setMaxLines(theme.wide ? 9 : 6);
        input.setFilters(new InputFilter[]{new InputFilter.LengthFilter(MAX_TEXT)});
        input.setImeOptions(EditorInfo.IME_ACTION_SEND);
        input.setBackground(null);
        lead(input, 24);
        pad(input, 0, 6, 0, 6);
        input.setOnEditorActionListener((v, id, event) -> {
            boolean enter = event != null && event.getKeyCode() == android.view.KeyEvent.KEYCODE_ENTER;
            if (enter && event.getAction() != android.view.KeyEvent.ACTION_DOWN) return true;
            if (id != EditorInfo.IME_ACTION_SEND && !enter) return false;
            submit();
            return true;
        });
        field.addView(input, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        example = text("", 16, 24, theme.fgMuted, theme.sans);
        example.setMaxLines(1);
        example.setEllipsize(TextUtils.TruncateAt.END);
        pad(example, 0, 6, 0, 6);
        example.setVisibility(GONE);
        field.addView(example, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP));
        LinearLayout.LayoutParams fieldParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        // gap-1.5 de chaque côté (la place du bloc de gauche, vide, compte aussi) + px-2 du champ.
        fieldParams.leftMargin = dp(14);
        fieldParams.rightMargin = dp(14);
        fieldParams.gravity = Gravity.CENTER_VERTICAL;
        pill.addView(field, fieldParams);

        // Micro : rond de 2.5rem dans la barre, gris, quand la voix est disponible pour ce compte.
        FrameLayout micBox = new FrameLayout(context);
        micBox.setContentDescription("Parler à Tamilya");
        micBox.setClickable(true);
        micBox.setOnClickListener(v -> actions.voice());
        micBox.addView(icon(R.drawable.ic_site_mic, theme.fgMuted), new LayoutParams(dp(18), dp(18), Gravity.CENTER));
        mic = micBox;
        mic.setVisibility(GONE);
        LinearLayout.LayoutParams micParams = new LinearLayout.LayoutParams(dp(40), dp(40));
        pill.addView(mic, micParams);
        bar.addView(pill, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        // Bouton rose plein du site : flèche quand on écrit, carré d'arrêt (rond clair) pendant la réponse.
        sendIcon = icon(R.drawable.ic_site_send, Color.WHITE);
        sendBox = new FrameLayout(context);
        sendBox.setContentDescription("Envoyer le message");
        sendBox.setClickable(true);
        sendBox.setOnClickListener(v -> {
            if (streaming) actions.stop();
            else submit();
        });
        sendBox.addView(sendIcon, new LayoutParams(dp(18), dp(18), Gravity.CENTER));
        LinearLayout.LayoutParams sendParams = new LinearLayout.LayoutParams(dp(round), dp(round));
        sendParams.leftMargin = dp(8);
        bar.addView(sendBox, sendParams);
        input.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) { }
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) { }
            @Override public void afterTextChanged(Editable s) {
                updateSendButton();
                updateExample();
            }
        });
        dock.addView(bar, block());

        // Petite ligne : text-center text-[11px] text-fg-muted.
        hint = text("Tamilya peut se tromper. Vérifie les informations importantes.", 11, 16.5f, theme.fgMuted, theme.sans);
        hint.setGravity(Gravity.CENTER);
        dock.addView(hint, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        column.addView(dock);

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
        int panelWidth = Math.min(dp(288), Math.round(getResources().getDisplayMetrics().widthPixels * 0.85f));
        menu.addView(menuPanel, new LayoutParams(panelWidth, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.START));
        addView(menu, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        layoutFor(true);
        updateSendButton();
        updateExample();
    }

    /** Marges qui changent entre l'accueil et la conversation (pt-1 puis pt-4 et fondu vers la teinte). */
    private void layoutFor(boolean home) {
        int side = sidePadding(theme.wide ? 24 : 10);
        dock.setPadding(side, dp(home ? 4 : 16), side, dp(theme.wide ? 12 : 8));
        if (home) {
            dock.setBackground(null);
        } else {
            GradientDrawable fade = new GradientDrawable(GradientDrawable.Orientation.BOTTOM_TOP,
                    new int[]{theme.personaSurface, theme.personaSurface, SiteTheme.alpha(theme.personaSurface, 0f)});
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) fade.setColors(
                    new int[]{theme.personaSurface, theme.personaSurface, SiteTheme.alpha(theme.personaSurface, 0f)}, new float[]{0f, 0.8f, 1f});
            dock.setBackground(fade);
        }
        homeBox.setVisibility(home ? VISIBLE : GONE);
        scroll.setVisibility(home ? GONE : VISIBLE);
    }

    /** Colonne centrée de 48rem au plus (max-w-3xl), avec la marge du site de chaque côté. */
    private int sidePadding(int gutterDp) {
        int width = getWidth() > 0 ? getWidth() : getResources().getDisplayMetrics().widthPixels;
        return Math.max(dp(gutterDp), (width - dp(768)) / 2 + dp(gutterDp));
    }

    @Override
    protected void onSizeChanged(int w, int h, int oldw, int oldh) {
        super.onSizeChanged(w, h, oldw, oldh);
        post(() -> {
            int home = sidePadding(theme.wide ? 24 : 16);
            homeBox.setPadding(home, 0, home, 0);
            int talk = sidePadding(theme.wide ? 24 : 14);
            list.setPadding(talk, dp(theme.wide ? 24 : 16), talk, dp(theme.wide ? 48 : 40));
            int low = sidePadding(theme.wide ? 24 : 10);
            dock.setPadding(low, dock.getPaddingTop(), low, dock.getPaddingBottom());
            // Écran bas (clavier ouvert) : le globe disparaît, comme @media (max-height: 560px) du site.
            boolean low560 = h < dp(560);
            if (globeBox != null) globeBox.setVisibility(low560 ? GONE : VISIBLE);
            if (hello != null) ((LinearLayout.LayoutParams) hello.getLayoutParams()).topMargin = low560 ? 0 : dp(theme.wide ? 32 : 20);
            if (hello != null) hello.requestLayout();
        });
    }

    private void submit() {
        String text = input.getText().toString().trim();
        if (text.isEmpty() || streaming || !canSend || isOffline) return;
        input.setText("");
        actions.send(text);
    }

    private boolean enabled() {
        return canSend && !isOffline;
    }

    private void updateSendButton() {
        boolean filled = !input.getText().toString().trim().isEmpty();
        boolean ready = filled && enabled();
        sendBox.setBackground(round(streaming ? theme.fg : theme.persona, 999));
        sendIcon.setImageResource(streaming ? R.drawable.ic_site_stop : R.drawable.ic_site_send);
        sendIcon.setColorFilter(streaming ? theme.bg : Color.WHITE, PorterDuff.Mode.SRC_IN);
        sendBox.setAlpha(streaming || ready ? 1f : 0.45f);
        sendBox.setContentDescription(streaming ? "Arrêter la génération" : "Envoyer le message");
        float off = enabled() && !streaming ? 1f : 0.45f;
        mic.setAlpha(off);
        plusButton.setAlpha(off);
    }

    /** Champ vide sur l'accueil : le texte d'invitation, puis les exemples, l'un après l'autre. */
    private void updateExample() {
        boolean rotating = enabled() && input.getText().length() == 0 && empty;
        input.setEnabled(canSend && !isOffline);
        input.setHint(rotating ? "" : enabled() ? PLACEHOLDER : isOffline ? "Hors ligne" : disabledReason == null ? "Conversation terminée" : disabledReason);
        handler.removeCallbacks(nextExample);
        if (!rotating) {
            example.animate().cancel();
            example.setVisibility(GONE);
            return;
        }
        if (example.getVisibility() != VISIBLE) {
            example.setVisibility(VISIBLE);
            exampleIndex = 0;
            playExample();
        } else {
            handler.postDelayed(nextExample, EXAMPLE_MS);
        }
    }

    private String[] examples() {
        List<String> all = new ArrayList<>();
        all.add(PLACEHOLDER);
        if (food) all.add(FOOD_EXAMPLE);
        for (String e : EXAMPLES) all.add(e);
        return all.toArray(new String[0]);
    }

    private void showNextExample() {
        exampleIndex++;
        playExample();
    }

    /** @keyframes composer-hint : monte et apparaît (12 %), reste, puis s'efface vers le haut (85 % → 100 %). */
    private void playExample() {
        String[] all = examples();
        example.setText(all[exampleIndex % all.length]);
        float shift = dp(24) * 0.7f;
        example.animate().cancel();
        if (!ValueAnimator.areAnimatorsEnabled()) {
            example.setAlpha(1f);
            example.setTranslationY(0f);
        } else {
            example.setAlpha(0f);
            example.setTranslationY(shift);
            example.animate().alpha(1f).translationY(0f).setStartDelay(0).setDuration(384).setInterpolator(rise).withEndAction(() ->
                    example.animate().alpha(0f).translationY(-shift).setStartDelay(2336).setDuration(480).setInterpolator(rise).start()).start();
        }
        handler.removeCallbacks(nextExample);
        handler.postDelayed(nextExample, EXAMPLE_MS);
    }

    @Override
    protected void onDetachedFromWindow() {
        super.onDetachedFromWindow();
        handler.removeCallbacksAndMessages(null);
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        updateExample();
    }

    /** Barre d'écriture coupée (fin d'essai, conversation pleine) ou rendue. */
    void setCanSend(boolean value, String reason) {
        canSend = value;
        disabledReason = reason;
        updateSendButton();
        updateExample();
    }

    /**
     * Ce que le site montre à ce compte : la pastille des administrateurs, l'idée « Commander à
     * manger », le micro, le « + » des documents. Lu sur le site, redonné ici à chaque ouverture.
     */
    void setSite(String badgeText, boolean food, boolean voice, boolean attach) {
        badge.setText(badgeText == null ? "" : badgeText);
        badge.setVisibility(badgeText == null || badgeText.isEmpty() ? GONE : VISIBLE);
        mic.setVisibility(voice ? VISIBLE : GONE);
        plusButton.setVisibility(attach ? VISIBLE : GONE);
        boolean changed = this.food != food || this.voice != voice;
        this.food = food;
        this.voice = voice;
        this.attach = attach;
        if (changed) shownKey = null;
    }

    /** Compte connecté : la cloche des notifications est à droite de l'en-tête. */
    void setSignedIn(boolean value) {
        signedIn = value;
        bell.setVisibility(value ? VISIBLE : GONE);
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

    /** Petite ligne sous la barre ; pour un visiteur, la fin (après « · ») est le lien rose vers le compte. */
    void setHint(String value, OnClickListener click) {
        int cut = click == null ? -1 : value.indexOf(" · ");
        if (cut < 0) {
            hint.setText(value);
        } else {
            SpannableString styled = new SpannableString(value);
            styled.setSpan(new ForegroundColorSpan(theme.persona), cut + 3, value.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) styled.setSpan(new android.text.style.TypefaceSpan(theme.semibold), cut + 3, value.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            hint.setText(styled);
        }
        hint.setClickable(click != null);
        hint.setOnClickListener(click);
    }

    void setOffline(boolean value) {
        isOffline = value;
        offline.setVisibility(value ? VISIBLE : GONE);
        shownKey = shownKey == null ? null : shownKey + "!";
        updateSendButton();
        updateExample();
    }

    /**
     * Redessine la liste si sa structure a changé (nombre de messages, statuts). Pendant la
     * réponse, seul le texte de la dernière réponse est mis à jour (updateLastAnswer).
     */
    void render(List<ChatMessage> messages, boolean streaming, String name) {
        this.streaming = streaming;
        boolean wasEmpty = empty;
        empty = messages.isEmpty();
        updateSendButton();
        if (wasEmpty != empty) updateExample();
        StringBuilder key = new StringBuilder(name == null ? "" : name).append('|').append(food).append(voice).append(isOffline).append('|');
        for (ChatMessage m : messages) key.append(m.role.charAt(0)).append(m.status.charAt(0)).append(m.notice == null ? 0 : m.notice.hashCode()).append(';');
        String wanted = key.toString();
        if (wanted.equals(shownKey)) {
            if (streaming) updateLastAnswer(messages);
            return;
        }
        boolean first = shownKey == null || wasEmpty != empty;
        shownKey = wanted;
        boolean wasAtBottom = atBottom();
        lastAnswer = null;
        lastAnswerText = null;
        layoutFor(messages.isEmpty());
        if (messages.isEmpty()) {
            list.removeAllViews();
            fillHome(name, first);
            return;
        }
        homeBox.removeAllViews();
        globeBox = null;
        hello = null;
        list.removeAllViews();
        // Relance : à côté de la question qui précède une réponse en erreur ou interrompue.
        ChatMessage lastMessage = messages.get(messages.size() - 1);
        boolean retryable = !lastMessage.mine() && !streaming && enabled()
                && (ChatMessage.ERROR.equals(lastMessage.status) || ChatMessage.INTERRUPTED.equals(lastMessage.status));
        int lastMine = -1;
        for (int i = 0; i < messages.size(); i++) if (messages.get(i).mine()) lastMine = i;
        boolean actionsAbove = false;
        for (int i = 0; i < messages.size(); i++) {
            ChatMessage message = messages.get(i);
            boolean last = i == messages.size() - 1;
            View row = message.mine() ? bubble(message, retryable && i == lastMine) : answer(message, last);
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            // space-y-10 : 2.5rem entre deux messages ; les boutons sous un message (copier…) sont dans cet espace.
            if (i > 0) params.topMargin = actionsAbove ? -dp(2) : dp(40);
            actionsAbove = row.getTag() == Boolean.TRUE;
            list.addView(row, params);
        }
        list.setPadding(list.getPaddingLeft(), list.getPaddingTop(), list.getPaddingRight(), dp(theme.wide ? 48 : 40) - (actionsAbove ? dp(42) : 0));
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

    /** .tamilya-hello-rise : monte de 14 px en apparaissant (700 ms, après un délai). */
    private void riseIn(View view, long delayMs) {
        if (!ValueAnimator.areAnimatorsEnabled()) return;
        view.setAlpha(0f);
        view.setTranslationY(dp(14));
        view.animate().alpha(1f).translationY(0f).setStartDelay(delayMs).setDuration(700).setInterpolator(rise).start();
    }

    /**
     * Accueil du site : Tamilya (globe animé) au centre, « Bonjour », la phrase, puis les idées
     * juste au-dessus de la barre d'écriture. Tout tient dans l'écran.
     */
    private void fillHome(String name, boolean animate) {
        homeBox.removeAllViews();
        // Haut : flex-1, centré, py-3 sm:py-8.
        LinearLayout middle = new LinearLayout(getContext());
        middle.setOrientation(LinearLayout.VERTICAL);
        middle.setGravity(Gravity.CENTER);
        middle.setClipChildren(false);
        middle.setClipToPadding(false);
        middle.setPadding(0, dp(theme.wide ? 32 : 12), 0, dp(theme.wide ? 32 : 12));

        // Globe : .tamilya-blob, large de min(34vw, 8.5rem) ; le halo et les gouttelettes dépassent de sa boîte.
        float widthDp = getResources().getDisplayMetrics().widthPixels / getResources().getDisplayMetrics().density;
        float blob = Math.min(widthDp * 0.34f, 136f);
        FrameLayout box = new FrameLayout(getContext());
        box.setClipChildren(false);
        box.setClipToPadding(false);
        GreyGlobe globe = new GreyGlobe(getContext(), theme.persona, blob);
        globe.setContentDescription(voice ? "Parler à Tamilya" : "Écrire à Tamilya");
        globe.setOnClickListener(v -> {
            globe.pop();
            if (voice && enabled()) actions.voice();
            else focusInput();
        });
        int globeView = Math.round(dpf(blob) * 1.8f);
        box.addView(globe, new LayoutParams(globeView, globeView, Gravity.CENTER));
        globeBox = box;
        LinearLayout.LayoutParams boxParams = new LinearLayout.LayoutParams(Math.round(dpf(blob)), Math.round(dpf(blob)));
        boxParams.gravity = Gravity.CENTER_HORIZONTAL;
        middle.addView(box, boxParams);

        // h1 : text-2xl sm:text-4xl font-semibold tracking-tight, mt-5 sm:mt-8.
        hello = theme.wide ? text("", 36, 40, theme.fg, theme.semibold) : text("", 24, 32, theme.fg, theme.semibold);
        hello.setText(greeting() + (name == null || name.isEmpty() ? "" : ", " + name));
        hello.setLetterSpacing(-0.025f);
        hello.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams helloParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        helloParams.topMargin = dp(theme.wide ? 32 : 20);
        middle.addView(hello, helloParams);

        // Phrase : mt-2 text-sm sm:text-base text-fg-muted, max-w-xs sur téléphone.
        TextView intro = theme.wide ? text("", 16, 24, theme.fgMuted, theme.sans) : text("", 14, 20, theme.fgMuted, theme.sans);
        intro.setText("Je suis Tamilya. Pose-moi ta question, en français ou en shimaoré.");
        intro.setGravity(Gravity.CENTER);
        if (!theme.wide) intro.setMaxWidth(dp(320));
        LinearLayout.LayoutParams introParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        introParams.topMargin = dp(8);
        introParams.gravity = Gravity.CENTER_HORIZONTAL;
        middle.addView(intro, introParams);
        homeBox.addView(middle, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        if (animate) {
            riseIn(hello, 250);
            riseIn(intro, 370);
        }

        List<String[]> ideas = new ArrayList<>();
        List<Integer> icons = new ArrayList<>();
        if (food) {
            ideas.add(FOOD_SUGGESTION);
            icons.add(R.drawable.ic_idee_repas);
        }
        for (int i = 0; i < SUGGESTIONS.length && ideas.size() < 4; i++) {
            ideas.add(SUGGESTIONS[i]);
            icons.add(SUGGESTION_ICONS[i]);
        }

        if (!theme.wide) {
            homeBox.addView(new Carousel(ideas, icons), new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
            return;
        }
        // Tablette : grille de deux colonnes, gap-3 pb-3.
        LinearLayout grid = new LinearLayout(getContext());
        grid.setOrientation(LinearLayout.VERTICAL);
        grid.setPadding(0, 0, 0, dp(12));
        for (int row = 0; row < 2; row++) {
            LinearLayout line = new LinearLayout(getContext());
            line.setOrientation(LinearLayout.HORIZONTAL);
            for (int col = 0; col < 2; col++) {
                int index = row * 2 + col;
                LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f);
                if (col == 1) params.leftMargin = dp(12);
                View card = suggestion(ideas.get(index), icons.get(index), true);
                line.addView(card, params);
                if (animate) riseIn(card, 450 + index * 70L);
            }
            LinearLayout.LayoutParams lineParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            if (row == 1) lineParams.topMargin = dp(12);
            grid.addView(line, lineParams);
        }
        homeBox.addView(grid, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
    }

    /**
     * Carte d'une idée. Tablette : rounded-2xl border bg-bg/60 p-4 gap-3, icône dans un carré de
     * 2.5rem. Téléphone (carrousel) : bg-bg/70 p-3, carré de 2.75rem, titre en demi-gras, « › ».
     */
    private View suggestion(String[] s, int iconId, boolean grid) {
        LinearLayout card = new LinearLayout(getContext());
        card.setOrientation(LinearLayout.HORIZONTAL);
        card.setGravity(Gravity.CENTER_VERTICAL);
        GradientDrawable shape = round(SiteTheme.alpha(theme.bg, grid ? 0.6f : 0.7f), 16);
        shape.setStroke(dp(1), theme.border);
        card.setBackground(shape);
        int inner = grid ? 17 : 13;
        card.setPadding(dp(inner), dp(inner), dp(inner), dp(inner));
        card.setContentDescription(s[0] + " : " + s[1]);
        card.setAlpha(enabled() ? 1f : 0.5f);
        if (grid) {
            card.setClickable(true);
            card.setOnClickListener(v -> {
                if (!streaming && enabled()) actions.send(s[2]);
            });
        }
        FrameLayout square = new FrameLayout(getContext());
        square.setBackground(round(theme.personaSoft, 12));
        int iconSize = grid ? 20 : 24;
        square.addView(icon(iconId, theme.fg), new LayoutParams(dp(iconSize), dp(iconSize), Gravity.CENTER));
        int squareSize = grid ? 40 : 44;
        card.addView(square, new LinearLayout.LayoutParams(dp(squareSize), dp(squareSize)));
        LinearLayout words = new LinearLayout(getContext());
        words.setOrientation(LinearLayout.VERTICAL);
        TextView title = text(s[0], 14, 20, theme.fg, grid ? theme.medium : theme.semibold);
        title.setMaxLines(1);
        title.setEllipsize(TextUtils.TruncateAt.END);
        words.addView(title);
        TextView sub = text(s[1], 12, 16, theme.fgMuted, theme.sans);
        sub.setMaxLines(1);
        sub.setEllipsize(TextUtils.TruncateAt.END);
        words.addView(sub);
        LinearLayout.LayoutParams wordsParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        wordsParams.leftMargin = dp(12);
        card.addView(words, wordsParams);
        if (!grid) {
            TextView chevron = text("›", 16, 24, theme.fgMuted, theme.sans);
            LinearLayout.LayoutParams chevronParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            chevronParams.leftMargin = dp(12);
            card.addView(chevron, chevronParams);
        }
        return card;
    }

    /**
     * Téléphone : les idées une carte à la fois (SuggestionCarousel.tsx). Elles changent seules le
     * temps d'un tour, puis s'arrêtent sur la première ; un glissement ou un point en montre une autre.
     */
    private final class Carousel extends LinearLayout {
        private final List<String[]> ideas;
        private final List<Integer> icons;
        private final FrameLayout stage;
        private final LinearLayout dots;
        private int index;
        private boolean auto = true;
        private float downX;
        private final Runnable advance = () -> {
            if (index == Carousel.this.ideas.size() - 1) auto = false;
            show((index + 1) % Carousel.this.ideas.size(), 1);
        };

        Carousel(List<String[]> ideas, List<Integer> icons) {
            super(HomeScreen.this.getContext());
            this.ideas = ideas;
            this.icons = icons;
            setOrientation(VERTICAL);
            setPadding(0, 0, 0, dp(12));
            stage = new FrameLayout(getContext());
            addView(stage, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
            // Points : 6 px dans une zone d'appui de 24 × 40 px ; marges négatives (-mt-1 -mb-3.5).
            dots = new LinearLayout(getContext());
            dots.setGravity(Gravity.CENTER);
            LayoutParams dotsParams = new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(40));
            dotsParams.topMargin = -dp(4);
            dotsParams.bottomMargin = -dp(14);
            addView(dots, dotsParams);
            stage.addView(suggestion(ideas.get(0), icons.get(0), false));
            drawDots();
            plan();
        }

        private void plan() {
            handler.removeCallbacks(advance);
            if (auto && ideas.size() > 1) handler.postDelayed(advance, CARD_MS);
        }

        private void drawDots() {
            dots.removeAllViews();
            for (int i = 0; i < ideas.size(); i++) {
                int target = i;
                FrameLayout zone = new FrameLayout(getContext());
                zone.setContentDescription("Idée " + (i + 1) + " : " + ideas.get(i)[0]);
                View dot = new View(getContext());
                dot.setBackground(round(i == index ? theme.persona : SiteTheme.alpha(theme.fgMuted, 0.4f), 999));
                zone.addView(dot, new FrameLayout.LayoutParams(dp(i == index ? 20 : 6), dp(6), Gravity.CENTER));
                zone.setOnClickListener(v -> {
                    auto = false;
                    handler.removeCallbacks(advance);
                    if (target != index) show(target, target > index ? 1 : -1);
                });
                dots.addView(zone, new LayoutParams(dp(i == index ? 38 : 24), dp(40)));
            }
        }

        private void show(int next, int dir) {
            View old = stage.getChildAt(stage.getChildCount() - 1);
            index = next;
            View card = suggestion(ideas.get(next), icons.get(next), false);
            stage.addView(card);
            if (ValueAnimator.areAnimatorsEnabled()) {
                card.setAlpha(0f);
                card.setTranslationX(dp(28) * dir);
                card.animate().alpha(1f).translationX(0f).setDuration(260).setInterpolator(rise).start();
                old.animate().alpha(0f).translationX(-dp(28) * dir).setDuration(260).withEndAction(() -> stage.removeView(old)).start();
            } else {
                stage.removeView(old);
            }
            drawDots();
            plan();
        }

        @Override
        public boolean onInterceptTouchEvent(MotionEvent event) {
            return event.getY() < stage.getBottom();
        }

        @Override
        public boolean onTouchEvent(MotionEvent event) {
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    downX = event.getX();
                    handler.removeCallbacks(advance);
                    return true;
                case MotionEvent.ACTION_UP:
                    float dx = event.getX() - downX;
                    if (Math.abs(dx) > dp(40)) {
                        auto = false;
                        int step = dx < 0 ? 1 : -1;
                        show((index + step + ideas.size()) % ideas.size(), step);
                    } else {
                        // Un appui (pas un glissement) envoie l'idée à Tamilya.
                        if (!streaming && enabled()) actions.send(ideas.get(index)[2]);
                        plan();
                    }
                    return true;
                case MotionEvent.ACTION_CANCEL:
                    plan();
                    return true;
                default:
                    return true;
            }
        }

        @Override
        protected void onDetachedFromWindow() {
            super.onDetachedFromWindow();
            handler.removeCallbacks(advance);
        }
    }

    /** « Bonjour » ou « Bonsoir » à l'heure de Mayotte, comme greeting() du site. */
    static String greeting() {
        java.util.Calendar now = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("Indian/Mayotte"));
        int hour = now.get(java.util.Calendar.HOUR_OF_DAY);
        return hour >= 18 || hour < 4 ? "Bonsoir" : "Bonjour";
    }

    /**
     * Bulle de la personne : max-w-[88%] sm:max-w-[75%] rounded-3xl rounded-br-lg, fond --persona-soft,
     * px-4 py-2.5 leading-relaxed. Dessous, à droite : relancer et copier quand la réponse a échoué.
     */
    private View bubble(ChatMessage message, boolean retry) {
        LinearLayout box = new LinearLayout(getContext());
        box.setOrientation(LinearLayout.VERTICAL);
        box.setClipChildren(false);
        box.setGravity(Gravity.END);
        TextView body = text(message.text(), 16, 26, theme.fg, theme.sans);
        int inside = list.getWidth() > 0 ? list.getWidth() - list.getPaddingLeft() - list.getPaddingRight()
                : getResources().getDisplayMetrics().widthPixels - 2 * sidePadding(theme.wide ? 24 : 14);
        body.setMaxWidth(Math.round(inside * (theme.wide ? 0.75f : 0.88f)));
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(theme.personaSoft);
        float big = dp(24), small = dp(8);
        shape.setCornerRadii(new float[]{big, big, big, big, small, small, big, big});
        body.setBackground(shape);
        pad(body, 16, 10, 16, 10);
        body.setTextIsSelectable(true);
        LinearLayout.LayoutParams bodyParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        bodyParams.gravity = Gravity.END;
        box.addView(body, bodyParams);
        if (retry) {
            LinearLayout tools = new LinearLayout(getContext());
            tools.setOrientation(LinearLayout.HORIZONTAL);
            tools.addView(action(R.drawable.ic_site_retry, "Relancer ce message", v -> actions.retry()));
            tools.addView(copyAction(message.text()));
            LinearLayout.LayoutParams toolsParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(40));
            toolsParams.topMargin = dp(2);
            box.addView(tools, toolsParams);
            box.setTag(Boolean.TRUE);
        }
        return box;
    }

    /** Petit bouton d'action sous un message (Action du site) : carré de 2.5rem au doigt, icône de 16. */
    private View action(int iconId, String label, OnClickListener click) {
        FrameLayout button = new FrameLayout(getContext());
        button.setContentDescription(label);
        button.setClickable(true);
        button.setOnClickListener(click);
        button.addView(icon(iconId, theme.fgMuted), new LayoutParams(dp(16), dp(16), Gravity.CENTER));
        button.setLayoutParams(new LinearLayout.LayoutParams(dp(40), dp(40)));
        return button;
    }

    private View copyAction(String value) {
        FrameLayout button = (FrameLayout) action(R.drawable.ic_site_copy, "Copier", null);
        ImageView image = (ImageView) button.getChildAt(0);
        button.setOnClickListener(v -> {
            ClipboardManager clipboard = getContext().getSystemService(ClipboardManager.class);
            if (clipboard == null) return;
            clipboard.setPrimaryClip(ClipData.newPlainText("Tamilya", value));
            image.setImageResource(R.drawable.ic_site_check);
            image.setColorFilter(theme.success, PorterDuff.Mode.SRC_IN);
            handler.postDelayed(() -> {
                image.setImageResource(R.drawable.ic_site_copy);
                image.setColorFilter(theme.fgMuted, PorterDuff.Mode.SRC_IN);
            }, 1500);
        });
        return button;
    }

    /** Réponse de Tamilya : son globe à gauche (2rem), le texte à droite sans bulle (gap-2.5 sm:gap-3, pt-1). */
    private View answer(ChatMessage message, boolean last) {
        LinearLayout row = new LinearLayout(getContext());
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setClipChildren(false);
        boolean inProgress = ChatMessage.STREAMING.equals(message.status);
        FrameLayout avatar = new FrameLayout(getContext());
        avatar.setClipChildren(false);
        GreyGlobe globe = new GreyGlobe(getContext(), theme.persona, 32f);
        globe.setBusy(inProgress);
        globe.setStill(!inProgress);
        globe.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        int globeView = Math.round(dp(32) * 1.8f);
        avatar.addView(globe, new LayoutParams(globeView, globeView, Gravity.CENTER));
        row.addView(avatar, new LinearLayout.LayoutParams(dp(32), dp(32)));

        LinearLayout content = new LinearLayout(getContext());
        content.setOrientation(LinearLayout.VERTICAL);
        content.setClipChildren(false);
        content.setPadding(0, dp(4), 0, 0);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        params.leftMargin = dp(theme.wide ? 12 : 10);
        row.addView(content, params);

        LinearLayout body = new LinearLayout(getContext());
        body.setOrientation(LinearLayout.VERTICAL);
        content.addView(body, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        bindAnswer(body, message.text(), inProgress);
        if (last) {
            lastAnswer = body;
            lastAnswerText = message.text();
        }
        boolean error = ChatMessage.ERROR.equals(message.status);
        if (!inProgress && (error || ChatMessage.INTERRUPTED.equals(message.status))) {
            String words = message.notice != null && !message.notice.isEmpty() ? message.notice
                    : error ? "La réponse n'a pas pu être générée." : "Réponse interrompue.";
            // Erreur : mt-2 rounded-xl bg-danger-soft px-3 py-2 text-sm ; interruption : mt-2 text-xs gris.
            TextView note = error ? text(words, 14, 20, theme.danger, theme.sans) : text(words, 12, 16, theme.fgMuted, theme.sans);
            if (error) {
                note.setBackground(round(theme.dangerSoft, 12));
                pad(note, 12, 8, 12, 8);
            }
            LinearLayout.LayoutParams noteParams = new LinearLayout.LayoutParams(error ? ViewGroup.LayoutParams.MATCH_PARENT : ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            noteParams.topMargin = dp(8);
            content.addView(note, noteParams);
        }
        // Copier, une fois la réponse terminée : sous le texte, dans l'espace entre deux messages.
        if (!inProgress && !error && !message.text().trim().isEmpty()) {
            View copy = copyAction(message.text());
            LinearLayout.LayoutParams copyParams = new LinearLayout.LayoutParams(dp(40), dp(40));
            copyParams.topMargin = dp(2);
            copyParams.leftMargin = -dp(6);
            content.addView(copy, copyParams);
            row.setTag(Boolean.TRUE);
        }
        return row;
    }

    /** Remplit le texte d'une réponse : morceaux de texte mis en forme (.markdown, interligne 1,7), cartes en bouton. */
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
            TextView view = text("", 16, 27.2f, theme.fg, theme.sans);
            view.setText(MarkdownSpans.render(part.text, theme, dp(1), actions::openLink));
            view.setMovementMethod(LinkMovementMethod.getInstance());
            view.setTextIsSelectable(!inProgress);
            body.addView(view, spaced(body.getChildCount() == 0 ? 0 : 6));
        }
    }

    /** Trois points de la couleur de Tamilya qui sautillent jusqu'au premier mot (h-6, gap-1, animate-bounce). */
    private View thinking() {
        LinearLayout dots = new LinearLayout(getContext());
        dots.setOrientation(LinearLayout.HORIZONTAL);
        dots.setGravity(Gravity.CENTER_VERTICAL);
        dots.setMinimumHeight(dp(24));
        dots.setContentDescription("Tamilya rédige une réponse");
        List<ObjectAnimator> moves = new ArrayList<>();
        for (int i = 0; i < 3; i++) {
            View dot = new View(getContext());
            dot.setBackground(round(theme.persona, 999));
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(dp(6), dp(6));
            if (i > 0) params.leftMargin = dp(4);
            dots.addView(dot, params);
            // animate-bounce de Tailwind : part de -25 %, retombe, remonte, en 1 s.
            ObjectAnimator move = ObjectAnimator.ofFloat(dot, View.TRANSLATION_Y, -dpf(1.5f), 0f, -dpf(1.5f));
            move.setDuration(1000);
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
        body.setTranslationY(-dp(112) * progress);
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

    /** Logo du site (BrandLogo.tsx) : la forme BTM teintée comme le texte, puis le badge « AI ». */
    private View brand(int heightDp) {
        int height = dp(heightDp);
        LinearLayout row = new LinearLayout(getContext());
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.BOTTOM);
        row.setContentDescription("BTM AI — GROUPE BTM");
        ImageView mark = new ImageView(getContext());
        mark.setImageResource(R.drawable.connect_logo);
        mark.setColorFilter(theme.fg, PorterDuff.Mode.SRC_IN);
        mark.setScaleType(ImageView.ScaleType.FIT_CENTER);
        row.addView(mark, new LinearLayout.LayoutParams(Math.round(height * 1039f / 483f), height));
        TextView ai = new TextView(getContext());
        ai.setText("AI");
        ai.setTextColor(theme.accentFg);
        ai.setTextSize(TypedValue.COMPLEX_UNIT_PX, height * 0.36f);
        ai.setTypeface(theme.bold);
        ai.setLetterSpacing(0.025f);
        ai.setIncludeFontPadding(false);
        Paint.FontMetrics metrics = ai.getPaint().getFontMetrics();
        // leading-none : la boîte fait la hauteur du corps, pas celle de la police.
        float extra = height * 0.36f - (metrics.descent - metrics.ascent);
        int padX = Math.round(height * 0.36f * 0.22f), padY = Math.round(height * 0.36f * 0.06f);
        ai.setPadding(padX, padY + Math.round(extra / 2f), padX, padY + Math.round(extra / 2f));
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(theme.accent);
        shape.setCornerRadius(height * 0.36f * 0.18f);
        ai.setBackground(shape);
        LinearLayout.LayoutParams aiParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        aiParams.leftMargin = Math.round(height * 0.35f);
        row.addView(ai, aiParams);
        return row;
    }

    private View rule() {
        View rule = new View(getContext());
        rule.setBackgroundColor(theme.border);
        return rule;
    }

    /** Icône du site (vecteur blanc) teintée. */
    private ImageView icon(int id, int color) {
        ImageView view = new ImageView(getContext());
        view.setImageResource(id);
        view.setColorFilter(color, PorterDuff.Mode.SRC_IN);
        view.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        return view;
    }

    /** Bouton d'icône de l'en-tête : icône grise dans une boîte (p-2), coins arrondis. */
    private View iconButton(int iconId, int iconDp, int boxDp, int radiusDp, String description, OnClickListener click) {
        FrameLayout button = new FrameLayout(getContext());
        button.setContentDescription(description);
        button.setClickable(true);
        button.setOnClickListener(click);
        button.addView(icon(iconId, theme.fgMuted), new LayoutParams(dp(iconDp), dp(iconDp), Gravity.CENTER));
        button.setLayoutParams(new LinearLayout.LayoutParams(dp(boxDp), dp(boxDp)));
        return button;
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
        button.setTypeface(theme.bold);
        button.setGravity(Gravity.CENTER);
        button.setPadding(dp(20), dp(11), dp(20), dp(11));
        button.setBackground(round(theme.accent, 24));
        button.setClickable(true);
        return button;
    }

    private TextView outlinedButton(String label) {
        TextView button = text(label, 14, 20, theme.fg, theme.medium);
        button.setGravity(Gravity.CENTER_VERTICAL);
        pad(button, 14, 9, 14, 9);
        GradientDrawable shape = round(theme.bg, 12);
        shape.setStroke(dp(1), theme.border);
        button.setBackground(shape);
        button.setClickable(true);
        return button;
    }

    /** Texte du menu : police du site, taille en dp (les « px » du CSS). */
    private TextView text(String value, int size, int color) {
        TextView view = new TextView(getContext());
        view.setText(value);
        view.setTextSize(TypedValue.COMPLEX_UNIT_DIP, size);
        view.setTextColor(color);
        view.setTypeface(theme.sans);
        return view;
    }

    /**
     * Texte aux mesures du CSS : corps et interligne en dp. La boîte fait exactement
     * lignes × interligne, comme dans le navigateur (demi-interligne au-dessus et au-dessous).
     */
    private TextView text(String value, float sizeDp, float lineDp, int color, Typeface face) {
        TextView view = new TextView(getContext());
        view.setText(value);
        view.setTextSize(TypedValue.COMPLEX_UNIT_DIP, sizeDp);
        view.setTextColor(color);
        view.setTypeface(face);
        view.setIncludeFontPadding(false);
        lead(view, lineDp);
        pad(view, 0, 0, 0, 0);
        return view;
    }

    /** Interligne du CSS : l'écart est réparti entre les lignes, et gardé en marge pour pad(). */
    private void lead(TextView view, float lineDp) {
        Paint.FontMetrics metrics = view.getPaint().getFontMetrics();
        float extra = dpf(lineDp) - (metrics.descent - metrics.ascent);
        view.setLineSpacing(extra, 1f);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) view.setFallbackLineSpacing(false);
        view.setTag(extra);
    }

    /** Marges intérieures du CSS (en dp), plus le demi-interligne de la première et de la dernière ligne. */
    private void pad(TextView view, int left, int top, int right, int bottom) {
        float extra = view.getTag() instanceof Float ? (Float) view.getTag() : 0f;
        int above = Math.round(extra / 2f);
        view.setPadding(dp(left), dp(top) + above, dp(right), dp(bottom) + Math.round(extra) - above);
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

    /** Bloc du bas de l'écran : pleine largeur, 0.5rem avant le suivant (space-y-2). */
    private LinearLayout.LayoutParams block() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.bottomMargin = dp(8);
        return params;
    }

    private int dp(int value) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics()));
    }

    private float dpf(float value) {
        return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics());
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
