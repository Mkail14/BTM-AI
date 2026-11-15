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
import android.graphics.RenderEffect;
import android.graphics.RenderNode;
import android.graphics.Shader;
import android.graphics.SweepGradient;
import android.os.Build;
import android.os.SystemClock;
import android.util.TypedValue;
import android.view.View;
import android.view.animation.PathInterpolator;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * Le globe de Tamilya : même goutte vivante que sur le site (TamilyaBlob.tsx), aux mêmes couleurs,
 * dessinée ici parce que Tamilya Connect s'affiche sans internet. Forme, gouttelettes, cœur et
 * sursauts suivent un bruit calculé à chaque image, comme sur le site.
 */
public final class GreyGlobe extends View {
    // Couleurs du globe du site : --blob = accent, éclat et ombre en color-mix (globals.css, .tamilya-blob).
    // Champs d'instance : getContext() est prêt quand ils sont calculés (juste après super()).
    private final int BLOB;
    private final int LIGHT;
    private final int DEEP;
    /** Battement du site : l'arc-en-ciel de .tamilya-blob (conic-gradient). */
    private final int[] SHIMMER;
    /** Largeur du globe du site (.tamilya-blob), en dp ; 0 : la taille de Tamilya Connect. */
    private final float sizeDp;
    /** Figé (réponse finie) : la goutte garde sa forme et ne bouge plus. */
    private boolean still;
    /** Tamilya réfléchit : plus vive et resserrée (busy du site). */
    private boolean busy;

    private static final int FPS_ACTIVE = 30;
    private static final int FPS_IDLE = 20;
    private static final int POP_MS = 520;
    private static final int RIPPLE_MS = 620;
    private static final int RIPPLE_DELAY_MS = 120;
    private static final int LATTICE_SIZE = 512;
    /** Largeur des gouttelettes du site (26 %, 20 %, 16 % de la boîte « goo »). */
    private static final float[] WIDTHS = {0.26f, 0.2f, 0.16f};
    /** Forme de départ du site (border-radius de .tamilya-blob__body), pour une goutte figée dès l'arrivée. */
    private static final float[] REST = {42f, 58f, 63f, 37f, 41f, 44f, 56f, 59f};
    /** Clic du site (tamilya-blob-pop) : largeur et hauteur à 0, 25, 50, 75 et 100 %. */
    private static final float[][] POP = {{1f, 1f}, {1.22f, 0.8f}, {0.86f, 1.16f}, {1.1f, 0.94f}, {1.3f, 1.3f}};
    private static final PathInterpolator BOUNCE = new PathInterpolator(0.34f, 1.56f, 0.64f, 1f);
    private static final PathInterpolator EASE_OUT = new PathInterpolator(0f, 0f, 0.58f, 1f);
    /** Filtre « goo » du site : le flou, puis le bord durci (feColorMatrix 24 -10). */
    private static final float[] GOO = {
            1, 0, 0, 0, 0,
            0, 1, 0, 0, 0,
            0, 0, 1, 0, 0,
            0, 0, 0, 24, -2550,
    };

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
    private final Shader[] dropShaders = new Shader[3];
    /** Goutte dessinée avec le vrai filtre du site (Android 12 et plus). */
    private Liquid liquid;
    /** Elle a déjà bougé : sinon, figée, elle garde la forme de départ du site. */
    private boolean moved;
    private boolean resting;
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
        this(context, ConnectTheme.of(context).accent, 0f);
    }

    /**
     * Le globe du site à une taille donnée : blob est la couleur de --persona, sizeDp la largeur
     * CSS de .tamilya-blob (136 sur l'accueil, 32 à côté des réponses) ; la vue fait 1,8 fois plus,
     * pour le halo et les gouttelettes qui dépassent.
     */
    public GreyGlobe(Context context, int blob, float sizeDp) {
        super(context);
        this.sizeDp = sizeDp;
        BLOB = blob;
        LIGHT = ConnectTheme.mix(BLOB, 0.55f, 0xFFFFE3EF);
        DEEP = ConnectTheme.mix(BLOB, 0.70f, 0xFF2A0614);
        SHIMMER = new int[]{BLOB, 0xFF9B72CB, 0xFF4285F4, 0xFF34A853, 0xFFFBBC05, 0xFFEA4335, BLOB};
        for (int i = 0; i < lattice.length; i++) lattice[i] = random.nextFloat() * 2f - 1f;
        for (int i = 0; i < drops.length; i++) {
            drops[i] = new float[]{range(25, 70) * (random.nextBoolean() ? -1 : 1), range(0, 1000)};
            dropAngle[i] = range(0, 360);
        }
        time = range(0, 300);
        rotation = range(0, 360);
        colorTurn = range(0, 360);

        // Même filtre « goo » que le site : on floute, puis on durcit le bord pour que les gouttes se soudent.
        goo.setColorFilter(new ColorMatrixColorFilter(new ColorMatrix(GOO)));
        clip.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.SRC_IN));
        solid.setColor(Color.WHITE);
        ripple.setStyle(Paint.Style.STROKE);
        ripple.setStrokeWidth(dp(2));
        ripple.setColor(BLOB);

        // Avant Android 9, le flou n'existe pas en rendu accéléré.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) setLayerType(LAYER_TYPE_SOFTWARE, null);
        setContentDescription("Écrire à Tamilya");
    }

    /**
     * Écrasement, rebond et ondes au toucher, comme le clic du site. Rend le temps à attendre avant
     * d'ouvrir l'action (520 ms ; 0 sans animations), ou -1 si le clic précédent n'est pas fini.
     */
    public long pop() {
        long now = SystemClock.uptimeMillis();
        if (now - popAt < POP_MS) return -1L;
        if (!motionAllowed()) return 0L;
        popAt = now;
        if (!running) invalidate();
        return POP_MS;
    }

    /** Arrivée du site (tamilya-hello-in) : la goutte éclot, petite et floue, en 900 ms. */
    public void hatch() {
        if (!motionAllowed()) return;
        PathInterpolator spring = new PathInterpolator(0.34f, 1.4f, 0.64f, 1f);
        setAlpha(0f);
        setScaleX(0.4f);
        setScaleY(0.4f);
        animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(900).setInterpolator(spring).start();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return;
        float density = getResources().getDisplayMetrics().density;
        ValueAnimator blur = ValueAnimator.ofFloat(0f, 1f);
        blur.setDuration(900);
        blur.setInterpolator(spring);
        blur.addUpdateListener(a -> {
            float radius = (10f * density * (1f - (float) a.getAnimatedValue()) - 0.5f) / 0.57735f;
            setRenderEffect(a.getAnimatedFraction() >= 1f || radius <= 0.5f ? null
                    : RenderEffect.createBlurEffect(radius, radius, Shader.TileMode.DECAL));
        });
        blur.start();
    }

    /** Flou du filtre « goo » du site (stdDeviation) : 7 px pour le grand globe, 2 px à côté des réponses. */
    private float gooRadius() {
        float sigma = (sizeDp > 0f && sizeDp < 64f ? 2f : 7f) * getResources().getDisplayMetrics().density;
        return Math.max(0.5f, (sigma - 0.5f) / 0.57735f);
    }

    /** Figée (data-still du site) : plus aucun mouvement, la forme du moment reste. */
    public void setStill(boolean value) {
        if (still == value) return;
        still = value;
        if (still) stop();
        else if (isShown()) start();
    }

    /** Elle réfléchit (busy du site) : cœur plus rapide, forme plus vive, gouttelettes resserrées. */
    public void setBusy(boolean value) {
        busy = value;
    }

    private static boolean motionAllowed() {
        return ValueAnimator.areAnimatorsEnabled();
    }

    @Override
    protected void onMeasure(int widthSpec, int heightSpec) {
        // Le globe fait 56 % de la vue : le reste laisse la place au halo et aux gouttelettes.
        if (sizeDp > 0f) {
            // Taille fixe, même si le parent est plus petit : le halo déborde comme sur le site.
            int size = Math.round(sizeDp * 1.8f * getResources().getDisplayMetrics().density);
            setMeasuredDimension(size, size);
            return;
        }
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
        solid.setMaskFilter(new BlurMaskFilter(gooRadius(), BlurMaskFilter.Blur.NORMAL));
        liquid = null;
        // Dégradés du site : leur rayon va jusqu'au coin le plus loin (farthest-corner), puis le pourcentage.
        // Halo : boîte de 136 %, rose à 55 % au centre, éteint à 65 % de la demi-diagonale.
        glow.setShader(new RadialGradient(0, 0, unit * 0.962f, new int[]{withAlpha(BLOB, 0.55f), withAlpha(BLOB, 0f)},
                new float[]{0f, 0.65f}, Shader.TileMode.CLAMP));
        lightShader = new RadialGradient(-half * 0.36f, -half * 0.44f, half * 0.891f,
                new int[]{LIGHT, withAlpha(LIGHT, 0f)}, null, Shader.TileMode.CLAMP);
        deepShader = new RadialGradient(half * 0.4f, half * 0.5f, half * 1.231f,
                new int[]{DEEP, withAlpha(DEEP, 0f)}, null, Shader.TileMode.CLAMP);
        // Gouttelettes : leur propre dégradé (clair en haut à gauche, rose à 70 %).
        for (int i = 0; i < dropShaders.length; i++) {
            float width = WIDTHS[i] * unit * 1.24f;
            dropShaders[i] = new RadialGradient(-0.15f * width, -0.2f * width, 0.955f * width,
                    new int[]{LIGHT, BLOB, BLOB}, new float[]{0f, 0.7f, 1f}, Shader.TileMode.CLAMP);
        }
        shimmer = new SweepGradient(0, 0, SHIMMER, null);
        shine.setShader(new RadialGradient(0, 0, unit * 0.13f, Color.argb(216, 255, 255, 255),
                Color.argb(0, 255, 255, 255), Shader.TileMode.CLAMP));
        if (still && !moved) rest();
        else step(SystemClock.uptimeMillis(), 0f);
    }

    /** Figée sans avoir bougé (réponse déjà finie) : la forme de départ du site, gouttelettes rentrées, halo plein. */
    private void rest() {
        resting = true;
        float size = box.width();
        for (int i = 0; i < 8; i++) radii[i < 4 ? i * 2 : (i - 4) * 2 + 1] = REST[i] * size / 100f;
        for (int i = 0; i < drops.length; i++) {
            dropAngle[i] = 0f;
            dropDistance[i] = 0f;
            dropScale[i] = 1f;
        }
        rotation = 0f;
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
        if (running || still || !motionAllowed()) return;
        running = true;
        moved = true;
        resting = false;
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
        // Le clic se joue à chaque image de l'écran, comme les animations du site.
        if (now - popAt < POP_MS + 40) invalidate();
        if (now - last < (lively ? 1000 / FPS_ACTIVE : 1000 / FPS_IDLE) - 4) return;
        float dt = Math.min(0.1f, (now - last) / 1000f);
        last = now;
        step(now, dt);
        invalidate();
    }

    /** Une image de la goutte : la suite exacte des calculs d'TamilyaBlob, sans la voix. */
    private void step(long now, float dt) {
        // Vitesse du site : 2,4 quand elle réfléchit, 1 sinon (la voix n'est pas ici).
        float speed = busy ? 2.4f : 1f;
        time += dt * speed;

        if (nextBeat != 0L && now >= nextBeat) {
            float strength = range(0.85f, 1f);
            beats.add(new float[]{now, strength});
            colorTurn += range(70, 150);
            beats.add(new float[]{now + range(230, 270), strength * range(0.6f, 0.75f)});
            nextBeat = now + (long) (busy ? range(650, 750) : range(1050, 1250));
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
        rotation += noise(time * 0.12f + 300f) * 55f * dt * speed;
        tilt = noise(time * 0.3f + 700f) * 8f;

        float grow = 1f + heart * 0.07f + (busy ? noise(time * 3f) * 0.03f : 0f);
        sx = grow * (1f + jolt * 0.08f * Math.abs(joltX));
        sy = grow * (1f + jolt * 0.08f * Math.abs(joltY));

        colorTurn += 120f * dt * speed;
        shimmerAlpha = clamp(heart * 1.2f, 0f, 1f);

        float size = box.width();
        for (int i = 0; i < 8; i++) {
            float percent = clamp(50f + noise(time * (0.35f + i * 0.04f) + i * 37.3f) * (busy ? 18f : 14f), 28f, 72f);
            // Ordre du site : 4 largeurs puis 4 hauteurs ; ordre d'Android : largeur, hauteur, coin par coin.
            radii[i < 4 ? i * 2 : (i - 4) * 2 + 1] = percent * size / 100f;
        }

        for (int i = 0; i < drops.length; i++) {
            float seed = drops[i][1];
            dropAngle[i] += (drops[i][0] + noise(time * 0.4f + seed) * 60f) * dt * speed;
            dropDistance[i] = clamp(55f + noise(time * 0.33f + seed + 50f) * 75f + (busy ? -25f : 0f), 0f, 150f);
            dropScale[i] = clamp(0.75f + noise(time * 0.5f + seed + 90f) * 0.3f, 0.4f, 1.2f);
        }

        shineX = noise(time * 0.25f + 900f) * 8f;
        shineY = noise(time * 0.25f + 950f) * 6f;
        lively = busy || heart > 0.01f || jolt > 0.01f || nextBeat - now < 120L || !beats.isEmpty();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        if (unit <= 0f) return;
        long now = SystemClock.uptimeMillis();
        long sincePop = now - popAt;
        boolean popping = sincePop >= 0L && sincePop < POP_MS;
        // Globe figé : le clic doit quand même se jouer jusqu'au bout.
        if (popping && !running) postInvalidateOnAnimation();
        float centerX = getWidth() / 2f;
        float centerY = getHeight() / 2f;

        canvas.save();
        canvas.translate(centerX, centerY);

        // Halo : au clic, il s'allume et s'élargit (tamilya-blob-flash), puis reprend sa place.
        float glowScale = resting ? 1f : 0.95f + heart * 0.12f;
        float glowAlpha = resting ? 1f : clamp(0.5f + heart * 0.35f, 0f, 1f);
        if (popping) {
            float p = sincePop / (float) POP_MS;
            if (p < 0.4f) {
                float e = EASE_OUT.getInterpolation(p / 0.4f);
                glowAlpha = 0.6f + 0.4f * e;
                glowScale *= 1f + 0.3f * e;
            } else {
                float e = EASE_OUT.getInterpolation((p - 0.4f) / 0.6f);
                glowAlpha = 1f - 0.6f * e;
                glowScale *= 1.3f + 0.2f * e;
            }
        }
        canvas.save();
        canvas.scale(glowScale, glowScale);
        glow.setAlpha(Math.round(255f * glowAlpha));
        canvas.drawCircle(0, 0, unit * 0.68f, glow);
        canvas.restore();

        // Clic : écrasé en largeur, puis en hauteur, rebond, puis il grossit et pâlit un peu (tamilya-blob-pop).
        int beat;
        if (popping) {
            float p = sincePop * 4f / POP_MS;
            int i = Math.min(3, (int) p);
            float e = BOUNCE.getInterpolation(p - i);
            float fade = clamp(1f - 0.15f * BOUNCE.getInterpolation(sincePop / (float) POP_MS), 0f, 1f);
            beat = canvas.saveLayerAlpha(layer.left * 1.5f, layer.top * 1.5f, layer.right * 1.5f, layer.bottom * 1.5f, Math.round(255f * fade));
            canvas.scale(POP[i][0] + (POP[i + 1][0] - POP[i][0]) * e, POP[i][1] + (POP[i + 1][1] - POP[i][1]) * e);
        } else {
            beat = canvas.save();
        }
        if (!resting) {
            canvas.translate(tx * unit / 100f, ty * unit / 100f);
            canvas.rotate(tilt);
            canvas.scale(sx, sy);
        }
        drawDrop(canvas);
        drawShine(canvas);
        canvas.restoreToCount(beat);

        if (popping) {
            drawRipple(canvas, sincePop);
            drawRipple(canvas, sincePop - RIPPLE_DELAY_MS);
        }
        canvas.restore();
    }

    private void drawDrop(Canvas canvas) {
        // Arc-en-ciel du battement : conic-gradient qui part du haut, tourné de --rainbow-turn.
        turn.setRotate(colorTurn % 360f - 90f);
        shimmer.setLocalMatrix(turn);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && canvas.isHardwareAccelerated()) {
            if (liquid == null) liquid = new Liquid();
            liquid.draw(canvas);
            return;
        }
        int all = canvas.saveLayer(layer, null);

        // Silhouette : le corps et ses gouttelettes, soudés par le filtre.
        int silhouette = canvas.saveLayer(layer, goo);
        canvas.save();
        canvas.rotate(rotation);
        body.rewind();
        body.addRoundRect(box, radii, Path.Direction.CW);
        canvas.drawPath(body, solid);
        canvas.restore();
        for (int i = 0; i < drops.length; i++) {
            float width = WIDTHS[i] * unit * 1.24f;
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
            shade.setShader(shimmer);
            shade.setAlpha(Math.round(255f * shimmerAlpha));
            canvas.drawPaint(shade);
        }
        canvas.restoreToCount(matter);

        canvas.restoreToCount(all);
    }

    /**
     * La goutte comme le site la fabrique : le corps et chaque gouttelette ont leurs propres couleurs,
     * puis le filtre « goo » floute le tout (couleurs comprises) et durcit le bord.
     */
    @android.annotation.TargetApi(Build.VERSION_CODES.S)
    private final class Liquid {
        private final RenderNode node = new RenderNode("tamilya-goo");
        private final int reach = (int) Math.ceil(layer.right);

        Liquid() {
            node.setPosition(-reach, -reach, reach, reach);
            float radius = gooRadius();
            node.setRenderEffect(RenderEffect.createColorFilterEffect(new ColorMatrixColorFilter(GOO),
                    RenderEffect.createBlurEffect(radius, radius, Shader.TileMode.DECAL)));
        }

        void draw(Canvas canvas) {
            Canvas c = node.beginRecording();
            c.translate(reach, reach);
            int rainbow = Math.round(255f * shimmerAlpha);

            c.save();
            c.rotate(rotation);
            body.rewind();
            body.addRoundRect(box, radii, Path.Direction.CW);
            shade.setShader(null);
            shade.setColor(BLOB);
            c.drawPath(body, shade);
            shade.setShader(deepShader);
            c.drawPath(body, shade);
            shade.setShader(lightShader);
            c.drawPath(body, shade);
            if (rainbow > 0) {
                shade.setShader(shimmer);
                shade.setAlpha(rainbow);
                c.drawPath(body, shade);
            }
            c.restore();

            for (int i = 0; i < drops.length; i++) {
                float width = WIDTHS[i] * unit * 1.24f;
                c.save();
                c.rotate(dropAngle[i]);
                c.translate(dropDistance[i] * width / 100f, 0f);
                c.scale(dropScale[i], dropScale[i]);
                shade.setAlpha(255);
                shade.setShader(dropShaders[i]);
                c.drawCircle(0, 0, width / 2f, shade);
                if (rainbow > 0) {
                    shade.setShader(shimmer);
                    shade.setAlpha(rainbow);
                    c.drawCircle(0, 0, width / 2f, shade);
                }
                c.restore();
            }
            shade.setAlpha(255);
            node.endRecording();
            canvas.drawRenderNode(node);
        }
    }

    /** Reflet net, hors du filtre : la goutte paraît mouillée. */
    private void drawShine(Canvas canvas) {
        canvas.save();
        canvas.translate(-0.1f * unit, -0.17f * unit);
        canvas.rotate(-30f);
        if (!resting) canvas.translate(shineX * unit * 0.0026f, shineY * unit * 0.0018f);
        canvas.scale(1f, 0.69f);
        canvas.drawCircle(0, 0, unit * 0.13f, shine);
        canvas.restore();
    }

    /** Onde du clic (tamilya-blob-ripple) : part du bord, grandit jusqu'à 2,1 fois en s'effaçant. */
    private void drawRipple(Canvas canvas, long elapsed) {
        float e = EASE_OUT.getInterpolation(Math.max(0L, elapsed) / (float) RIPPLE_MS);
        float scale = 1f + 1.1f * e;
        ripple.setAlpha(Math.round(204f * (1f - e)));
        ripple.setStrokeWidth(dp(2) * scale);
        canvas.drawCircle(0, 0, (unit * 0.38f - dp(1)) * scale, ripple);
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
