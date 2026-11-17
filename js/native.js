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

  // Dismiss the launch splash on the first frame the page actually paints. The
  // launch theme's own auto-hide in capacitor.config.json is the safety net for
  // a page that never gets here, not the normal path.
  function hideSplash() {
    var splash = plugins.SplashScreen;
    if (!splash || !splash.hide) return;
    function hide() {
      try { ignoreRejection(splash.hide()); } catch (err) {}
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

  function syncBars() {
    var dark = window.MergeTheme && window.MergeTheme.isDark
      ? window.MergeTheme.isDark()
      : document.documentElement.dataset.theme === 'dark';

    // SystemBars styles the status and navigation bars together. Fall back to
    // the legacy StatusBar plugin if an older native shell lacks SystemBars.
    var systemBars = plugins.SystemBars;
    if (systemBars && systemBars.setStyle) {
      try {
        var result = systemBars.setStyle({ style: dark ? 'DARK' : 'LIGHT' });
        if (result && typeof result.catch === 'function') {
          result.catch(function () { styleStatusBar(dark); });
        }
        return;
      } catch (err) {}
    }
    styleStatusBar(dark);
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
