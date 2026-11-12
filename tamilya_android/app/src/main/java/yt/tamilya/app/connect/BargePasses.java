package yt.tamilya.app.connect;

import android.animation.ValueAnimator;
import android.app.Dialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorMatrix;
import android.graphics.ColorMatrixColorFilter;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.view.animation.DecelerateInterpolator;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.google.zxing.EncodeHintType;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import com.google.zxing.qrcode.encoder.ByteMatrix;
import com.google.zxing.qrcode.encoder.Encoder;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.EnumMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Tickets de barge payés dans Tamilya Connect, comme sur le site (BargeTickets.tsx) :
 * - la carte bleue du Département est une image rangée dans l'APK (res/drawable-nodpi/barge_carte.png,
 *   faite depuis le dessin du site, sans QR ni texte) : rien à télécharger ;
 * - l'app n'y ajoute que le QR code du ticket (version 4, correction H, logo Groupe BTM au centre,
 *   comme PlainQr), le ticket (« BARGE SEULE », « VOITURE »…) et la date ;
 * - toucher : le ticket en grand ; deux touches rapides : scan démo, le bas s'arrache, « UTILISÉ ».
 * Le scan est gardé sur l'appareil seulement (démo), comme sur le site.
 */
final class BargePasses {
    private BargePasses() {}

    /** Dessin du site : 540 × 860, le bas arraché à 57 %, le ticket usé raccourci à 510. */
    static final float CARD_W = 540f;
    static final float CARD_H = 860f;
    static final float USED_H = 510f;
    static final float TEAR = 0.57f;
    private static final long DOUBLE_TAP_MS = 350;
    private static final long TEAR_MS = 1100;
    private static final String PREFS = "barge-scans";

    private static final int CREAM = Color.parseColor("#F5F0E6");
    private static final int MUTED = Color.parseColor("#8E9398");
    private static final int ACCENT = Color.parseColor("#F06A9B");

    private static Bitmap card;
    private static Bitmap logo;

    static String frDate(long at) {
        return new SimpleDateFormat("dd/MM/yyyy", Locale.FRANCE).format(new Date(at));
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Heure du scan (ms), ou 0 si le ticket n'a pas servi. */
    static long scanOf(Context context, String code) {
        return prefs(context).getLong(code, 0L);
    }

    private static Bitmap card(Context context) {
        if (card == null) card = BitmapFactory.decodeResource(context.getResources(), yt.tamilya.app.R.drawable.barge_carte);
        return card;
    }

    private static Bitmap logo(Context context) {
        if (logo == null) logo = BitmapFactory.decodeResource(context.getResources(), yt.tamilya.app.R.drawable.barge_logo_btm);
        return logo;
    }

    /** Modules du QR code (null si le code ne tient pas dans la version 4). */
    static ByteMatrix qr(String text) {
        try {
            Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class);
            hints.put(EncodeHintType.QR_VERSION, 4);
            hints.put(EncodeHintType.CHARACTER_SET, "UTF-8");
            return Encoder.encode(text, ErrorCorrectionLevel.H, hints).getMatrix();
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Les tickets sous la réponse de Tamilya, alignés à gauche : un seul (pas trop grand), sinon
     * côte à côte (3 sur une ligne s'il y en a 3, sinon 2), chaque code sous son ticket.
     * reorder : « Commander un nouveau ticket » (ticket usé, en grand).
     */
    static View list(Context context, JSONArray tickets, Runnable reorder) {
        List<JSONObject> passes = new ArrayList<>();
        for (int i = 0; i < tickets.length(); i++) {
            JSONObject t = tickets.optJSONObject(i);
            if (t != null && !t.optString("code").isEmpty()) passes.add(t);
        }
        LinearLayout box = new LinearLayout(context);
        box.setOrientation(LinearLayout.VERTICAL);
        if (passes.isEmpty()) return box;

        int columns = passes.size() == 1 ? 1 : passes.size() == 3 ? 3 : 2;
        List<PassView> views = new ArrayList<>();
        Runnable refresh = () -> {
            for (PassView v : views) v.refresh();
        };
        LinearLayout row = null;
        for (int i = 0; i < passes.size(); i++) {
            if (i % columns == 0) {
                row = new LinearLayout(context);
                row.setOrientation(LinearLayout.HORIZONTAL);
                row.setGravity(Gravity.TOP | Gravity.START);
                LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(
                        columns == 1 ? dp(context, 220) : ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
                if (i > 0) rowParams.topMargin = dp(context, 12);
                box.addView(row, rowParams);
            }
            JSONObject pass = passes.get(i);
            String code = pass.optString("code");
            LinearLayout cell = new LinearLayout(context);
            cell.setOrientation(LinearLayout.VERTICAL);
            PassView view = new PassView(context, code, pass.optString("title", "BARGE SEULE"));
            views.add(view);
            Tapper tapper = new Tapper(view, reorder, refresh);
            view.setOnClickListener(v -> tapper.tap());
            view.setContentDescription("Ticket " + pass.optString("title") + ", toucher pour l'agrandir, deux fois pour le scanner");
            cell.addView(view, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
            TextView codeText = text(context, code, 12, CREAM);
            codeText.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
            codeText.setLetterSpacing(0.15f);
            codeText.setPadding(0, dp(context, 6), 0, 0);
            cell.addView(codeText);
            LinearLayout.LayoutParams cellParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            if (i % columns > 0) cellParams.leftMargin = dp(context, 12);
            row.addView(cell, cellParams);
        }
        // Dernière ligne incomplète : des cases vides gardent la même largeur de ticket.
        int missing = (columns - passes.size() % columns) % columns;
        for (int i = 0; i < missing && row != null; i++) {
            LinearLayout.LayoutParams empty = new LinearLayout.LayoutParams(0, 1, 1f);
            empty.leftMargin = dp(context, 12);
            row.addView(new View(context), empty);
        }

        TextView note = text(context, passes.size() + " ticket" + (passes.size() > 1 ? "s" : "")
                + " · démo · Montre le QR code à l'embarquement, à Mamoudzou. Une fois scanné, le ticket ne sert plus."
                + " Démo : touche deux fois un ticket pour le scanner.", 12, MUTED);
        note.setPadding(0, dp(context, 10), 0, 0);
        box.addView(note);
        return box;
    }

    /** Une touche ouvre le ticket en grand ; une deuxième, juste après, le scanne. */
    private static final class Tapper {
        private final PassView view;
        private final Runnable reorder;
        private final Runnable refresh;
        private long last;
        private Dialog open;

        Tapper(PassView view, Runnable reorder, Runnable refresh) {
            this.view = view;
            this.reorder = reorder;
            this.refresh = refresh;
        }

        void tap() {
            long now = android.os.SystemClock.uptimeMillis();
            boolean twice = now - last < DOUBLE_TAP_MS;
            last = twice ? 0 : now;
            if (twice && scanOf(view.getContext(), view.code) == 0) {
                scan();
            } else if (open == null) {
                show();
            }
        }

        private void scan() {
            Context context = view.getContext();
            long at = System.currentTimeMillis();
            prefs(context).edit().putLong(view.code, at).apply();
            vibrate(context);
            if (open == null) show();
            View big = open == null ? null : open.findViewById(android.R.id.content).findViewWithTag("big");
            if (big instanceof PassView) ((PassView) big).tear(() -> {
                refresh.run();
                if (open != null) fillUsed(open);
            });
            else refresh.run();
        }

        private void show() {
            Context context = view.getContext();
            Dialog dialog = new Dialog(context, android.R.style.Theme_Translucent_NoTitleBar_Fullscreen);
            open = dialog;
            dialog.setOnDismissListener(d -> {
                open = null;
                refresh.run();
            });
            FrameLayout root = new FrameLayout(context);
            root.setBackgroundColor(Color.argb(140, 0, 0, 0));
            root.setOnClickListener(v -> dialog.dismiss());
            LinearLayout column = new LinearLayout(context);
            column.setOrientation(LinearLayout.VERTICAL);
            column.setGravity(Gravity.CENTER_HORIZONTAL);
            column.setTag("column");

            PassView big = new PassView(context, view.code, view.title);
            big.setTag("big");
            big.setOnClickListener(v -> tap());
            int screenW = context.getResources().getDisplayMetrics().widthPixels;
            int screenH = context.getResources().getDisplayMetrics().heightPixels;
            int width = Math.min(screenW - dp(context, 32), Math.round(screenH * 0.86f * CARD_W / CARD_H));
            column.addView(big, new LinearLayout.LayoutParams(width, ViewGroup.LayoutParams.WRAP_CONTENT));
            root.addView(column, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));
            dialog.setContentView(root);
            if (scanOf(context, view.code) != 0) fillUsed(dialog);

            Window window = dialog.getWindow();
            if (window != null) {
                window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    window.addFlags(WindowManager.LayoutParams.FLAG_BLUR_BEHIND);
                    window.getAttributes().setBlurBehindRadius(dp(context, 18));
                }
            }
            dialog.show();
        }

        /** Ticket usé, en grand : la date du scan et « Commander un nouveau ticket ». */
        private void fillUsed(Dialog dialog) {
            Context context = view.getContext();
            View found = dialog.findViewById(android.R.id.content).findViewWithTag("column");
            if (!(found instanceof LinearLayout) || found.findViewWithTag("used") != null) return;
            LinearLayout column = (LinearLayout) found;
            LinearLayout info = new LinearLayout(context);
            info.setTag("used");
            info.setOrientation(LinearLayout.VERTICAL);
            info.setGravity(Gravity.CENTER_HORIZONTAL);
            info.setPadding(dp(context, 24), dp(context, 16), dp(context, 24), 0);
            TextView when = text(context, "Ticket utilisé le " + frDate(scanOf(context, view.code)), 16, Color.WHITE);
            when.setTypeface(when.getTypeface(), Typeface.BOLD);
            when.setGravity(Gravity.CENTER);
            info.addView(when);
            TextView why = text(context, "Il n'est plus valable. Commande un nouveau ticket pour la prochaine traversée.", 14, Color.argb(204, 255, 255, 255));
            why.setGravity(Gravity.CENTER);
            why.setPadding(0, dp(context, 4), 0, 0);
            info.addView(why);
            TextView again = text(context, "Commander un nouveau ticket", 15, Color.WHITE);
            again.setTypeface(again.getTypeface(), Typeface.BOLD);
            again.setPadding(dp(context, 20), dp(context, 10), dp(context, 20), dp(context, 10));
            GradientDrawable pink = new GradientDrawable();
            pink.setColor(ACCENT);
            pink.setCornerRadius(dp(context, 24));
            again.setBackground(pink);
            again.setOnClickListener(v -> {
                dialog.dismiss();
                reorder.run();
            });
            LinearLayout.LayoutParams againParams = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            againParams.topMargin = dp(context, 12);
            info.addView(again, againParams);
            // Toucher le texte ferme aussi, comme le flou autour.
            info.setOnClickListener(v -> dialog.dismiss());
            column.addView(info);
        }
    }

    private static void vibrate(Context context) {
        try {
            Vibrator vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
            if (vibrator != null && vibrator.hasVibrator()) {
                vibrator.vibrate(VibrationEffect.createWaveform(new long[] {0, 30, 50, 80}, -1));
            }
        } catch (Exception ignored) {
            // Pas de vibreur.
        }
    }

    /** Le ticket : la carte rangée dans l'APK, le QR, le ticket et la date ; usé, le bas arraché. */
    static final class PassView extends View {
        final String code;
        final String title;
        private final ByteMatrix matrix;
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        private final Paint grey = new Paint(Paint.FILTER_BITMAP_FLAG);
        private final Rect src = new Rect();
        private final RectF dst = new RectF();
        private final Path path = new Path();
        /** Arrachage en cours : 0 → 1 (−1 : rien à jouer). */
        private float tearing = -1f;

        PassView(Context context, String code, String title) {
            super(context);
            this.code = code;
            this.title = title;
            this.matrix = qr(code);
            ColorMatrix gray = new ColorMatrix();
            gray.setSaturation(0.25f);
            grey.setColorFilter(new ColorMatrixColorFilter(gray));
            grey.setAlpha(217);
            setClickable(true);
        }

        private boolean used() {
            return scanOf(getContext(), code) != 0;
        }

        void refresh() {
            requestLayout();
            invalidate();
        }

        /** Le bas s'arrache et tombe, puis « UTILISÉ » se pose ; done : une fois fini. */
        void tear(Runnable done) {
            ValueAnimator anim = ValueAnimator.ofFloat(0f, 1f).setDuration(TEAR_MS);
            anim.setInterpolator(new DecelerateInterpolator());
            anim.addUpdateListener(a -> {
                tearing = (float) a.getAnimatedValue();
                invalidate();
            });
            anim.addListener(new android.animation.AnimatorListenerAdapter() {
                @Override
                public void onAnimationEnd(android.animation.Animator animation) {
                    tearing = -1f;
                    refresh();
                    done.run();
                }
            });
            tearing = 0f;
            refresh();
            anim.start();
        }

        @Override
        protected void onMeasure(int widthSpec, int heightSpec) {
            int width = MeasureSpec.getSize(widthSpec);
            float ratio = (used() && tearing < 0f ? USED_H : CARD_H) / CARD_W;
            setMeasuredDimension(width, Math.round(width * ratio));
        }

        @Override
        protected void onDraw(Canvas canvas) {
            float s = getWidth() / CARD_W;
            if (!used() && tearing < 0f) {
                face(canvas, s, today());
                return;
            }
            String date = frDate(used() ? scanOf(getContext(), code) : System.currentTimeMillis());
            // Haut gardé, grisé, le bord en dents de scie.
            int saved = canvas.saveLayer(0, 0, getWidth(), CARD_H * s, grey);
            canvas.clipPath(zigzag(s, true));
            face(canvas, s, date);
            canvas.restoreToCount(saved);
            if (tearing >= 0f) {
                // Le bas arraché tombe en tournant et s'efface.
                float p = tearing;
                int stub = canvas.save();
                canvas.translate(0, p * p * CARD_H * s * 0.45f);
                canvas.rotate(-10f * p, CARD_W * s * 0.85f, CARD_H * s * TEAR);
                canvas.clipPath(zigzag(s, false));
                int alpha = canvas.saveLayerAlpha(0, 0, getWidth(), CARD_H * s, Math.round(255 * (1f - p)));
                face(canvas, s, date);
                canvas.restoreToCount(alpha);
                canvas.restoreToCount(stub);
            }
            stamp(canvas, s);
        }

        private String today() {
            return frDate(System.currentTimeMillis());
        }

        /** Bord déchiré, comme ZIGZAG du site : 21 dents sur la largeur, à TEAR ± 1,2 %. */
        private Path zigzag(float s, boolean top) {
            path.reset();
            float w = CARD_W * s;
            float h = CARD_H * s;
            if (top) {
                path.moveTo(0, 0);
                path.lineTo(w, 0);
                for (int i = 20; i >= 0; i--) path.lineTo(w * i * 0.05f, h * (TEAR + (i % 2 == 1 ? 0.012f : -0.012f)));
            } else {
                for (int i = 0; i <= 20; i++) {
                    float x = w * i * 0.05f;
                    float y = h * (TEAR + (i % 2 == 1 ? 0.012f : -0.012f));
                    if (i == 0) path.moveTo(x, y);
                    else path.lineTo(x, y);
                }
                path.lineTo(w, h);
                path.lineTo(0, h);
            }
            path.close();
            return path;
        }

        private void face(Canvas canvas, float s, String date) {
            Bitmap art = card(getContext());
            src.set(0, 0, art.getWidth(), art.getHeight());
            dst.set(0, 0, CARD_W * s, CARD_H * s);
            canvas.drawBitmap(art, src, dst, paint);
            drawQr(canvas, s);

            paint.setTextAlign(Paint.Align.CENTER);
            paint.setColor(Color.parseColor("#232323"));
            paint.setTypeface(Typeface.create(Typeface.MONOSPACE, Typeface.BOLD));
            paint.setTextSize(27 * s);
            paint.setLetterSpacing(0.5f / 27f);
            canvas.drawText(title, 270 * s, 414 * s, paint);
            paint.setColor(Color.parseColor("#3a3a3a"));
            paint.setTextSize(19 * s);
            paint.setLetterSpacing(0f);
            canvas.drawText(date, 270 * s, 443 * s, paint);
        }

        /** Comme PlainQr : 1 module de marge, modules noirs carrés, logo Groupe BTM dans un carré blanc au centre. */
        private void drawQr(Canvas canvas, float s) {
            if (matrix == null) return;
            int size = matrix.getWidth();
            float left = CARD_W * 0.3056f * s;
            float top = CARD_H * 0.0837f * s;
            float box = CARD_W * 0.3889f * s;
            float m = box / (size + 2);
            int logoModules = ((int) Math.ceil(size * 0.34)) | 1;
            float logoStart = (size - logoModules) / 2f;
            paint.setStyle(Paint.Style.FILL);
            paint.setColor(Color.WHITE);
            canvas.drawRect(left, top, left + box, top + box, paint);
            paint.setAntiAlias(false);
            paint.setColor(Color.parseColor("#111111"));
            for (int row = 0; row < size; row++) {
                for (int col = 0; col < size; col++) {
                    if (matrix.get(col, row) != 1) continue;
                    if (row >= logoStart && row < logoStart + logoModules && col >= logoStart && col < logoStart + logoModules) continue;
                    float x = left + (col + 1) * m;
                    float y = top + (row + 1) * m;
                    canvas.drawRect(x, y, x + m + 0.5f, y + m + 0.5f, paint);
                }
            }
            paint.setAntiAlias(true);
            float center = 1 + size / 2f;
            float badge = logoModules - 1;
            float bx = left + (center - badge / 2f) * m;
            float by = top + (center - badge / 2f) * m;
            paint.setColor(Color.WHITE);
            canvas.drawRect(bx, by, bx + badge * m, by + badge * m, paint);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(0.7f * m);
            paint.setColor(Color.parseColor("#111111"));
            canvas.drawRect(bx, by, bx + badge * m, by + badge * m, paint);
            paint.setStyle(Paint.Style.FILL);
            // Logo dans 84 % du carré, proportions gardées.
            Bitmap brand = logo(getContext());
            float room = badge * 0.84f * m;
            float scale = Math.min(room / brand.getWidth(), room / brand.getHeight());
            float lw = brand.getWidth() * scale;
            float lh = brand.getHeight() * scale;
            float cx = left + center * m;
            float cy = top + center * m;
            src.set(0, 0, brand.getWidth(), brand.getHeight());
            dst.set(cx - lw / 2f, cy - lh / 2f, cx + lw / 2f, cy + lh / 2f);
            canvas.drawBitmap(brand, src, dst, paint);
        }

        /** « UTILISÉ » en rouge, penché, posé à 24 % de la hauteur ; il tombe d'en haut pendant l'arrachage. */
        private void stamp(Canvas canvas, float s) {
            float appear = tearing < 0f ? 1f : Math.max(0f, Math.min(1f, (tearing - 0.6f) / 0.3f));
            if (appear <= 0f) return;
            float w = CARD_W * s;
            paint.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
            paint.setTextAlign(Paint.Align.CENTER);
            paint.setTextSize(w * 0.09f);
            paint.setLetterSpacing(0.1f);
            float textW = paint.measureText("UTILISÉ");
            Paint.FontMetrics fm = paint.getFontMetrics();
            float padX = w * 0.045f;
            float padY = w * 0.015f;
            float boxW = textW + padX * 2;
            float boxH = (fm.descent - fm.ascent) + padY * 2;
            float cx = w / 2f;
            float cy = CARD_H * s * 0.24f + boxH / 2f;
            int saved = canvas.save();
            float scale = 1f + (1f - appear) * 1.4f;
            canvas.rotate(-14f, cx, cy);
            canvas.scale(scale, scale, cx, cy);
            int alpha = Math.round(255 * appear);
            RectF r = new RectF(cx - boxW / 2f, cy - boxH / 2f, cx + boxW / 2f, cy + boxH / 2f);
            paint.setStyle(Paint.Style.FILL);
            paint.setColor(Color.argb(Math.round(217 * appear), 255, 255, 255));
            canvas.drawRoundRect(r, w * 0.012f, w * 0.012f, paint);
            int red = Color.parseColor("#DC2626");
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(w * 0.012f);
            paint.setColor(red);
            paint.setAlpha(alpha);
            canvas.drawRoundRect(r, w * 0.012f, w * 0.012f, paint);
            paint.setStyle(Paint.Style.FILL);
            paint.setColor(red);
            paint.setAlpha(alpha);
            canvas.drawText("UTILISÉ", cx, cy - (fm.ascent + fm.descent) / 2f, paint);
            paint.setAlpha(255);
            paint.setLetterSpacing(0f);
            canvas.restoreToCount(saved);
        }
    }

    private static TextView text(Context context, String value, int sp, int color) {
        TextView view = new TextView(context);
        view.setText(value);
        view.setTextColor(color);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        return view;
    }

    private static int dp(Context context, int value) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, context.getResources().getDisplayMetrics()));
    }
}
