package io.github.moh23rd.sixfold;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    private static final String EXTRA_ACTION = "sixfold.action";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GallerySavePlugin.class);
        registerPlugin(WindowSurfacePlugin.class);
        registerPlugin(HapticsPlugin.class);
        registerPlugin(LaunchActionPlugin.class);

        // A shortcut can start the activity before the page exists. Keep the
        // action until the page asks for it; a normal launcher start leaves it
        // null.
        captureAction(getIntent());

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
        final Bridge bridge = getBridge();
        final WebView webView = bridge.getWebView();
        webView.setBackgroundColor(webViewSurface);

        // Android's font-size setting is otherwise invisible to a WebView: it
        // renders CSS pixels at a fixed scale, so a reader who raised the system
        // size still got the same small copy. Follow it, capped where the
        // layouts still hold together; the page's own type scale remains the
        // floor for a reader who has not changed the setting.
        final WebSettings settings = webView.getSettings();
        final float fontScale = getResources().getConfiguration().fontScale;
        settings.setTextZoom(Math.round(Math.min(Math.max(fontScale, 0.85f), 1.3f) * 100));

        // Links to GitHub belong in the browser, not in a chromeless WebView
        // with no address bar. The shell's own pages all come from localhost,
        // so anything else is handed to the system and the page stays put.
        webView.setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                final Uri url = request.getUrl();
                final String scheme = url.getScheme();
                final String host = url.getHost();
                if (("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme))
                    && !"localhost".equalsIgnoreCase(host)
                    && !"127.0.0.1".equals(host)) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, url));
                    } catch (ActivityNotFoundException ignored) {
                        // No browser installed: leave the app where it is.
                    }
                    return true;
                }
                return super.shouldOverrideUrlLoading(view, request);
            }
        });

        // Draw the WebView behind the system bars. The bundled SystemBars
        // plugin applies the Android insets to the WebView.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getWindow().setNavigationBarContrastEnforced(false);
        }
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        captureAction(intent);
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().evaluateJavascript(
                "window.SixfoldLaunchAction && window.SixfoldLaunchAction()", null);
        }
    }

    private static void captureAction(Intent intent) {
        if (intent == null) return;
        String action = intent.getStringExtra(EXTRA_ACTION);
        if (action != null && !action.isEmpty()) LaunchActionPlugin.pending = action;
    }

    /** Perceived brightness of a surface colour, enough to pick between two themes. */
    private static boolean isDark(int color) {
        return 0.2126 * Color.red(color) + 0.7152 * Color.green(color) + 0.0722 * Color.blue(color) < 128;
    }
}
