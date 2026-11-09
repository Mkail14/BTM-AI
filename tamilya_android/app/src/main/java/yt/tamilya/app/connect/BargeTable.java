package yt.tamilya.app.connect;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

import yt.tamilya.app.R;

/**
 * Tableau de tickets de barge de Tamilya Connect, rangé dans l'APK : sans internet, le serveur
 * n'envoie qu'un signal (table « barge ») et les tickets demandés ; l'app dessine le reste,
 * comme le tableau du site (src/components/chat/BargeTickets.tsx). Le serveur recalcule
 * toujours le prix au paiement : les prix d'ici ne servent qu'à l'affichage.
 */
final class BargeTable {
    static final String FROM = "Mamoudzou";
    static final String TO = "Dzaoudzi";
    static final int MAX_QUANTITY = 20;

    static final class Ticket {
        final String id;
        final String label;
        final String detail;
        final int cents;
        final int icon;

        Ticket(String id, String label, String detail, int cents, int icon) {
            this.id = id;
            this.label = label;
            this.detail = detail;
            this.cents = cents;
            this.icon = icon;
        }

        /** « Poids lourd (3,5 t à 15 t) », sinon le nom seul. */
        String name() {
            return "Poids lourd".equals(label) ? label + " (" + detail + ")" : label;
        }
    }

    /** Même catalogue que le site (src/lib/barge/catalog.ts). */
    static final Ticket[] TICKETS = {
            new Ticket("pieton", "Piéton", "Ticket unitaire", 100, R.drawable.ic_barge_pieton),
            new Ticket("velo", "Vélo ou cyclomoteur", "Moins de 125 cm³", 200, R.drawable.ic_barge_velo),
            new Ticket("moto", "Moto", "Plus de 125 cm³", 300, R.drawable.ic_barge_moto),
            new Ticket("voiture", "Voiture", "Véhicule léger", 1500, R.drawable.ic_barge_voiture),
            new Ticket("utilitaire", "Utilitaire", "Moins de 3,5 t", 3000, R.drawable.ic_barge_utilitaire),
            new Ticket("pl-15", "Poids lourd", "3,5 t à 15 t", 7500, R.drawable.ic_barge_camion),
            new Ticket("pl-26", "Poids lourd", "15 t à 26 t", 10_000, R.drawable.ic_barge_camion),
            new Ticket("pl-max", "Poids lourd", "Plus de 26 t", 12_200, R.drawable.ic_barge_camion),
    };

    interface Pay {
        /** « Payer » touché : tickets choisis (jamais de prix) et le résumé affiché. */
        void pay(JSONArray cart, String label);
    }

    // Couleurs écrites en chiffres (et non Color.parseColor) : les tests sans téléphone peuvent charger la classe.
    private static final int CREAM = 0xFFF5F0E6;
    private static final int MUTED = 0xFF8E9398;
    private static final int ACCENT = 0xFFF06A9B;
    private static final int CARD = 0xFF1D1F21;
    private static final int SURFACE = 0xFF2B2E33;
    private static final int AMBER = 0xFFF2B84B;

    static Ticket find(String id) {
        for (Ticket t : TICKETS) if (t.id.equals(id)) return t;
        return null;
    }

    /** Panier proposé par le serveur ; tickets inconnus ignorés, quantités bornées. */
    static LinkedHashMap<String, Integer> cartOf(JSONObject choice) {
        LinkedHashMap<String, Integer> cart = new LinkedHashMap<>();
        JSONArray lines = choice.optJSONArray("cart");
        for (int i = 0; lines != null && i < lines.length(); i++) {
            JSONObject line = lines.optJSONObject(i);
            if (line == null || find(line.optString("ticketId")) == null) continue;
            int quantity = Math.max(0, Math.min(MAX_QUANTITY, line.optInt("quantity")));
            if (quantity > 0) cart.put(line.optString("ticketId"), quantity);
        }
        return cart;
    }

    static int count(Map<String, Integer> cart) {
        int n = 0;
        for (int q : cart.values()) n += q;
        return n;
    }

    static int total(Map<String, Integer> cart) {
        int cents = 0;
        for (Map.Entry<String, Integer> e : cart.entrySet()) {
            Ticket t = find(e.getKey());
            if (t != null) cents += t.cents * e.getValue();
        }
        return cents;
    }

    /** « 15 € », « 2,50 € » (comme formatEuros du site). */
    static String euros(int cents) {
        if (cents % 100 == 0) return (cents / 100) + " €";
        return String.format(Locale.FRANCE, "%.2f €", cents / 100.0);
    }

    /** « Barge Mamoudzou → Dzaoudzi : 2× Piéton, 1× Voiture · 17 € » */
    static String summary(Map<String, Integer> cart) {
        StringBuilder what = new StringBuilder();
        for (Map.Entry<String, Integer> e : cart.entrySet()) {
            Ticket t = find(e.getKey());
            if (t == null || e.getValue() <= 0) continue;
            if (what.length() > 0) what.append(", ");
            what.append(e.getValue()).append("× ").append(t.name());
        }
        return "Barge " + FROM + " → " + TO + " : " + what + " · " + euros(total(cart));
    }

    static JSONArray toJson(Map<String, Integer> cart) {
        JSONArray lines = new JSONArray();
        for (Map.Entry<String, Integer> e : cart.entrySet()) {
            if (e.getValue() <= 0) continue;
            try {
                lines.put(new JSONObject().put("ticketId", e.getKey()).put("quantity", (int) e.getValue()));
            } catch (JSONException ignored) {
                // Clés fixes : n'arrive pas.
            }
        }
        return lines;
    }

    private final Context context;
    private final LinkedHashMap<String, Integer> cart;
    private final Pay pay;
    private final LinearLayout root;
    private boolean others;

    /** cart est gardé par l'écran : les quantités restent si la liste est redessinée. */
    BargeTable(Context context, LinkedHashMap<String, Integer> cart, Pay pay) {
        this.context = context;
        this.cart = cart;
        this.pay = pay;
        root = new LinearLayout(context);
        root.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable card = round(CARD, 24);
        card.setStroke(dp(1), SURFACE);
        root.setBackground(card);
        root.setContentDescription("Acheter un ticket de barge");
        fill();
    }

    View view() {
        return root;
    }

    private void change(String id, int delta) {
        Integer now = cart.get(id);
        int next = Math.max(0, Math.min(MAX_QUANTITY, (now == null ? 0 : now) + delta));
        if (next == 0) cart.remove(id);
        else cart.put(id, next);
        fill();
    }

    private void fill() {
        root.removeAllViews();

        // Trajet, en une ligne.
        LinearLayout head = row();
        head.setPadding(dp(14), dp(14), dp(14), 0);
        head.addView(iconBox(R.drawable.ic_barge_bateau, 40), new LinearLayout.LayoutParams(dp(40), dp(40)));
        LinearLayout titles = column();
        titles.setPadding(dp(12), 0, dp(8), 0);
        TextView route = text(FROM + " → " + TO, 15, CREAM);
        route.setTypeface(route.getTypeface(), Typeface.BOLD);
        titles.addView(route);
        titles.addView(text("Sans date · valable jusqu'au scan", 12, MUTED));
        head.addView(titles, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        TextView demo = text("Démo", 10, AMBER);
        demo.setTypeface(demo.getTypeface(), Typeface.BOLD);
        demo.setPadding(dp(8), dp(2), dp(8), dp(2));
        demo.setBackground(round(Color.argb(40, 242, 184, 75), 10));
        head.addView(demo);
        root.addView(head);

        // Tickets demandés, et rien d'autre.
        LinearLayout lines = column();
        if (cart.isEmpty()) {
            TextView none = text("Aucun ticket : ajoute une personne.", 12, MUTED);
            none.setGravity(Gravity.CENTER);
            none.setPadding(dp(12), dp(12), dp(12), dp(12));
            lines.addView(none);
        }
        int index = 0;
        for (Map.Entry<String, Integer> e : cart.entrySet()) {
            Ticket t = find(e.getKey());
            if (t == null) continue;
            if (index++ > 0) {
                View rule = new View(context);
                rule.setBackgroundColor(SURFACE);
                lines.addView(rule, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1)));
            }
            lines.addView(line(t, e.getValue()));
        }
        GradientDrawable frame = round(Color.TRANSPARENT, 16);
        frame.setStroke(dp(1), SURFACE);
        lines.setBackground(frame);
        LinearLayout.LayoutParams linesParams = full();
        linesParams.setMargins(dp(14), dp(12), dp(14), 0);
        root.addView(lines, linesParams);

        // « + Ajouter une personne » et les autres tickets, seulement si on les demande.
        LinearLayout links = row();
        TextView person = text("+ Ajouter une personne", 13, ACCENT);
        person.setTypeface(person.getTypeface(), Typeface.BOLD);
        person.setPadding(0, dp(10), dp(10), dp(10));
        person.setOnClickListener(v -> change("pieton", 1));
        links.addView(person, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        boolean extra = cart.size() < TICKETS.length;
        if (extra) {
            TextView other = text(others ? "Fermer" : "Autre ticket (véhicule…)", 13, MUTED);
            other.setPadding(dp(10), dp(10), 0, dp(10));
            other.setOnClickListener(v -> {
                others = !others;
                fill();
            });
            links.addView(other);
        }
        LinearLayout.LayoutParams linksParams = full();
        linksParams.setMargins(dp(14), dp(2), dp(14), 0);
        root.addView(links, linksParams);
        if (others && extra) root.addView(otherGrid());

        // Paiement.
        int n = count(cart);
        LinearLayout payButton = row();
        payButton.setPadding(dp(18), dp(13), dp(18), dp(13));
        payButton.setBackground(round(ACCENT, 26));
        TextView payLabel = text("Payer · " + n + " ticket" + (n > 1 ? "s" : ""), 15, Color.WHITE);
        payLabel.setTypeface(payLabel.getTypeface(), Typeface.BOLD);
        payButton.addView(payLabel, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        TextView payTotal = text(euros(total(cart)), 15, Color.WHITE);
        payTotal.setTypeface(payTotal.getTypeface(), Typeface.BOLD);
        payButton.addView(payTotal);
        payButton.setEnabled(n > 0);
        payButton.setAlpha(n > 0 ? 1f : 0.45f);
        payButton.setClickable(true);
        payButton.setContentDescription("Payer " + n + " ticket" + (n > 1 ? "s" : "") + ", " + euros(total(cart)));
        payButton.setOnClickListener(v -> {
            if (count(cart) > 0) pay.pay(toJson(cart), summary(cart));
        });
        LinearLayout.LayoutParams payParams = full();
        payParams.setMargins(dp(14), dp(8), dp(14), 0);
        root.addView(payButton, payParams);

        TextView note = text("Démonstration : rien n'est payé pour de vrai", 11, MUTED);
        note.setGravity(Gravity.CENTER);
        note.setPadding(dp(14), dp(8), dp(14), dp(14));
        root.addView(note, full());
    }

    private View line(Ticket t, int quantity) {
        LinearLayout line = row();
        line.setPadding(dp(12), dp(10), dp(10), dp(10));
        line.addView(icon(t.icon, CREAM, 22), new LinearLayout.LayoutParams(dp(22), dp(22)));
        LinearLayout names = column();
        names.setPadding(dp(12), 0, dp(8), 0);
        TextView name = text(t.name(), 14, CREAM);
        name.setTypeface(name.getTypeface(), Typeface.BOLD);
        names.addView(name);
        names.addView(text(euros(t.cents) + " le ticket", 12, MUTED));
        line.addView(names, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        line.addView(step("−", "Retirer un ticket " + t.label, true, () -> change(t.id, -1)));
        TextView n = text(String.valueOf(quantity), 15, CREAM);
        n.setTypeface(n.getTypeface(), Typeface.BOLD);
        n.setGravity(Gravity.CENTER);
        line.addView(n, new LinearLayout.LayoutParams(dp(30), ViewGroup.LayoutParams.WRAP_CONTENT));
        line.addView(step("+", "Ajouter un ticket " + t.label, quantity < MAX_QUANTITY, () -> change(t.id, 1)));
        return line;
    }

    private View otherGrid() {
        LinearLayout grid = column();
        LinearLayout current = null;
        int inRow = 0;
        for (Ticket t : TICKETS) {
            if (cart.containsKey(t.id)) continue;
            if (current == null || inRow == 2) {
                current = row();
                LinearLayout.LayoutParams p = full();
                p.topMargin = dp(6);
                grid.addView(current, p);
                inRow = 0;
            }
            LinearLayout cell = row();
            cell.setPadding(dp(10), dp(8), dp(10), dp(8));
            GradientDrawable box = round(Color.TRANSPARENT, 14);
            box.setStroke(dp(1), SURFACE);
            cell.setBackground(box);
            cell.setClickable(true);
            cell.setContentDescription("Ajouter un ticket " + t.name() + ", " + euros(t.cents));
            cell.addView(icon(t.icon, CREAM, 18), new LinearLayout.LayoutParams(dp(18), dp(18)));
            LinearLayout names = column();
            names.setPadding(dp(8), 0, 0, 0);
            TextView name = text("Poids lourd".equals(t.label) ? "PL " + t.detail : t.label, 12, CREAM);
            name.setSingleLine(true);
            name.setEllipsize(android.text.TextUtils.TruncateAt.END);
            names.addView(name);
            names.addView(text(euros(t.cents), 11, MUTED));
            cell.addView(names, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
            cell.setOnClickListener(v -> {
                others = false;
                change(t.id, 1);
            });
            LinearLayout.LayoutParams cellParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            if (inRow == 1) cellParams.leftMargin = dp(6);
            current.addView(cell, cellParams);
            inRow++;
        }
        // Dernière ligne à un seul ticket : garder la même largeur de case.
        if (current != null && inRow == 1) {
            LinearLayout.LayoutParams spacer = new LinearLayout.LayoutParams(0, 1, 1f);
            spacer.leftMargin = dp(6);
            current.addView(new View(context), spacer);
        }
        grid.setPadding(dp(14), 0, dp(14), dp(4));
        return grid;
    }

    private TextView step(String sign, String label, boolean enabled, Runnable onClick) {
        TextView button = text(sign, 17, CREAM);
        button.setGravity(Gravity.CENTER);
        GradientDrawable ring = round(Color.TRANSPARENT, 20);
        ring.setStroke(dp(1), SURFACE);
        button.setBackground(ring);
        button.setContentDescription(label);
        button.setClickable(enabled);
        button.setAlpha(enabled ? 1f : 0.4f);
        if (enabled) button.setOnClickListener(v -> onClick.run());
        button.setLayoutParams(new LinearLayout.LayoutParams(dp(36), dp(36)));
        return button;
    }

    private View iconBox(int res, int sizeDp) {
        LinearLayout box = new LinearLayout(context);
        box.setGravity(Gravity.CENTER);
        box.setBackground(round(SURFACE, 12));
        box.addView(icon(res, CREAM, 22), new LinearLayout.LayoutParams(dp(22), dp(22)));
        box.setMinimumWidth(dp(sizeDp));
        box.setMinimumHeight(dp(sizeDp));
        return box;
    }

    private ImageView icon(int res, int color, int sizeDp) {
        ImageView image = new ImageView(context);
        image.setImageResource(res);
        image.setImageTintList(ColorStateList.valueOf(color));
        image.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        return image;
    }

    private LinearLayout row() {
        LinearLayout row = new LinearLayout(context);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        return row;
    }

    private LinearLayout column() {
        LinearLayout column = new LinearLayout(context);
        column.setOrientation(LinearLayout.VERTICAL);
        return column;
    }

    private static LinearLayout.LayoutParams full() {
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
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

    private int dp(int value) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, context.getResources().getDisplayMetrics()));
    }
}
