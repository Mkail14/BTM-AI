package yt.tamilya.app.connect;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorFilter;
import android.graphics.LinearGradient;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.RadialGradient;
import android.graphics.Rect;
import android.graphics.Shader;
import android.graphics.drawable.Drawable;

import yt.tamilya.app.R;

/**
 * Fond de Tamilya Connect : les courbes du lagon du site (.fond-lagon), en gris. Les lignes vivent
 * sur les bords et s'effacent au centre, là où on lit, et sous l'en-tête.
 * L'image du motif n'est préparée qu'au premier affichage, pour ne pas ralentir l'ouverture de l'app.
 */
final class LagonDrawable extends Drawable {
    // 0,26 jusqu'au 2026-11-08 : sur la tablette, les lignes couvraient tout l'écran (« ça fait peur »).
    private static final float LINES_OPACITY = 0.12f;
    private static final int LARGE_SCREEN_DP = 768;
    private static final int MAX_TILE_PX = 1024;

    private final Context context;
    private final int background;
    private final float density;
    private final Paint lines = new Paint(Paint.FILTER_BITMAP_FLAG);
    private final Paint center = new Paint();
    private final Paint top = new Paint();
    private int tileSize;
    private boolean tileReady;

    LagonDrawable(Context context, int background) {
        this.context = context;
        this.background = background;
        this.density = context.getResources().getDisplayMetrics().density;
        lines.setAlpha(Math.round(LINES_OPACITY * 255f));
    }

    @Override
    protected void onBoundsChange(Rect bounds) {
        int width = bounds.width();
        int height = bounds.height();
        if (width <= 0 || height <= 0) return;
        boolean large = width / density >= LARGE_SCREEN_DP;

        int wanted = Math.min(MAX_TILE_PX, Math.round((large ? 640 : 460) * density));
        if (wanted != tileSize) {
            tileSize = wanted;
            tileReady = false;
        }

        // Même dégradés que le masque du site, posés par-dessus : le fond est uni, le résultat est identique.
        float radiusX = width * (large ? 0.5f : 0.8f);
        float radiusY = height * (large ? 0.6f : 0.42f);
        float centerX = width / 2f;
        float centerY = height * (large ? 0.46f : 0.45f);
        float clear = large ? 0.45f : 0.2f;
        float end = large ? 1f : 0.9f;
        RadialGradient radial = new RadialGradient(0, 0, radiusX,
                new int[]{background, background, transparent()}, new float[]{0f, clear, end}, Shader.TileMode.CLAMP);
        Matrix place = new Matrix();
        place.setScale(1f, radiusY / radiusX);
        place.postTranslate(centerX, centerY);
        radial.setLocalMatrix(place);
        center.setShader(radial);

        top.setShader(new LinearGradient(0, density * 56, 0, density * (large ? 160 : 144),
                background, transparent(), Shader.TileMode.CLAMP));
    }

    private int transparent() {
        return Color.argb(0, Color.red(background), Color.green(background), Color.blue(background));
    }

    private void prepareTile() {
        Drawable vector = context.getDrawable(R.drawable.fond_lagon);
        if (vector == null) return;
        Bitmap tile = Bitmap.createBitmap(tileSize, tileSize, Bitmap.Config.ARGB_8888);
        vector.setBounds(0, 0, tileSize, tileSize);
        vector.draw(new Canvas(tile));
        BitmapShader shader = new BitmapShader(tile, Shader.TileMode.REPEAT, Shader.TileMode.REPEAT);
        // Le motif part du milieu de l'écran, comme sur le site.
        Matrix place = new Matrix();
        place.setTranslate(getBounds().width() / 2f - tileSize / 2f, 0);
        shader.setLocalMatrix(place);
        lines.setShader(shader);
        tileReady = true;
    }

    @Override
    public void draw(Canvas canvas) {
        Rect bounds = getBounds();
        canvas.drawColor(background);
        if (!tileReady && tileSize > 0) prepareTile();
        if (!tileReady) return;
        canvas.drawRect(bounds, lines);
        canvas.drawRect(bounds, center);
        canvas.drawRect(bounds, top);
    }

    @Override
    public void setAlpha(int alpha) {
        // Fond uni, sans transparence.
    }

    @Override
    public void setColorFilter(ColorFilter colorFilter) {
        // Toujours les mêmes gris.
    }

    @Override
    public int getOpacity() {
        return PixelFormat.OPAQUE;
    }
}
