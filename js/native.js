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

  // Hold the OS splash until the page has finished its own hand-off. Hiding it
  // on `load` uncovered the page's flat native boot surface for however long
  // the WebView took to paint, which read as a blank flash between the launch
  // screen and the hub. The page now paints underneath the splash and
  // js/index marks home-ready when the hub (or the first-run guide) is ready.
  function hideSplash() {
    var splash = plugins.SplashScreen;
    if (!splash || !splash.hide) { splashHandoff(); return; }
    var hidden = false;
    var firstRun = typeof window.__sixfoldFirstRun === 'boolean'
      ? window.__sixfoldFirstRun
      : true;
    if (typeof window.__sixfoldFirstRun !== 'boolean') {
      try { firstRun = localStorage.getItem('sixfold.welcome.v1') !== '1'; } catch (err) {}
    }
    function hide() {
      if (hidden) return;
      hidden = true;
      window.__sixfoldSplashHiddenAt = performance.now();
      window.__sixfoldBootAtHide = Boolean(document.getElementById('boot-splash'));
      try {
        // Let the launch picture dissolve while the first hub frames reach the
        // compositor; an instant cut can expose a bare surface on a cold start.
        ignoreRejection(splash.hide({ fadeOutDuration: 450 }));
      } catch (err) {}
      // The plugin resolves the moment it starts the platform's exit, and there
      // is no callback for the exit finishing, so the hand-off starts here.
      splashHandoff();
    }
    function waitForPaint(deadline) {
      if (hidden) return;
      requestPaint();
      if (window.__sixfoldPainted || Date.now() > deadline) {
        hide();
        return;
      }
      window.setTimeout(function () { waitForPaint(deadline); }, 80);
    }
    var paintAsked = false;
    function requestPaint() {
      if (paintAsked) return;
      paintAsked = true;
      window.__sixfoldPaintRequestedAt = performance.now();
      var paint = plugins.LaunchPaint;
      if (!paint || !paint.request) return;
      try { ignoreRejection(paint.request()); } catch (err) {}
    }
    function waitForWelcome(deadline) {
      if (hidden) return;
      var welcome = document.getElementById('welcome');
      if (welcome && !welcome.hidden) {
        // The guide paints over the hub. Keep the OS splash up until the
        // native WebView has committed a visual state, then uncover the guide.
        if (window.requestAnimationFrame) {
          requestAnimationFrame(function () {
            requestAnimationFrame(function () { waitForPaint(Date.now() + 6000); });
          });
        } else {
          waitForPaint(Date.now() + 6000);
        }
        return;
      }
      if (Date.now() > deadline) { waitForPaint(Date.now() + 1400); return; }
      window.setTimeout(function () { waitForWelcome(deadline); }, 60);
    }

    function afterHomeReady() {
      if (document.documentElement.classList.contains('home-ready')) {
        // A returning reader has no guide to wait for. A first launch does:
        // keep the branded launch screen up until that sheet is on screen.
        if (firstRun) waitForWelcome(Date.now() + 9000);
        else waitForPaint(Date.now() + 6000);
        return;
      }
      if ('MutationObserver' in window) {
        var ready = new MutationObserver(function () {
          if (!document.documentElement.classList.contains('home-ready')) return;
          ready.disconnect();
          afterHomeReady();
        });
        ready.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      }
      window.setTimeout(function () {
        if ('MutationObserver' in window) {
          try { ready.disconnect(); } catch (err) {}
        }
        hide();
      }, 12000);
      if (!('MutationObserver' in window)) window.setTimeout(hide, 700);
    }

    afterHomeReady();
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

  // Android rewrites the window background from the theme's day/night resource
  // on every configuration change — a rotation, a window resize, or the system
  // switching to dark. That resource is the launch colour, not the page's, and
  // no appearance event fires with the change, so the strip around the page kept
  // the colour the app opened in. Report the page colour again once the config
  // pass has settled, and once more after it: the plugin's own restyle can land
  // late on a slow device, and the report has to be the last write.
  var surfaceRepairTimer = 0;
  var surfaceSettleTimer = 0;

  function repairSurfaceSoon() {
    window.clearTimeout(surfaceRepairTimer);
    window.clearTimeout(surfaceSettleTimer);
    surfaceRepairTimer = window.setTimeout(resurface, 120);
    surfaceSettleTimer = window.setTimeout(resurface, 600);
  }

  window.addEventListener('resize', repairSurfaceSoon);
  window.addEventListener('orientationchange', repairSurfaceSoon);

  // Coming back from the background can deliver a configuration change that
  // arrived while the page was hidden; nothing else would report it then.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) repairSurfaceSoon();
  });

  // theme.js only follows the system scheme while the app is set to Auto, but
  // Android restyles the window on the change either way, so the shell repairs
  // the strip even when the page's own appearance does not move.
  var scheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
  if (scheme) {
    if (scheme.addEventListener) scheme.addEventListener('change', repairSurfaceSoon);
    else if (scheme.addListener) scheme.addListener(repairSurfaceSoon);
  }

  // A sheet or a dialog sits on top of the screen it was opened from, and back
  // means "close that" long before it means "leave". The page marks the event
  // handled when it dismisses its own layer, so the shell never has to know
  // which panel is up.
  function pageHandledBack() {
    if (typeof window.CustomEvent !== 'function') return false;
    var event;
    try {
      event = new CustomEvent('sixfold:back', { cancelable: true });
    } catch (err) {
      return false;
    }
    document.dispatchEvent(event);
    return event.defaultPrevented;
  }

  // Leaving the legal page reloads the app document, because a WebView keeps no
  // back-forward cache. The flag tells the page that this load is a return, not
  // a launch, so it skips its launch layer and the cover's build instead of
  // replaying the splash on the way back to the hub.
  function markReturning() {
    try { sessionStorage.setItem('sixfold.returning', '1'); } catch (err) {}
  }

  function back() {
    if (pageHandledBack()) return;
    // The legal page is a document of its own, so back returns to the hub
    // through history instead of leaving the app from a page the reader only
    // opened to read.
    if (document.documentElement.hasAttribute('data-page')) {
      markReturning();
      if (window.history.length > 1) history.back();
      else location.replace('./');
      return;
    }
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

  // The legal page's own "Back to Sixfold" link leaves by navigation, not by the
  // gesture, so it has to mark the return as well or that path still replays the
  // launch.
  function wireLegalLink() {
    if (!document.documentElement.hasAttribute('data-page')) return;
    document.addEventListener('click', function (event) {
      var link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
      if (!link) return;
      var href = link.getAttribute('href');
      if (href === './' || href === 'index.html' || href === '/index.html') markReturning();
    });
  }

  // Long-press shortcuts start the activity with an action instead of a URL.
  // The page asks for it once, after its own routing has run, and the native
  // side clears it so returning from Recents does not replay the shortcut.
  function routeLaunch(action) {
    if (!action) return;
    if (action === 'gauntlet') {
      var start = document.getElementById('daily-gauntlet-action');
      if (start) start.click();
      return;
    }
    // The first [data-game] match can be a daily-week dot or a profile chip;
    // the hub's actual cover is the .home-game button, which is the one with
    // the click handler that opens the game.
    var card = document.querySelector('.home-game[data-game="' + action + '"]');
    if (card) card.click();
  }

  var pageReady = false;

  function consumeLaunchAction() {
    // A cold start can deliver the action before DOMContentLoaded; consuming
    // then would click a hub card that initRoute is about to replace with the
    // hub. Wait for load, when the page's own routing has already run.
    if (!pageReady) return;
    var launch = plugins.LaunchAction;
    if (!launch || !launch.consume) return;
    var pending;
    try { pending = launch.consume(); } catch (err) { return; }
    if (!pending || typeof pending.then !== 'function') return;
    pending.then(function (result) {
      // Wait for the page's first frame before driving its own controls: the
      // shortcut can arrive while the hub is still building its cards.
      window.setTimeout(function () { routeLaunch(result && result.action); }, 0);
    }).catch(function () {});
  }

  window.SixfoldLaunchAction = consumeLaunchAction;

  window.addEventListener('load', function () {
    pageReady = true;
    hideSplash();
    syncBars();
    consumeLaunchAction();
  });
  window.addEventListener('merge:appearance', syncBars);
  wireBack();
  wireLegalLink();
})();
