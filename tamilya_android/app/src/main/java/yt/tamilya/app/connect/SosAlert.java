package yt.tamilya.app.connect;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.regex.Pattern;

/**
 * SOS de Tamilya Connect : la personne écrit « SOS ». Compte à rebours de 10 s pour
 * annuler, puis l'alerte part par les relais ; le serveur écrit à ses proches
 * (position et batterie). Le bouton 112 ouvre le clavier d'appel, l'alerte part aussi.
 */
final class SosAlert {
    static final int SECONDS = 10;
    /** Code à part : la réponse n'a rien à déclencher, la position est relue à chaque seconde. */
    private static final int REQ_SOS_LOCATION = 4711;
    /** Position plus vieille que ça : pas envoyée. */
    private static final long MAX_LOCATION_AGE_MS = 2 * 60 * 60 * 1000L;
    private static final Pattern SOS = Pattern.compile("(?i)\\s*s\\s*o\\s*s[\\s!.]*");

    interface Sender {
        void send(JSONObject content);
    }

    /** « SOS », « sos ! », « S O S »… mais pas une phrase qui contient le mot. */
    static boolean isSos(String text) {
        return text != null && SOS.matcher(text).matches();
    }

    private final Activity activity;
    private final Handler main = new Handler(Looper.getMainLooper());
    private LocationManager locations;
    private LocationListener listener;
    private Location best;
    private boolean finished;

    SosAlert(Activity activity) {
        this.activity = activity;
    }

    void show(int peers, Sender sender) {
        int ink = Color.parseColor("#17191B");
        int cream = Color.parseColor("#F5F0E6");
        int muted = Color.parseColor("#8E9398");
        int accent = Color.parseColor("#F06A9B");
        int red = Color.parseColor("#E5484D");

        LinearLayout card = new LinearLayout(activity);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(24), dp(24), dp(24), dp(20));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(ink);
        bg.setCornerRadius(dp(26));
        card.setBackground(bg);

        TextView title = text("Alerte SOS", cream, 19);
        title.setTypeface(title.getTypeface(), Typeface.BOLD);
        card.addView(title);

        TextView relays = text(peersText(peers), peers > 0 ? cream : red, 14);
        relays.setPadding(0, dp(8), 0, 0);
        card.addView(relays);

        TextView detail = text("Tes proches recevront un e-mail avec ta position et ta batterie.", muted, 14);
        detail.setPadding(0, dp(6), 0, 0);
        card.addView(detail);

        TextView count = text("", cream, 40);
        count.setTypeface(count.getTypeface(), Typeface.BOLD);
        count.setGravity(Gravity.CENTER);
        count.setPadding(0, dp(18), 0, dp(2));
        card.addView(count, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        TextView countLabel = text("secondes avant l'envoi", muted, 13);
        countLabel.setGravity(Gravity.CENTER);
        card.addView(countLabel, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        AlertDialog dialog = new AlertDialog.Builder(activity).setView(card).create();
        if (dialog.getWindow() != null) dialog.getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        dialog.setCanceledOnTouchOutside(false);

        TextView call = pill("Appeler le 112", Color.WHITE, red);
        LinearLayout.LayoutParams callParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        callParams.topMargin = dp(18);
        card.addView(call, callParams);

        LinearLayout row = new LinearLayout(activity);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.END);
        LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        rowParams.topMargin = dp(12);
        card.addView(row, rowParams);
        TextView cancel = pill("Annuler", muted, Color.TRANSPARENT);
        row.addView(cancel);
        TextView now = pill("Envoyer", Color.WHITE, accent);
        LinearLayout.LayoutParams nowParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        nowParams.leftMargin = dp(8);
        row.addView(now, nowParams);

        int[] left = {SECONDS};
        Runnable fire = () -> {
            if (finished) return;
            finished = true;
            JSONObject content = content();
            stopLocating();
            dialog.dismiss();
            vibrate(new long[]{0, 90, 80, 90});
            if (content != null) sender.send(content);
        };
        Runnable tick = new Runnable() {
            @Override
            public void run() {
                if (finished) return;
                if (locations == null && hasLocation()) startLocating();
                count.setText(String.valueOf(left[0]));
                if (left[0] <= 0) {
                    fire.run();
                    return;
                }
                left[0]--;
                main.postDelayed(this, 1000);
            }
        };
        cancel.setOnClickListener(v -> dialog.dismiss());
        now.setOnClickListener(v -> fire.run());
        call.setOnClickListener(v -> {
            fire.run();
            dial112();
        });
        dialog.setOnDismissListener(d -> {
            // Annulé (bouton, retour) : rien ne part.
            finished = true;
            main.removeCallbacksAndMessages(null);
            stopLocating();
        });

        if (!hasLocation()) {
            activity.requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_SOS_LOCATION);
        } else {
            startLocating();
        }
        vibrate(new long[]{0, 60});
        dialog.show();
        tick.run();
    }

    private static String peersText(int peers) {
        if (peers < 0) return "Recherche de téléphones autour…";
        if (peers == 0) return "Aucun téléphone autour : ton alerte attendra un relais. Si tu peux, déplace-toi.";
        return (peers == 1 ? "1 téléphone autour" : peers + " téléphones autour") + " : ton alerte peut passer.";
    }

    /** Ce qui part au serveur : position (si connue et récente) et batterie. */
    private JSONObject content() {
        try {
            JSONObject content = new JSONObject().put("kind", "sos").put("at", System.currentTimeMillis());
            Location where = best;
            if (where != null && System.currentTimeMillis() - where.getTime() <= MAX_LOCATION_AGE_MS) {
                content.put("lat", where.getLatitude()).put("lng", where.getLongitude());
                if (where.hasAccuracy()) content.put("accuracy", Math.min(100_000.0, (double) where.getAccuracy()));
            }
            BatteryManager battery = (BatteryManager) activity.getSystemService(Context.BATTERY_SERVICE);
            int level = battery == null ? -1 : battery.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
            if (level >= 0 && level <= 100) content.put("battery", level);
            return content;
        } catch (JSONException e) {
            return null;
        }
    }

    private boolean hasLocation() {
        return activity.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || activity.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    /** Dernière position connue, puis le GPS pendant le compte à rebours (il marche sans internet). */
    private void startLocating() {
        locations = (LocationManager) activity.getSystemService(Context.LOCATION_SERVICE);
        if (locations == null) return;
        try {
            for (String provider : locations.getProviders(true)) consider(locations.getLastKnownLocation(provider));
            // Classe complète : avant Android 11, ces méthodes n'ont pas de version par défaut.
            listener = new LocationListener() {
                @Override public void onLocationChanged(Location location) { consider(location); }
                @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
                @Override public void onProviderEnabled(String provider) {}
                @Override public void onProviderDisabled(String provider) {}
            };
            for (String provider : new String[]{LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER}) {
                if (locations.isProviderEnabled(provider)) {
                    locations.requestLocationUpdates(provider, 1000, 0, listener, Looper.getMainLooper());
                }
            }
        } catch (SecurityException | IllegalArgumentException ignored) {
            // Pas de position : l'alerte part quand même.
        }
    }

    private void consider(Location location) {
        if (location == null) return;
        if (best == null || location.getTime() > best.getTime() + 60_000
                || (location.hasAccuracy() && (!best.hasAccuracy() || location.getAccuracy() < best.getAccuracy()))) {
            best = location;
        }
    }

    private void stopLocating() {
        if (locations != null && listener != null) {
            try {
                locations.removeUpdates(listener);
            } catch (SecurityException ignored) {
                // Déjà arrêté.
            }
        }
        listener = null;
    }

    /** Ouvre le clavier d'appel avec le 112 : la personne n'a plus qu'à appuyer. */
    private void dial112() {
        try {
            activity.startActivity(new Intent(Intent.ACTION_DIAL, Uri.parse("tel:112")));
        } catch (ActivityNotFoundException ignored) {
            // Pas d'appli téléphone (tablette) : rien à ouvrir.
        }
    }

    private void vibrate(long[] pattern) {
        Vibrator vibrator = (Vibrator) activity.getSystemService(Context.VIBRATOR_SERVICE);
        if (vibrator == null || !vibrator.hasVibrator()) return;
        vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1));
    }

    private TextView text(String value, int color, int sp) {
        TextView view = new TextView(activity);
        view.setText(value);
        view.setTextColor(color);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        return view;
    }

    private TextView pill(String value, int textColor, int fill) {
        TextView button = text(value, textColor, 15);
        button.setTypeface(button.getTypeface(), Typeface.BOLD);
        button.setGravity(Gravity.CENTER);
        button.setPadding(dp(22), dp(12), dp(22), dp(12));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(fill);
        bg.setCornerRadius(dp(22));
        button.setBackground(bg);
        button.setClickable(true);
        return button;
    }

    private int dp(int value) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, activity.getResources().getDisplayMetrics()));
    }
}
