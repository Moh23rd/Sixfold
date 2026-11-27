/* Vibration feedback only — no audio.

   The web Vibration API is a simple on/off motor, so "premium" here means
   restraint: very short pulses, a little space between them, and a stronger
   pattern only when the moment deserves it. Long buzzes read as a phone call;
   the whole set below stays under 150ms. */
(function () {
  'use strict';

  const STORE = 'merge2048.haptics';
  let enabled = true;

  try {
    if (localStorage.getItem(STORE) === 'off') enabled = false;
  } catch (err) {
    /* storage blocked — vibration stays on */
  }

  // Android's WebView has no Vibration API, so the APK rides on a small native
  // plugin; a browser keeps the web call. Either way the patterns below are the
  // ones that reach the motor.
  const bridge = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
  const native = Boolean(bridge && typeof bridge.vibrate === 'function');
  const api = native || typeof navigator.vibrate === 'function';
  // Two pulses closer than this blur into one muddy buzz. Coalescing them also
  // stops a rapid Fruit Merge chain from machine-gunning the motor.
  const MIN_GAP = 32;
  let lastPulse = 0;

  // Timings say when the motor runs; gains say how hard. Android's amplitude
  // scale (0–255) is what makes a tick feel like a system haptic instead of a
  // buzz: the same short pulse at 120 is a tap, at 255 it is an alarm. The
  // patterns below stay under 200ms total and leave room between pulses, so a
  // chain of merges reads as separate touches rather than one long rattle.
  const PATTERN = {
    // 8ms sat under the spin-up time of most phone motors: the call reached the
    // plugin and the phone stayed still. 10ms with a light gain is the shortest
    // pulse that still reads as deliberate.
    tap: [10],
    mergeLow: [14],
    mergeMid: [10, 26, 12],
    mergeHigh: [9, 24, 12, 24, 16],
    win: [10, 34, 13, 36, 16, 40, 24],
    over: [20, 48, 14]
  };
  const GAIN = {
    tap: [120],
    mergeLow: [150],
    mergeMid: [140, 0, 170],
    mergeHigh: [150, 0, 180, 0, 210],
    win: [130, 0, 160, 0, 190, 0, 230],
    over: [180, 0, 120]
  };

  function supported() {
    return api;
  }

  function cancel() {
    if (!api) return;
    try {
      if (native) bridge.cancel();
      else navigator.vibrate(0);
    } catch (err) {
      /* ignore */
    }
  }

  function announce() {
    try {
      window.dispatchEvent(new CustomEvent('sixfold:haptics', { detail: { enabled: enabled } }));
    } catch (err) {
      /* an old WebView without CustomEvent keeps the local switches working */
    }
  }

  function buzz(pattern, gain, force) {
    if (!enabled || !api) return false;
    const now = performance.now();
    if (!force && now - lastPulse < MIN_GAP) return false;
    lastPulse = now;
    try {
      // The web API has no amplitude, so a browser plays the timings alone;
      // the shell takes both and shapes the pulses.
      const result = native ? bridge.vibrate({ pattern: pattern, amplitudes: gain }) : navigator.vibrate(pattern);
      // The bridge answers with a promise; a phone with no motor rejects it,
      // and a rejection here is not worth telling the game about.
      if (result && typeof result.catch === 'function') result.catch(function () {});
      return true;
    } catch (err) {
      /* some browsers only allow this during a gesture */
      return false;
    }
  }

  // The home screen stays silent. Browsing cards and scrolling the hub used to
  // fire a tick on every touch, which read as a rattle rather than feedback;
  // vibration now belongs only to moves made inside a game.

  // Leaving the page does not cancel the motor, deliberately. Cancelling is a
  // bridge call, and Capacitor answers a plugin call through WebView's message
  // listener: a reply that arrives after the document has been replaced is
  // delivered to a native peer the WebView has already released. On Android 13
  // with WebView 109 that is a SIGSEGV in the app process — the CI tombstone
  // for the legal-page return is a posted WebView runnable calling a released
  // JNI peer, and the last bridge traffic before it was this cancel firing from
  // `visibilitychange` and `pagehide` while `licenses.html` was loading. The
  // longest pattern here is under 150ms, so a pulse still running when the page
  // goes away is over before the next screen settles, and the switch below still
  // stops it on the spot when the reader turns haptics off.

  window.MergeHaptics = {
    supported: supported,
    cancel: cancel,

    tap: function () {
      buzz(PATTERN.tap, GAIN.tap);
    },

    merge: function (value) {
      const size = Number(value) || 0;
      if (size >= 256) buzz(PATTERN.mergeHigh, GAIN.mergeHigh);
      else if (size >= 64) buzz(PATTERN.mergeMid, GAIN.mergeMid);
      else buzz(PATTERN.mergeLow, GAIN.mergeLow);
    },

    // An ending lands in the same task as the move that caused it, so it is
    // forced past the coalescing window: the tap must not swallow the win.
    win: function () {
      buzz(PATTERN.win, GAIN.win, true);
    },

    over: function () {
      buzz(PATTERN.over, GAIN.over, true);
    },

    isEnabled: function () {
      return enabled;
    },

    toggle: function () {
      if (enabled) {
        enabled = false;
        try {
          localStorage.setItem(STORE, 'off');
        } catch (err) {
          /* ignore */
        }
        cancel();
        announce();
        return false;
      }

      enabled = true;
      try {
        localStorage.setItem(STORE, 'on');
      } catch (err) {
        /* ignore */
      }
      // A crisp confirmation on the switch itself, even if the last pulse was
      // a moment ago.
      buzz(PATTERN.tap, GAIN.tap, true);
      announce();
      return true;
    }
  };
})();
