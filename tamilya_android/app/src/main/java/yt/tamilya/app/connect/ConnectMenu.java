package yt.tamilya.app.connect;

import android.app.Dialog;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Locale;

/**
 * Le menu des trois barres de Tamilya Connect : le même que dans Tamilya (Sidebar.tsx et
 * AccountMenu.tsx du site). En haut le nom et le « + », au milieu l'historique, en bas le
 * compte et le solde ; le compte ouvre Mes documents, Paramètres, Utilisation, Aide et
 * Se déconnecter. Le nom et le solde sont ceux lus au dernier passage avec internet.
 * Il glisse depuis la gauche, et se referme en touchant à côté, en glissant vers la gauche
 * ou avec le bouton retour.
 */
final class ConnectMenu {
    private static final int CREAM = Color.parseColor("#F5F0E6");
    private static final int MUTED = Color.parseColor("#8E9398");
    private static final int ACCENT = Color.parseColor("#F06A9B");
    private static final int PANEL = Color.parseColor("#161819");
    private static final int LINE = Color.parseColor("#2B2E33");
    private static final int MENU = Color.parseColor("#1D1F21");
    private static final int SLIDE_MS = 200;

    private final Context context;
    private final ConnectScreen screen;
    private final ConnectScreen.Actions actions;
    private final Dialog dialog;
    private final View dim;
    private final LinearLayout panel;
    private boolean leaving;

    ConnectMenu(Context context, ConnectScreen screen, ConnectScreen.Actions actions) {
        this.context = context;
        this.screen = screen;
        this.actions = actions;
        dialog = new Dialog(context, android.R.style.Theme_Translucent_NoTitleBar);
        dialog.setOnKeyListener((d, key, event) -> {
            if (key == android.view.KeyEvent.KEYCODE_BACK && event.getAction() == android.view.KeyEvent.ACTION_UP) {
                close();
                return true;
            }
            return false;
        });

        Swipe root = new Swipe(context);
        dim = new View(context);
        dim.setBackgroundColor(Color.argb(102, 0, 0, 0));
        dim.setOnClickListener(v -> close());
        root.addView(dim, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        panel = new LinearLayout(context);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setBackgroundColor(PANEL);
        panel.setClickable(true);
        panel.setPadding(0, statusBar(), 0, navigationBar());
        int width = Math.min(dp(288), Math.round(context.getResources().getDisplayMetrics().widthPixels * 0.85f));
        root.addView(panel, new FrameLayout.LayoutParams(width, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.START));
        dialog.setContentView(root);

        Window window = dialog.getWindow();
        if (window != null) {
            window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
            window.addFlags(WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS);
            window.setStatusBarColor(Color.TRANSPARENT);
            window.setNavigationBarColor(Color.TRANSPARENT);
        }
    }

    void show(JSONArray history, String currentId, JSONObject account) {
        panel.removeAllViews();
        panel.addView(top());
        panel.addView(historyTitle());
        panel.addView(historyList(history, currentId), new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        panel.addView(bottom(account));
        dialog.show();
        // Glisse depuis la gauche, le fond s'assombrit.
        panel.post(() -> {
            panel.setTranslationX(-panel.getWidth());
            panel.animate().translationX(0).setDuration(SLIDE_MS).start();
        });
        dim.setAlpha(0f);
        dim.animate().alpha(1f).setDuration(SLIDE_MS).start();
    }

    private void close() {
        if (leaving) return;
        leaving = true;
        dim.animate().alpha(0f).setDuration(SLIDE_MS).start();
        panel.animate().translationX(-panel.getWidth()).setDuration(SLIDE_MS).withEndAction(dialog::dismiss).start();
    }

    /** Ferme le menu, puis fait l'action (le menu ne reste pas devant). */
    private View.OnClickListener then(Runnable action) {
        return v -> {
            close();
            panel.postDelayed(action, SLIDE_MS);
        };
    }

    // --- Haut : le nom, le « + », la croix du menu

    private View top() {
        LinearLayout row = new LinearLayout(context);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(16), dp(16), dp(8), dp(12));
        TextView brand = text("Tamilya", 20, CREAM);
        brand.setTypeface(brand.getTypeface(), Typeface.BOLD);
        row.addView(brand, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        TextView plus = text("+", 22, Color.WHITE);
        plus.setGravity(Gravity.CENTER);
        plus.setBackground(round(ACCENT, 20));
        plus.setContentDescription("Nouvelle conversation");
        plus.setClickable(true);
        plus.setOnClickListener(then(actions::newConversation));
        row.addView(plus, new LinearLayout.LayoutParams(dp(40), dp(40)));

        TextView cross = text("✕", 18, MUTED);
        cross.setGravity(Gravity.CENTER);
        cross.setContentDescription("Fermer le menu");
        cross.setClickable(true);
        cross.setOnClickListener(v -> close());
        LinearLayout.LayoutParams crossParams = new LinearLayout.LayoutParams(dp(40), dp(40));
        crossParams.leftMargin = dp(6);
        row.addView(cross, crossParams);
        return row;
    }

    // --- Milieu : l'historique

    private View historyTitle() {
        TextView title = text("HISTORIQUE", 12, MUTED);
        title.setLetterSpacing(0.08f);
        title.setPadding(dp(20), dp(12), dp(20), dp(8));
        return title;
    }

    private View historyList(JSONArray history, String currentId) {
        ScrollView scroll = new ScrollView(context);
        LinearLayout list = new LinearLayout(context);
        list.setOrientation(LinearLayout.VERTICAL);
        list.setPadding(dp(12), 0, dp(12), dp(8));
        if (history.length() == 0) {
            TextView empty = text("Tes conversations enregistrées apparaîtront ici. Il faut internet une première fois pour les récupérer.", 14, MUTED);
            empty.setPadding(dp(8), 0, dp(8), 0);
            list.addView(empty);
        }
        for (int i = 0; i < history.length(); i++) {
            JSONObject item = history.optJSONObject(i);
            if (item == null) continue;
            String id = item.optString("id");
            View box = screen.historyRow(item, id.equals(currentId));
            // Même ligne que dans Connect ; le menu se ferme avant d'ouvrir ou de supprimer.
            if (box instanceof ViewGroup && ((ViewGroup) box).getChildCount() > 0) {
                ViewGroup row = (ViewGroup) ((ViewGroup) box).getChildAt(0);
                row.setOnClickListener(then(() -> actions.openConversation(id)));
                View trash = row.getChildAt(row.getChildCount() - 1);
                if (trash != null && trash.isClickable()) trash.setOnClickListener(then(() -> actions.deleteConversation(id)));
            }
            list.addView(box);
        }
        scroll.addView(list);
        return scroll;
    }

    // --- Bas : le compte et le solde

    private View bottom(JSONObject account) {
        LinearLayout box = new LinearLayout(context);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(12), dp(8), dp(12), dp(12));
        View separator = new View(context);
        separator.setBackgroundColor(LINE);
        box.addView(separator, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 1));

        String name = account.optString("name", "");
        String email = account.optString("email", "");
        if (name.isEmpty() && email.isEmpty()) {
            // Pas encore de compte connu sur ce téléphone : comme sur le site sans compte.
            box.addView(item("Paramètres", () -> actions.openPage("/parametres")));
            TextView login = text("Se connecter", 15, Color.WHITE);
            login.setTypeface(login.getTypeface(), Typeface.BOLD);
            login.setGravity(Gravity.CENTER);
            login.setPadding(dp(12), dp(10), dp(12), dp(10));
            login.setBackground(round(ACCENT, 10));
            login.setClickable(true);
            login.setOnClickListener(then(() -> actions.openPage("/")));
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            params.topMargin = dp(4);
            box.addView(login, params);
            return box;
        }

        // Menu du compte, au-dessus de la ligne du compte, ouvert en la touchant.
        LinearLayout menu = new LinearLayout(context);
        menu.setOrientation(LinearLayout.VERTICAL);
        menu.setBackground(round(MENU, 12));
        menu.setPadding(dp(6), dp(6), dp(6), dp(6));
        menu.setVisibility(View.GONE);
        if (!name.isEmpty() && !email.isEmpty()) {
            TextView mail = text(email, 12, MUTED);
            mail.setSingleLine(true);
            mail.setEllipsize(TextUtils.TruncateAt.END);
            mail.setPadding(dp(12), dp(6), dp(12), dp(8));
            menu.addView(mail);
        }
        menu.addView(item("Mes documents", () -> actions.openPage("/documents")));
        menu.addView(item("Paramètres", () -> actions.openPage("/parametres")));
        menu.addView(item("Utilisation", () -> actions.openPage("/utilisation")));
        menu.addView(item("Obtenir de l'aide", () -> actions.openPage("/aide")));
        View rule = new View(context);
        rule.setBackgroundColor(LINE);
        LinearLayout.LayoutParams ruleParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 1);
        ruleParams.topMargin = dp(4);
        ruleParams.bottomMargin = dp(4);
        menu.addView(rule, ruleParams);
        menu.addView(item("Se déconnecter", () -> actions.openPage("/?deconnexion=1")));
        LinearLayout.LayoutParams menuParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        menuParams.topMargin = dp(8);
        box.addView(menu, menuParams);

        LinearLayout row = new LinearLayout(context);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, dp(8), 0, 0);

        LinearLayout who = new LinearLayout(context);
        who.setOrientation(LinearLayout.HORIZONTAL);
        who.setGravity(Gravity.CENTER_VERTICAL);
        who.setPadding(dp(8), dp(8), dp(8), dp(8));
        who.setClickable(true);
        who.setContentDescription("Mon compte");
        String shown = name.isEmpty() ? email : name;
        TextView initial = text(shown.substring(0, 1).toUpperCase(Locale.FRANCE), 14, Color.WHITE);
        initial.setTypeface(initial.getTypeface(), Typeface.BOLD);
        initial.setGravity(Gravity.CENTER);
        initial.setBackground(round(ACCENT, 16));
        who.addView(initial, new LinearLayout.LayoutParams(dp(32), dp(32)));
        TextView label = text(shown, 15, CREAM);
        label.setTypeface(label.getTypeface(), Typeface.BOLD);
        label.setSingleLine(true);
        label.setEllipsize(TextUtils.TruncateAt.END);
        label.setPadding(dp(12), 0, dp(4), 0);
        who.addView(label, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        TextView chevron = text("⌃⌄", 12, MUTED);
        who.addView(chevron);
        who.setOnClickListener(v -> {
            boolean open = menu.getVisibility() != View.VISIBLE;
            menu.setVisibility(open ? View.VISIBLE : View.GONE);
            who.setBackground(open ? round(MENU, 10) : null);
        });
        row.addView(who, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        // Solde du portefeuille : il ouvre le portefeuille, comme sur le site.
        boolean known = account.has("balanceCents") && !account.isNull("balanceCents");
        String balance = known ? euros(account.optLong("balanceCents")) : "—";
        TextView wallet = text(account.optBoolean("demo") ? balance + "  démo" : balance, 12, CREAM);
        wallet.setTypeface(wallet.getTypeface(), Typeface.BOLD);
        wallet.setPadding(dp(10), dp(6), dp(10), dp(6));
        GradientDrawable pill = round(PANEL, 16);
        pill.setStroke(dp(1), LINE);
        wallet.setBackground(pill);
        wallet.setClickable(true);
        wallet.setContentDescription(known ? "Portefeuille : " + balance : "Portefeuille");
        wallet.setOnClickListener(then(() -> actions.openPage("/portefeuille")));
        LinearLayout.LayoutParams walletParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        walletParams.leftMargin = dp(4);
        row.addView(wallet, walletParams);
        box.addView(row);
        return box;
    }

    private View item(String label, Runnable action) {
        TextView view = text(label, 15, CREAM);
        view.setPadding(dp(12), dp(10), dp(12), dp(10));
        view.setClickable(true);
        view.setOnClickListener(then(action));
        return view;
    }

    /** 1234 → « 12,34 € », comme formatEuros sur le site. */
    static String euros(long cents) {
        return String.format(Locale.FRANCE, "%,.2f €", cents / 100.0).replace(' ', ' ').replace(' ', ' ');
    }

    /** Glisser vers la gauche referme le menu, comme sur le site. */
    private final class Swipe extends FrameLayout {
        private float startX;
        private float startY;

        Swipe(Context context) {
            super(context);
        }

        @Override
        public boolean dispatchTouchEvent(MotionEvent event) {
            if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
                startX = event.getRawX();
                startY = event.getRawY();
            } else if (event.getActionMasked() == MotionEvent.ACTION_UP) {
                float dx = event.getRawX() - startX;
                if (dx < -dp(60) && Math.abs(dx) > Math.abs(event.getRawY() - startY) * 1.5f) {
                    close();
                    return true;
                }
            }
            return super.dispatchTouchEvent(event);
        }
    }

    private TextView text(String value, int sp, int color) {
        TextView view = new TextView(context);
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

    private int statusBar() {
        int id = context.getResources().getIdentifier("status_bar_height", "dimen", "android");
        return id > 0 ? context.getResources().getDimensionPixelSize(id) : dp(24);
    }

    private int navigationBar() {
        int id = context.getResources().getIdentifier("navigation_bar_height", "dimen", "android");
        return id > 0 ? context.getResources().getDimensionPixelSize(id) : 0;
    }

    private int dp(int value) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, context.getResources().getDisplayMetrics()));
    }
}
