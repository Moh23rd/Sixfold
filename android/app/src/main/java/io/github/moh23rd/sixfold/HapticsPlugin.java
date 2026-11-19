package io.github.moh23rd.sixfold;

import android.content.Context;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

/**
 * Vibration the page can actually reach.
 *
 * The WebView does not implement the web Vibration API, so every
 * navigator.vibrate() call in the app was a no-op: the patterns were written,
 * the toggle changed state, and the phone never moved. This plugin hands the
 * same patterns to the platform vibrator instead.
 *
 * The page sends a waveform in navigator.vibrate's own shape — alternating
 * on/off milliseconds — and it is played once. Amplitudes stay at the motor's
 * default: the patterns are already 8–24ms pulses, and asking for a lower
 * amplitude on a phone whose motor cannot do it would only make them vanish.
 */
@CapacitorPlugin(name = "Haptics")
public class HapticsPlugin extends Plugin {

    private Vibrator vibrator() {
        Context context = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager manager =
                (VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            return manager == null ? null : manager.getDefaultVibrator();
        }
        return (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
    }

    @PluginMethod
    public void vibrate(PluginCall call) {
        JSArray pattern = call.getArray("pattern");
        Vibrator motor = vibrator();
        if (motor == null || !motor.hasVibrator()) {
            call.reject("no vibrator");
            return;
        }
        if (pattern == null || pattern.length() == 0) {
            call.reject("pattern is required");
            return;
        }

        // [on, off, on, off] becomes [wait, on, off, on, off]: the platform
        // waveform starts with the delay before the first pulse.
        long[] timings = new long[pattern.length() + 1];
        timings[0] = 0;
        for (int i = 0; i < pattern.length(); i += 1) {
            long slice;
            try {
                slice = Math.max(1, pattern.getLong(i));
            } catch (JSONException err) {
                call.reject("pattern must be numbers");
                return;
            }
            timings[i + 1] = Math.min(slice, 1000);
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                motor.vibrate(VibrationEffect.createWaveform(timings, -1));
            } else {
                motor.vibrate(timings, -1);
            }
        } catch (RuntimeException err) {
            call.reject("vibration failed");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        Vibrator motor = vibrator();
        if (motor != null) motor.cancel();
        call.resolve();
    }
}
