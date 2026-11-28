package io.github.moh23rd.sixfold;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Runs the real Activity and WebView, not a browser stub. MainActivity sets
 * __sixfoldPainted and __sixfoldPaintAt only inside
 * WebView.VisualStateCallback.onComplete; native.js records the hand-off after
 * seeing that callback's values. A browser test cannot prove this path because
 * it would have to inject the flag itself.
 */
@RunWith(AndroidJUnit4.class)
public class LaunchPaintSignalTest {

    private static final long DEADLINE_MS = 30000;

    @Test
    public void visualStateCallbackReachesThePageBeforeSplashHide() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            final CountDownLatch done = new CountDownLatch(1);
            final AtomicReference<String> result = new AtomicReference<>("the WebView did not answer");

            scenario.onActivity(activity -> {
                final WebView webView = activity.getBridge() == null
                    ? null
                    : activity.getBridge().getWebView();
                poll(webView, System.currentTimeMillis() + DEADLINE_MS, done, result);
            });

            assertTrue(
                "the native paint hand-off did not complete: " + result.get(),
                done.await(DEADLINE_MS + 5000, TimeUnit.MILLISECONDS)
            );
            assertEquals(
                "the Android visual-state callback did not reach the page",
                "true",
                result.get()
            );
        }
    }

    private static void poll(
        WebView view,
        long deadline,
        CountDownLatch done,
        AtomicReference<String> result
    ) {
        if (view == null) {
            result.set("the bridge has no WebView");
            done.countDown();
            return;
        }
        view.evaluateJavascript(
            "JSON.stringify({ painted: Boolean(window.__sixfoldPainted)," +
                " requestedAt: window.__sixfoldPaintRequestedAt," +
                " paintAt: window.__sixfoldPaintAt, hiddenAt: window.__sixfoldSplashHiddenAt," +
                " bootAtHide: window.__sixfoldBootAtHide === true })",
            value -> {
                boolean ready = false;
                String clean = value == null ? "{}" : value;
                if (clean.startsWith("\"") && clean.endsWith("\"")) {
                    clean = clean.substring(1, clean.length() - 1).replace("\\\"", "\"");
                }
                try {
                    final JSONObject state = new JSONObject(clean);
                    final double requestedAt = state.optDouble("requestedAt", Double.NaN);
                    final double paintAt = state.optDouble("paintAt", Double.NaN);
                    final double hiddenAt = state.optDouble("hiddenAt", Double.NaN);
                    ready = state.optBoolean("painted")
                        && state.optBoolean("bootAtHide")
                        && Double.isFinite(requestedAt)
                        && Double.isFinite(paintAt)
                        && Double.isFinite(hiddenAt)
                        && paintAt >= requestedAt
                        && paintAt <= hiddenAt;
                } catch (Exception ignored) {}
                if (ready) {
                    result.set("true");
                    done.countDown();
                } else if (System.currentTimeMillis() > deadline) {
                    result.set("timed out waiting for the visual-state callback: " + value);
                    done.countDown();
                } else {
                    view.postDelayed(
                        () -> poll(view, deadline, done, result),
                        100
                    );
                }
            }
        );
    }
}