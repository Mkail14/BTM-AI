package yt.tamilya.app;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.util.TypedValue;
import android.view.View;

/**
 * Anneau qui se remplit pendant qu'on tire vers le haut (comme le mode éphémère d'Instagram),
 * avec une flèche au centre et le nom de ce qui va s'ouvrir dessous.
 */
final class PullIndicator extends View {
    private final Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint arrow = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint label = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF bounds = new RectF();
    private float progress;
    private String text = "";

    PullIndicator(Context context) {
        super(context);
        float stroke = dp(3);
        track.setStyle(Paint.Style.STROKE);
        track.setStrokeWidth(stroke);
        track.setColor(Color.argb(70, 245, 240, 230));
        ring.setStyle(Paint.Style.STROKE);
        ring.setStrokeWidth(stroke);
        ring.setStrokeCap(Paint.Cap.ROUND);
        ring.setColor(Color.parseColor("#F06A9B"));
        fill.setColor(Color.parseColor("#F06A9B"));
        arrow.setStyle(Paint.Style.STROKE);
        arrow.setStrokeWidth(dp(2.5f));
        arrow.setStrokeCap(Paint.Cap.ROUND);
        arrow.setStrokeJoin(Paint.Join.ROUND);
        label.setColor(Color.parseColor("#F5F0E6"));
        label.setTextAlign(Paint.Align.CENTER);
        label.setTextSize(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, 14, getResources().getDisplayMetrics()));
        label.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        setWillNotDraw(false);
    }

    void set(float value, String caption) {
        progress = Math.max(0f, Math.min(1f, value));
        text = caption;
        invalidate();
    }

    private float dp(float value) {
        return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics());
    }

    @Override
    protected void onDraw(Canvas canvas) {
        float cx = getWidth() / 2f;
        float radius = dp(26);
        float cy = radius + dp(8);
        bounds.set(cx - radius, cy - radius, cx + radius, cy + radius);
        canvas.drawCircle(cx, cy, radius, track);
        canvas.drawArc(bounds, -90, 360 * progress, false, ring);

        // Plein : le disque se remplit d'un coup, la flèche devient blanche.
        boolean full = progress >= 1f;
        if (full) canvas.drawCircle(cx, cy, radius - dp(1.5f), fill);
        arrow.setColor(full ? Color.WHITE : Color.parseColor("#F5F0E6"));
        float lift = dp(3) * progress;
        float half = dp(7);
        canvas.drawLine(cx, cy + half - lift, cx, cy - half - lift, arrow);
        canvas.drawLine(cx - dp(6), cy - dp(1) - lift, cx, cy - half - lift, arrow);
        canvas.drawLine(cx + dp(6), cy - dp(1) - lift, cx, cy - half - lift, arrow);

        canvas.drawText(text, cx, cy + radius + dp(24), label);
    }
}
