package yt.tamilya.app;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.RenderEffect;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.LayerDrawable;
import android.graphics.drawable.StateListDrawable;
import android.os.Build;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.DecelerateInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Locale;

/**
 * Le menu des trois tirets de Tamilya : le tiroir du site sur téléphone (Sidebar.tsx,
 * ConversationItem.tsx, AccountMenu.tsx, ConfirmDialog.tsx), aux mêmes mesures (les « px » du
 * CSS sont des dp ici). En haut le logo et le « + » rond (pas de croix) ; le bouton « Tableau de
 * bord » des administrateurs ; l'historique (appui long ou « ⋯ » pour supprimer) ; en bas
 * « Mes documents », le compte et le solde. Le compte ouvre Paramètres, Utilisation, Obtenir de
 * l'aide et Se déconnecter. Il glisse depuis la gauche et se referme en touchant à côté, en
 * glissant vers la gauche ou avec le bouton retour.
 */
final class HomeMenu extends FrameLayout {
    private static final int SLIDE_MS = 200;

    private final SiteTheme theme;
    private final HomeScreen.Actions actions;
    /** L'écran derrière le menu, flouté tant que le menu est ouvert (backdrop-blur-sm). */
    private final View behind;
    private final View dim;
    private final LinearLayout panel;
    private final int panelWidth;
    private final LinearLayout adminBox;
    private final ScrollView middle;
    private final LinearLayout items;
    private final LinearLayout bottom;
    /** Petits menus (supprimer, compte), par-dessus le tiroir. */
    private final FrameLayout popLayer;
    /** Fenêtre de confirmation, par-dessus tout. */
    private final FrameLayout sheetLayer;
    private Runnable popupGone;
    private boolean closing;
    private String shown;
    private float downX, downY;

    HomeMenu(Context context, SiteTheme theme, HomeScreen.Actions actions, View behind, View logo) {
        super(context);
        this.theme = theme;
        this.actions = actions;
        this.behind = behind;
        setVisibility(GONE);

        // Fond : bg-black/40, un appui dessus referme.
        dim = new View(context);
        dim.setBackgroundColor(0x66000000);
        dim.setOnClickListener(v -> close());
        addView(dim, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // Tiroir : w-72 max-w-[85vw], bg-bg-subtle, filet à droite.
        int line = Math.max(1, dp(1));
        panel = new LinearLayout(context);
        panel.setOrientation(LinearLayout.VERTICAL);
        LayerDrawable back = new LayerDrawable(new Drawable[]{new ColorDrawable(theme.border), new ColorDrawable(theme.bgSubtle)});
        back.setLayerInset(1, 0, 0, line, 0);
        panel.setBackground(back);
        panel.setPadding(0, 0, line, 0);
        panel.setClickable(true);
        panelWidth = Math.min(dp(288), Math.round(getResources().getDisplayMetrics().widthPixels * 0.85f));
        addView(panel, new LayoutParams(panelWidth, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.LEFT));

        // Haut : px-4 pt-4 pb-3 ; le logo, puis le « + » rond (bouton-verre) et la croix (size-10), gap-1.5.
        LinearLayout top = new LinearLayout(context);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(dp(16), dp(16), dp(16), dp(12));
        logo.setClickable(true);
        logo.setOnClickListener(v -> close());
        top.addView(logo, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        top.addView(new View(context), new LinearLayout.LayoutParams(0, 1, 1f));
        FrameLayout plus = new FrameLayout(context);
        // Juste le « + », sans rond ; un léger fond gris seulement sous le doigt.
        plus.setBackground(pressable(999, theme.bgMuted));
        plus.setContentDescription("Nouvelle conversation");
        plus.setClickable(true);
        plus.setOnClickListener(v -> go(actions::newConversation));
        plus.addView(icon(R.drawable.ic_site_plus_fort, theme.fgMuted), new LayoutParams(dp(18), dp(18), Gravity.CENTER));
        top.addView(plus, new LinearLayout.LayoutParams(dp(36), dp(36)));
        // Pas de croix : on referme en touchant la zone floutée à côté.
        panel.addView(top);

        // Administrateurs : bouton rose « Tableau de bord » (rounded-lg bg-accent px-3 py-2 text-sm font-medium),
        // placé en bas, juste au-dessus de « Mes documents » (voir fillAccount).
        adminBox = new LinearLayout(context);
        LinearLayout board = row(R.drawable.ic_site_dashboard, 18, theme.accentFg, "Tableau de bord", 14, 20, theme.medium, theme.accentFg, 8);
        board.setPadding(dp(12), dp(8), dp(12), dp(8));
        board.setBackground(round(theme.accent, 8));
        board.setOnClickListener(v -> go(() -> actions.openPage("/admin")));
        adminBox.addView(board, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        adminBox.setVisibility(GONE);

        // Historique : mt-5 flex-1 overflow-y-auto px-3.
        middle = new ScrollView(context);
        middle.setVerticalScrollBarEnabled(false);
        middle.setClipToPadding(false);
        items = new LinearLayout(context);
        items.setOrientation(LinearLayout.VERTICAL);
        items.setPadding(dp(12), 0, dp(12), dp(8));
        middle.addView(items);
        LinearLayout.LayoutParams middleParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f);
        middleParams.topMargin = dp(20);
        panel.addView(middle, middleParams);

        // Bas : border-t p-3 text-sm.
        View rule = new View(context);
        rule.setBackgroundColor(theme.border);
        panel.addView(rule, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, line));
        bottom = new LinearLayout(context);
        bottom.setOrientation(LinearLayout.VERTICAL);
        bottom.setPadding(dp(12), dp(12), dp(12), dp(12));
        panel.addView(bottom);

        popLayer = new FrameLayout(context);
        popLayer.setClickable(true);
        popLayer.setOnClickListener(v -> hidePopup());
        popLayer.setVisibility(GONE);
        addView(popLayer, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        sheetLayer = new FrameLayout(context);
        sheetLayer.setBackgroundColor(0x80000000);
        sheetLayer.setClickable(true);
        sheetLayer.setOnClickListener(v -> hideSheet());
        sheetLayer.setVisibility(GONE);
        addView(sheetLayer, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    // ----- Ouverture et fermeture -----

    boolean isOpen() {
        return getVisibility() == VISIBLE && !closing;
    }

    void open() {
        closing = false;
        dim.animate().cancel();
        panel.animate().cancel();
        setVisibility(VISIBLE);
        dim.setAlpha(0f);
        dim.animate().alpha(1f).setDuration(SLIDE_MS).start();
        panel.setTranslationX(-panelWidth);
        panel.animate().translationX(0f).setDuration(SLIDE_MS).setInterpolator(new DecelerateInterpolator()).start();
        blur(behind, true);
    }

    void close() {
        if (!isOpen()) return;
        closing = true;
        hideSheet();
        hidePopup();
        blur(behind, false);
        dim.animate().alpha(0f).setDuration(SLIDE_MS).start();
        panel.animate().translationX(-panelWidth).setDuration(SLIDE_MS).setInterpolator(new DecelerateInterpolator()).withEndAction(() -> {
            closing = false;
            setVisibility(GONE);
        }).start();
    }

    /** Bouton retour : ferme d'abord la fenêtre ou le petit menu ouvert. Faux s'il n'y en avait pas. */
    boolean dismissPopup() {
        if (sheetLayer.getVisibility() == VISIBLE) {
            hideSheet();
            return true;
        }
        if (popLayer.getVisibility() == VISIBLE) {
            hidePopup();
            return true;
        }
        return false;
    }

    /** Ferme le menu, puis fait l'action (le menu ne reste pas devant). */
    private void go(Runnable action) {
        close();
        action.run();
    }

    /** Glisser vers la gauche referme le menu, comme sur le site. */
    @Override
    public boolean dispatchTouchEvent(MotionEvent event) {
        if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
            downX = event.getRawX();
            downY = event.getRawY();
        } else if (event.getActionMasked() == MotionEvent.ACTION_UP && popLayer.getVisibility() != VISIBLE && sheetLayer.getVisibility() != VISIBLE) {
            float dx = event.getRawX() - downX;
            if (dx < -dp(60) && Math.abs(dx) > Math.abs(event.getRawY() - downY) * 1.5f) {
                MotionEvent cancel = MotionEvent.obtain(event);
                cancel.setAction(MotionEvent.ACTION_CANCEL);
                super.dispatchTouchEvent(cancel);
                cancel.recycle();
                close();
                return true;
            }
        }
        return super.dispatchTouchEvent(event);
    }

    // ----- Contenu -----

    /**
     * Remplit le menu. admin : le compte voit « Tableau de bord » ; documents : il voit « Mes
     * documents » ; balanceCents : solde du portefeuille, ou null si ce compte n'en a pas.
     */
    void show(JSONArray history, String currentId, String name, String email, boolean signedIn, boolean loading,
              boolean admin, boolean documents, Long balanceCents, boolean demo) {
        String wanted = history + "|" + currentId + "|" + name + "|" + email + "|" + signedIn + "|" + loading + "|" + admin + "|" + documents + "|" + balanceCents + "|" + demo;
        if (wanted.equals(shown)) return;
        shown = wanted;
        hidePopup();
        adminBox.setVisibility(signedIn && admin ? VISIBLE : GONE);
        fillHistory(history, currentId, signedIn, loading);
        bottom.removeAllViews();
        if (signedIn) fillAccount(name, email, documents, balanceCents, demo);
        else fillGuest();
    }

    private void fillHistory(JSONArray history, String currentId, boolean signedIn, boolean loading) {
        items.removeAllViews();
        // h2 : px-2 pb-2 text-xs font-medium tracking-wide text-fg-muted uppercase.
        TextView title = text("HISTORIQUE", 12, 16, theme.fgMuted, theme.medium);
        title.setLetterSpacing(0.025f);
        pad(title, 8, 0, 8, 8);
        items.addView(title);
        if (!signedIn) {
            items.addView(guestHistory());
            return;
        }
        if (history.length() == 0) {
            TextView empty = text(loading ? "Chargement…" : "Tes conversations enregistrées apparaîtront ici.", 14, 20, theme.fgMuted, theme.sans);
            pad(empty, 8, 0, 8, 0);
            items.addView(empty);
            return;
        }
        boolean first = true;
        for (int i = 0; i < history.length(); i++) {
            JSONObject conversation = history.optJSONObject(i);
            if (conversation == null) continue;
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            // space-y-0.5
            if (!first) params.topMargin = dp(2);
            first = false;
            items.addView(historyRow(conversation, conversation.optString("id").equals(currentId)), params);
        }
    }

    /** Une conversation (ConversationItem.tsx) : rounded-lg py-2 pr-9 pl-2 text-sm, surlignée si elle est ouverte. */
    private View historyRow(JSONObject conversation, boolean active) {
        String id = conversation.optString("id");
        String label = conversation.optString("title");
        if (label.isEmpty()) label = "Conversation";
        String name = label;
        boolean connect = "connect".equals(conversation.optString("source"));

        FrameLayout box = new FrameLayout(getContext());
        LinearLayout row = new LinearLayout(getContext());
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(8), dp(8), dp(36), dp(8));
        Runnable rest = () -> row.setBackground(active ? round(theme.bgMuted, 8) : pressable(8, theme.bgMuted));
        rest.run();
        TextView title = text(name, 14, 20, theme.fg, active ? theme.medium : theme.sans);
        title.setSingleLine(true);
        title.setEllipsize(TextUtils.TruncateAt.END);
        row.addView(title, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        if (connect) {
            // Conversation née dans Tamilya Connect : rounded-full border px-1.5 py-px text-[10px] font-medium, à 6 du titre.
            TextView tag = text("Connect", 10, 15, theme.fgMuted, theme.medium);
            pad(tag, 6, 1, 6, 1);
            GradientDrawable shape = round(Color.TRANSPARENT, 999);
            shape.setStroke(Math.max(1, dp(1)), theme.border);
            tag.setBackground(shape);
            tag.measure(MeasureSpec.UNSPECIFIED, MeasureSpec.UNSPECIFIED);
            // Le titre se coupe pour laisser la place à l'étiquette, qui reste collée à lui.
            title.setMaxWidth(Math.max(dp(40), panelWidth - Math.max(1, dp(1)) - dp(24 + 8 + 36 + 6) - tag.getMeasuredWidth()));
            LinearLayout.LayoutParams tagParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            tagParams.leftMargin = dp(6);
            row.addView(tag, tagParams);
        }
        row.setContentDescription(name + (connect ? " (Tamilya Connect)" : "") + ". Appui long pour supprimer.");
        row.setClickable(true);
        row.setOnClickListener(v -> go(() -> actions.openConversation(id)));
        Runnable more = () -> {
            row.setBackground(round(theme.bgMuted, 8));
            title.setTypeface(theme.medium);
            deletePopup(box, id, name, () -> {
                rest.run();
                title.setTypeface(active ? theme.medium : theme.sans);
            });
        };
        row.setOnLongClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS);
            more.run();
            return true;
        });
        box.addView(row, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        if (active) {
            // « ⋯ » : affiché seulement sur la conversation ouverte (right-1, p-1.5, icône de 16).
            FrameLayout dots = new FrameLayout(getContext());
            dots.setBackground(pressable(6, theme.bg));
            dots.setContentDescription("Actions pour « " + name + " »");
            dots.setClickable(true);
            dots.setOnClickListener(v -> more.run());
            dots.addView(icon(R.drawable.ic_site_dots, theme.fgMuted), new LayoutParams(dp(16), dp(16), Gravity.CENTER));
            LayoutParams dotsParams = new LayoutParams(dp(28), dp(28), Gravity.RIGHT | Gravity.CENTER_VERTICAL);
            dotsParams.rightMargin = dp(4);
            box.addView(dots, dotsParams);
        }
        return box;
    }

    /** Sans compte : cadre en pointillés « Historique réservé aux comptes » (rounded-xl border-dashed p-3 text-sm). */
    private View guestHistory() {
        LinearLayout box = new LinearLayout(getContext());
        box.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable shape = round(Color.TRANSPARENT, 12);
        shape.setStroke(Math.max(1, dp(1)), theme.border, dp(4), dp(3));
        box.setBackground(shape);
        box.setPadding(dp(12), dp(12), dp(12), dp(12));
        LinearLayout head = row(R.drawable.ic_site_lock, 16, theme.fg, "Historique réservé aux comptes", 14, 20, theme.medium, theme.fg, 8);
        head.setClickable(false);
        box.addView(head);
        TextView why = text("Crée un compte gratuit pour enregistrer tes conversations et les retrouver sur tous tes appareils.", 14, 20, theme.fgMuted, theme.sans);
        pad(why, 0, 4, 0, 0);
        box.addView(why);
        TextView create = text("Créer un compte ou se connecter", 14, 20, theme.accent, theme.medium);
        pad(create, 0, 12, 0, 0);
        create.setClickable(true);
        create.setOnClickListener(v -> go(actions::signIn));
        box.addView(create);
        return box;
    }

    /** Compte connecté : « Mes documents », puis la ligne du compte et le solde (AccountMenu.tsx). */
    private void fillAccount(String name, String email, boolean documents, Long balanceCents, boolean demo) {
        if (adminBox.getVisibility() == VISIBLE) {
            LinearLayout.LayoutParams adminParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            adminParams.bottomMargin = dp(4);
            bottom.addView(adminBox, adminParams);
        }
        if (documents) {
            // mb-1 flex gap-3 rounded-lg px-2 py-2 font-medium.
            LinearLayout docs = row(R.drawable.ic_site_folder, 18, theme.fg, "Mes documents", 14, 20, theme.medium, theme.fg, 12);
            docs.setPadding(dp(8), dp(8), dp(8), dp(8));
            docs.setBackground(pressable(8, theme.bgMuted));
            docs.setOnClickListener(v -> go(() -> actions.openPage("/documents")));
            LinearLayout.LayoutParams docsParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            docsParams.bottomMargin = dp(4);
            bottom.addView(docs, docsParams);
        }
        boolean hasName = name != null && !name.isEmpty();
        boolean hasEmail = email != null && !email.isEmpty();
        String who = hasName ? name : hasEmail ? email : "Mon compte";

        LinearLayout line = new LinearLayout(getContext());
        line.setOrientation(LinearLayout.HORIZONTAL);
        line.setGravity(Gravity.CENTER_VERTICAL);
        // Bouton du compte : pastille rose avec l'initiale (size-8), le nom (font-medium), les chevrons.
        LinearLayout trigger = new LinearLayout(getContext());
        trigger.setOrientation(LinearLayout.HORIZONTAL);
        trigger.setGravity(Gravity.CENTER_VERTICAL);
        trigger.setPadding(dp(8), dp(8), dp(8), dp(8));
        trigger.setBackground(pressable(8, theme.bgMuted));
        trigger.setContentDescription("Mon compte : " + who);
        trigger.setClickable(true);
        TextView initial = text(who.trim().isEmpty() ? "?" : who.trim().substring(0, 1).toUpperCase(Locale.FRANCE), 14, 20, theme.accentFg, theme.semibold);
        initial.setGravity(Gravity.CENTER);
        initial.setBackground(round(theme.accent, 999));
        trigger.addView(initial, new LinearLayout.LayoutParams(dp(32), dp(32)));
        TextView label = text(who, 14, 20, theme.fg, theme.medium);
        label.setSingleLine(true);
        label.setEllipsize(TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams labelParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        labelParams.leftMargin = dp(12);
        labelParams.rightMargin = dp(12);
        trigger.addView(label, labelParams);
        trigger.addView(icon(R.drawable.ic_site_chevrons, theme.fgMuted), new LinearLayout.LayoutParams(dp(16), dp(16)));
        trigger.setOnClickListener(v -> accountPopup(trigger, hasName && hasEmail ? email : null));
        line.addView(trigger, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        if (balanceCents != null) {
            // Solde : rounded-full border bg-bg px-2.5 py-1.5 text-xs font-semibold, icône rose de 14.
            LinearLayout wallet = row(R.drawable.ic_site_wallet, 14, theme.accent, euros(balanceCents), 12, 16, theme.semibold, theme.fg, 6);
            if (demo) {
                TextView mark = text("démo", 12, 16, theme.fgMuted, theme.sans);
                LinearLayout.LayoutParams markParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
                markParams.leftMargin = dp(6);
                wallet.addView(mark, markParams);
            }
            wallet.setPadding(dp(10), dp(6), dp(10), dp(6));
            GradientDrawable pill = round(theme.bg, 999);
            pill.setStroke(Math.max(1, dp(1)), theme.border);
            wallet.setBackground(pill);
            wallet.setContentDescription("Portefeuille : " + euros(balanceCents) + (demo ? " (solde fictif de démonstration)" : ""));
            wallet.setOnClickListener(v -> go(() -> actions.openPage("/portefeuille")));
            LinearLayout.LayoutParams walletParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            walletParams.leftMargin = dp(4);
            line.addView(wallet, walletParams);
        }
        bottom.addView(line);
    }

    /** Sans compte : Paramètres (avec le cadenas), le bouton rose « Se connecter », puis les deux liens. */
    private void fillGuest() {
        LinearLayout settings = row(R.drawable.ic_site_settings, 18, theme.fg, "Paramètres", 14, 20, theme.sans, theme.fg, 8);
        settings.addView(new View(getContext()), new LinearLayout.LayoutParams(0, 1, 1f));
        settings.addView(icon(R.drawable.ic_site_lock, theme.fgMuted), new LinearLayout.LayoutParams(dp(14), dp(14)));
        settings.setPadding(dp(8), dp(8), dp(8), dp(8));
        settings.setBackground(pressable(8, theme.bgMuted));
        settings.setOnClickListener(v -> go(actions::signIn));
        bottom.addView(settings);
        TextView login = text("Se connecter", 14, 20, theme.accentFg, theme.medium);
        login.setGravity(Gravity.CENTER);
        pad(login, 12, 8, 12, 8);
        login.setBackground(round(theme.accent, 8));
        login.setClickable(true);
        login.setOnClickListener(v -> go(actions::signIn));
        LinearLayout.LayoutParams loginParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        loginParams.topMargin = dp(4);
        bottom.addView(login, loginParams);
        bottom.addView(smallLink("Conditions d'utilisation", 8, "/conditions"));
        bottom.addView(smallLink("Données et confidentialité", 4, "/confidentialite"));
    }

    private TextView smallLink(String label, int topDp, String path) {
        TextView link = text(label, 12, 16, theme.fgMuted, theme.sans);
        pad(link, 8, topDp, 8, 0);
        link.setClickable(true);
        link.setOnClickListener(v -> go(() -> actions.openPage(path)));
        return link;
    }

    // ----- Petits menus -----

    /** « Supprimer », sous la ligne : w-48 rounded-xl border bg-bg p-1 shadow-xl. */
    private void deletePopup(View anchor, String id, String name, Runnable gone) {
        LinearLayout card = card(4);
        LinearLayout delete = row(R.drawable.ic_site_trash, 16, theme.danger, "Supprimer", 14, 20, theme.medium, theme.danger, 10);
        delete.setPadding(dp(12), dp(10), dp(12), dp(10));
        delete.setBackground(pressable(8, theme.dangerSoft));
        delete.setOnClickListener(v -> {
            hidePopup();
            sheet(R.drawable.ic_site_trash, true, "Supprimer cette conversation ?", "« " + name + " » sera effacée définitivement.",
                    "Supprimer", true, () -> actions.deleteConversation(id));
        });
        card.addView(delete, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        int[] at = place(anchor);
        int left = at[0] + anchor.getWidth() - dp(4) - dp(192);
        int below = at[1] + anchor.getHeight() + dp(4);
        // Trop bas : le menu passe au-dessus de la ligne.
        if (below + dp(56) > getHeight()) popup(card, dp(192), left, -1, getHeight() - at[1] + dp(4), Color.TRANSPARENT, gone);
        else popup(card, dp(192), left, below, -1, Color.TRANSPARENT, gone);
    }

    /** Menu du compte, au-dessus de sa ligne : rounded-xl border bg-bg p-1.5 shadow-xl, page assombrie et floutée derrière. */
    private void accountPopup(View trigger, String email) {
        LinearLayout card = card(6);
        if (email != null) {
            TextView mail = text(email, 12, 16, theme.fgMuted, theme.sans);
            mail.setSingleLine(true);
            mail.setEllipsize(TextUtils.TruncateAt.END);
            pad(mail, 12, 6, 12, 8);
            card.addView(mail);
        }
        card.addView(menuItem(R.drawable.ic_site_settings, "Paramètres", () -> actions.openPage("/parametres")));
        card.addView(menuItem(R.drawable.ic_site_gauge, "Utilisation", () -> actions.openPage("/utilisation")));
        card.addView(menuItem(R.drawable.ic_site_help, "Obtenir de l'aide", actions::help));
        View rule = new View(getContext());
        rule.setBackgroundColor(theme.border);
        LinearLayout.LayoutParams ruleParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Math.max(1, dp(1)));
        ruleParams.topMargin = dp(4);
        ruleParams.bottomMargin = dp(4);
        card.addView(rule, ruleParams);
        card.addView(menuItem(R.drawable.ic_site_logout, "Se déconnecter", () -> actions.openPage("/?deconnexion=1")));
        int[] at = place(trigger);
        trigger.setBackground(round(theme.bgMuted, 8));
        blur(panel, true);
        popup(card, Math.max(trigger.getWidth(), dp(256)), at[0], -1, getHeight() - at[1] + dp(8), 0x40000000, () -> {
            trigger.setBackground(pressable(8, theme.bgMuted));
            blur(panel, false);
        });
    }

    /** Ligne du menu du compte : flex gap-3 rounded-lg px-3 py-2, icône de 18. */
    private View menuItem(int iconId, String label, Runnable action) {
        LinearLayout item = row(iconId, 18, theme.fg, label, 16, 24, theme.sans, theme.fg, 12);
        item.setPadding(dp(12), dp(8), dp(12), dp(8));
        item.setBackground(pressable(8, theme.bgMuted));
        item.setOnClickListener(v -> go(action));
        return item;
    }

    private LinearLayout card(int padDp) {
        LinearLayout card = new LinearLayout(getContext());
        card.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable shape = round(theme.bg, 12);
        shape.setStroke(Math.max(1, dp(1)), theme.border);
        card.setBackground(shape);
        card.setPadding(dp(padDp), dp(padDp), dp(padDp), dp(padDp));
        card.setElevation(dp(12));
        card.setClickable(true);
        return card;
    }

    /** Place d'une vue dans le menu (coin haut gauche, en pixels). */
    private int[] place(View view) {
        int[] at = new int[2];
        int[] me = new int[2];
        view.getLocationInWindow(at);
        getLocationInWindow(me);
        return new int[]{at[0] - me[0], at[1] - me[1]};
    }

    /** Affiche un petit menu : à « top » du haut, ou à « bottom » du bas quand top vaut -1. */
    private void popup(View card, int width, int left, int top, int bottomEdge, int dimColor, Runnable gone) {
        hidePopup();
        popupGone = gone;
        popLayer.setBackgroundColor(dimColor);
        LayoutParams params = new LayoutParams(width, ViewGroup.LayoutParams.WRAP_CONTENT, (top < 0 ? Gravity.BOTTOM : Gravity.TOP) | Gravity.LEFT);
        params.leftMargin = Math.max(dp(4), left);
        if (top < 0) params.bottomMargin = bottomEdge;
        else params.topMargin = top;
        popLayer.addView(card, params);
        popLayer.setAlpha(0f);
        popLayer.setVisibility(VISIBLE);
        popLayer.animate().alpha(1f).setDuration(120).start();
    }

    private void hidePopup() {
        if (popLayer.getVisibility() != VISIBLE) return;
        popLayer.animate().cancel();
        popLayer.setVisibility(GONE);
        popLayer.removeAllViews();
        Runnable gone = popupGone;
        popupGone = null;
        if (gone != null) gone.run();
    }

    // ----- Fenêtre de confirmation -----

    /** Message d'erreur dans la fenêtre du site (alertDialog). */
    void alert(String title, String message) {
        sheet(R.drawable.ic_site_offline, false, title, message, "Compris", false, null);
    }

    /**
     * Fenêtre du site (ConfirmDialog.tsx) : en bas de l'écran sur téléphone (coins hauts arrondis,
     * petite poignée), centrée sur tablette. Fond bg-black/50 ; un appui dessus annule.
     */
    private void sheet(int iconId, boolean danger, String title, String message, String confirmLabel, boolean cancel, Runnable onConfirm) {
        sheetLayer.animate().cancel();
        sheetLayer.removeAllViews();
        boolean wide = theme.wide;
        LinearLayout box = new LinearLayout(getContext());
        box.setOrientation(LinearLayout.VERTICAL);
        box.setClickable(true);
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(theme.bg);
        shape.setStroke(Math.max(1, dp(1)), theme.border);
        float r = dp(24);
        shape.setCornerRadii(wide ? new float[]{r, r, r, r, r, r, r, r} : new float[]{r, r, r, r, 0, 0, 0, 0});
        box.setBackground(shape);
        box.setElevation(dp(16));
        box.setPadding(dp(24), dp(wide ? 24 : 16), dp(24), dp(24));
        if (!wide) {
            View handle = new View(getContext());
            handle.setBackground(round(theme.border, 999));
            LinearLayout.LayoutParams handleParams = new LinearLayout.LayoutParams(dp(40), dp(4));
            handleParams.gravity = Gravity.CENTER_HORIZONTAL;
            handleParams.bottomMargin = dp(16);
            box.addView(handle, handleParams);
        }
        LinearLayout head = new LinearLayout(getContext());
        head.setOrientation(LinearLayout.HORIZONTAL);
        FrameLayout mark = new FrameLayout(getContext());
        mark.setBackground(round(danger ? theme.dangerSoft : theme.accentSoft, 16));
        mark.addView(icon(iconId, danger ? theme.danger : theme.accent), new LayoutParams(dp(22), dp(22), Gravity.CENTER));
        head.addView(mark, new LinearLayout.LayoutParams(dp(44), dp(44)));
        LinearLayout words = new LinearLayout(getContext());
        words.setOrientation(LinearLayout.VERTICAL);
        words.setPadding(0, dp(2), 0, 0);
        words.addView(text(title, 16, 22, theme.fg, theme.semibold));
        if (message != null && !message.isEmpty()) {
            TextView detail = text(message, 14, 22.75f, theme.fgMuted, theme.sans);
            pad(detail, 0, 6, 0, 0);
            words.addView(detail);
        }
        LinearLayout.LayoutParams wordsParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        wordsParams.leftMargin = dp(16);
        head.addView(words, wordsParams);
        box.addView(head);

        // Boutons : rounded-xl px-4 py-2.5 text-sm font-medium ; l'un sous l'autre sur téléphone, à droite sur tablette.
        TextView confirm = text(confirmLabel, 14, 20, danger ? (theme.dark ? 0xFF2A0A07 : Color.WHITE) : theme.accentFg, theme.medium);
        confirm.setGravity(Gravity.CENTER);
        pad(confirm, 16, 10, 16, 10);
        confirm.setBackground(round(danger ? theme.danger : theme.accent, 12));
        confirm.setClickable(true);
        confirm.setOnClickListener(v -> {
            hideSheet();
            if (onConfirm != null) onConfirm.run();
        });
        TextView back = null;
        if (cancel) {
            back = text("Annuler", 14, 20, theme.fg, theme.medium);
            back.setGravity(Gravity.CENTER);
            pad(back, 16, 10, 16, 10);
            GradientDrawable outline = round(Color.TRANSPARENT, 12);
            outline.setStroke(Math.max(1, dp(1)), theme.border);
            StateListDrawable backShape = new StateListDrawable();
            GradientDrawable pressed = round(theme.bgMuted, 12);
            pressed.setStroke(Math.max(1, dp(1)), theme.border);
            backShape.addState(new int[]{android.R.attr.state_pressed}, pressed);
            backShape.addState(new int[]{}, outline);
            back.setBackground(backShape);
            back.setClickable(true);
            back.setOnClickListener(v -> hideSheet());
        }
        LinearLayout buttons = new LinearLayout(getContext());
        if (wide) {
            buttons.setOrientation(LinearLayout.HORIZONTAL);
            buttons.setGravity(Gravity.RIGHT);
            if (back != null) buttons.addView(back);
            LinearLayout.LayoutParams confirmParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            if (back != null) confirmParams.leftMargin = dp(8);
            buttons.addView(confirm, confirmParams);
        } else {
            buttons.setOrientation(LinearLayout.VERTICAL);
            buttons.addView(confirm, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
            if (back != null) {
                LinearLayout.LayoutParams backParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
                backParams.topMargin = dp(8);
                buttons.addView(back, backParams);
            }
        }
        LinearLayout.LayoutParams buttonsParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        buttonsParams.topMargin = dp(24);
        box.addView(buttons, buttonsParams);

        LayoutParams boxParams = wide
                ? new LayoutParams(Math.min(dp(448), getWidth() - dp(32)), ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER)
                : new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM);
        sheetLayer.addView(box, boxParams);
        sheetLayer.setAlpha(0f);
        sheetLayer.setVisibility(VISIBLE);
        sheetLayer.animate().alpha(1f).setDuration(160).withEndAction(null).start();
        box.setTranslationY(dp(wide ? 12 : 48));
        box.animate().translationY(0f).setDuration(SLIDE_MS).setInterpolator(new DecelerateInterpolator()).start();
    }

    private void hideSheet() {
        if (sheetLayer.getVisibility() != VISIBLE) return;
        sheetLayer.animate().cancel();
        sheetLayer.setVisibility(GONE);
        sheetLayer.removeAllViews();
    }

    // ----- Petits éléments -----

    /** Icône puis texte sur une ligne, centrés en hauteur (flex items-center gap-…). */
    private LinearLayout row(int iconId, int iconDp, int iconColor, String label, float sizeDp, float lineDp, Typeface face, int color, int gapDp) {
        LinearLayout row = new LinearLayout(getContext());
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setClickable(true);
        row.addView(icon(iconId, iconColor), new LinearLayout.LayoutParams(dp(iconDp), dp(iconDp)));
        TextView text = text(label, sizeDp, lineDp, color, face);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.leftMargin = dp(gapDp);
        row.addView(text, params);
        return row;
    }

    /** Fond qui passe à la couleur donnée sous le doigt (le « hover » du site). */
    private Drawable pressable(int radiusDp, int pressedColor) {
        StateListDrawable shape = new StateListDrawable();
        shape.addState(new int[]{android.R.attr.state_pressed}, round(pressedColor, radiusDp));
        shape.addState(new int[]{}, new ColorDrawable(Color.TRANSPARENT));
        return shape;
    }

    /** Flou de 8 px du site (backdrop-blur-sm), à partir d'Android 12. */
    private void blur(View view, boolean on) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return;
        view.setRenderEffect(on ? RenderEffect.createBlurEffect(dpf(13), dpf(13), Shader.TileMode.CLAMP) : null);
    }

    /** 1234 → « 12,34 € », comme formatEuros sur le site. */
    private static String euros(long cents) {
        return String.format(Locale.FRANCE, "%,.2f €", cents / 100.0);
    }

    /** Icône du site (vecteur blanc) teintée. */
    private ImageView icon(int id, int color) {
        ImageView view = new ImageView(getContext());
        view.setImageResource(id);
        view.setColorFilter(color, PorterDuff.Mode.SRC_IN);
        view.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        return view;
    }

    /** Texte aux mesures du CSS : corps et interligne en dp, comme dans HomeScreen. */
    private TextView text(String value, float sizeDp, float lineDp, int color, Typeface face) {
        TextView view = new TextView(getContext());
        view.setText(value);
        view.setTextSize(TypedValue.COMPLEX_UNIT_DIP, sizeDp);
        view.setTextColor(color);
        view.setTypeface(face);
        view.setIncludeFontPadding(false);
        Paint.FontMetrics metrics = view.getPaint().getFontMetrics();
        float extra = dpf(lineDp) - (metrics.descent - metrics.ascent);
        view.setLineSpacing(extra, 1f);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) view.setFallbackLineSpacing(false);
        view.setTag(extra);
        pad(view, 0, 0, 0, 0);
        return view;
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

    private int dp(int value) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics()));
    }

    private float dpf(float value) {
        return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics());
    }
}
