package io.github.moh23rd.sixfold;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Arms the Android visual-state callback only after the page's launch layer is
 * ready. The page calls this once from js/native.js; the callback then writes
 * the real paint timestamps and resolves the call, so the splash cannot hide on
 * a DOM-ready guess.
 */
@CapacitorPlugin(name = "LaunchPaint")
public class LaunchPaintPlugin extends Plugin {

    @PluginMethod
    public void request(PluginCall call) {
        if (!(getActivity() instanceof MainActivity)) {
            call.reject("no Sixfold activity");
            return;
        }
        final MainActivity activity = (MainActivity) getActivity();
        activity.runOnUiThread(() -> activity.requestPaintSignal(call));
    }
}