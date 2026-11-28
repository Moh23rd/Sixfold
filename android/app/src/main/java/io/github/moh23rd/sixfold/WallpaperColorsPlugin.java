package io.github.moh23rd.sixfold;

import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The phone's wallpaper colours, for a Material You-style palette.
 *
 * Android 12's own dynamic colour is a native theme resource this WebView
 * cannot read, but the platform exposes the same source Monet derives from:
 * WallpaperManager.getWallpaperColors() returns the primary, secondary and
 * tertiary colours Android picked out of the wallpaper. The page builds its
 * board ramp from all three anchors, so the app follows the wallpaper the way
 * the rest of the phone does.
 *
 * No permission is needed for the system wallpaper's colours. Releases before
 * Android 8.1 have no such API and report unsupported, which is what leaves the
 * page on its built-in palettes. A launcher wallpaper that has no colours
 * extracted yet falls back to the lock screen's, then to a small sample of the
 * wallpaper itself; a device with none rejects, and the page keeps the palette
 * it had.
 */
@CapacitorPlugin(name = "WallpaperColors")
public class WallpaperColorsPlugin extends Plugin {

    @PluginMethod
    public void colors(PluginCall call) {
        // The reader is a separate class because it needs API-27 types; a class
        // that mentions them cannot be verified before Android 8.1, which took
        // the process down at startup on API 24 and 26.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O_MR1) {
            call.reject("wallpaper colours need Android 8.1 or newer");
            return;
        }

        String[] palette;
        try {
            palette = WallpaperColourReader.read(getContext());
        } catch (SecurityException err) {
            call.reject("wallpaper colours are not readable");
            return;
        } catch (RuntimeException err) {
            call.reject("wallpaper colours are not available");
            return;
        }
        if (palette == null || palette[0] == null) {
            call.reject("this wallpaper has no extracted colours");
            return;
        }

        JSObject result = new JSObject();
        result.put("primary", palette[0]);
        if (palette[1] != null) result.put("secondary", palette[1]);
        if (palette[2] != null) result.put("tertiary", palette[2]);
        call.resolve(result);
    }
}
