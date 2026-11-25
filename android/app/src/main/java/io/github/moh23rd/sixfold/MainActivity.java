package io.github.moh23rd.sixfold;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    private static final String EXTRA_ACTION = "sixfold.action";
    private static final float TEXT_ZOOM_MIN = 0.85f;
    // How far the page follows the system text size. 1.3 is Android's largest
    // preset and the point the fixed chrome still holds: at 1.5 a 32.6px sudoku
    // digit no longer fits its 29px cell, and the board's title collides with
    // the clock. The page stops following the setting here instead of breaking
    // the board at the accessibility sizes above it.
    private static final float TEXT_ZOOM_MAX = 1.3f;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GallerySavePlugin.class);
        registerPlugin(WindowSurfacePlugin.class);
        registerPlugin(HapticsPlugin.class);
        registerPlugin(LaunchActionPlugin.class);

        // A shortcut can start the activity before the page exists. Keep the
        // action until the page asks for it; a normal launcher start leaves it
        // null. A recreated activity is handed the original intent again — the
        // shortcut extra is still in it — so only a fresh launch may read it,
        // or changing the system font size would replay the shortcut.
        if (savedInstanceState == null) captureAction(getIntent());

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
        getWindow().getDecorView().setBackgroundColor(webViewSurface);

        // The activity content is padded for the system bars, so its padding is
        // the strip visible around the page. Give that view the same surface as
        // the page; without it the strip falls back to a flat platform colour
        // (black on this API) instead of matching the app.
        final View content = findViewById(android.R.id.content);
        if (content != null) content.setBackgroundColor(webViewSurface);

        // Android's font-size setting is otherwise invisible to a WebView: it
        // renders CSS pixels at a fixed scale, so a reader who raised the system
        // size still got the same small copy. Follow it, capped where the
        // layouts still hold together; the page's own type scale remains the
        // floor for a reader who has not changed the setting.
        webView.getSettings().setTextZoom(textZoom(getResources().getConfiguration().fontScale));

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

        // Draw the WebView behind the system bars. installStableInsets below
        // pads the activity content for them (SystemBars' handling is off).
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getWindow().setNavigationBarContrastEnforced(false);
        }

        installStableInsets();
    }

    /* The app pads the activity content itself; SystemBars' inset handling is
       disabled in capacitor.config.json. Padding the DecorView, as that plugin
       does, is not stable on API 36's edge-to-edge window: the framework
       clears the DecorView's padding between inset passes, so the page height
       flipped between padded and unpadded every few frames. The whole page
       jumped, and an IME keeps dispatching insets, which turned the jump into
       a flash. The content view keeps the padding it is given, and consuming
       the insets stops anything below it from adding a second copy. The IME
       inset is the keyboard's height, so the page shrinks to the visible area
       and the focused field stays above the keyboard. */
    private void installStableInsets() {
        final View content = findViewById(android.R.id.content);
        if (content == null) return;
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, insets) -> {
            final Insets bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            final Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            final boolean keyboard = insets.isVisible(WindowInsetsCompat.Type.ime());
            view.setPadding(
                bars.left,
                bars.top,
                bars.right,
                keyboard ? Math.max(bars.bottom, ime.bottom) : bars.bottom
            );
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(content);
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        // The activity is kept across a system font-size change, so the page
        // does not reload back to the hub mid-game; apply the new scale here,
        // because onCreate ran with the previous one.
        final Bridge bridge = getBridge();
        if (bridge != null && bridge.getWebView() != null) {
            final WebSettings settings = bridge.getWebView().getSettings();
            settings.setTextZoom(textZoom(newConfig.fontScale));
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

    /** Android's font-size setting, within the range the layouts can hold. */
    private static int textZoom(float fontScale) {
        return Math.round(Math.min(Math.max(fontScale, TEXT_ZOOM_MIN), TEXT_ZOOM_MAX) * 100);
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
