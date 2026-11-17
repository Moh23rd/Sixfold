package io.github.moh23rd.sixfold;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Keeps the native surface in step with the page colour.
 *
 * <p>The window background and the WebView's own background are what Android
 * composites when it animates the app away (back, return to home). Leaving them
 * transparent or splash-coloured is what made the closing animation show the
 * launcher through a half-drawn card, so the page reports its colour here and
 * the value is remembered for the next launch.
 */
@CapacitorPlugin(name = "Shell")
public class ShellPlugin extends Plugin {

    static final String PREFS = "sixfold.shell";
    static final String SURFACE = "surface";

    @PluginMethod
    public void setSurface(PluginCall call) {
        String hex = call.getString("color", "");
        final int color;
        try {
            color = Color.parseColor(hex);
        } catch (IllegalArgumentException err) {
            call.reject("bad colour");
            return;
        }
        // Plugin calls arrive off the UI thread; the window belongs to it.
        final Activity activity = getActivity();
        if (activity != null) activity.runOnUiThread(() -> apply(activity, color));
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putInt(SURFACE, color)
            .apply();
        call.resolve();
    }

    /** Paint the window and the WebView with the page colour. */
    static void apply(Activity activity, int color) {
        if (activity == null) return;
        activity.getWindow().setBackgroundDrawable(new ColorDrawable(color));
        if (activity instanceof BridgeActivity) {
            WebView view = ((BridgeActivity) activity).getBridge().getWebView();
            if (view != null) view.setBackgroundColor(color);
        }
    }

    /** The colour the page used last time, for the frame before it reports one. */
    static int stored(Context context, int fallback) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt(SURFACE, fallback);
    }
}
