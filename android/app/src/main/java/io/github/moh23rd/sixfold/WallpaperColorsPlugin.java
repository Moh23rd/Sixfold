package io.github.moh23rd.sixfold;

import android.app.WallpaperColors;
import android.app.WallpaperManager;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import android.graphics.Bitmap;
import android.graphics.Canvas;

import java.util.Locale;

/**
 * The phone's wallpaper colours, for a Material You-style palette.
 *
 * Android 12's own dynamic colour is a native theme resource this WebView
 * cannot read, but the platform exposes the same source Monet derives from:
 * WallpaperManager.getWallpaperColors() returns the primary, secondary and
 * tertiary colours Android picked out of the wallpaper. The page builds its
 * board ramp from the primary, so the app follows the wallpaper the way the
 * rest of the phone does.
 *
 * No permission is needed for the system wallpaper's colours. Older releases
 * (below Android 8.1) have no such API and report unsupported, which is what
 * leaves the page on its built-in palettes. A launcher wallpaper that has no
 * colours extracted yet falls back to the lock screen's, and a device with
 * neither rejects; the page keeps the palette it had.
 */
@CapacitorPlugin(name = "WallpaperColors")
public class WallpaperColorsPlugin extends Plugin {

    @PluginMethod
    public void colors(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O_MR1) {
            call.reject("wallpaper colours need Android 8.1 or newer");
            return;
        }

        WallpaperManager manager = WallpaperManager.getInstance(getContext());
        WallpaperColors colors = null;
        try {
            colors = manager.getWallpaperColors(WallpaperManager.FLAG_SYSTEM);
            if (colors == null) colors = manager.getWallpaperColors(WallpaperManager.FLAG_LOCK);
        } catch (SecurityException err) {
            call.reject("wallpaper colours are not readable");
            return;
        } catch (RuntimeException err) {
            call.reject("wallpaper colours are not available");
            return;
        }

        if (colors == null) {
            colors = colorsFromWallpaper(manager);
        }
        if (colors == null) {
            call.reject("this wallpaper has no extracted colours");
            return;
        }

        JSObject result = new JSObject();
        result.put("primary", hex(colors.getPrimaryColor()));
        Color secondary = colors.getSecondaryColor();
        Color tertiary = colors.getTertiaryColor();
        if (secondary != null) result.put("secondary", hex(secondary));
        if (tertiary != null) result.put("tertiary", hex(tertiary));
        call.resolve(result);
    }

    /**
     * A wallpaper set before the colour extraction existed (and some live
     * wallpapers) reports null. Draw it once at a small size and keep the
     * centre pixel: enough to answer with a real colour without decoding a
     * full-resolution image.
     */
    private WallpaperColors colorsFromWallpaper(WallpaperManager manager) {
        Drawable drawable;
        try {
            drawable = manager.getDrawable();
        } catch (SecurityException err) {
            return null;
        } catch (RuntimeException err) {
            return null;
        } catch (OutOfMemoryError err) {
            return null;
        }
        if (drawable == null) return null;
        try {
            if (drawable instanceof ColorDrawable) {
                Bitmap flat = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
                new Canvas(flat).drawColor(((ColorDrawable) drawable).getColor());
                return WallpaperColors.fromBitmap(flat);
            }
            Bitmap sample = Bitmap.createBitmap(16, 16, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(sample);
            drawable.setBounds(0, 0, sample.getWidth(), sample.getHeight());
            drawable.draw(canvas);
            return WallpaperColors.fromBitmap(sample);
        } catch (RuntimeException err) {
            return null;
        } catch (OutOfMemoryError err) {
            return null;
        }
    }

    private static String hex(Color color) {
        return String.format(Locale.US, "#%06x", color.toArgb() & 0xffffff);
    }
}
