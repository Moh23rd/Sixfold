package io.github.moh23rd.sixfold;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;

import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GallerySavePlugin.class);
        registerPlugin(ShellPlugin.class);
        super.onCreate(savedInstanceState);

        // Draw the WebView behind the system bars. The bundled SystemBars
        // plugin applies the Android insets to the WebView.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getWindow().setNavigationBarContrastEnforced(false);
        }

        // An opaque surface in the page's colour, so a window animation never
        // shows the launcher through the app. The page reports the exact colour
        // (palette included) as soon as it starts; this covers the first frame.
        ShellPlugin.apply(this, ShellPlugin.stored(this, ContextCompat.getColor(this, R.color.app_surface)));
    }
}
