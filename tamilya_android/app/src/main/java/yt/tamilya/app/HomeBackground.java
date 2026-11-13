package yt.tamilya.app;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorFilter;
import android.graphics.ComposeShader;
import android.graphics.LinearGradient;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.RadialGradient;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.drawable.Drawable;

/**
 * Fond de la conversation du site (ChatShell.tsx, globals.css) : la surface teintée par la
 * personnalité (.persona-surface), le halo rose en haut, les courbes du lagon (.fond-lagon)
 * effacées au centre et sous l'en-tête, et le filet rose tout en haut (.persona-line).
 */
final class HomeBackground extends Drawable {
    private final Context context;
    private final SiteTheme theme;
    private final float density;
    private final Paint glow = new Paint();
    private final Paint lines = new Paint(Paint.FILTER_BITMAP_FLAG);
    private final Paint centerMask = new Paint();
    private final Paint topMask = new Paint();
    private final Paint line = new Paint();
    private final RectF layer = new RectF();
    private boolean ready;

    HomeBackground(Context context, SiteTheme theme) {
        this.context = context;
        this.theme = theme;
        density = context.getResources().getDisplayMetrics().density;
        centerMask.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.DST_IN));
        topMask.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.DST_IN));
    }

    @Override
    protected void onBoundsChange(Rect bounds) {
        int width = bounds.width();
        int height = bounds.height();
        ready = false;
        if (width <= 0 || height <= 0) return;

        // Halo : radial-gradient(70rem 26rem at 50% 0, --persona-glow, transparent 70%).
        float rx = 1120 * density, ry = 416 * density;
        RadialGradient halo = new RadialGradient(0, 0, rx,
                new int[]{SiteTheme.alpha(theme.persona, theme.personaGlow), SiteTheme.alpha(theme.persona, 0f)},
                new float[]{0f, 0.7f}, Shader.TileMode.CLAMP);
        Matrix place = new Matrix();
        place.setScale(1f, ry / rx);
        place.postTranslate(width / 2f, 0);
        halo.setLocalMatrix(place);
        glow.setShader(halo);

        // Courbes du lagon : motif de 640 px répété depuis le milieu, teinté du rose au lagon.
        // Moins de 768 px de large (téléphone, tablette debout) : motif de 460 px, plus rare et plus doux.
        boolean narrow = width < 768 * density;
        int tile = Math.round((narrow ? 460 : 640) * density);
        Bitmap mask = Bitmap.createBitmap(tile, tile, Bitmap.Config.ALPHA_8);
        Drawable vector = context.getDrawable(R.drawable.fond_lagon);
        if (vector != null) {
            vector = vector.mutate();
            vector.setTint(Color.WHITE);
            vector.setBounds(0, 0, tile, tile);
            vector.draw(new Canvas(mask));
        }
        BitmapShader pattern = new BitmapShader(mask, Shader.TileMode.REPEAT, Shader.TileMode.REPEAT);
        Matrix tilePlace = new Matrix();
        tilePlace.setTranslate(width / 2f - tile / 2f, 0);
        pattern.setLocalMatrix(tilePlace);
        int end = SiteTheme.mix(theme.persona, 0.4f, theme.lagon);
        LinearGradient tint = new LinearGradient(0, 0, 0, height,
                new int[]{theme.persona, theme.persona, end}, new float[]{0f, 0.15f, 1f}, Shader.TileMode.CLAMP);
        lines.setShader(new ComposeShader(pattern, tint, PorterDuff.Mode.SRC_IN));
        lines.setAlpha(Math.round((narrow && !theme.dark ? 0.10f : theme.lagonOpacity) * 255f));

        // Masques du site : ellipse 50 % × 60 % au centre (vide jusqu'à 45 %), puis fondu sous l'en-tête (3,5 rem → 10 rem).
        float mrx = width * (narrow ? 0.8f : 0.5f), mry = height * (narrow ? 0.42f : 0.6f);
        RadialGradient center = new RadialGradient(0, 0, mrx, new int[]{0x00000000, 0x00000000, 0xFF000000},
                new float[]{0f, narrow ? 0.2f : 0.45f, narrow ? 0.9f : 1f}, Shader.TileMode.CLAMP);
        Matrix centerPlace = new Matrix();
        centerPlace.setScale(1f, mry / mrx);
        centerPlace.postTranslate(width / 2f, height * (narrow ? 0.45f : 0.46f));
        center.setLocalMatrix(centerPlace);
        centerMask.setShader(center);
        topMask.setShader(new LinearGradient(0, 56 * density, 0, (narrow ? 144 : 160) * density, 0x00000000, 0xFF000000, Shader.TileMode.CLAMP));

        // Filet rose en haut : linear-gradient(90deg, transparent, --persona 25%, --persona 75%, transparent), opacité 0,85.
        line.setShader(new LinearGradient(0, 0, width, 0,
                new int[]{SiteTheme.alpha(theme.persona, 0f), theme.persona, theme.persona, SiteTheme.alpha(theme.persona, 0f)},
                new float[]{0f, 0.25f, 0.75f, 1f}, Shader.TileMode.CLAMP));
        line.setAlpha(Math.round(0.85f * 255f));
        layer.set(0, 0, width, height);
        ready = true;
    }

    @Override
    public void draw(Canvas canvas) {
        Rect bounds = getBounds();
        canvas.drawColor(theme.personaSurface);
        if (!ready) return;
        canvas.drawRect(bounds, glow);
        int saved = canvas.saveLayer(layer, null);
        canvas.drawRect(bounds, lines);
        canvas.drawRect(bounds, centerMask);
        canvas.drawRect(bounds, topMask);
        canvas.restoreToCount(saved);
        canvas.drawRect(0, 0, bounds.width(), 2 * density, line);
    }

    @Override
    public void setAlpha(int alpha) {
        // Fond opaque.
    }

    @Override
    public void setColorFilter(ColorFilter colorFilter) {
        // Toujours les couleurs du site.
    }

    @Override
    public int getOpacity() {
        return PixelFormat.OPAQUE;
    }
}
