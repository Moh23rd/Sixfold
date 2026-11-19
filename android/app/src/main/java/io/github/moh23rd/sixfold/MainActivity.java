package io.github.moh23rd.sixfold;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.os.Bundle;

import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GallerySavePlugin.class);
        registerPlugin(WindowSurfacePlugin.class);
        registerPlugin(HapticsPlugin.class);

        // The page reports its surface colour whenever the appearance changes, so
        // the last reported colour is the appearance this launch should open in.
        // Picking the launch theme here — before the splash is installed — keeps
        // the splash and its handoff in that appearance instead of the phone's
        // day/night setting. No stored colour leaves the day/night theme in place.
        final int surface = WindowSurfacePlugin.storedColor(this);
        if (surface != 0) {
            setTheme(isDark(surface) ? R.style.AppTheme_NoActionBarLaunch_Dark : R.style.AppTheme_NoActionBarLaunch_Light);
        }

        super.onCreate(savedInstanceState);

        // installSplashScreen swaps in postSplashScreenTheme during super.onCreate,
        // so this lands after the handoff and gives the window the exact palette
        // colour rather than the flat light/dark one the themes carry.
        if (surface != 0) {
            getWindow().setBackgroundDrawable(new ColorDrawable(surface));
        }

        // The WebView paints white until the page has a background of its own,
        // which read as a second, blank splash between the launch screen and the
        // hub. Give it the same surface the window is using.
        final int webViewSurface = surface != 0 ? surface : ContextCompat.getColor(this, R.color.app_surface);
        getBridge().getWebView().setBackgroundColor(webViewSurface);

        // Draw the WebView behind the system bars. The bundled SystemBars
        // plugin applies the Android insets to the WebView.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getWindow().setNavigationBarContrastEnforced(false);
        }
    }

    /** Perceived brightness of a surface colour, enough to pick between two themes. */
    private static boolean isDark(int color) {
        return 0.2126 * Color.red(color) + 0.7152 * Color.green(color) + 0.0722 * Color.blue(color) < 128;
    }
}
