package yt.tamilya.app;

import android.content.Context;
import android.net.Uri;
import android.util.Log;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Carte déjà prête dans l'app : le moteur des cartes du site (MapLibre) et
 * les styles du fond de carte (OpenFreeMap) sont rangés dans l'APK, et servis
 * à la WebView sans rien télécharger.
 *
 * Mise à jour toute seule : le site demande le moteur avec sa version
 * (« /maplibre/maplibre-gl.mjs?v=6.16.0 »). Si l'app n'a pas cette version,
 * la page le prend sur internet comme avant, et l'app télécharge la nouvelle
 * version en arrière-plan pour la fois suivante (les anciennes sont effacées).
 * Les styles sont relus en arrière-plan une fois par lancement de l'app.
 */
final class MapCache {
    private static final String TAG = "MapCache";
    private static final String ASSETS = "maplibre";
    private static final String[] ENGINE = {"maplibre-gl.mjs", "maplibre-gl-worker.mjs"};
    private static final String[] STYLES = {"positron", "dark"};
    private static final String STYLE_HOST = "tiles.openfreemap.org";
    /** Seule source acceptée pour le moteur : le site lui-même, jamais un sous-domaine. */
    private static final String ENGINE_BASE = "https://tamilya.yt/maplibre/";
    /** Le moteur fait environ 1,1 Mo : au-delà de 5 Mo, ce n'est pas lui. */
    private static final long MAX_ENGINE_BYTES = 5L * 1024 * 1024;
    private static final long MAX_STYLE_BYTES = 1024L * 1024;

    private final Context context;
    private final File root;
    /**
     * Partagé par toute l'app : un MapCache est créé à chaque recréation de l'écran (moteur
     * d'affichage arrêté, par exemple) et son fil n'était jamais arrêté.
     */
    private static final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Set<String> pending = ConcurrentHashMap.newKeySet();
    private final String bundledVersion;
    private volatile boolean stylesRefreshed;

    MapCache(Context context) {
        this.context = context.getApplicationContext();
        this.root = new File(this.context.getFilesDir(), "maplibre");
        this.bundledVersion = readAsset(ASSETS + "/VERSION").trim();
    }

    /** Réponse gardée dans l'app pour cette demande, ou null : la WebView va la chercher sur internet. */
    WebResourceResponse intercept(WebResourceRequest request) {
        if (!"GET".equalsIgnoreCase(request.getMethod())) return null;
        Uri url = request.getUrl();
        String host = url.getHost();
        String path = url.getPath();
        if (host == null || path == null) return null;
        try {
            if (host.equals(STYLE_HOST) && path.startsWith("/styles/")) return style(path.substring("/styles/".length()));
            if ("https".equals(url.getScheme()) && host.equals("tamilya.yt") && url.getPort() == -1 && path.startsWith("/maplibre/")) {
                return engine(url, path.substring("/maplibre/".length()));
            }
        } catch (IOException e) {
            Log.w(TAG, "Fichier de carte illisible, pris sur internet", e);
        }
        return null;
    }

    private WebResourceResponse engine(Uri url, String file) throws IOException {
        if (!isOneOf(file, ENGINE)) return null;
        String version = url.getQueryParameter("v");
        // Sans version, on ne sait pas si notre copie est la bonne : internet.
        if (version == null || !version.matches("[0-9A-Za-z.\\-]{1,24}")) return null;
        File saved = new File(root, version + "/" + file);
        if (saved.isFile()) return response("text/javascript", new FileInputStream(saved));
        if (version.equals(bundledVersion)) return response("text/javascript", context.getAssets().open(ASSETS + "/" + file));
        // Nouvelle version sur le site : prise sur internet cette fois, gardée pour la suivante.
        downloadEngine(version);
        return null;
    }

    private WebResourceResponse style(String name) throws IOException {
        if (!isOneOf(name, STYLES)) return null;
        refreshStyles();
        File saved = new File(root, "styles/" + name + ".json");
        InputStream body = saved.isFile() ? new FileInputStream(saved) : context.getAssets().open(ASSETS + "/styles/" + name + ".json");
        return response("application/json", body);
    }

    private static WebResourceResponse response(String mime, InputStream body) {
        Map<String, String> headers = new HashMap<>();
        // Le style est demandé par la page du site à un autre domaine : il faut l'autoriser.
        headers.put("Access-Control-Allow-Origin", "*");
        headers.put("Cache-Control", "no-cache");
        return new WebResourceResponse(mime, "utf-8", 200, "OK", headers, body);
    }

    /** Télécharge toute la nouvelle version du moteur (une seule fois), puis efface les anciennes. */
    private void downloadEngine(String version) {
        if (!pending.add("engine:" + version)) return;
        io.execute(() -> {
            File dir = new File(root, version);
            try {
                for (String file : ENGINE) download(ENGINE_BASE + file + "?v=" + Uri.encode(version), new File(dir, file), "javascript", MAX_ENGINE_BYTES);
                File[] others = root.listFiles();
                if (others != null) {
                    for (File other : others) {
                        if (other.isDirectory() && !other.getName().equals(version) && !other.getName().equals("styles")) deleteAll(other);
                    }
                }
                Log.i(TAG, "Moteur des cartes " + version + " gardé dans l'app");
            } catch (IOException e) {
                Log.w(TAG, "Téléchargement du moteur " + version + " raté, nouvel essai plus tard", e);
                deleteAll(dir);
                pending.remove("engine:" + version);
            }
        });
    }

    /** Relit les styles du fond de carte, une fois par lancement (ils changent rarement). */
    private void refreshStyles() {
        if (stylesRefreshed) return;
        stylesRefreshed = true;
        io.execute(() -> {
            for (String name : STYLES) {
                try {
                    download("https://" + STYLE_HOST + "/styles/" + name, new File(root, "styles/" + name + ".json"), "json", MAX_STYLE_BYTES);
                } catch (IOException e) {
                    Log.w(TAG, "Style " + name + " pas relu : la copie de l'app reste utilisée", e);
                }
            }
        });
    }

    /**
     * Écrit d'abord à côté, puis remplace : jamais de fichier à moitié écrit servi à la page.
     * Refusé : redirection, type de contenu inattendu, fichier plus gros que maxBytes.
     */
    private static void download(String address, File target, String expectedType, long maxBytes) throws IOException {
        File parent = target.getParentFile();
        if (parent != null && !parent.isDirectory() && !parent.mkdirs()) throw new IOException("Dossier impossible : " + parent);
        File part = new File(target.getPath() + ".part");
        HttpURLConnection connection = (HttpURLConnection) new URL(address).openConnection();
        connection.setConnectTimeout(15_000);
        connection.setReadTimeout(60_000);
        connection.setInstanceFollowRedirects(false);
        try {
            if (connection.getResponseCode() != 200) throw new IOException("HTTP " + connection.getResponseCode() + " pour " + address);
            String type = connection.getContentType();
            if (type == null || !type.toLowerCase(Locale.ROOT).contains(expectedType)) {
                throw new IOException("Type " + type + " inattendu pour " + address);
            }
            if (connection.getContentLengthLong() > maxBytes) throw new IOException("Fichier trop gros pour " + address);
            long written = 0;
            try (InputStream in = connection.getInputStream(); OutputStream out = new FileOutputStream(part)) {
                byte[] buffer = new byte[16_384];
                for (int n; (n = in.read(buffer)) > 0; ) {
                    out.write(buffer, 0, n);
                    written += n;
                    if (written > maxBytes) throw new IOException("Fichier trop gros pour " + address);
                }
            }
            if (written < 100) throw new IOException("Fichier vide pour " + address);
            if (!part.renameTo(target)) {
                if (!target.delete() || !part.renameTo(target)) throw new IOException("Remplacement impossible : " + target);
            }
        } finally {
            connection.disconnect();
            if (part.exists() && !part.delete()) Log.w(TAG, "Reste d'un téléchargement : " + part);
        }
    }

    private String readAsset(String name) {
        try (InputStream in = context.getAssets().open(name)) {
            byte[] bytes = new byte[64];
            int n = in.read(bytes);
            return n > 0 ? new String(bytes, 0, n, StandardCharsets.UTF_8) : "";
        } catch (IOException e) {
            return "";
        }
    }

    private static boolean isOneOf(String value, String[] list) {
        for (String item : list) if (item.equals(value)) return true;
        return false;
    }

    private static void deleteAll(File file) {
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteAll(child);
        if (file.exists() && !file.delete()) Log.w(TAG, "Pas effacé : " + file);
    }
}
