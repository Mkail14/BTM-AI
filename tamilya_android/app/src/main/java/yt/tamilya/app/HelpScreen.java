package yt.tamilya.app;

import android.app.Activity;
import android.app.Dialog;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Insets;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.InputFilter;
import android.text.InputType;
import android.text.TextWatcher;
import android.util.Patterns;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * « Obtenir de l'aide » dans l'app : la page d'aide de l'APK, la même que le rond d'aide
 * du site (HelpBubble.tsx), en écran natif. La page /aide du site n'est jamais ouverte
 * dans l'app : MainActivity l'intercepte et ouvre celle-ci.
 * Trois onglets : Questions (la FAQ du site, copiée dans l'APK par tools/faq-json.mjs,
 * lisible sans internet), Assistant (l'IA d'aide, POST /api/aide) et Écrire (message
 * à l'équipe, POST /api/aide). Le fil de l'assistant reste tant que l'app est ouverte.
 */
final class HelpScreen {
    interface Host {
        /** Ouvre une page du site (lien d'une réponse) ; l'aide est déjà fermée. */
        void openPage(String path);
        /** Cookies de la WebView pour tamilya.yt (compte connecté), ou null. */
        String cookies();
        /** E-mail du compte connu sur ce téléphone, ou « ». */
        String accountEmail();
        void feedback(String kind);
    }

    private static final String API = "https://tamilya.yt/api/aide";
    private static final int TIMEOUT_MS = 30_000;
    private static final int TURN_MAX = 1500;
    private static final int MESSAGE_MAX = 3000;
    private static final int SLIDE_MS = 220;

    private static final int INK = Color.parseColor("#111111");
    private static final int CREAM = Color.parseColor("#F5F0E6");
    private static final int MUTED = Color.parseColor("#8E9398");
    private static final int ACCENT = Color.parseColor("#F06A9B");
    private static final int ACCENT_SOFT = Color.parseColor("#3A1626");
    private static final int SURFACE = Color.parseColor("#1D1F21");
    private static final int LINE = Color.parseColor("#2B2E33");
    private static final int DANGER = Color.parseColor("#FF8A8A");
    private static final int DANGER_SOFT = Color.parseColor("#3A1A1A");
    private static final int SUCCESS = Color.parseColor("#6FD39A");
    private static final int SUCCESS_SOFT = Color.parseColor("#163322");

    private final Activity activity;
    private final Host host;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Dialog dialog;
    private final LinearLayout root;
    private final FrameLayout body;
    private final TextView[] tabs = new TextView[3];
    private boolean leaving;

    // Questions
    private JSONArray faq = new JSONArray();
    private final List<String> topics = new ArrayList<>();
    private String query = "";
    // Assistant : { role, content }
    private final List<String[]> turns = new ArrayList<>();
    private String draft = "";
    private boolean asking;
    private String chatError;
    // Écrire
    private String topic;
    private String email = "";
    private String message = "";
    private boolean sending;
    private String sendError;
    private String sentTo;
    private int tab;

    HelpScreen(Activity activity, Host host) {
        this.activity = activity;
        this.host = host;
        loadFaq();

        dialog = new Dialog(activity, android.R.style.Theme_Black_NoTitleBar);
        dialog.setOnKeyListener((d, key, event) -> {
            if (key == KeyEvent.KEYCODE_BACK && event.getAction() == KeyEvent.ACTION_UP) {
                close();
                return true;
            }
            return false;
        });

        root = new LinearLayout(activity);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(INK);
        root.addView(header());
        root.addView(rule());
        root.addView(tabBar());
        root.addView(rule());
        body = new FrameLayout(activity);
        root.addView(body, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        dialog.setContentView(root);

        Window window = dialog.getWindow();
        if (window != null) {
            window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
            window.setStatusBarColor(INK);
            window.setNavigationBarColor(INK);
            window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
            // Android 11+ : le contenu s'arrête aux barres système et remonte avec le clavier.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                window.setDecorFitsSystemWindows(false);
                root.setOnApplyWindowInsetsListener((view, insets) -> {
                    Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                    view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                    return WindowInsets.CONSUMED;
                });
            }
        }
    }

    boolean isOpen() {
        return dialog.isShowing();
    }

    /** Ouvre l'aide sur les questions (ou là où on l'avait laissée). */
    void show() {
        if (dialog.isShowing()) return;
        leaving = false;
        if (email.isEmpty()) email = host.accountEmail();
        select(tab);
        dialog.show();
        // Monte du bas, comme le panneau du rond d'aide sur téléphone.
        root.setAlpha(0f);
        root.post(() -> {
            root.setTranslationY(root.getHeight() * 0.08f);
            root.animate().alpha(1f).translationY(0).setDuration(SLIDE_MS).start();
        });
    }

    void close() {
        if (leaving || !dialog.isShowing()) return;
        leaving = true;
        hideKeyboard();
        root.animate().alpha(0f).translationY(root.getHeight() * 0.08f).setDuration(SLIDE_MS).withEndAction(() -> {
            dialog.dismiss();
            leaving = false;
        }).start();
    }

    private void loadFaq() {
        try (InputStream in = activity.getAssets().open("aide/faq.json")) {
            JSONObject data = new JSONObject(read(in, 512 * 1024));
            faq = data.getJSONArray("faq");
            JSONArray list = data.getJSONArray("topics");
            for (int i = 0; i < list.length(); i++) topics.add(list.getString(i));
        } catch (Exception e) {
            faq = new JSONArray();
        }
    }

    // --- Haut : titre et croix

    private View header() {
        LinearLayout row = new LinearLayout(activity);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(16), dp(12), dp(8), dp(12));
        LinearLayout titles = new LinearLayout(activity);
        titles.setOrientation(LinearLayout.VERTICAL);
        TextView title = text("Besoin d'aide ?", 17, CREAM);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        titles.addView(title);
        titles.addView(text("On est là pour toi.", 12, MUTED));
        row.addView(titles, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        ImageView cross = icon(R.drawable.ic_aide_fermer, MUTED, 18, 44);
        cross.setClickable(true);
        cross.setContentDescription("Fermer l'aide");
        cross.setOnClickListener(v -> {
            host.feedback("key");
            close();
        });
        row.addView(cross, new LinearLayout.LayoutParams(dp(44), dp(44)));
        return row;
    }

    private View tabBar() {
        LinearLayout row = new LinearLayout(activity);
        row.setPadding(dp(6), dp(6), dp(6), dp(6));
        String[] labels = {"Questions", "Assistant", "Écrire"};
        for (int i = 0; i < 3; i++) {
            int index = i;
            TextView button = text(labels[i], 14, MUTED);
            button.setTypeface(Typeface.DEFAULT_BOLD);
            button.setGravity(Gravity.CENTER);
            button.setPadding(0, dp(10), 0, dp(10));
            button.setClickable(true);
            button.setOnClickListener(v -> {
                host.feedback("key");
                select(index);
            });
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            if (i > 0) params.leftMargin = dp(4);
            row.addView(button, params);
            tabs[i] = button;
        }
        return row;
    }

    private void select(int index) {
        tab = index;
        for (int i = 0; i < 3; i++) {
            tabs[i].setTextColor(i == index ? CREAM : MUTED);
            tabs[i].setBackground(i == index ? round(SURFACE, 10) : null);
            tabs[i].setSelected(i == index);
        }
        hideKeyboard();
        body.removeAllViews();
        View page = index == 0 ? faqTab() : index == 1 ? chatTab() : emailTab();
        body.addView(page, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    // --- Questions

    private View faqTab() {
        ScrollView scroll = new ScrollView(activity);
        scroll.setFillViewport(true);
        LinearLayout page = new LinearLayout(activity);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setPadding(dp(12), dp(12), dp(12), dp(16));
        EditText search = field("Chercher (quota, code, compte…)");
        search.setSingleLine(true);
        search.setImeOptions(EditorInfo.IME_ACTION_SEARCH);
        search.setText(query);
        page.addView(search);
        LinearLayout results = new LinearLayout(activity);
        results.setOrientation(LinearLayout.VERTICAL);
        page.addView(results);
        fillFaq(results);
        search.addTextChangedListener(new Watcher(value -> {
            query = value;
            fillFaq(results);
        }));
        scroll.addView(page);
        return scroll;
    }

    private void fillFaq(LinearLayout results) {
        results.removeAllViews();
        String[] words = normalize(query).trim().split("\\s+");
        int shown = 0;
        for (int t = 0; t < faq.length(); t++) {
            JSONObject section = faq.optJSONObject(t);
            if (section == null) continue;
            JSONArray questions = section.optJSONArray("questions");
            if (questions == null) continue;
            LinearLayout card = new LinearLayout(activity);
            card.setOrientation(LinearLayout.VERTICAL);
            GradientDrawable border = round(INK, 12);
            border.setStroke(dp(1), LINE);
            card.setBackground(border);
            card.setClipToOutline(true);
            int count = 0;
            for (int q = 0; q < questions.length(); q++) {
                JSONObject item = questions.optJSONObject(q);
                if (item == null || !matches(words, item.optString("q") + " " + item.optString("a"))) continue;
                if (count > 0) card.addView(rule());
                card.addView(question(item));
                count++;
            }
            if (count == 0) continue;
            TextView title = text(section.optString("title").toUpperCase(Locale.FRANCE), 11, MUTED);
            title.setLetterSpacing(0.08f);
            title.setPadding(dp(4), dp(16), dp(4), dp(6));
            results.addView(title);
            results.addView(card);
            shown += count;
        }

        LinearLayout more = new LinearLayout(activity);
        more.setOrientation(LinearLayout.VERTICAL);
        more.setBackground(round(SURFACE, 12));
        more.setPadding(dp(14), dp(12), dp(14), dp(12));
        TextView line = text(shown == 0 ? "Aucune question ne correspond." : "Pas trouvé ta réponse ?", 14, CREAM);
        line.setTypeface(Typeface.DEFAULT_BOLD);
        more.addView(line);
        TextView ask = link("Demande à l'assistant d'aide →");
        ask.setOnClickListener(v -> {
            host.feedback("key");
            select(1);
        });
        more.addView(ask);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.topMargin = dp(20);
        results.addView(more, params);
    }

    /** Une question : touchée, elle se déplie (le « + » tourne), comme sur le site. */
    private View question(JSONObject item) {
        LinearLayout box = new LinearLayout(activity);
        box.setOrientation(LinearLayout.VERTICAL);
        LinearLayout row = new LinearLayout(activity);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(14), dp(12), dp(14), dp(12));
        row.setClickable(true);
        TextView q = text(item.optString("q"), 14, CREAM);
        q.setTypeface(Typeface.DEFAULT_BOLD);
        row.addView(q, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        TextView plus = text("+", 18, MUTED);
        plus.setPadding(dp(12), 0, 0, 0);
        row.addView(plus);
        box.addView(row);

        LinearLayout answer = new LinearLayout(activity);
        answer.setOrientation(LinearLayout.VERTICAL);
        answer.setPadding(dp(14), 0, dp(14), dp(12));
        answer.setVisibility(View.GONE);
        TextView a = text(item.optString("a"), 14, MUTED);
        a.setLineSpacing(0, 1.25f);
        answer.addView(a);
        JSONObject target = item.optJSONObject("link");
        if (target != null) {
            String href = target.optString("href");
            TextView go = link(target.optString("label") + " →");
            go.setOnClickListener(v -> {
                host.feedback("key");
                close();
                main.postDelayed(() -> host.openPage(href), SLIDE_MS);
            });
            answer.addView(go);
        }
        box.addView(answer);

        row.setOnClickListener(v -> {
            host.feedback("key");
            boolean open = answer.getVisibility() != View.VISIBLE;
            answer.setVisibility(open ? View.VISIBLE : View.GONE);
            plus.animate().rotation(open ? 45 : 0).setDuration(150).start();
        });
        return box;
    }

    private static String normalize(String text) {
        return Normalizer.normalize(text, Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase(Locale.FRANCE);
    }

    private static boolean matches(String[] words, String text) {
        String haystack = normalize(text);
        for (String word : words) if (!word.isEmpty() && !haystack.contains(word)) return false;
        return true;
    }

    // --- Assistant

    private View chatTab() {
        LinearLayout page = new LinearLayout(activity);
        page.setOrientation(LinearLayout.VERTICAL);
        ScrollView scroll = new ScrollView(activity);
        LinearLayout list = new LinearLayout(activity);
        list.setOrientation(LinearLayout.VERTICAL);
        list.setPadding(dp(12), dp(12), dp(12), dp(12));
        scroll.addView(list);
        page.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        list.addView(bubble("Bonjour ! Je suis l'assistant d'aide de BTM AI. Pose-moi ta question sur le site : compte, quotas, code de la route, portefeuille…", false));
        for (String[] turn : turns) list.addView(bubble(turn[1], "user".equals(turn[0])));
        if (asking) {
            View dots = bubble("…", false);
            dots.setContentDescription("L'assistant écrit");
            list.addView(dots);
        }
        if (chatError != null) {
            LinearLayout alert = new LinearLayout(activity);
            alert.setOrientation(LinearLayout.VERTICAL);
            alert.setBackground(round(DANGER_SOFT, 12));
            alert.setPadding(dp(12), dp(8), dp(12), dp(8));
            alert.addView(text(chatError, 14, DANGER));
            TextView write = text("Écrire à l'équipe", 14, DANGER);
            write.setTypeface(Typeface.DEFAULT_BOLD);
            write.setPaintFlags(write.getPaintFlags() | android.graphics.Paint.UNDERLINE_TEXT_FLAG);
            write.setClickable(true);
            write.setOnClickListener(v -> {
                host.feedback("key");
                select(2);
            });
            alert.addView(write);
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            params.topMargin = dp(10);
            list.addView(alert, params);
        }
        scroll.post(() -> scroll.fullScroll(View.FOCUS_DOWN));

        page.addView(rule());
        LinearLayout bar = new LinearLayout(activity);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(10), dp(10), dp(10), dp(10));
        EditText input = field("Ta question…");
        input.setBackground(pill());
        input.setPadding(dp(16), dp(10), dp(16), dp(10));
        input.setFilters(new InputFilter[] {new InputFilter.LengthFilter(TURN_MAX)});
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        input.setMaxLines(4);
        input.setText(draft);
        input.setSelection(draft.length());
        bar.addView(input, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        ImageView send = icon(R.drawable.ic_aide_envoyer, Color.WHITE, 18, 40);
        send.setBackground(round(ACCENT, 20));
        send.setClickable(true);
        send.setContentDescription("Envoyer la question");
        LinearLayout.LayoutParams sendParams = new LinearLayout.LayoutParams(dp(40), dp(40));
        sendParams.leftMargin = dp(8);
        bar.addView(send, sendParams);
        Runnable refresh = () -> {
            boolean ready = !draft.trim().isEmpty() && !asking;
            send.setEnabled(ready);
            send.setAlpha(ready ? 1f : 0.45f);
        };
        refresh.run();
        input.addTextChangedListener(new Watcher(value -> {
            draft = value;
            refresh.run();
        }));
        send.setOnClickListener(v -> {
            host.feedback("key");
            ask();
        });
        page.addView(bar);
        return page;
    }

    private View bubble(String content, boolean mine) {
        TextView view = text(content, 14, CREAM);
        view.setLineSpacing(0, 1.25f);
        view.setTextIsSelectable(true);
        view.setPadding(dp(14), dp(8), dp(14), dp(8));
        float r = dp(16);
        float tail = dp(5);
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(mine ? ACCENT_SOFT : SURFACE);
        // Coin en bas à gauche (assistant) ou à droite (toi), comme sur le site.
        shape.setCornerRadii(mine ? new float[] {r, r, r, r, tail, tail, r, r} : new float[] {r, r, r, r, r, r, tail, tail});
        view.setBackground(shape);
        view.setMaxWidth(Math.round(activity.getResources().getDisplayMetrics().widthPixels * 0.78f));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.gravity = mine ? Gravity.END : Gravity.START;
        params.topMargin = dp(8);
        view.setLayoutParams(params);
        return view;
    }

    private void ask() {
        String question = draft.trim();
        if (question.isEmpty() || asking) return;
        if (question.length() > TURN_MAX) question = question.substring(0, TURN_MAX);
        List<String[]> before = new ArrayList<>(turns);
        turns.add(new String[] {"user", question});
        while (turns.size() > 12) turns.remove(0);
        draft = "";
        asking = true;
        chatError = null;
        select(1);
        String asked = question;
        String cookies = host.cookies();
        JSONArray messages = new JSONArray();
        try {
            for (String[] turn : turns) {
                String content = turn[1].length() > TURN_MAX ? turn[1].substring(0, TURN_MAX) : turn[1];
                messages.put(new JSONObject().put("role", turn[0]).put("content", content));
            }
        } catch (Exception ignored) {
        }
        io.execute(() -> {
            String answer = null;
            String error;
            try {
                JSONObject data = post(new JSONObject().put("kind", "chat").put("messages", messages), cookies);
                answer = data.optString("answer", "");
                error = answer.isEmpty() ? "L'assistant n'a pas pu répondre." : null;
            } catch (Refused e) {
                error = e.getMessage();
            } catch (Exception e) {
                error = "Pas de réponse : vérifie ta connexion internet, puis réessaie.";
            }
            String reply = answer;
            String problem = error;
            main.post(() -> {
                asking = false;
                if (problem == null) {
                    turns.add(new String[] {"assistant", reply});
                    host.feedback("ready");
                } else {
                    // La question sans réponse quitte le fil et revient dans le champ, comme sur le site.
                    turns.clear();
                    turns.addAll(before);
                    if (draft.isEmpty()) draft = asked;
                    chatError = problem;
                }
                if (tab == 1 && dialog.isShowing()) select(1);
            });
        });
    }

    // --- Écrire à l'équipe

    private View emailTab() {
        if (sentTo != null) return sent();
        LinearLayout page = new LinearLayout(activity);
        page.setOrientation(LinearLayout.VERTICAL);

        // Page fixe : seule la zone du message s'agrandit ou rétrécit pour remplir l'écran.
        LinearLayout form = new LinearLayout(activity);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(dp(14), dp(14), dp(14), dp(10));
        page.addView(form, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        LinearLayout who = new LinearLayout(activity);
        who.setGravity(Gravity.CENTER_VERTICAL);
        ImageView mail = icon(R.drawable.ic_aide_mail, ACCENT, 20, 36);
        mail.setBackground(round(ACCENT_SOFT, 18));
        who.addView(mail, new LinearLayout.LayoutParams(dp(36), dp(36)));
        LinearLayout names = new LinearLayout(activity);
        names.setOrientation(LinearLayout.VERTICAL);
        names.setPadding(dp(12), 0, 0, 0);
        TextView team = text("L'équipe de GROUPE BTM", 14, CREAM);
        team.setTypeface(Typeface.DEFAULT_BOLD);
        names.addView(team);
        names.addView(text("Une vraie personne te répond.", 14, MUTED));
        who.addView(names);
        form.addView(who);

        form.addView(label("SUJET", dp(14)));
        Flow chips = new Flow(activity, dp(6));
        for (String name : topics) {
            TextView chip = text(name, 13, MUTED);
            chip.setPadding(dp(12), dp(5), dp(12), dp(5));
            chip.setClickable(true);
            paintChip(chip, name.equals(topic));
            chip.setOnClickListener(v -> {
                host.feedback("key");
                topic = name.equals(topic) ? null : name;
                for (int i = 0; i < chips.getChildCount(); i++) {
                    TextView other = (TextView) chips.getChildAt(i);
                    paintChip(other, other.getText().toString().equals(topic));
                }
            });
            chips.addView(chip);
        }
        LinearLayout.LayoutParams chipsParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        chipsParams.topMargin = dp(6);
        form.addView(chips, chipsParams);

        form.addView(label("TON E-MAIL", dp(14)));
        EditText address = field("toi@exemple.com");
        address.setSingleLine(true);
        address.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        address.setFilters(new InputFilter[] {new InputFilter.LengthFilter(200)});
        address.setText(email);
        form.addView(address, topMargin(dp(6)));

        LinearLayout messageHead = new LinearLayout(activity);
        messageHead.setGravity(Gravity.BOTTOM);
        TextView messageLabel = label("TON MESSAGE", 0);
        messageHead.addView(messageLabel, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        TextView counter = text(message.length() + " / " + MESSAGE_MAX, 11, MUTED);
        counter.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        messageHead.addView(counter);
        form.addView(messageHead, topMargin(dp(14)));
        EditText body = field("Explique ce qui se passe, et sur quelle page…");
        body.setGravity(Gravity.TOP | Gravity.START);
        body.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        body.setFilters(new InputFilter[] {new InputFilter.LengthFilter(MESSAGE_MAX)});
        body.setLineSpacing(0, 1.2f);
        body.setMinHeight(dp(64));
        body.setText(message);
        LinearLayout.LayoutParams bodyParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f);
        bodyParams.topMargin = dp(6);
        form.addView(body, bodyParams);

        if (sendError != null) {
            TextView alert = text(sendError, 14, DANGER);
            alert.setBackground(round(DANGER_SOFT, 12));
            alert.setPadding(dp(12), dp(8), dp(12), dp(8));
            form.addView(alert, topMargin(dp(10)));
        }

        // Bas : bouton toujours visible, et l'adresse directe pour qui préfère sa messagerie.
        page.addView(rule());
        LinearLayout foot = new LinearLayout(activity);
        foot.setOrientation(LinearLayout.VERTICAL);
        foot.setPadding(dp(12), dp(12), dp(12), dp(12));
        LinearLayout button = new LinearLayout(activity);
        button.setGravity(Gravity.CENTER);
        button.setBackground(round(ACCENT, 12));
        button.setPadding(0, dp(12), 0, dp(12));
        button.setClickable(true);
        TextView buttonText = text(sending ? "Envoi…" : "Envoyer à l'équipe", 14, Color.WHITE);
        buttonText.setTypeface(Typeface.DEFAULT_BOLD);
        button.addView(buttonText);
        if (!sending) {
            ImageView arrow = icon(R.drawable.ic_aide_envoyer, Color.WHITE, 15, 15);
            LinearLayout.LayoutParams arrowParams = new LinearLayout.LayoutParams(dp(15), dp(15));
            arrowParams.leftMargin = dp(8);
            button.addView(arrow, arrowParams);
        }
        foot.addView(button);
        TextView direct = text("ou directement à contact@btm.yt", 12, MUTED);
        direct.setGravity(Gravity.CENTER);
        direct.setPadding(0, dp(8), 0, 0);
        direct.setClickable(true);
        direct.setOnClickListener(v -> {
            try {
                activity.startActivity(new android.content.Intent(android.content.Intent.ACTION_SENDTO, android.net.Uri.parse("mailto:contact@btm.yt")));
            } catch (Exception ignored) {
            }
        });
        foot.addView(direct);
        page.addView(foot);

        Runnable refresh = () -> {
            boolean ready = !sending && !email.trim().isEmpty() && message.trim().length() >= 5;
            button.setEnabled(ready);
            button.setAlpha(ready ? 1f : 0.45f);
        };
        refresh.run();
        address.addTextChangedListener(new Watcher(value -> {
            email = value;
            refresh.run();
        }));
        body.addTextChangedListener(new Watcher(value -> {
            message = value;
            counter.setText(value.length() + " / " + MESSAGE_MAX);
            refresh.run();
        }));
        button.setOnClickListener(v -> {
            host.feedback("key");
            send();
        });
        return page;
    }

    private void paintChip(TextView chip, boolean on) {
        GradientDrawable shape = round(on ? ACCENT_SOFT : INK, 16);
        shape.setStroke(dp(1), on ? ACCENT : LINE);
        chip.setBackground(shape);
        chip.setTextColor(on ? CREAM : MUTED);
        chip.setTypeface(on ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
        chip.setSelected(on);
    }

    private void send() {
        if (sending) return;
        String to = email.trim();
        if (!Patterns.EMAIL_ADDRESS.matcher(to).matches()) {
            sendError = "Cette adresse e-mail ne semble pas valide.";
            select(2);
            return;
        }
        sending = true;
        sendError = null;
        select(2);
        String cookies = host.cookies();
        JSONObject request;
        try {
            request = new JSONObject().put("kind", "email").put("email", to).put("message", message.trim()).put("page", "App Android");
            if (topic != null) request.put("topic", topic);
        } catch (Exception e) {
            sending = false;
            return;
        }
        io.execute(() -> {
            String error;
            try {
                JSONObject data = post(request, cookies);
                error = data.optBoolean("sent") ? null : "L'envoi a échoué. Réessaie.";
            } catch (Refused e) {
                error = e.getMessage();
            } catch (Exception e) {
                error = "L'envoi a échoué : vérifie ta connexion internet, puis réessaie.";
            }
            String problem = error;
            main.post(() -> {
                sending = false;
                if (problem == null) {
                    sentTo = to;
                    message = "";
                    topic = null;
                    host.feedback("ready");
                } else {
                    sendError = problem;
                }
                if (tab == 2 && dialog.isShowing()) select(2);
            });
        });
    }

    private View sent() {
        LinearLayout page = new LinearLayout(activity);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setGravity(Gravity.CENTER);
        page.setPadding(dp(24), dp(24), dp(24), dp(24));
        ImageView check = icon(R.drawable.ic_aide_coche, SUCCESS, 26, 56);
        check.setBackground(round(SUCCESS_SOFT, 28));
        page.addView(check, new LinearLayout.LayoutParams(dp(56), dp(56)));
        TextView title = text("Message envoyé", 16, CREAM);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setPadding(0, dp(12), 0, dp(6));
        page.addView(title);
        TextView line = text("L'équipe de GROUPE BTM te répond à " + sentTo + ".", 14, MUTED);
        line.setGravity(Gravity.CENTER);
        line.setMaxWidth(dp(260));
        page.addView(line);
        TextView again = link("Écrire un autre message");
        again.setPadding(0, dp(16), 0, 0);
        again.setOnClickListener(v -> {
            host.feedback("key");
            sentTo = null;
            select(2);
        });
        page.addView(again);
        return page;
    }

    // --- Réseau

    /** Le site a répondu par un refus, avec son propre message. */
    private static final class Refused extends IOException {
        Refused(String message) {
            super(message);
        }
    }

    private static JSONObject post(JSONObject request, String cookies) throws IOException, org.json.JSONException {
        HttpURLConnection connection = (HttpURLConnection) new URL(API).openConnection();
        try {
            byte[] bytes = request.toString().getBytes(StandardCharsets.UTF_8);
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(TIMEOUT_MS);
            connection.setReadTimeout(TIMEOUT_MS);
            connection.setInstanceFollowRedirects(false);
            connection.setUseCaches(false);
            connection.setDoOutput(true);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("User-Agent", "TamilyaApp Aide");
            if (cookies != null && !cookies.isEmpty()) connection.setRequestProperty("Cookie", cookies);
            connection.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream out = connection.getOutputStream()) {
                out.write(bytes);
            }
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                String text = "";
                InputStream error = connection.getErrorStream();
                if (error != null) {
                    try (InputStream in = error) {
                        text = read(in, 64 * 1024);
                    }
                }
                String message = "";
                try {
                    message = new JSONObject(text).optString("error", "");
                } catch (Exception ignored) {
                }
                throw new Refused(message.isEmpty() ? "Le service d'aide ne répond pas pour l'instant. Réessaie dans un moment." : message);
            }
            try (InputStream in = connection.getInputStream()) {
                return new JSONObject(read(in, 64 * 1024));
            }
        } finally {
            connection.disconnect();
        }
    }

    private static String read(InputStream in, int max) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        for (int n; (n = in.read(buffer)) > 0; ) {
            out.write(buffer, 0, n);
            if (out.size() > max) throw new IOException("réponse trop longue");
        }
        return out.toString("UTF-8");
    }

    // --- Petites briques

    /** Rangée qui passe à la ligne, pour les pastilles du sujet. */
    private static final class Flow extends ViewGroup {
        private final int gap;

        Flow(Context context, int gap) {
            super(context);
            this.gap = gap;
        }

        @Override
        protected void onMeasure(int widthSpec, int heightSpec) {
            int width = MeasureSpec.getSize(widthSpec);
            int x = 0, y = 0, line = 0;
            for (int i = 0; i < getChildCount(); i++) {
                View child = getChildAt(i);
                child.measure(MeasureSpec.makeMeasureSpec(width, MeasureSpec.AT_MOST), MeasureSpec.UNSPECIFIED);
                if (x > 0 && x + child.getMeasuredWidth() > width) {
                    x = 0;
                    y += line + gap;
                    line = 0;
                }
                x += child.getMeasuredWidth() + gap;
                line = Math.max(line, child.getMeasuredHeight());
            }
            setMeasuredDimension(width, y + line);
        }

        @Override
        protected void onLayout(boolean changed, int l, int t, int r, int b) {
            int width = r - l;
            int x = 0, y = 0, line = 0;
            for (int i = 0; i < getChildCount(); i++) {
                View child = getChildAt(i);
                int w = child.getMeasuredWidth(), h = child.getMeasuredHeight();
                if (x > 0 && x + w > width) {
                    x = 0;
                    y += line + gap;
                    line = 0;
                }
                child.layout(x, y, x + w, y + h);
                x += w + gap;
                line = Math.max(line, h);
            }
        }
    }

    private interface OnText {
        void changed(String value);
    }

    private static final class Watcher implements TextWatcher {
        private final OnText onText;

        Watcher(OnText onText) {
            this.onText = onText;
        }

        @Override
        public void beforeTextChanged(CharSequence s, int start, int count, int after) {}

        @Override
        public void onTextChanged(CharSequence s, int start, int before, int count) {}

        @Override
        public void afterTextChanged(Editable s) {
            onText.changed(s.toString());
        }
    }

    private void hideKeyboard() {
        View focus = dialog.getCurrentFocus();
        if (focus == null) return;
        android.view.inputmethod.InputMethodManager keyboard =
                (android.view.inputmethod.InputMethodManager) activity.getSystemService(Context.INPUT_METHOD_SERVICE);
        if (keyboard != null) keyboard.hideSoftInputFromWindow(focus.getWindowToken(), 0);
        focus.clearFocus();
    }

    private EditText field(String hint) {
        EditText view = new EditText(activity);
        view.setHint(hint);
        view.setHintTextColor(MUTED);
        view.setTextColor(CREAM);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        GradientDrawable shape = round(SURFACE, 12);
        shape.setStroke(dp(1), LINE);
        view.setBackground(shape);
        view.setPadding(dp(14), dp(10), dp(14), dp(10));
        view.setOnFocusChangeListener((v, focused) -> {
            if (v.getBackground() instanceof GradientDrawable) ((GradientDrawable) v.getBackground()).setStroke(dp(1), focused ? ACCENT : LINE);
        });
        return view;
    }

    private Drawable pill() {
        GradientDrawable shape = round(SURFACE, 22);
        shape.setStroke(dp(1), LINE);
        return shape;
    }

    private TextView label(String value, int top) {
        TextView view = text(value, 11, MUTED);
        view.setLetterSpacing(0.08f);
        view.setTypeface(Typeface.DEFAULT_BOLD);
        view.setPadding(0, top, 0, 0);
        return view;
    }

    private TextView link(String value) {
        TextView view = text(value, 14, ACCENT);
        view.setTypeface(Typeface.DEFAULT_BOLD);
        view.setPadding(0, dp(6), 0, 0);
        view.setClickable(true);
        return view;
    }

    private LinearLayout.LayoutParams topMargin(int margin) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.topMargin = margin;
        return params;
    }

    private View rule() {
        View line = new View(activity);
        line.setBackgroundColor(LINE);
        line.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 1));
        return line;
    }

    /** Icône de sizeDp au centre d'une case de boxDp. */
    private ImageView icon(int drawable, int color, int sizeDp, int boxDp) {
        ImageView view = new ImageView(activity);
        Drawable d = activity.getDrawable(drawable);
        if (d != null) {
            d = d.mutate();
            d.setTint(color);
        }
        view.setImageDrawable(d);
        view.setScaleType(ImageView.ScaleType.FIT_CENTER);
        int pad = dp((boxDp - sizeDp) / 2);
        view.setPadding(pad, pad, pad, pad);
        return view;
    }

    private TextView text(String value, int sp, int color) {
        TextView view = new TextView(activity);
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
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, activity.getResources().getDisplayMetrics()));
    }
}
