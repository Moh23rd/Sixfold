package io.github.moh23rd.sixfold;

import android.app.Activity;
import android.app.UiModeManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.view.View;
import android.webkit.WebView;

import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Repaints the window surface to the colour the page is showing.
 *
 * The window sits behind the WebView and is only visible at its edges while a
 * system animation scales or fades it, so it has to agree with the page rather
 * than with the phone's day/night setting: a dark appearance chosen on a
 * light-system phone would otherwise flash a cream frame around a dark app.
 *
 * The page reports its colour whenever the theme or palette changes, and the
 * last report is remembered so the next launch can pick the matching launch
 * theme: that is what keeps the splash out of the phone's day/night colour.
 *
 * A report repaints three surfaces. The window drawable is the strip around
 * the page; the activity content view is the strip exposed by its keyboard
 * padding; and the WebView's own background is what shows wherever the page is
 * transparent. MainActivity only seeds those at launch, so they have to follow
 * the palette as well. Setting a background drawable already invalidates
 * the decor, so the report needs no explicit frame request. Nothing is retried
 * or polled, and the theme's day/night {@code app_surface} covers the very
 * first launch, before any colour has been reported.
 */
@CapacitorPlugin(name = "WindowSurface")
public class WindowSurfacePlugin extends Plugin {

    private static final String PREFS = "sixfold.appearance";
    private static final String KEY_SURFACE = "surface";
    private static final String KEY_THEME = "theme";

    /** The surface colour the page last reported, or 0 before the first report. */
    static int storedColor(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt(KEY_SURFACE, 0);
    }

    /** The appearance the page last reported: auto, light or dark. */
    static String storedTheme(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_THEME, "auto");
    }

    /* The system paints a cold start's first window (the Android 12 splash)
       from the activity theme before this process exists, so setTheme() in
       onCreate cannot reach it: a light app on a dark phone still opened on a
       dark plate. UiModeManager's per-app night mode is persisted by the system
       and is applied when it resolves the app's resources, starting window
       included. Auto keeps following the phone.

       Below API 31 the per-app mode does not exist; the onCreate setTheme()
       still picks the right activity theme there. */
    static void applyNightMode(Context context, String preference) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return;
        UiModeManager manager = (UiModeManager) context.getSystemService(Context.UI_MODE_SERVICE);
        if (manager == null) return;
        int mode = "dark".equals(preference) ? UiModeManager.MODE_NIGHT_YES
            : "light".equals(preference) ? UiModeManager.MODE_NIGHT_NO
            : UiModeManager.MODE_NIGHT_AUTO;
        try {
            manager.setApplicationNightMode(mode);
        } catch (IllegalArgumentException | SecurityException ignored) {
            // An OEM build without per-app night mode keeps the onCreate theme.
        }
    }

    /* Paints every surface the page colour has to cover: the window background
       drawable, which is the strip behind the system bars; the activity content,
       which is the strip its keyboard padding exposes; and the WebView, which
       is everything the page leaves transparent. The window drawable already is
       the decor's background — PhoneWindow installs it there — so setting the
       decor colour as well painted the same rows twice. Callers pass a null
       WebView only before the bridge has one. */
    static void applySurface(Activity activity, WebView webView, int color) {
        activity.getWindow().setBackgroundDrawable(new ColorDrawable(color));
        final View content = activity.findViewById(android.R.id.content);
        if (content != null) content.setBackgroundColor(color);
        if (webView != null) webView.setBackgroundColor(color);
    }

    @PluginMethod
    public void setTheme(final PluginCall call) {
        final String preference = call.getString("preference", "auto");
        final SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!preference.equals(prefs.getString(KEY_THEME, "auto"))) {
            prefs.edit().putString(KEY_THEME, preference).apply();
        }
        applyNightMode(getContext(), preference);
        call.resolve();
    }

    @PluginMethod
    public void setColor(final PluginCall call) {
        final String value = call.getString("color");
        if (value == null) {
            call.reject("color is required");
            return;
        }

        final int color;
        try {
            color = Color.parseColor(value);
        } catch (IllegalArgumentException err) {
            call.reject("color is not a hex colour");
            return;
        }

        final SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (prefs.getInt(KEY_SURFACE, 0) != color) {
            prefs.edit().putInt(KEY_SURFACE, color).apply();
        }

        final FragmentActivity activity = getBridge().getActivity();
        if (activity == null) {
            call.reject("no activity");
            return;
        }

        // Post rather than run inline: SystemBars.setStyle() queues its decor
        // repaint on the main looper, and this write has to land after that one,
        // not before. Inline it painted first and the queued repaint put the
        // launch colour back until the page reported again over the bridge.
        activity.getWindow().getDecorView().post(new Runnable() {
            @Override
            public void run() {
                applySurface(activity, getBridge().getWebView(), color);
                call.resolve();
            }
        });
    }
}
