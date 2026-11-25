package io.github.moh23rd.sixfold;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Hands a launch shortcut's action to the page once.
 *
 * Static app shortcuts start MainActivity with an extra instead of a URL, so
 * the page needs a way to ask what opened it. The last action is kept here and
 * cleared on read: a shortcut fires once, and a return from Recents must not
 * replay it. A second shortcut while the app is already running replaces the
 * pending value and wakes the page through onNewIntent.
 */
@CapacitorPlugin(name = "LaunchAction")
public class LaunchActionPlugin extends Plugin {

    static volatile String pending = null;

    @PluginMethod
    public void consume(PluginCall call) {
        String action = pending;
        pending = null;
        JSObject result = new JSObject();
        if (action != null && !action.isEmpty()) result.put("action", action);
        call.resolve(result);
    }
}
