package yt.tamilya.app;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Insets;
import android.media.AudioAttributes;
import android.media.SoundPool;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Base64;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.os.CancellationSignal;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.NoCredentialException;

import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

import org.json.JSONObject;

import yt.tamilya.app.connect.TamilyaConnect;

import java.io.IOException;
import java.io.OutputStream;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Locale;

/**
 * Tamilya : l'app affiche elle-même le site, sans Chrome (donc sans fenêtre « Ouvrir avec »
 * ni blocage MIUI). Elle ajoute ce qu'un site ne peut pas faire seul : écran de lancement,
 * écran hors ligne, bouton retour, micro et reconnaissance vocale d'Android.
 */
public class MainActivity extends Activity {

    private static final String HOME = "https://tamilya.yt/";
    /** Arrêts du moteur d'affichage : pas de relance sans fin si une page le fait tomber à chaque fois. */
    private static final CrashGuard RENDER_GUARD = new CrashGuard();
    private static final String SITE_HOST = "tamilya.yt";
    private static final String SITE_ORIGIN = "https://tamilya.yt";
    /** Identifiant client Google « Web » du site (public : il figure dans toute page avec un bouton Google). */
    private static final String GOOGLE_WEB_CLIENT_ID = "557607296482-8jkgd9squ5e2jdg1mufnl4p5fmn7m4sv.apps.googleusercontent.com";

    private static final int REQ_WEB_MIC = 1;
    private static final int REQ_SPEECH_MIC = 2;
    private static final int REQ_LOCATION = 3;
    private static final int REQ_FILE = 4;
    private static final int REQ_CONNECT = 5;
    private static final int REQ_SAVE_PDF = 6;
    /** Environ 8 Mo de PDF, bien plus qu'un document d'une page avec deux signatures. */
    private static final int MAX_PDF_BASE64 = 11_000_000;

    /** Geste vers le haut qui ouvre et ferme Tamilya Connect. */
    private static final int SWIPE_DP = 160;
    /** Durée du fondu de Tamilya Connect, un peu plus pour rendre le fond à la conversation. */
    private static final int PAGE_PULL_RESET_MS = 260;

    private final Handler main = new Handler(Looper.getMainLooper());

    /** Connu du seul cadre principal : les iframes ne peuvent pas appeler le pont du micro. */
    private final String bridgeToken = newToken();

    private WebView web;
    private View splash;
    private View offline;
    private boolean pageFailed;

    private PermissionRequest pendingWebMic;
    private GeolocationPermissions.Callback pendingGeo;
    private String pendingGeoOrigin;
    private ValueCallback<Uri[]> pendingFile;
    private byte[] pendingPdf;

    private SpeechRecognizer recognizer;
    private String pendingSpeechLang;

    private SoundPool sounds;
    private int soundStart;
    private int soundEnd;
    private long lastTap;

    private TextToSpeech tts;
    private boolean ttsReady;
    private final ArrayList<Runnable> ttsWaiting = new ArrayList<>();

    private TamilyaConnect connect;
    /** Moteur et styles des cartes, rangés dans l'APK et mis à jour tout seuls. */
    private MapCache mapCache;
    private ConnectivityManager connectivity;
    private ConnectivityManager.NetworkCallback networkCallback;
    private boolean online = true;
    /** Tamilya Connect ouvert avec internet : il reste ouvert tant que la personne ne le ferme pas. */
    private boolean openedOnline;

    private float swipeX;
    private float swipeY;
    private boolean swipeDone;
    /** La page sous le doigt est déjà tout en bas (demandé à la page au début du geste). */
    private boolean webAtBottom;
    /** Dernier état envoyé par la page à chaque défilement : connu dès que le doigt se pose. */
    private volatile boolean pageAtBottom;
    /** Un dessin du geste est en cours dans la page : on n'envoie que le plus récent. */
    private boolean pullInFlight;
    private float pullSent = -1f, pullWanted;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor("#111111"));

        FrameLayout content = new FrameLayout(this);
        web = new WebView(this);
        content.addView(web, match());
        offline = buildOfflineView();
        offline.setVisibility(View.GONE);
        content.addView(offline, match());
        mapCache = new MapCache(this);
        connect = new TamilyaConnect(this, new TamilyaConnect.Host() {
            @Override
            public void requestConnectPermissions(String[] permissions) {
                requestPermissions(permissions, REQ_CONNECT);
            }

            @Override
            public void onConnectClosed() {
                openedOnline = false;
                // Internet revenu pendant Tamilya Connect : on retrouve la page normale.
                if (online && pageFailed) retry();
            }

            @Override
            public void openPage(String path) {
                // Sans internet, la page dit qu'il faut internet, comme partout ailleurs dans l'app.
                web.loadUrl(SITE_ORIGIN + path);
            }
        });
        content.addView(connect.view(), match());
        splash = buildSplashView();
        content.addView(splash, match());
        root.addView(content, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(root);
        applySystemBars(root);

        configureWebView();
        loadSounds();
        watchNetwork();

        if (state != null) web.restoreState(state);
        if (web.getUrl() == null) web.loadUrl(startUrl(getIntent()));
    }

    private static FrameLayout.LayoutParams match() {
        return new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
    }

    /** Android 11+ : le contenu s'arrête aux barres système et remonte avec le clavier. */
    private void applySystemBars(View root) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return;
        getWindow().setDecorFitsSystemWindows(false);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            // displayCutout : Android 15+ dessine sous l'encoche ; en paysage, le bord de la page s'y cachait.
            Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout()
                    | WindowInsets.Type.ime());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsets.CONSUMED;
        });
    }

    private View buildSplashView() {
        FrameLayout box = new FrameLayout(this);
        box.setBackgroundColor(Color.parseColor("#111111"));
        ImageView icon = new ImageView(this);
        icon.setImageResource(R.mipmap.ic_launcher);
        int size = dp(128);
        box.addView(icon, new FrameLayout.LayoutParams(size, size, Gravity.CENTER));
        return box;
    }

    private View buildOfflineView() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setBackgroundColor(Color.parseColor("#111111"));
        box.setPadding(dp(32), dp(24), dp(32), dp(24));

        // Pastille douce autour du logo, pour ne pas faire « page d'erreur de navigateur ».
        android.graphics.drawable.GradientDrawable halo = new android.graphics.drawable.GradientDrawable();
        halo.setShape(android.graphics.drawable.GradientDrawable.OVAL);
        halo.setColor(Color.parseColor("#1D1F21"));
        ImageView icon = new ImageView(this);
        icon.setImageResource(R.mipmap.ic_launcher);
        icon.setBackground(halo);
        icon.setPadding(dp(22), dp(22), dp(22), dp(22));
        box.addView(icon, new LinearLayout.LayoutParams(dp(112), dp(112)));

        TextView title = new TextView(this);
        title.setText(R.string.offline_title);
        title.setTextColor(Color.parseColor("#F5F0E6"));
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 23);
        title.setTypeface(title.getTypeface(), android.graphics.Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, dp(28), 0, dp(10));
        box.addView(title);

        TextView message = new TextView(this);
        message.setText(R.string.offline_message);
        message.setTextColor(Color.parseColor("#8E9398"));
        message.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        message.setLineSpacing(dp(4), 1f);
        message.setGravity(Gravity.CENTER);
        box.addView(message, new LinearLayout.LayoutParams(dp(300), LinearLayout.LayoutParams.WRAP_CONTENT));

        // Action principale : ouvrir Tamilya Connect. Bouton rose plein, comme l'app.
        TextView write = new TextView(this);
        write.setText(R.string.offline_write);
        write.setTextColor(Color.WHITE);
        write.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        write.setTypeface(write.getTypeface(), android.graphics.Typeface.BOLD);
        write.setGravity(Gravity.CENTER);
        write.setPadding(dp(30), dp(15), dp(30), dp(15));
        android.graphics.drawable.GradientDrawable pink = new android.graphics.drawable.GradientDrawable();
        pink.setColor(Color.parseColor("#F06A9B"));
        pink.setCornerRadius(dp(28));
        write.setBackground(pink);
        write.setOnClickListener(v -> connect.open());
        LinearLayout.LayoutParams writeParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        writeParams.topMargin = dp(32);
        box.addView(write, writeParams);

        // Réessayer : discret, sous le bouton.
        TextView retry = new TextView(this);
        retry.setText(R.string.offline_retry);
        retry.setTextColor(Color.parseColor("#8E9398"));
        retry.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        retry.setGravity(Gravity.CENTER);
        retry.setPadding(dp(16), dp(18), dp(16), dp(8));
        retry.setOnClickListener(v -> retry());
        box.addView(retry);
        return box;
    }

    private void retry() {
        pageFailed = false;
        offline.setVisibility(View.GONE);
        web.reload();
    }

    /** Internet présent et vérifié par Android (pas seulement un wifi sans accès). */
    private void watchNetwork() {
        connectivity = getSystemService(ConnectivityManager.class);
        if (connectivity == null) return;
        NetworkCapabilities current = connectivity.getNetworkCapabilities(connectivity.getActiveNetwork());
        setOnline(current != null && current.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED));
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onCapabilitiesChanged(Network network, NetworkCapabilities caps) {
                boolean validated = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
                main.post(() -> setOnline(validated));
            }

            @Override
            public void onLost(Network network) {
                main.post(() -> setOnline(false));
            }
        };
        connectivity.registerDefaultNetworkCallback(networkCallback);
    }

    private void setOnline(boolean value) {
        boolean changed = value != online;
        online = value;
        connect.setOnline(value);
        if (!changed || !value) return;
        // Internet revenu : Tamilya Connect se ferme tout seul, sauf si la personne l'a ouvert avec internet.
        if (connect.isOpen()) {
            if (!openedOnline) connect.close();
        } else if (pageFailed) retry();
    }

    /**
     * Glisser vers le haut, comme le mode éphémère d'Instagram, avec ou sans internet, dans
     * la conversation : les messages montent, un petit rond se remplit au-dessus de la barre
     * d'écriture, qui ne bouge pas. Rond complet : ça vibre et Tamilya Connect s'ouvre.
     * Lâché avant, tout redescend.
     */
    @Override
    public boolean dispatchTouchEvent(MotionEvent event) {
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                swipeX = event.getRawX();
                swipeY = event.getRawY();
                swipeDone = false;
                pullFired = false;
                touching = true;
                // Avec internet, la page répond plus lentement : on part de ce qu'elle a déjà dit.
                webAtBottom = pageAtBottom;
                if (!connect.isOpen() && offline.getVisibility() != View.VISIBLE) askConversationAtBottom(event);
                break;
            case MotionEvent.ACTION_MOVE: {
                float up = swipeY - event.getRawY();
                float side = Math.abs(event.getRawX() - swipeX);
                if (!touching) break;
                if (!swipeDone) {
                    boolean eligible = connect.isOpen() ? connect.atBottom() : webAtBottom;
                    if (!eligible || up < dp(18) || up < side * 2) break;
                    // C'est bien le geste : la page ne reçoit plus le doigt.
                    swipeDone = true;
                    swipeY = event.getRawY();
                    MotionEvent cancel = MotionEvent.obtain(event);
                    cancel.setAction(MotionEvent.ACTION_CANCEL);
                    super.dispatchTouchEvent(cancel);
                    cancel.recycle();
                    up = 0;
                }
                if (!pullFired) dragTo(Math.max(0f, up));
                return true;
            }
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                touching = false;
                if (swipeDone) {
                    swipeDone = false;
                    if (!pullFired) release();
                    pullFired = false;
                    return true;
                }
                if (event.getActionMasked() == MotionEvent.ACTION_UP && pressedNativeButton(event)) feedback("key");
                break;
            default:
                break;
        }
        return super.dispatchTouchEvent(event);
    }

    /** Appui sans glisser sur un bouton de Tamilya Connect ou de l'écran hors ligne. */
    private boolean pressedNativeButton(MotionEvent event) {
        if (Math.abs(event.getRawX() - swipeX) > dp(12) || Math.abs(event.getRawY() - swipeY) > dp(12)) return false;
        View screen = connect.isOpen() ? connect.view() : offline.getVisibility() == View.VISIBLE ? offline : null;
        return screen instanceof ViewGroup && hitsButton((ViewGroup) screen, event.getRawX(), event.getRawY());
    }

    private boolean hitsButton(ViewGroup parent, float x, float y) {
        int[] at = new int[2];
        for (int i = parent.getChildCount() - 1; i >= 0; i--) {
            View child = parent.getChildAt(i);
            if (child.getVisibility() != View.VISIBLE) continue;
            child.getLocationOnScreen(at);
            if (x < at[0] || y < at[1] || x >= at[0] + child.getWidth() || y >= at[1] + child.getHeight()) continue;
            if (child.isClickable()) return true;
            if (child instanceof ViewGroup && hitsButton((ViewGroup) child, x, y)) return true;
        }
        return false;
    }

    /** Le rond a été complété pendant ce geste : la suite du doigt est ignorée. */
    private boolean pullFired;
    private float pullProgress;
    /** Un doigt est posé : seul un vrai geste (posé, glissé, levé) peut ouvrir ou fermer. */
    private boolean touching;

    /** Le doigt monte : les messages suivent, le rond se remplit. */
    private void dragTo(float distance) {
        float progress = Math.min(1f, distance / dp(SWIPE_DP));
        setPull(progress);
        if (progress < 1f) return;
        pullFired = true;
        haptic(VibrationEffect.EFFECT_HEAVY_CLICK, 0, 40);
        release();
    }

    private void setPull(float progress) {
        pullProgress = progress;
        if (connect.isOpen()) connect.setPull(progress);
        else setPagePull(progress);
    }

    /** Messages et rond de la conversation : dessinés dans la page, la barre d'écriture reste en place. */
    private void setPagePull(float progress) {
        pullWanted = progress;
        if (pullInFlight || progress == pullSent) return;
        pullInFlight = true;
        pullSent = progress;
        web.evaluateJavascript("window.__tcPull&&__tcPull(" + progress + ")", ignored -> {
            pullInFlight = false;
            if (pullWanted != pullSent) setPagePull(pullWanted);
        });
    }

    /** Rond complet : on active. Sinon, tout redescend. */
    private void release() {
        boolean closing = connect.isOpen();
        if (pullProgress < 1f) {
            android.animation.ValueAnimator back = android.animation.ValueAnimator.ofFloat(pullProgress, 0f).setDuration(220);
            back.addUpdateListener(a -> setPull((float) a.getAnimatedValue()));
            back.start();
        } else if (closing) {
            connect.close();
        } else {
            openedOnline = online;
            connect.open();
            web.postDelayed(() -> setPagePull(0f), PAGE_PULL_RESET_MS);
        }
    }

    /** Dans la conversation, la zone sous le doigt est-elle déjà tout en bas ? */
    private void askConversationAtBottom(MotionEvent event) {
        int[] origin = new int[2];
        web.getLocationOnScreen(origin);
        float density = getResources().getDisplayMetrics().density;
        float x = (event.getRawX() - origin[0]) / density;
        float y = (event.getRawY() - origin[1]) / density;
        String js = "(function(x,y){function end(e){return e.scrollTop+e.clientHeight>=e.scrollHeight-2;}"
                // L'accueil garde la conversation préparée dessous : ce n'est pas encore la conversation.
                + "if(!document.querySelector('[data-chat-view]')||document.querySelector('.landing-home'))return false;"
                + "for(var e=document.elementFromPoint(x,y);e&&e!==document.body&&e!==document.documentElement;e=e.parentElement){"
                + "var s=getComputedStyle(e).overflowY;if((s==='auto'||s==='scroll')&&e.scrollHeight>e.clientHeight+1)return end(e);}"
                + "return end(document.scrollingElement||document.documentElement);})(" + x + "," + y + ")";
        web.evaluateJavascript(js, result -> webAtBottom = "true".equals(result));
    }

    private int dp(int value) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics()));
    }

    private void configureWebView() {
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
        web.setBackgroundColor(Color.parseColor("#111111"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setGeolocationEnabled(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setTextZoom(100);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " TamilyaApp/" + BuildInfo.VERSION);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(web, false);

        // Un seul objet natif, visible dans tous les cadres : chaque appel exige le jeton,
        // que seul le cadre principal de tamilya.yt reçoit (pageScript). TamilyaGoogle et
        // TamilyaFiles, appelés par le site, sont de simples relais JS posés par pageScript.
        web.addJavascriptInterface(new NativeBridge(), "TamilyaNative");
        web.setWebViewClient(new AppWebViewClient());
        web.setWebChromeClient(new AppChromeClient());
        web.setDownloadListener((url, agent, disposition, mime, length) -> openExternally(Uri.parse(url)));
    }

    /**
     * Ce qui s'affiche dans l'app : le site et la page de paiement Stripe Checkout (le seul
     * produit Stripe ouvert par le site, voir src/lib/wallet/stripe.ts). hooks.stripe.com :
     * retour de Stripe après une validation bancaire (3-D Secure) faite hors de l'iframe.
     * Le reste part dans le navigateur.
     */
    private static boolean staysInApp(Uri uri) {
        String host = uri.getHost();
        if (!"https".equals(uri.getScheme()) || host == null) return false;
        return host.equals(SITE_HOST) || host.endsWith("." + SITE_HOST)
                || host.equals("checkout.stripe.com") || host.equals("hooks.stripe.com");
    }

    private static boolean isSiteOrigin(Uri origin) {
        return origin != null && "https".equals(origin.getScheme()) && SITE_HOST.equals(origin.getHost());
    }

    private void openExternally(Uri uri) {
        String scheme = uri.getScheme();
        if (!"https".equals(scheme) && !"http".equals(scheme) && !"mailto".equals(scheme) && !"tel".equals(scheme)) return;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE));
        } catch (ActivityNotFoundException ignored) {
            // Aucune app ne sait ouvrir ce lien : on reste sur la page.
        }
    }

    private String startUrl(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        if (data != null && "https".equals(data.getScheme()) && SITE_HOST.equals(data.getHost())) return data.toString();
        return HOME;
    }

    private void hideSplash() {
        if (splash.getVisibility() != View.VISIBLE) return;
        splash.animate().alpha(0f).setDuration(220).withEndAction(() -> splash.setVisibility(View.GONE)).start();
    }

    private void injectPageSupport(WebView view) {
        if (!isSiteOrigin(Uri.parse(String.valueOf(view.getUrl())))) return;
        view.evaluateJavascript(pageScript(), null);
        view.evaluateJavascript(connectPullScript(), null);
    }

    /** Pendant le geste : les messages montent et un petit rond se remplit au-dessus de la barre d'écriture. */
    private String connectPullScript() {
        return "(function(token){if(window.__tcPull)return;"
                // À chaque défilement : la conversation est-elle tout en bas ? (envoyé seulement quand ça change)
                + "var lastEnd=null;function tcEnd(){var v=!!document.querySelector('[data-chat-view]')&&!document.querySelector('.landing-home');"
                + "if(v){var m=document.querySelector('[data-chat-view]'),s=null;for(var e of m.querySelectorAll('*')){var o=getComputedStyle(e).overflowY;if((o==='auto'||o==='scroll')&&e.scrollHeight>e.clientHeight+1){s=e;break;}}"
                + "s=s||document.scrollingElement||document.documentElement;v=s.scrollTop+s.clientHeight>=s.scrollHeight-2;}"
                + "if(v!==lastEnd){lastEnd=v;TamilyaNative.atBottom(token,v);}}"
                + "var tcWait=0;function tcSoon(){if(!tcWait)tcWait=requestAnimationFrame(function(){tcWait=0;tcEnd();});}"
                + "document.addEventListener('scroll',tcSoon,{capture:true,passive:true});window.addEventListener('resize',tcSoon);"
                + "new MutationObserver(tcSoon).observe(document.documentElement,{childList:true,subtree:true});tcSoon();"
                + "var st=document.createElement('style');"
                + "st.textContent='#tc-rond{position:fixed;left:0;right:0;z-index:30;pointer-events:none;text-align:center;color:#8E9398;font-size:14px}"
                + "#tc-rond svg{display:block;margin:0 auto 10px;width:36px;height:36px;transform:rotate(-90deg)}"
                + "#tc-rond circle{fill:none;stroke:#8E9398;stroke-width:2.5;stroke-linecap:round}"
                + "html.tc-pull [data-chat-view]>:not(header):not(.composer-dock){transform:translateY(var(--tc-up))}';"
                + "(document.head||document.documentElement).appendChild(st);"
                + "var ring=null,arc=null,root=document.documentElement,LONG=113.1;"
                + "window.__tcPull=function(p){"
                + "if(!(p>0)){root.classList.remove('tc-pull');if(ring)ring.remove();ring=null;return;}"
                + "var dock=document.querySelector('.composer-dock');if(!dock)return;"
                // Doigt resté posé : la sélection de texte ne doit pas rester à l'écran.
                + "var sel=window.getSelection();if(sel)sel.removeAllRanges();"
                + "if(!ring||!ring.isConnected){ring=document.createElement('div');ring.id='tc-rond';"
                + "ring.innerHTML='<svg viewBox=\"0 0 40 40\"><circle cx=\"20\" cy=\"20\" r=\"18\"/></svg>Balaye vers le haut pour activer Tamilya Connect';"
                + "arc=ring.querySelector('circle');document.body.appendChild(ring);}"
                + "root.classList.add('tc-pull');root.style.setProperty('--tc-up',(-112*p)+'px');"
                + "ring.style.top=(dock.getBoundingClientRect().top-76)+'px';"
                + "ring.style.opacity=String(Math.min(1,p*3));"
                + "arc.style.strokeDasharray=(LONG*p)+' '+LONG;};})(" + JSONObject.quote(bridgeToken) + ")";
    }

    /**
     * Android WebView n'a pas de reconnaissance vocale : on donne au site la même interface
     * que Chrome (voir src/lib/chat/voice.ts), branchée sur celle d'Android.
     */
    private String pageScript() {
        return "(function(token){"
                // Ponts appelés par le site (google-identity.ts, AttestationHebergement.tsx) : même
                // nom et mêmes arguments qu'avant, le jeton est ajouté ici, dans ce cadre seulement.
                + "if(!window.TamilyaGoogle)window.TamilyaGoogle={googleSignIn:function(r,n){TamilyaNative.googleSignIn(token,String(r),String(n));}};"
                + "if(!window.TamilyaFiles)window.TamilyaFiles={savePdf:function(n,b){TamilyaNative.savePdf(token,String(n),String(b));}};"
                // Prévient le site (fenêtre de connexion déjà ouverte) que le bouton Google natif est prêt.
                + "try{window.dispatchEvent(new Event('tamilya-native-ready'));}catch(e){}"
                + "if(window.__tamilyaVoice)return;"
                + "var st=document.createElement('style');"
                + "st.textContent='.voice-halo{display:none!important}.voice-overlay[data-compact]::after{content:\"\";position:fixed;inset:-24px;z-index:-1;pointer-events:none;opacity:.35;border-radius:64px;box-shadow:inset 34px 0 60px -22px #4dd2ff,inset -34px 0 60px -22px #ff4dd8,inset 0 34px 60px -22px #7a5cff,inset 0 -34px 60px -22px #ff9a5c;transition:opacity .6s ease;animation:tamilya-glow 6s ease-in-out infinite alternate}.voice-overlay[data-compact]:has([data-state=waiting])::after{opacity:.6}.voice-overlay[data-compact]:has([data-state=speaking])::after{opacity:.9}@keyframes tamilya-glow{from{filter:hue-rotate(-22deg)}to{filter:hue-rotate(22deg)}}@media (prefers-reduced-motion:reduce){.voice-overlay[data-compact]::after{animation:none}}"
                // Le site a sa propre lueur (.voice-edge) : on n'en affiche qu'une.
                + "html:has(.voice-edge) .voice-overlay[data-compact]::after{display:none!important}';"
                + "(document.head||document.documentElement).appendChild(st);"
                // Vibration et sons : /voix garde son écran ouvert, sa session commence à la première écoute.
                // Vibrations du site (écriture de Tamilya, réponse prête) : celles du téléphone, sans la limite du navigateur.
                + "navigator.vibrate=function(p){TamilyaNative.feedback(token,Array.isArray(p)?'ready':'tick');return true;};"
                + "document.addEventListener('click',function(e){var t=e.target;"
                + "if(!t||!t.closest)return;if(t.closest('.awa-blob,.voice-orb-slot'))TamilyaNative.feedback(token,'tap');"
                // Tous les boutons du site : petite vibration, sans son.
                + "else if(t.closest('button,a,summary,label,select,[role=button],[role=tab],[role=menuitem],[role=switch],[role=option],input[type=checkbox],input[type=radio]'))TamilyaNative.feedback(token,'key');},true);"
                + "var voiceOn=false;function watchVoice(){var o=document.querySelector('.voice-overlay'),s=document.querySelector('.voice-orb-slot');"
                + "var on=!!o&&(voiceOn||location.pathname!=='/voix'||(!!s&&s.dataset.state!=='off'));"
                + "if(on!==voiceOn){voiceOn=on;TamilyaNative.feedback(token,on?'start':'end');}}"
                + "new MutationObserver(watchVoice).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['data-state']});"
                + "var active=null;"
                + "function R(){this.lang='fr-FR';this.continuous=false;this.interimResults=false;"
                + "this.onresult=null;this.onerror=null;this.onend=null;this.onaudiostart=null;this.onsoundstart=null;}"
                + "R.prototype.start=function(){if(active)throw new Error('busy');active=this;TamilyaNative.startListening(token,this.lang||'fr-FR');};"
                + "R.prototype.stop=function(){TamilyaNative.stopListening(token);};"
                + "R.prototype.abort=function(){TamilyaNative.cancelListening(token);};"
                + "window.__tamilyaVoice=function(type,text,isFinal){var r=active;if(!r)return;"
                + "if(type==='audiostart'&&r.onaudiostart)r.onaudiostart();"
                + "else if(type==='soundstart'&&r.onsoundstart)r.onsoundstart();"
                + "else if(type==='result'&&r.onresult){var res=[{transcript:text}];res.isFinal=isFinal;r.onresult({resultIndex:0,results:[res]});}"
                + "else if(type==='error'&&r.onerror)r.onerror({error:text});"
                + "else if(type==='end'){active=null;if(r.onend)r.onend();}};"
                + "window.SpeechRecognition=R;window.webkitSpeechRecognition=R;"
                // Android WebView n a pas non plus de synthèse vocale : même principe.
                + "if(!('speechSynthesis' in window)){"
                + "var utterances={},next=0;"
                + "var voice={name:'Google français',lang:'fr-FR',default:true,localService:true,voiceURI:'fr-FR'};"
                + "window.SpeechSynthesisUtterance=function(t){this.text=t||'';this.lang='fr-FR';this.voice=null;this.rate=1;this.pitch=1;this.volume=1;"
                + "this.onstart=null;this.onend=null;this.onerror=null;this.onboundary=null;};"
                + "window.speechSynthesis={speaking:false,pending:false,paused:false,onvoiceschanged:null,"
                + "getVoices:function(){return[voice];},"
                + "speak:function(u){if(!u.text){setTimeout(function(){if(u.onend)u.onend({});},0);return;}"
                + "var id=++next;utterances[id]=u;TamilyaNative.speak(token,String(id),u.text,u.lang||'fr-FR',u.rate||1,u.pitch||1);},"
                + "cancel:function(){utterances={};TamilyaNative.stopSpeaking(token);},"
                + "pause:function(){},resume:function(){},addEventListener:function(){},removeEventListener:function(){}};"
                + "window.__tamilyaTts=function(type,id,start){var u=utterances[id];if(!u)return;"
                + "if(type==='start'){if(u.onstart)u.onstart({});}"
                + "else if(type==='word'){if(u.onboundary)u.onboundary({name:'word',charIndex:start});}"
                + "else{delete utterances[id];if(type==='end'){if(u.onend)u.onend({});}else if(u.onerror)u.onerror({error:'synthesis-failed'});}};"
                + "}"
                + "})(" + JSONObject.quote(bridgeToken) + ");";
    }

    private void voiceEvent(String type, String text, boolean isFinal) {
        String js = "window.__tamilyaVoice&&window.__tamilyaVoice(" + JSONObject.quote(type) + ","
                + JSONObject.quote(text == null ? "" : text) + "," + isFinal + ");";
        main.post(() -> {
            if (web != null) web.evaluateJavascript(js, null);
        });
    }

    private void ttsEvent(String type, String id, int start) {
        String js = "window.__tamilyaTts&&window.__tamilyaTts(" + JSONObject.quote(type) + ","
                + JSONObject.quote(id) + "," + start + ");";
        main.post(() -> {
            if (web != null) web.evaluateJavascript(js, null);
        });
    }

    private void withTts(Runnable action) {
        if (ttsReady) {
            action.run();
            return;
        }
        ttsWaiting.add(action);
        if (tts != null) return;
        tts = new TextToSpeech(this, status -> {
            ttsReady = status == TextToSpeech.SUCCESS;
            ArrayList<Runnable> waiting = new ArrayList<>(ttsWaiting);
            ttsWaiting.clear();
            for (Runnable waitingAction : waiting) waitingAction.run();
        });
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String id) { ttsEvent("start", id, 0); }
            @Override public void onDone(String id) { ttsEvent("end", id, 0); }
            @Override public void onError(String id) { ttsEvent("error", id, 0); }
            @Override public void onRangeStart(String id, int start, int end, int frame) { ttsEvent("word", id, start); }
        });
    }

    private void speak(String id, String text, String lang, float rate, float pitch) {
        withTts(() -> {
            if (!ttsReady) {
                ttsEvent("error", id, 0);
                return;
            }
            tts.setLanguage(Locale.forLanguageTag(lang));
            tts.setSpeechRate(rate);
            tts.setPitch(pitch);
            if (tts.speak(text, TextToSpeech.QUEUE_ADD, null, id) != TextToSpeech.SUCCESS) ttsEvent("error", id, 0);
        });
    }

    private void loadSounds() {
        AudioAttributes attributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        sounds = new SoundPool.Builder().setMaxStreams(2).setAudioAttributes(attributes).build();
        soundStart = sounds.load(this, R.raw.voice_start, 1);
        soundEnd = sounds.load(this, R.raw.voice_end, 1);
    }

    private void vibrate(long... pattern) {
        Vibrator vibrator = getSystemService(Vibrator.class);
        if (vibrator == null || !vibrator.hasVibrator()) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1));
        } else {
            vibrator.vibrate(pattern, -1);
        }
    }

    /** Vibration nette du téléphone (comme le clavier ou les boutons du système), pas un bourdonnement. */
    private void haptic(int effect, long... fallback) {
        Vibrator vibrator = getSystemService(Vibrator.class);
        if (vibrator == null || !vibrator.hasVibrator()) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) vibrator.vibrate(VibrationEffect.createPredefined(effect));
        else vibrate(fallback);
    }

    /** Boutons, globe, écriture de Tamilya, vocal. Le son reste réservé au vocal. */
    private void feedback(String kind) {
        long now = SystemClock.elapsedRealtime();
        switch (kind) {
            case "tap":
                lastTap = now;
                haptic(VibrationEffect.EFFECT_CLICK, 0, 30);
                break;
            case "tick":
                haptic(VibrationEffect.EFFECT_TICK, 0, 12);
                break;
            case "ready":
                haptic(VibrationEffect.EFFECT_DOUBLE_CLICK, 0, 25, 70, 25);
                break;
            case "key":
                // Un même appui peut arriver deux fois : par la page et par l'écran natif.
                if (now - lastTap < 120) break;
                lastTap = now;
                haptic(VibrationEffect.EFFECT_CLICK, 0, 30);
                break;
            case "start":
                sounds.play(soundStart, 0.8f, 0.8f, 1, 0, 1f);
                if (now - lastTap > 500) haptic(VibrationEffect.EFFECT_CLICK, 0, 30);
                break;
            case "end":
                sounds.play(soundEnd, 0.8f, 0.8f, 1, 0, 1f);
                haptic(VibrationEffect.EFFECT_DOUBLE_CLICK, 0, 25, 70, 25);
                break;
            default:
                break;
        }
    }

    private void googleResult(String request, String token, String error) {
        String js = "window.__tamilyaGoogle&&window.__tamilyaGoogle(" + JSONObject.quote(request) + ","
                + JSONObject.quote(token) + "," + JSONObject.quote(error) + ");";
        main.post(() -> {
            if (web != null) web.evaluateJavascript(js, null);
        });
    }

    /** Panneau de compte Google d'Android, par-dessus l'app : la personne ne la quitte pas. */
    private void googleSignIn(String request, String hashedNonce) {
        if (web == null || !isSiteOrigin(Uri.parse(String.valueOf(web.getUrl())))) return;
        GetSignInWithGoogleOption option = new GetSignInWithGoogleOption.Builder(GOOGLE_WEB_CLIENT_ID)
                .setNonce(hashedNonce)
                .build();
        GetCredentialRequest credentialRequest = new GetCredentialRequest.Builder()
                .addCredentialOption(option)
                .build();
        CredentialManager.create(this).getCredentialAsync(this, credentialRequest, new CancellationSignal(),
                main::post, new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                    @Override
                    public void onResult(GetCredentialResponse response) {
                        Credential credential = response.getCredential();
                        if (credential instanceof CustomCredential
                                && GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())) {
                            try {
                                String token = GoogleIdTokenCredential.createFrom(credential.getData()).getIdToken();
                                googleResult(request, token, "");
                            } catch (RuntimeException e) {
                                googleResult(request, "", "invalid-credential");
                            }
                        } else {
                            googleResult(request, "", "invalid-credential");
                        }
                    }

                    @Override
                    public void onError(GetCredentialException e) {
                        String code = e instanceof GetCredentialCancellationException ? "cancelled"
                                : e instanceof NoCredentialException ? "no-credential"
                                : "google-" + e.getType();
                        googleResult(request, "", code);
                    }
                });
    }

    private boolean hasPermission(String permission) {
        return checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED;
    }

    private void startSpeech(String lang) {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            voiceEvent("error", "service-not-allowed", false);
            voiceEvent("end", "", false);
            return;
        }
        if (!hasPermission(Manifest.permission.RECORD_AUDIO)) {
            pendingSpeechLang = lang;
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_SPEECH_MIC);
            return;
        }
        if (recognizer == null) {
            recognizer = SpeechRecognizer.createSpeechRecognizer(this);
            recognizer.setRecognitionListener(new SpeechListener());
        }
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
                .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        recognizer.startListening(intent);
    }

    private void cancelSpeech() {
        if (recognizer != null) recognizer.cancel();
        voiceEvent("error", "aborted", false);
        voiceEvent("end", "", false);
    }

    /** Appelé depuis la page : tout est vérifié par le jeton, puis exécuté sur le fil principal. */
    private final class NativeBridge {
        @JavascriptInterface
        public void atBottom(String token, boolean value) {
            if (bridgeToken.equals(token)) pageAtBottom = value;
        }

        @JavascriptInterface
        public void startListening(String token, String lang) {
            if (!bridgeToken.equals(token)) return;
            main.post(() -> startSpeech(lang));
        }

        @JavascriptInterface
        public void speak(String token, String id, String text, String lang, float rate, float pitch) {
            if (!bridgeToken.equals(token)) return;
            main.post(() -> MainActivity.this.speak(id, text, lang, rate, pitch));
        }

        @JavascriptInterface
        public void stopSpeaking(String token) {
            if (!bridgeToken.equals(token)) return;
            main.post(() -> {
                ttsWaiting.clear();
                if (tts != null) tts.stop();
            });
        }

        @JavascriptInterface
        public void feedback(String token, String kind) {
            if (!bridgeToken.equals(token)) return;
            main.post(() -> MainActivity.this.feedback(kind));
        }

        @JavascriptInterface
        public void stopListening(String token) {
            if (!bridgeToken.equals(token)) return;
            main.post(() -> {
                if (recognizer != null) recognizer.stopListening();
            });
        }

        @JavascriptInterface
        public void cancelListening(String token) {
            if (!bridgeToken.equals(token)) return;
            main.post(MainActivity.this::cancelSpeech);
        }

        /** Bouton Google du site (google-identity.ts), via le relais window.TamilyaGoogle de pageScript. */
        @JavascriptInterface
        public void googleSignIn(String token, String request, String hashedNonce) {
            if (!bridgeToken.equals(token)) return;
            if (request == null || hashedNonce == null || request.length() > 64 || hashedNonce.length() > 128) return;
            main.post(() -> MainActivity.this.googleSignIn(request, hashedNonce));
        }

        /** PDF créé dans la page (un lien blob: ne peut pas partir dans le navigateur), via window.TamilyaFiles. */
        @JavascriptInterface
        public void savePdf(String token, String name, String base64) {
            if (!bridgeToken.equals(token)) return;
            if (name == null || base64 == null || base64.length() > MAX_PDF_BASE64) return;
            main.post(() -> MainActivity.this.savePdf(name, base64));
        }
    }

    /** La personne choisit où ranger le fichier : aucune permission de stockage n'est nécessaire. */
    private void savePdf(String name, String base64) {
        String page = web == null ? null : web.getUrl();
        if (page == null || !isSiteOrigin(Uri.parse(page))) return;
        byte[] pdf;
        try {
            pdf = Base64.decode(base64, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            return;
        }
        if (!isPdf(pdf)) return;
        pendingPdf = pdf;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType("application/pdf")
                .putExtra(Intent.EXTRA_TITLE, safePdfName(name));
        try {
            startActivityForResult(intent, REQ_SAVE_PDF);
        } catch (ActivityNotFoundException e) {
            pendingPdf = null;
            Toast.makeText(this, R.string.pdf_failed, Toast.LENGTH_LONG).show();
        }
    }

    private static boolean isPdf(byte[] bytes) {
        return bytes.length > 4 && bytes[0] == '%' && bytes[1] == 'P' && bytes[2] == 'D' && bytes[3] == 'F' && bytes[4] == '-';
    }

    private static String safePdfName(String name) {
        String clean = name.replaceAll("[^A-Za-z0-9._-]", "-");
        if (clean.length() > 80) clean = clean.substring(0, 80);
        return clean.toLowerCase(Locale.ROOT).endsWith(".pdf") ? clean : clean + ".pdf";
    }

    private void writePendingPdf(Uri target) {
        byte[] pdf = pendingPdf;
        pendingPdf = null;
        if (target == null) return;
        try (OutputStream out = getContentResolver().openOutputStream(target)) {
            if (pdf == null || out == null) throw new IOException("Fichier indisponible");
            out.write(pdf);
            Toast.makeText(this, R.string.pdf_saved, Toast.LENGTH_LONG).show();
        } catch (IOException | SecurityException e) {
            Toast.makeText(this, R.string.pdf_failed, Toast.LENGTH_LONG).show();
        }
    }

    private final class SpeechListener implements RecognitionListener {
        private String firstOf(Bundle bundle) {
            ArrayList<String> list = bundle == null ? null : bundle.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
            return list == null || list.isEmpty() ? "" : list.get(0);
        }

        @Override public void onReadyForSpeech(Bundle params) { voiceEvent("audiostart", "", false); }
        @Override public void onBeginningOfSpeech() { voiceEvent("soundstart", "", false); }
        @Override public void onRmsChanged(float rmsdB) { }
        @Override public void onBufferReceived(byte[] buffer) { }
        @Override public void onEndOfSpeech() { }
        @Override public void onEvent(int eventType, Bundle params) { }

        @Override public void onPartialResults(Bundle partial) {
            String text = firstOf(partial);
            if (!text.isEmpty()) voiceEvent("result", text, false);
        }

        @Override public void onResults(Bundle results) {
            String text = firstOf(results);
            if (!text.isEmpty()) voiceEvent("result", text, true);
            voiceEvent("end", "", false);
        }

        @Override public void onError(int error) {
            String code;
            switch (error) {
                case SpeechRecognizer.ERROR_NO_MATCH:
                case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                    code = "no-speech";
                    break;
                case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                    code = "not-allowed";
                    break;
                case SpeechRecognizer.ERROR_NETWORK:
                case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                    code = "network";
                    break;
                case SpeechRecognizer.ERROR_AUDIO:
                    code = "audio-capture";
                    break;
                case SpeechRecognizer.ERROR_CLIENT:
                    code = "aborted";
                    break;
                default:
                    code = "service-not-allowed";
            }
            voiceEvent("error", code, false);
            voiceEvent("end", "", false);
        }
    }

    private final class AppWebViewClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            // Carte déjà dans l'app : rien à télécharger (appelé hors du fil de l'écran).
            WebResourceResponse kept = mapCache != null ? mapCache.intercept(request) : null;
            return kept != null ? kept : super.shouldInterceptRequest(view, request);
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (!request.isForMainFrame()) return false;
            Uri uri = request.getUrl();
            if (staysInApp(uri)) return false;
            openExternally(uri);
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            pageFailed = false;
        }

        @Override
        public void onPageCommitVisible(WebView view, String url) {
            injectPageSupport(view);
            if (!pageFailed) hideSplash();
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            injectPageSupport(view);
            CookieManager.getInstance().flush();
            // En ligne : prépare Tamilya Connect (clé de l'appareil, clé du serveur) pour le hors ligne.
            if (!pageFailed && online && isSiteOrigin(Uri.parse(String.valueOf(url)))) {
                connect.syncAccount(CookieManager.getInstance().getCookie(HOME));
            }
            if (!pageFailed) {
                offline.setVisibility(View.GONE);
                hideSplash();
            }
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (!request.isForMainFrame()) return;
            pageFailed = true;
            offline.setVisibility(View.VISIBLE);
            hideSplash();
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            // Le moteur d'affichage s'est arrêté (manque de mémoire) : on repart proprement,
            // sauf s'il tombe encore et encore (même page en cause) : on ferme au lieu de boucler.
            if (RENDER_GUARD.allowRestart(android.os.SystemClock.elapsedRealtime())) {
                recreate();
            } else {
                Toast.makeText(MainActivity.this, "Tamilya n'arrive pas à afficher cette page. Rouvre l'app dans un moment.", Toast.LENGTH_LONG).show();
                finish();
            }
            return true;
        }
    }

    private final class AppChromeClient extends WebChromeClient {
        @Override
        public void onPermissionRequest(PermissionRequest request) {
            boolean audioOnly = request.getResources().length == 1
                    && PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(request.getResources()[0]);
            if (!isSiteOrigin(request.getOrigin()) || !audioOnly) {
                request.deny();
                return;
            }
            if (hasPermission(Manifest.permission.RECORD_AUDIO)) {
                request.grant(request.getResources());
                return;
            }
            // Fenêtre d'autorisation déjà ouverte : l'ancienne demande reçoit une réponse (sinon le
            // micro de la page restait bloqué) et la nouvelle attend le choix de cette fenêtre.
            if (pendingWebMic != null) {
                pendingWebMic.deny();
                pendingWebMic = request;
                return;
            }
            pendingWebMic = request;
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_WEB_MIC);
        }

        @Override
        public void onPermissionRequestCanceled(PermissionRequest request) {
            // La page a renoncé (changement de page) : on ne répond plus à une demande morte.
            if (pendingWebMic == request) pendingWebMic = null;
        }

        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            if (!SITE_ORIGIN.equals(origin.replaceAll("/+$", ""))) {
                callback.invoke(origin, false, false);
                return;
            }
            if (hasPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                    || hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)) {
                callback.invoke(origin, true, false);
                return;
            }
            pendingGeo = callback;
            pendingGeoOrigin = origin;
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOCATION);
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (pendingFile != null) pendingFile.onReceiveValue(null);
            pendingFile = callback;
            try {
                startActivityForResult(params.createIntent(), REQ_FILE);
                return true;
            } catch (ActivityNotFoundException e) {
                pendingFile = null;
                return false;
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        boolean granted = false;
        for (int result : results) granted |= result == PackageManager.PERMISSION_GRANTED;

        if (code == REQ_WEB_MIC && pendingWebMic != null) {
            if (granted) pendingWebMic.grant(pendingWebMic.getResources());
            else pendingWebMic.deny();
            pendingWebMic = null;
        } else if (code == REQ_SPEECH_MIC && pendingSpeechLang != null) {
            String lang = pendingSpeechLang;
            pendingSpeechLang = null;
            if (granted) {
                startSpeech(lang);
            } else {
                voiceEvent("error", "not-allowed", false);
                voiceEvent("end", "", false);
            }
        } else if (code == REQ_CONNECT) {
            connect.onPermissionsResult();
        } else if (code == REQ_LOCATION && pendingGeo != null) {
            pendingGeo.invoke(pendingGeoOrigin, granted, false);
            pendingGeo = null;
            pendingGeoOrigin = null;
        }
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code == REQ_SAVE_PDF) {
            writePendingPdf(result == RESULT_OK && data != null ? data.getData() : null);
            return;
        }
        if (code != REQ_FILE || pendingFile == null) return;
        pendingFile.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
        pendingFile = null;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent.getData() != null) web.loadUrl(startUrl(intent));
    }

    @Override
    public void onBackPressed() {
        if (connect.isOpen()) connect.close();
        else if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        web.saveState(state);
    }

    @Override
    protected void onPause() {
        CookieManager.getInstance().flush();
        web.onPause();
        // Le relais continue si son service tourne ; sinon il s'arrête ici.
        connect.pause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        connect.resume();
    }

    @Override
    protected void onDestroy() {
        if (connectivity != null && networkCallback != null) connectivity.unregisterNetworkCallback(networkCallback);
        connect.destroy();
        if (recognizer != null) {
            recognizer.destroy();
            recognizer = null;
        }
        if (sounds != null) sounds.release();
        if (tts != null) {
            tts.shutdown();
            tts = null;
        }
        web.destroy();
        web = null;
        super.onDestroy();
    }

    private static String newToken() {
        byte[] bytes = new byte[24];
        new SecureRandom().nextBytes(bytes);
        StringBuilder hex = new StringBuilder();
        for (byte b : bytes) hex.append(String.format("%02x", b));
        return hex.toString();
    }

    private static final class BuildInfo {
        static final String VERSION = "1.2.1";
    }
}
