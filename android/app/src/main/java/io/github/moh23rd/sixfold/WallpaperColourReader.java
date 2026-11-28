package io.github.moh23rd.sixfold;

import android.app.WallpaperColors;
import android.app.WallpaperManager;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;

import java.util.Locale;

/**
 * Reads the wallpaper colours the page builds its palette from.
 *
 * This lives apart from the plugin on purpose. The plugin is instantiated at
 * startup on every release, and a class whose code mentions API-27 types cannot
 * be verified before Android 8.1 — its mere registration took the app down on
 * API 24 and 26 with a fatal exception while the WebView was attaching. This
 * class is only touched after the plugin's version guard has passed.
 */
final class WallpaperColourReader {

    private WallpaperColourReader() {}

    /**
     * Primary, secondary and tertiary as lowercase #rrggbb; the last two are
     * null on a wallpaper that only produced one colour, and the whole array is
     * null when nothing could be extracted.
     */
    static String[] read(Context context) {
        WallpaperManager manager = WallpaperManager.getInstance(context);
        WallpaperColors colors;
        try {
            colors = manager.getWallpaperColors(WallpaperManager.FLAG_SYSTEM);
            if (colors == null) colors = manager.getWallpaperColors(WallpaperManager.FLAG_LOCK);
        } catch (RuntimeException err) {
            colors = null;
        }
        if (colors == null) colors = sample(manager);
        if (colors == null) return null;
        return new String[] {
            hex(colors.getPrimaryColor()),
            colors.getSecondaryColor() == null ? null : hex(colors.getSecondaryColor()),
            colors.getTertiaryColor() == null ? null : hex(colors.getTertiaryColor())
        };
    }

    /**
     * A wallpaper set before the colour extraction existed (and some live
     * wallpapers) reports null. Draw it once at a small size and keep the
     * extracted colours: enough to answer without decoding a full-resolution
     * image.
     */
    private static WallpaperColors sample(WallpaperManager manager) {
        Drawable drawable;
        try {
            drawable = manager.getDrawable();
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
