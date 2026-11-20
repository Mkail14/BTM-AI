package yt.tamilya.app;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

/**
 * Carte d'une réponse (carte de l'eau, ticket de barge, offres d'emploi…) montrée directement
 * dans la conversation native : la page /apercu/carte du site, qui ne contient que cette carte.
 * Même rendu que sur le site. La page donne sa hauteur ; quand elle ouvre un panneau plein
 * écran (« Voir la carte »), la carte prend tout l'écran le temps qu'il reste ouvert.
 * Sans internet ou en cas d'erreur, le bouton « Voir … » reste à sa place.
 */
@SuppressLint("ViewConstructor")
final class CardFrame extends FrameLayout {
    /** Hauteur d'attente avant que la page donne la sienne (h-24 du squelette du site). */
    private static final int WAITING_DP = 96;

    private final View fallback;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final String url;
    private WebView page;
    private boolean full;

    CardFrame(Context context, String name, String body, View fallback) {
        super(context);
        this.fallback = fallback;
        this.url = ChatApi.BASE + "/apercu/carte?bloc=" + Uri.encode(name) + "&contenu=" + Uri.encode(body);
        addView(fallback, new LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        if (online(context)) show();
    }

    /** Montre la carte dans la conversation ; false si l'appareil n'a pas internet. */
    boolean show() {
        if (page != null) return true;
        if (!online(getContext())) return false;
        page = build();
        fallback.setVisibility(GONE);
        addView(page, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(WAITING_DP)));
        page.loadUrl(url);
        return true;
    }

    boolean isFull() {
        return full;
    }

    /** Retour : ferme le panneau plein écran comme la touche Échap sur le site. */
    void closeFull() {
        if (page == null || !full) return;
        page.evaluateJavascript("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));"
                + "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));", null);
        // Panneau sans Échap : la carte revient quand même dans la conversation.
        main.postDelayed(() -> setFull(false), 900);
    }

    /** Carte retirée pour de bon (trop de cartes gardées) : la page est libérée. */
    void destroy() {
        setFull(false);
        if (page == null) return;
        removeView(page);
        page.destroy();
        page = null;
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private WebView build() {
        WebView view = new WebView(getContext());
        view.setBackgroundColor(Color.TRANSPARENT);
        view.setOverScrollMode(View.OVER_SCROLL_NEVER);
        view.setVerticalScrollBarEnabled(false);
        view.setHorizontalScrollBarEnabled(false);
        WebSettings s = view.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setGeolocationEnabled(true);
        s.setSupportZoom(false);
        s.setTextZoom(100);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        // Même signature que la page principale : le site applique les réglages de l'application.
        s.setUserAgentString(s.getUserAgentString() + " TamilyaApp/" + MainActivity.BuildInfo.VERSION);
        view.addJavascriptInterface(new Bridge(), "TamilyaCarte");
        view.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                // Un lien de la carte (Google Maps, offre d'emploi…) s'ouvre hors de la carte.
                if (!request.isForMainFrame()) return false;
                try {
                    getContext().startActivity(new android.content.Intent(android.content.Intent.ACTION_VIEW, request.getUrl()));
                } catch (RuntimeException ignored) {
                    // Aucune application pour ce lien.
                }
                return true;
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) main.post(CardFrame.this::backToButton);
            }

            @Override
            public void onReceivedHttpError(WebView v, WebResourceRequest request, android.webkit.WebResourceResponse response) {
                // Page absente ou en panne (site pas encore à jour, maintenance) : le bouton plutôt qu'une page d'erreur.
                if (request.isForMainFrame()) main.post(CardFrame.this::backToButton);
            }
        });
        return view;
    }

    /** Page en erreur (réseau coupé pendant le chargement) : le bouton revient. */
    private void backToButton() {
        destroy();
        fallback.setVisibility(VISIBLE);
    }

    private void setHeight(int cssPx) {
        if (page == null || cssPx <= 0) return;
        int height = dp(cssPx);
        if (full) {
            // La place gardée dans la conversation suivra au retour.
            setMinimumHeight(height);
            return;
        }
        ViewGroup.LayoutParams params = page.getLayoutParams();
        if (params.height == height) return;
        params.height = height;
        page.setLayoutParams(params);
    }

    /** Panneau plein écran ouvert ou fermé dans la page : la carte passe sur tout l'écran, puis revient. */
    private void setFull(boolean on) {
        if (page == null || on == full) return;
        ViewGroup root = getRootView().findViewById(android.R.id.content);
        if (root == null) return;
        full = on;
        if (on) {
            int height = page.getHeight();
            setMinimumHeight(height);
            removeView(page);
            root.addView(page, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        } else {
            ((ViewGroup) page.getParent()).removeView(page);
            int height = Math.max(getMinimumHeight(), dp(WAITING_DP));
            setMinimumHeight(0);
            addView(page, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, height));
        }
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    static boolean online(Context context) {
        ConnectivityManager manager = context.getSystemService(ConnectivityManager.class);
        if (manager == null) return false;
        Network network = manager.getActiveNetwork();
        NetworkCapabilities caps = network == null ? null : manager.getNetworkCapabilities(network);
        return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }

    /** Appelé par la page (src/components/chat/CardEmbed.tsx), hors du fil principal. */
    private final class Bridge {
        @JavascriptInterface
        public void hauteur(int px) {
            main.post(() -> setHeight(px));
        }

        @JavascriptInterface
        public void pleinEcran(boolean on) {
            main.post(() -> setFull(on));
        }
    }
}
