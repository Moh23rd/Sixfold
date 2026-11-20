package io.github.moh23rd.sixfold;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.view.Window;
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
 * A report has to repaint two surfaces and then ask for a frame. The window
 * drawable is the strip around the page, the WebView's own background is what
 * shows wherever the page is transparent (MainActivity seeds it once at
 * launch), and a background set while a touch is still being handled is not
 * drawn until something requests a frame — without that the strip keeps the
 * colour the app opened with until an unrelated redraw or a restart.
 * Nothing is retried or polled, and the theme's day/night {@code app_surface}
 * covers the very first launch, before any colour has been reported.
 */
@CapacitorPlugin(name = "WindowSurface")
public class WindowSurfacePlugin extends Plugin {

    private static final String PREFS = "sixfold.appearance";
    private static final String KEY_SURFACE = "surface";

    /** The surface colour the page last reported, or 0 before the first report. */
    static int storedColor(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt(KEY_SURFACE, 0);
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

        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                final Window window = activity.getWindow();
                window.setBackgroundDrawable(new ColorDrawable(color));
                final WebView webView = getBridge().getWebView();
                if (webView != null) webView.setBackgroundColor(color);
                window.getDecorView().postInvalidateOnAnimation();
                call.resolve();
            }
        });
    }
}
