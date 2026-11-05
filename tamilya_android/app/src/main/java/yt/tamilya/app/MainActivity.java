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
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

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
    private static final String SITE_HOST = "tamilya.yt";
    private static final String SITE_ORIGIN = "https://tamilya.yt";
    /** Identifiant client Google « Web » du site (public : il figure dans toute page avec un bouton Google). */
    private static final String GOOGLE_WEB_CLIENT_ID = "557607296482-8jkgd9squ5e2jdg1mufnl4p5fmn7m4sv.apps.googleusercontent.com";

    private static final int REQ_WEB_MIC = 1;
    private static final int REQ_SPEECH_MIC = 2;
    private static final int REQ_LOCATION = 3;
    private static final int REQ_FILE = 4;
    private static final int REQ_CONNECT = 5;

    /** Geste vers le haut qui ouvre et ferme Tamilya Connect. */
    private static final int SWIPE_DP = 120;

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
    private ConnectivityManager connectivity;
    private ConnectivityManager.NetworkCallback networkCallback;
    private boolean online = true;

    private float swipeX;
    private float swipeY;
    private boolean swipeDone;
    /** La page sous le doigt est déjà tout en bas (demandé à la page au début du geste). */
    private boolean webAtBottom;

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
        connect = new TamilyaConnect(this, new TamilyaConnect.Host() {
            @Override
            public void requestConnectPermissions(String[] permissions) {
                requestPermissions(permissions, REQ_CONNECT);
            }

            @Override
            public void onConnectClosed() {
                // Internet revenu pendant Tamilya Connect : on retrouve la page normale.
                if (online && pageFailed) retry();
            }
        });
        // Voile sombre et rond du geste (au-dessus de la page, sous Tamilya Connect).
        dim = new View(this);
        dim.setBackgroundColor(Color.BLACK);
        dim.setAlpha(0f);
        dim.setClickable(false);
        content.addView(dim, match());
        content.addView(connect.view(), match());
        pull = new PullIndicator(this);
        pull.setVisibility(View.GONE);
        FrameLayout.LayoutParams pullParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(110), Gravity.BOTTOM);
        pullParams.bottomMargin = dp(36);
        content.addView(pull, pullParams);
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
            Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
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

        ImageView icon = new ImageView(this);
        icon.setImageResource(R.mipmap.ic_launcher);
        box.addView(icon, new LinearLayout.LayoutParams(dp(96), dp(96)));

        TextView title = new TextView(this);
        title.setText(R.string.offline_title);
        title.setTextColor(Color.parseColor("#F5F0E6"));
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, dp(24), 0, dp(24));
        box.addView(title);

        Button retry = new Button(this);
        retry.setText(R.string.offline_retry);
        retry.setOnClickListener(v -> retry());
        box.addView(retry);

        TextView hint = new TextView(this);
        hint.setText("↑  Tire vers le haut pour écrire à Tamilya sans internet");
        hint.setTextColor(Color.parseColor("#8E9398"));
        hint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        hint.setGravity(Gravity.CENTER);
        hint.setPadding(dp(24), dp(40), dp(24), 0);
        box.addView(hint);
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
        // Internet revenu : Tamilya Connect se ferme tout seul, retour à la page normale.
        if (connect.isOpen()) connect.close();
        else if (pageFailed) retry();
    }

    /**
     * Glisser vers le haut, comme le mode éphémère d'Instagram : un rond se remplit pendant
     * qu'on tire, rien ne s'active tant qu'il n'est pas complet ; plein, on lâche et Tamilya
     * Connect s'ouvre (ou se ferme) en animation. Lâché trop tôt, tout revient en place.
     */
    @Override
    public boolean dispatchTouchEvent(MotionEvent event) {
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                swipeX = event.getRawX();
                swipeY = event.getRawY();
                swipeDone = false;
                touching = true;
                webAtBottom = false;
                if (!connect.isOpen() && offline.getVisibility() != View.VISIBLE) askPageAtBottom(event);
                break;
            case MotionEvent.ACTION_MOVE: {
                float up = swipeY - event.getRawY();
                float side = Math.abs(event.getRawX() - swipeX);
                if (!touching) break;
                if (!swipeDone) {
                    boolean eligible = connect.isOpen() ? connect.atBottom()
                            : offline.getVisibility() == View.VISIBLE || webAtBottom;
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
                dragTo(Math.max(0f, up));
                return true;
            }
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                touching = false;
                if (swipeDone) {
                    swipeDone = false;
                    release(event.getActionMasked() == MotionEvent.ACTION_UP);
                    return true;
                }
                break;
            default:
                break;
        }
        return super.dispatchTouchEvent(event);
    }

    private PullIndicator pull;
    private View dim;
    private boolean pullFull;
    /** Un doigt est posé : seul un vrai geste (posé, glissé, levé) peut ouvrir ou fermer. */
    private boolean touching;

    /** Le doigt monte : l'écran suit (avec résistance), le rond se remplit. */
    private void dragTo(float distance) {
        float progress = Math.min(1f, distance / dp(SWIPE_DP));
        // Résistance : plus on tire, moins ça bouge (sensation élastique).
        float follow = dp(90) * (1f - (float) Math.exp(-distance / dp(140)));
        View moving = connect.isOpen() ? connect.view() : (offline.getVisibility() == View.VISIBLE ? offline : web);
        moving.setTranslationY(-follow);
        if (!connect.isOpen()) dim.setAlpha(0.55f * progress);
        pull.setVisibility(View.VISIBLE);
        pull.setAlpha(Math.min(1f, progress * 2.5f));
        pull.setTranslationY(-follow * 0.6f);
        pull.set(progress, connect.isOpen() ? "Fermer Tamilya Connect" : "Tamilya Connect");
        boolean full = progress >= 1f;
        if (full && !pullFull) {
            pull.performHapticFeedback(android.view.HapticFeedbackConstants.CONTEXT_CLICK);
            pull.animate().scaleX(1.12f).scaleY(1.12f).setDuration(120)
                    .withEndAction(() -> pull.animate().scaleX(1f).scaleY(1f).setDuration(140).start()).start();
        }
        pullFull = full;
    }

    /** Doigt levé : rond complet, on active ; sinon tout revient en place. */
    private void release(boolean lifted) {
        boolean activate = lifted && pullFull;
        boolean closing = connect.isOpen();
        pullFull = false;
        android.view.animation.Interpolator spring = new android.view.animation.OvershootInterpolator(1.2f);
        pull.animate().alpha(0f).translationY(0f).setDuration(220)
                .withEndAction(() -> pull.setVisibility(View.GONE)).start();
        web.animate().translationY(0f).setDuration(380).setInterpolator(spring).start();
        offline.animate().translationY(0f).setDuration(380).setInterpolator(spring).start();
        dim.animate().alpha(0f).setDuration(activate && !closing ? 520 : 260).start();
        if (!activate) {
            if (closing) connect.view().animate().translationY(0f).setDuration(380).setInterpolator(spring).start();
            return;
        }
        if (closing) connect.close();
        else connect.open();
    }

    /** La zone qui défile sous le doigt (ou la page) est-elle déjà tout en bas ? */
    private void askPageAtBottom(MotionEvent event) {
        int[] origin = new int[2];
        web.getLocationOnScreen(origin);
        float density = getResources().getDisplayMetrics().density;
        float x = (event.getRawX() - origin[0]) / density;
        float y = (event.getRawY() - origin[1]) / density;
        String js = "(function(x,y){function end(e){return e.scrollTop+e.clientHeight>=e.scrollHeight-2;}"
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

        web.addJavascriptInterface(new NativeBridge(), "TamilyaNative");
        web.addJavascriptInterface(new GoogleBridge(), "TamilyaGoogle");
        web.setWebViewClient(new AppWebViewClient());
        web.setWebChromeClient(new AppChromeClient());
        web.setDownloadListener((url, agent, disposition, mime, length) -> openExternally(Uri.parse(url)));
    }

    /** Ce qui s'affiche dans l'app : le site et le paiement Stripe. Le reste part dans le navigateur. */
    private static boolean staysInApp(Uri uri) {
        String host = uri.getHost();
        if (!"https".equals(uri.getScheme()) || host == null) return false;
        return host.equals(SITE_HOST) || host.endsWith("." + SITE_HOST)
                || host.equals("stripe.com") || host.endsWith(".stripe.com");
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
    }

    /**
     * Android WebView n'a pas de reconnaissance vocale : on donne au site la même interface
     * que Chrome (voir src/lib/chat/voice.ts), branchée sur celle d'Android.
     */
    private String pageScript() {
        return "(function(token){"
                + "if(window.__tamilyaVoice)return;"
                + "var st=document.createElement('style');"
                + "st.textContent='.voice-halo{display:none!important}.voice-overlay[data-compact]::after{content:\"\";position:fixed;inset:-24px;z-index:-1;pointer-events:none;opacity:.35;border-radius:64px;box-shadow:inset 34px 0 60px -22px #4dd2ff,inset -34px 0 60px -22px #ff4dd8,inset 0 34px 60px -22px #7a5cff,inset 0 -34px 60px -22px #ff9a5c;transition:opacity .6s ease;animation:tamilya-glow 6s ease-in-out infinite alternate}.voice-overlay[data-compact]:has([data-state=waiting])::after{opacity:.6}.voice-overlay[data-compact]:has([data-state=speaking])::after{opacity:.9}@keyframes tamilya-glow{from{filter:hue-rotate(-22deg)}to{filter:hue-rotate(22deg)}}@media (prefers-reduced-motion:reduce){.voice-overlay[data-compact]::after{animation:none}}"
                // Le site a sa propre lueur (.voice-edge) : on n'en affiche qu'une.
                + "html:has(.voice-edge) .voice-overlay[data-compact]::after{display:none!important}';"
                + "(document.head||document.documentElement).appendChild(st);"
                // Vibration et sons : /voix garde son écran ouvert, sa session commence à la première écoute.
                + "document.addEventListener('click',function(e){var t=e.target;"
                + "if(t&&t.closest&&t.closest('.awa-blob,.voice-orb-slot'))TamilyaNative.feedback(token,'tap');},true);"
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

    /** Toucher du globe, ouverture et fermeture du vocal. */
    private void feedback(String kind) {
        long now = SystemClock.elapsedRealtime();
        switch (kind) {
            case "tap":
                lastTap = now;
                vibrate(0, 22);
                break;
            case "start":
                sounds.play(soundStart, 0.8f, 0.8f, 1, 0, 1f);
                if (now - lastTap > 500) vibrate(0, 22);
                break;
            case "end":
                sounds.play(soundEnd, 0.8f, 0.8f, 1, 0, 1f);
                vibrate(0, 18, 70, 28);
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
    }

    /** Appelé par le bouton Google du site (google-identity.ts), dans l'app seulement. */
    private final class GoogleBridge {
        @JavascriptInterface
        public void googleSignIn(String request, String hashedNonce) {
            if (request == null || hashedNonce == null || request.length() > 64 || hashedNonce.length() > 128) return;
            main.post(() -> MainActivity.this.googleSignIn(request, hashedNonce));
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
            // Le moteur d'affichage s'est arrêté (manque de mémoire) : on repart proprement.
            recreate();
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
            pendingWebMic = request;
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_WEB_MIC);
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
        static final String VERSION = "1.2.0";
    }
}
