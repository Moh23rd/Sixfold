package io.github.moh23rd.sixfold;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;

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
 * The page reports its colour whenever the theme or palette changes. Nothing is
 * stored, retried or polled, and the launch theme's static {@code app_surface}
 * covers the window until the first report.
 */
@CapacitorPlugin(name = "WindowSurface")
public class WindowSurfacePlugin extends Plugin {

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

        final FragmentActivity activity = getBridge().getActivity();
        if (activity == null) {
            call.reject("no activity");
            return;
        }

        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                activity.getWindow().setBackgroundDrawable(new ColorDrawable(color));
                call.resolve();
            }
        });
    }
}
