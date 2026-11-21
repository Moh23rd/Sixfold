/* Native shell glue. On the web this file does nothing; inside the Capacitor
   wrapper it hides the native launch screen and keeps Android's back gesture
   in step with Sixfold's own navigation. */
(function () {
  'use strict';

  var cap = window.Capacitor;
  if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return;

  document.documentElement.classList.add('is-native');
  var plugins = cap.Plugins || {};

  function ignoreRejection(value) {
    if (value && typeof value.catch === 'function') value.catch(function () {});
  }

  // The page's own launch layer waits for this before it fades into the hub,
  // so nothing of the hub builds while a splash still covers it.
  var splashGone = false;
  function splashHandoff() {
    if (splashGone) return;
    splashGone = true;
    try { window.dispatchEvent(new Event('merge:splash-hidden')); } catch (err) {}
  }

  // Dismiss the launch splash on the first frame the page actually paints. The
  // launch theme's own auto-hide in capacitor.config.json is the safety net for
  // a page that never gets here, not the normal path.
  function hideSplash() {
    var splash = plugins.SplashScreen;
    if (!splash || !splash.hide) { splashHandoff(); return; }
    function hide() {
      try { ignoreRejection(splash.hide()); } catch (err) {}
      // The plugin resolves the moment it starts the platform's exit, and there
      // is no callback for the exit finishing, so the hand-off starts here.
      splashHandoff();
    }
    if (window.requestAnimationFrame) {
      requestAnimationFrame(function () { requestAnimationFrame(hide); });
    } else {
      hide();
    }
  }

  function styleStatusBar(dark) {
    var bar = plugins.StatusBar;
    if (!bar || !bar.setStyle) return;
    try { ignoreRejection(bar.setStyle({ style: dark ? 'DARK' : 'LIGHT' })); } catch (err) {}
  }

  // Styling the bars has a side effect on Android: SystemBars sets the window
  // (decor) background to the theme's windowBackground while it changes the bar
  // icons. That is the same surface the page's colour is painted on, so the
  // colour reported a moment earlier is replaced by the launch colour and the
  // strip around the page stays stale until the next report or a restart. Ask
  // for the page's colour again on the microtask after the bar call is posted —
  // native reports run in order, so this one is the last write.
  function resurface() {
    var theme = window.MergeTheme;
    if (theme && theme.repaintSurface) theme.repaintSurface();
  }

  // The bar icons only care about light and dark, so a palette change has
  // nothing to restyle. Skipping the call also skips its window-background
  // side effect, which would otherwise flash the launch colour over the new
  // palette on every swatch tap while the report was re-sent.
  var appliedBarStyle = null;

  function syncBars() {
    var dark = window.MergeTheme && window.MergeTheme.isDark
      ? window.MergeTheme.isDark()
      : document.documentElement.dataset.theme === 'dark';
    var style = dark ? 'DARK' : 'LIGHT';
    if (appliedBarStyle === style) return;

    // SystemBars styles the status and navigation bars together. Fall back to
    // the legacy StatusBar plugin if an older native shell lacks SystemBars.
    var systemBars = plugins.SystemBars;
    if (systemBars && systemBars.setStyle) {
      try {
        var result = systemBars.setStyle({ style: style });
        // SystemBars repaints the decor background from the theme's
        // windowBackground as part of this call. Report the page colour again
        // on the microtask after the plugin proxy posts the bar call, so the
        // repair is queued behind it but still ahead of the next frame:
        // reporting inline could overtake the bar call, and a timer waits
        // behind a rendered frame on a slow device, showing the launch colour.
        Promise.resolve().then(resurface);
        if (result && typeof result.then === 'function') {
          result.then(function () {
            appliedBarStyle = style;
          }, function () {
            styleStatusBar(dark);
            resurface();
          });
        } else {
          appliedBarStyle = style;
        }
        return;
      } catch (err) {}
    }
    styleStatusBar(dark);
    resurface();
  }

  function back() {
    if (location.hash && location.hash !== '#hub') {
      if (window.history.length > 1) history.back();
      else location.hash = '#hub';
      return;
    }
    var app = plugins.App;
    if (app && app.minimizeApp) {
      try { ignoreRejection(app.minimizeApp()); } catch (err) {}
    }
  }

  function wireBack() {
    var app = plugins.App;
    if (!app || !app.addListener) return;
    try { ignoreRejection(app.addListener('backButton', back)); } catch (err) {}
  }

  window.addEventListener('load', function () {
    hideSplash();
    syncBars();
  });
  window.addEventListener('merge:appearance', syncBars);
  wireBack();
})();
