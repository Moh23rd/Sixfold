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

  const PATTERN = {
    // 8ms sat under the spin-up time of most phone motors: the call reached the
    // plugin and the phone stayed still. 18ms is the shortest tap that reads as
    // a deliberate tick, so a move actually says something.
    tap: [18],
    mergeLow: [20],
    mergeMid: [11, 16, 9],
    mergeHigh: [12, 18, 10, 18, 12],
    win: [11, 30, 12, 30, 14, 30, 22],
    over: [24, 46, 15]
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

  function buzz(pattern, force) {
    if (!enabled || !api) return false;
    const now = performance.now();
    if (!force && now - lastPulse < MIN_GAP) return false;
    lastPulse = now;
    try {
      const result = native ? bridge.vibrate({ pattern: pattern }) : navigator.vibrate(pattern);
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
      buzz(PATTERN.tap);
    },

    merge: function (value) {
      const size = Number(value) || 0;
      if (size >= 256) buzz(PATTERN.mergeHigh);
      else if (size >= 64) buzz(PATTERN.mergeMid);
      else buzz(PATTERN.mergeLow);
    },

    // An ending lands in the same task as the move that caused it, so it is
    // forced past the coalescing window: the tap must not swallow the win.
    win: function () {
      buzz(PATTERN.win, true);
    },

    over: function () {
      buzz(PATTERN.over, true);
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
      buzz(PATTERN.tap, true);
      announce();
      return true;
    }
  };
})();
