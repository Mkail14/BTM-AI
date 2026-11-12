package yt.tamilya.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

/**
 * Lien d'un autre site touché dans une conversation : il s'ouvre ici, par-dessus Tamilya,
 * au lieu de faire sortir vers le navigateur. Une croix (ou le retour du téléphone) ramène
 * à la conversation. Le retour remonte d'abord les pages visitées dans ce lien.
 * Une page neuve à chaque ouverture, détruite à la fermeture (pas de mémoire gardée).
 * Posé dans l'écran de l'app (pas une fenêtre à part) : le retour du téléphone passe par
 * MainActivity.onBackPressed, une fenêtre Dialog le laissait fermer toute l'app.
 */
final class LinkViewer {
    interface Host {
        /** Lien que ce visualiseur ne sait pas ouvrir (téléphone, e-mail, autre app). */
        void openExternally(Uri uri);
        void feedback(String kind);
    }

    private static final int INK = Color.parseColor("#111111");
    private static final int CREAM = Color.parseColor("#F5F0E6");
    private static final int MUTED = Color.parseColor("#8E9398");
    private static final int ACCENT = Color.parseColor("#F06A9B");
    private static final int LINE = Color.parseColor("#2B2E33");

    private final Activity activity;
    private final Host host;
    private final FrameLayout parent;
    private LinearLayout root;
    private WebView page;
    private TextView title;
    private TextView address;
    private ProgressBar progress;

    LinkViewer(Activity activity, FrameLayout parent, Host host) {
        this.activity = activity;
        this.parent = parent;
        this.host = host;
    }

    boolean isOpen() {
        return root != null;
    }

    /** Les vidéos YouTube gardent l'app YouTube ; le reste en https/http s'ouvre ici. */
    static boolean opensInside(Uri uri) {
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (host == null || !("https".equals(scheme) || "http".equals(scheme))) return false;
        host = host.toLowerCase();
        return !(host.equals("youtu.be") || host.equals("youtube.com") || host.endsWith(".youtube.com"));
    }

    void show(Uri uri) {
        if (isOpen()) {
            page.loadUrl(uri.toString());
            return;
        }
        build();
        address.setText(uri.getHost());
        title.setText(uri.getHost());
        parent.addView(root, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        page.loadUrl(uri.toString());
    }

    void close() {
        if (root == null) return;
        parent.removeView(root);
        release();
    }

    /** Retour : page précédente du lien s'il y en a une, sinon fermeture. */
    void back() {
        if (page != null && page.canGoBack()) page.goBack();
        else close();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void build() {
        root = new LinearLayout(activity);
        root.setClickable(true);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(INK);
        root.addView(header());

        progress = new ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        progress.setProgressTintList(android.content.res.ColorStateList.valueOf(ACCENT));
        progress.setProgressBackgroundTintList(android.content.res.ColorStateList.valueOf(LINE));
        root.addView(progress, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(2)));

        page = new WebView(activity);
        WebSettings settings = page.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setSupportMultipleWindows(false);
        page.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if ("https".equals(scheme) || "http".equals(scheme)) return false;
                host.openExternally(uri);
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                Uri uri = Uri.parse(String.valueOf(url));
                if (uri.getHost() != null) address.setText(uri.getHost());
            }
        });
        page.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int value) {
                progress.setProgress(value);
                progress.setVisibility(value >= 100 ? View.INVISIBLE : View.VISIBLE);
            }

            @Override
            public void onReceivedTitle(WebView view, String text) {
                if (text != null && !text.trim().isEmpty()) title.setText(text.trim());
            }
        });
        page.setDownloadListener((url, agent, disposition, mime, length) -> host.openExternally(Uri.parse(url)));
        root.addView(page, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
    }

    private void release() {
        if (page != null) {
            page.stopLoading();
            page.destroy();
        }
        page = null;
        root = null;
    }

    // --- Haut : croix, titre de la page et site

    private View header() {
        LinearLayout row = new LinearLayout(activity);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(4), dp(6), dp(16), dp(6));
        ImageView cross = icon(R.drawable.ic_aide_fermer, CREAM, 18, 44);
        cross.setClickable(true);
        cross.setContentDescription("Fermer et revenir à la conversation");
        cross.setOnClickListener(v -> {
            host.feedback("key");
            close();
        });
        row.addView(cross, new LinearLayout.LayoutParams(dp(44), dp(44)));

        LinearLayout titles = new LinearLayout(activity);
        titles.setOrientation(LinearLayout.VERTICAL);
        titles.setPadding(dp(8), 0, 0, 0);
        title = line(15, CREAM);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        address = line(12, MUTED);
        titles.addView(title);
        titles.addView(address);
        row.addView(titles, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        return row;
    }

    private TextView line(int sp, int color) {
        TextView view = new TextView(activity);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        view.setTextColor(color);
        view.setSingleLine(true);
        view.setEllipsize(TextUtils.TruncateAt.END);
        return view;
    }

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

    private int dp(int value) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, activity.getResources().getDisplayMetrics()));
    }
}
