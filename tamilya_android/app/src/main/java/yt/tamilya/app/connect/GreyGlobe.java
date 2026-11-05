package yt.tamilya.app.connect;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.BlurMaskFilter;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorMatrix;
import android.graphics.ColorMatrixColorFilter;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.SweepGradient;
import android.os.Build;
import android.os.SystemClock;
import android.util.TypedValue;
import android.view.View;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * Le globe de Tamilya, en gris : même goutte vivante que sur le site (AwaBlob.tsx), dessinée ici
 * parce que Tamilya Connect s'affiche sans internet. Forme, gouttelettes, cœur et sursauts
 * suivent un bruit calculé à chaque image, comme sur le site.
 */
final class GreyGlobe extends View {
    private static final int BLOB = Color.parseColor("#8E9398");
    private static final int LIGHT = Color.parseColor("#DDE0E3");
    private static final int DEEP = Color.parseColor("#44474B");
    /** Couleurs du battement du site, ramenées à des gris. */
    private static final int[] SHIMMER = {BLOB, 0xFF94989D, 0xFFA0A4A8, 0xFFB0B4B8, 0xFFA0A4A8, 0xFF94989D, BLOB};

    private static final int FPS_ACTIVE = 30;
    private static final int FPS_IDLE = 20;
    private static final int POP_MS = 520;
    private static final int RIPPLE_MS = 620;
    private static final int RIPPLE_DELAY_MS = 120;
    private static final int LATTICE_SIZE = 512;

    private final Random random = new Random();
    private final float[] lattice = new float[LATTICE_SIZE];
    private final List<float[]> beats = new ArrayList<>();
    private final float[][] drops = new float[3][];
    private final float[] dropAngle = new float[3];
    private final float[] dropDistance = new float[3];
    private final float[] dropScale = new float[3];
    private final float[] radii = new float[8];

    private final Paint glow = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint solid = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint goo = new Paint();
    private final Paint clip = new Paint();
    private final Paint shade = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint shine = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint ripple = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path body = new Path();
    private final RectF box = new RectF();
    private final RectF layer = new RectF();
    private final Matrix turn = new Matrix();
    private final Runnable frame = this::onFrame;

    private Shader lightShader;
    private Shader deepShader;
    private SweepGradient shimmer;

    private float unit;
    private float time;
    private float rotation;
    private float colorTurn;
    private float heart;
    private float shimmerAlpha;
    private float tx;
    private float ty;
    private float tilt;
    private float sx = 1f;
    private float sy = 1f;
    private float shineX;
    private float shineY;
    private float joltX;
    private float joltY;
    private long joltAt = -100000L;
    private long nextBeat;
    private long nextJolt;
    private long last;
    private long popAt = -100000L;
    private boolean lively = true;
    private boolean running;

    GreyGlobe(Context context) {
        super(context);
        for (int i = 0; i < lattice.length; i++) lattice[i] = random.nextFloat() * 2f - 1f;
        for (int i = 0; i < drops.length; i++) {
            drops[i] = new float[]{range(25, 70) * (random.nextBoolean() ? -1 : 1), range(0, 1000)};
            dropAngle[i] = range(0, 360);
        }
        time = range(0, 300);
        rotation = range(0, 360);
        colorTurn = range(0, 360);

        // Même filtre « goo » que le site : on floute, puis on durcit le bord pour que les gouttes se soudent.
        ColorMatrix matrix = new ColorMatrix(new float[]{
                1, 0, 0, 0, 0,
                0, 1, 0, 0, 0,
                0, 0, 1, 0, 0,
                0, 0, 0, 24, -2550,
        });
        goo.setColorFilter(new ColorMatrixColorFilter(matrix));
        clip.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.SRC_IN));
        solid.setColor(Color.WHITE);
        ripple.setStyle(Paint.Style.STROKE);
        ripple.setStrokeWidth(dp(2));
        ripple.setColor(BLOB);

        // Avant Android 9, le flou n'existe pas en rendu accéléré.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) setLayerType(LAYER_TYPE_SOFTWARE, null);
        setContentDescription("Écrire à Tamilya");
    }

    /** Écrasement, rebond et ondes au toucher. */
    void pop() {
        popAt = SystemClock.uptimeMillis();
    }

    private static boolean motionAllowed() {
        return ValueAnimator.areAnimatorsEnabled();
    }

    @Override
    protected void onMeasure(int widthSpec, int heightSpec) {
        // Le globe fait 56 % de la vue : le reste laisse la place au halo et aux gouttelettes.
        int size = dp(216);
        setMeasuredDimension(resolveSize(size, widthSpec), resolveSize(size, heightSpec));
    }

    @Override
    protected void onSizeChanged(int w, int h, int oldW, int oldH) {
        unit = Math.min(w, h) / 1.8f;
        float half = unit * 0.372f;
        float reach = Math.min(w, h) / 2f;
        layer.set(-reach, -reach, reach, reach);
        box.set(-half, -half, half, half);
        solid.setMaskFilter(new BlurMaskFilter(unit * 0.09f, BlurMaskFilter.Blur.NORMAL));
        glow.setShader(new RadialGradient(0, 0, unit * 0.68f, new int[]{withAlpha(BLOB, 0.55f), withAlpha(BLOB, 0f)},
                new float[]{0f, 0.65f}, Shader.TileMode.CLAMP));
        lightShader = new RadialGradient(-half * 0.36f, -half * 0.44f, half * 0.9f,
                new int[]{LIGHT, withAlpha(LIGHT, 0f)}, null, Shader.TileMode.CLAMP);
        deepShader = new RadialGradient(half * 0.4f, half * 0.5f, half * 1.15f,
                new int[]{DEEP, withAlpha(DEEP, 0f)}, null, Shader.TileMode.CLAMP);
        shimmer = new SweepGradient(0, 0, SHIMMER, null);
        shine.setShader(new RadialGradient(0, 0, unit * 0.13f, Color.argb(216, 255, 255, 255),
                Color.argb(0, 255, 255, 255), Shader.TileMode.CLAMP));
        long now = SystemClock.uptimeMillis();
        step(now, 0f);
    }

    @Override
    public void onVisibilityAggregated(boolean visible) {
        super.onVisibilityAggregated(visible);
        if (visible) start();
        else stop();
    }

    @Override
    protected void onDetachedFromWindow() {
        stop();
        super.onDetachedFromWindow();
    }

    private void start() {
        if (running || !motionAllowed()) return;
        running = true;
        long now = SystemClock.uptimeMillis();
        last = now;
        if (nextBeat == 0L) nextBeat = now + (long) range(600, 1000);
        if (nextJolt == 0L) nextJolt = now + (long) range(2500, 6000);
        postOnAnimation(frame);
    }

    private void stop() {
        running = false;
        removeCallbacks(frame);
    }

    private void onFrame() {
        if (!running) return;
        postOnAnimation(frame);
        long now = SystemClock.uptimeMillis();
        boolean popping = now - popAt < RIPPLE_MS + RIPPLE_DELAY_MS;
        if (now - last < (lively || popping ? 1000 / FPS_ACTIVE : 1000 / FPS_IDLE) - 4) return;
        float dt = Math.min(0.1f, (now - last) / 1000f);
        last = now;
        step(now, dt);
        invalidate();
    }

    /** Une image de la goutte : la suite exacte des calculs d'AwaBlob, sans la voix. */
    private void step(long now, float dt) {
        time += dt;

        if (nextBeat != 0L && now >= nextBeat) {
            float strength = range(0.85f, 1f);
            beats.add(new float[]{now, strength});
            colorTurn += range(70, 150);
            beats.add(new float[]{now + range(230, 270), strength * range(0.6f, 0.75f)});
            nextBeat = now + (long) range(1050, 1250);
        }
        float pulse = 0f;
        for (int i = beats.size() - 1; i >= 0; i--) {
            float[] beat = beats.get(i);
            float d = now - beat[0];
            if (d >= 700f) {
                beats.remove(i);
            } else if (d >= 0f) {
                pulse = Math.max(pulse, beat[1] * (d < 90f ? d / 90f : (float) Math.exp(-(d - 90f) / 180f)));
            }
        }
        heart = pulse;

        if (nextJolt != 0L && now >= nextJolt) {
            double angle = range(0, 360) * Math.PI / 180;
            joltAt = now;
            joltX = (float) Math.cos(angle);
            joltY = (float) Math.sin(angle);
            nextJolt = now + (long) range(2500, 7000);
        }
        float jd = (now - joltAt) / 1000f;
        float jolt = jd < 1.2f ? (float) (Math.sin(Math.min(1f, jd / 0.18f) * Math.PI * 0.5) * Math.exp(-jd * 3.2)) : 0f;

        tx = noise(time * 0.22f + 11f) * 5f + joltX * jolt * 6f;
        ty = noise(time * 0.19f + 47f) * 5f + joltY * jolt * 6f;
        rotation += noise(time * 0.12f + 300f) * 55f * dt;
        tilt = noise(time * 0.3f + 700f) * 8f;

        float grow = 1f + heart * 0.07f;
        sx = grow * (1f + jolt * 0.08f * Math.abs(joltX));
        sy = grow * (1f + jolt * 0.08f * Math.abs(joltY));

        colorTurn += 120f * dt;
        shimmerAlpha = clamp(heart * 1.2f, 0f, 1f);

        float size = box.width();
        for (int i = 0; i < 8; i++) {
            float percent = clamp(50f + noise(time * (0.35f + i * 0.04f) + i * 37.3f) * 14f, 28f, 72f);
            // Ordre du site : 4 largeurs puis 4 hauteurs ; ordre d'Android : largeur, hauteur, coin par coin.
            radii[i < 4 ? i * 2 : (i - 4) * 2 + 1] = percent * size / 100f;
        }

        for (int i = 0; i < drops.length; i++) {
            float speed = drops[i][0];
            float seed = drops[i][1];
            dropAngle[i] += (speed + noise(time * 0.4f + seed) * 60f) * dt;
            dropDistance[i] = clamp(55f + noise(time * 0.33f + seed + 50f) * 75f, 0f, 150f);
            dropScale[i] = clamp(0.75f + noise(time * 0.5f + seed + 90f) * 0.3f, 0.4f, 1.2f);
        }

        shineX = noise(time * 0.25f + 900f) * 8f;
        shineY = noise(time * 0.25f + 950f) * 6f;
        lively = heart > 0.01f || jolt > 0.01f || nextBeat - now < 120L || !beats.isEmpty();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        if (unit <= 0f) return;
        long now = SystemClock.uptimeMillis();
        float centerX = getWidth() / 2f;
        float centerY = getHeight() / 2f;
        float scale = popScale(now);

        canvas.save();
        canvas.translate(centerX, centerY);

        canvas.save();
        float glowScale = 0.95f + heart * 0.12f;
        canvas.scale(glowScale, glowScale);
        glow.setAlpha(Math.round(255f * clamp(0.5f + heart * 0.35f, 0f, 1f)));
        canvas.drawCircle(0, 0, unit * 0.68f, glow);
        canvas.restore();

        canvas.save();
        canvas.translate(tx * unit / 100f, ty * unit / 100f);
        canvas.rotate(tilt);
        canvas.scale(sx * scale, sy * scale);
        drawDrop(canvas);
        drawShine(canvas);
        canvas.restore();

        drawRipple(canvas, now - popAt);
        drawRipple(canvas, now - popAt - RIPPLE_DELAY_MS);
        canvas.restore();
    }

    private void drawDrop(Canvas canvas) {
        int all = canvas.saveLayer(layer, null);

        // Silhouette : le corps et ses gouttelettes, soudés par le filtre.
        int silhouette = canvas.saveLayer(layer, goo);
        canvas.save();
        canvas.rotate(rotation);
        body.rewind();
        body.addRoundRect(box, radii, Path.Direction.CW);
        canvas.drawPath(body, solid);
        canvas.restore();
        float[] widths = {0.26f, 0.2f, 0.16f};
        for (int i = 0; i < drops.length; i++) {
            float width = widths[i] * unit * 1.24f;
            double angle = dropAngle[i] * Math.PI / 180;
            float distance = dropDistance[i] * width / 100f;
            canvas.drawCircle((float) Math.cos(angle) * distance, (float) Math.sin(angle) * distance,
                    width / 2f * dropScale[i], solid);
        }
        canvas.restoreToCount(silhouette);

        // Matière : posée seulement sur la silhouette.
        int matter = canvas.saveLayer(layer, clip);
        canvas.rotate(rotation);
        canvas.drawColor(BLOB);
        shade.setAlpha(255);
        shade.setShader(deepShader);
        canvas.drawPaint(shade);
        shade.setShader(lightShader);
        canvas.drawPaint(shade);
        if (shimmerAlpha > 0f) {
            turn.setRotate(colorTurn % 360f - rotation);
            shimmer.setLocalMatrix(turn);
            shade.setShader(shimmer);
            shade.setAlpha(Math.round(120f * shimmerAlpha));
            canvas.drawPaint(shade);
        }
        canvas.restoreToCount(matter);

        canvas.restoreToCount(all);
    }

    /** Reflet net, hors du filtre : la goutte paraît mouillée. */
    private void drawShine(Canvas canvas) {
        canvas.save();
        canvas.translate(-0.1f * unit + shineX * unit * 0.0026f, -0.17f * unit + shineY * unit * 0.0018f);
        canvas.rotate(-30f);
        canvas.scale(1f, 0.69f);
        canvas.drawCircle(0, 0, unit * 0.13f, shine);
        canvas.restore();
    }

    private void drawRipple(Canvas canvas, long elapsed) {
        if (elapsed < 0L || elapsed >= RIPPLE_MS) return;
        float progress = elapsed / (float) RIPPLE_MS;
        ripple.setAlpha(Math.round(200f * (1f - progress)));
        canvas.drawCircle(0, 0, unit * (0.38f + progress * 0.38f), ripple);
    }

    private float popScale(long now) {
        long elapsed = now - popAt;
        if (elapsed < 0L || elapsed >= POP_MS) return 1f;
        float progress = elapsed / (float) POP_MS;
        return 1f - 0.14f * (float) Math.sin(progress * Math.PI * 2) * (1f - progress);
    }

    /** Bruit lisse à deux octaves : un grand mouvement lent et des frémissements. */
    private float noise(float x) {
        return smooth(x) * 0.72f + smooth(x * 2.3f + 91.7f) * 0.28f;
    }

    private float smooth(float x) {
        int i = (int) Math.floor(x);
        float f = x - i;
        float u = f * f * (3f - 2f * f);
        float a = lattice[Math.floorMod(i, LATTICE_SIZE)];
        float b = lattice[Math.floorMod(i + 1, LATTICE_SIZE)];
        return a + (b - a) * u;
    }

    private float range(float min, float max) {
        return min + random.nextFloat() * (max - min);
    }

    private static float clamp(float value, float min, float max) {
        return Math.min(max, Math.max(min, value));
    }

    private static int withAlpha(int color, float alpha) {
        return Color.argb(Math.round(alpha * 255f), Color.red(color), Color.green(color), Color.blue(color));
    }

    private int dp(int value) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics()));
    }
}
