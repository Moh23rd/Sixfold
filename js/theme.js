/* Theme (auto / light / dark), colour palettes and browser chrome. */
(function () {
  'use strict';

  const THEME_KEY = 'merge2048.theme';
  const PALETTE_KEY = 'merge2048.palette';

  // The hand-tuned "Warm" ramp, one colour per tile for 2 … 2048.
  const WARM = [
    '#f3ecdf', '#f0e3c8', '#efb07a', '#ee9563', '#ec7c55', '#e85f3b',
    '#e7c364', '#e3b94a', '#dcab30', '#cf9822', '#b9801a'
  ];

  // The seven accent colours the collection games use for tubes, fruit, marks
  // and mine numbers. They follow the selected palette just like the tiles.
  const GAME_ACCENTS = [
    '#e85f3b', '#e3a92f', '#8bbd54', '#39a9a1', '#5b8fd5', '#9a6bb5', '#d96b8a'
  ];

  // Other palettes are the warm colours hue-shifted (or, for Mono, desaturated),
  // so they keep the same brightness curve and stay equally readable.
  const PALETTES = [
    { id: 'warm', label: 'Warm' },
    { id: 'ocean', label: 'Ocean', shift: 196 },
    { id: 'forest', label: 'Forest', shift: 104 },
    { id: 'berry', label: 'Berry', shift: 296 },
    { id: 'dusk', label: 'Dusk', shift: 252 },
    { id: 'mono', label: 'Mono', mono: true }
  ];

  // Page chrome colours that pick up the palette, page background included.
  const PAGE_VARS = ['--page', '--panel', '--sheet-bg', '--overlay'];

  const root = document.documentElement;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const state = { theme: 'auto', palette: 'warm' };

  try {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'auto') state.theme = savedTheme;
    const savedPalette = localStorage.getItem(PALETTE_KEY);
    if (PALETTES.some(function (p) { return p.id === savedPalette; })) state.palette = savedPalette;
  } catch (err) {
    /* storage blocked — defaults are fine */
  }

  /* ---------- appearance cross-fade ---------- */

  // A theme or palette switch repaints every surface at once. The class below
  // is what turns on the colour transitions at the end of v5.css: they are
  // raised for the length of one switch and taken away again, so the app pays
  // nothing for them while it is being played.
  const calmMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const FADE_MS = 220;
  let fadeTimer = 0;

  function endCrossFade() {
    window.clearTimeout(fadeTimer);
    fadeTimer = 0;
    root.classList.remove('is-theme-fading');
  }

  function isNativeShell() {
    return Boolean(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  function crossFade() {
    // A phone that asked for calm motion, or one the launch script already put
    // on the light paint path, keeps the instant switch it had.
    if (calmMotion && calmMotion.matches) return;
    if (window.MergePerf && window.MergePerf.lite) return;
    // The shell fades too: its WebView composites each faded surface
    // separately, which used to leave a page on an in-between colour until
    // something forced a repaint. repaintNativePage() promotes those surfaces
    // for the length of the switch, so the layer carries the new colours.
    root.classList.add('is-theme-fading');
    window.clearTimeout(fadeTimer);
    fadeTimer = window.setTimeout(endCrossFade, FADE_MS + 60);
  }

  // The launch call lands under the splash, where a fade would only add work
  // to the first paint. Every later switch — a swatch, a theme button or the
  // phone turning to dark at sunset — is a real change and gets the fade.
  function switchIsVisible(persist) {
    return Boolean(persist) || root.classList.contains('home-ready');
  }

  /* ---------- colour helpers ---------- */

  function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }

  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let rgb;
    if (h < 60) rgb = [c, x, 0];
    else if (h < 120) rgb = [x, c, 0];
    else if (h < 180) rgb = [0, c, x];
    else if (h < 240) rgb = [0, x, c];
    else if (h < 300) rgb = [x, 0, c];
    else rgb = [c, 0, x];
    return '#' + rgb.map(function (v) {
      const n = Math.max(0, Math.min(255, Math.round((v + m) * 255)));
      return (n < 16 ? '0' : '') + n.toString(16);
    }).join('');
  }

  function activePalette() {
    return PALETTES.filter(function (p) { return p.id === state.palette; })[0] || PALETTES[0];
  }

  // Recolours #rrggbb or #rrggbbaa for the given palette, keeping alpha.
  function recolor(hex, palette) {
    const value = String(hex).trim();
    const match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value);
    if (!match) return hex;
    if (!palette.mono && !palette.shift) return value;

    const alpha = match[2] ? match[2].toLowerCase() : '';
    const n = parseInt(match[1], 16);
    const hsl = rgbToHsl((n >> 16) & 255, (n >> 8) & 255, n & 255);
    if (palette.mono) return hslToHex(hsl[0], 0.04, hsl[2]) + alpha;
    return hslToHex(hsl[0] + palette.shift, hsl[1], hsl[2]) + alpha;
  }

  /* ---------- page tint ---------- */

  function tintPage() {
    PAGE_VARS.forEach(function (name) {
      root.style.removeProperty(name);
    });
    const palette = activePalette();
    if (!palette.mono && !palette.shift) return;

    const computed = getComputedStyle(root);
    const bases = PAGE_VARS.map(function (name) {
      return [name, computed.getPropertyValue(name).trim()];
    });
    bases.forEach(function (pair) {
      if (!/^#[0-9a-f]{6,8}$/i.test(pair[1])) return;
      root.style.setProperty(pair[0], recolor(pair[1], palette));
    });
  }

  /* ---------- browser chrome ---------- */

  // The two flat page colours, used only if --page has not resolved yet.
  const PAGE_BASE = { light: '#f6f1e8', dark: '#1a1918' };

  // The window surface takes a six- or eight-digit hex; a custom property is
  // kept exactly as written, so a #fff in the cascade has to be expanded first.
  function pageHex(value) {
    const match = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(String(value || '').trim());
    if (!match) return null;
    const raw = match[1].toLowerCase();
    if (raw.length === 3) return '#' + raw[0] + raw[0] + raw[1] + raw[1] + raw[2] + raw[2];
    return '#' + raw;
  }

  // The page colour for the theme, palette and contrast in use. Reading --page
  // back from the cascade, rather than recolouring a second copy of the bases,
  // keeps the bar, the manifest and the window surface on the colour the page
  // actually paints: high contrast replaces --page with pure white or black, and
  // a palette tints whatever value resolved. It is a style read, not a layout
  // read, so a swatch still repaints the bar in the same task.
  function chromeColour() {
    return pageHex(getComputedStyle(root).getPropertyValue('--page'))
      || recolor(root.dataset.theme === 'dark' ? PAGE_BASE.dark : PAGE_BASE.light, activePalette());
  }

  // The window surface behind the WebView is only seen at the edges while a
  // system animation runs, so it has to follow the page and not the phone's
  // day/night setting. One report per distinct colour: the appearance paths
  // already repaint through refreshPage, so without this memo the same colour
  // would cross the bridge twice. A browser ignores this entirely.
  let reportedSurface = null;

  function paintWindowSurface(bg) {
    if (bg === reportedSurface) return;
    const native = window.Capacitor && window.Capacitor.Plugins;
    const plugin = native && native.WindowSurface;
    if (!plugin || typeof plugin.setColor !== 'function') return;
    reportedSurface = bg;
    try {
      const pending = plugin.setColor({ color: bg });
      // A report that never landed left the surface on the old colour. Forget
      // it, so the next appearance change tries again instead of treating the
      // colour as already painted for the rest of the session.
      if (pending && pending.catch) {
        pending.catch(function () {
          if (reportedSurface === bg) reportedSurface = null;
        });
      }
    } catch (err) {
      /* an older APK without the plugin keeps the static launch colour */
      reportedSurface = null;
    }
  }

  // The phone's status bar / address bar follows the page, palette included.
  function paintBrowserChrome() {
    const bg = chromeColour();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && meta.getAttribute('content') !== bg) meta.setAttribute('content', bg);
    // Scrollbars, form controls and the phone's own surfaces follow this too.
    const scheme = document.querySelector('meta[name="color-scheme"]');
    if (scheme) scheme.setAttribute('content', root.dataset.theme === 'dark' ? 'dark' : 'light');
    paintWindowSurface(bg);
  }

  // The installed app's bottom strip comes from the manifest, not theme-color.
  // Keep the theme cookie for a future install, and point the link at the
  // matching light/dark file so a fresh install captures the right colour.
  function syncManifest() {
    const theme = root.dataset.theme === 'dark' ? 'dark' : 'light';
    try {
      const age = '; path=/; max-age=31536000; SameSite=Lax';
      document.cookie = 'merge2048_theme=' + theme + age;
    } catch (err) {
      /* cookies blocked — the manifest falls back to the phone's theme */
    }

    let link = document.getElementById('manifest-link');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      link.id = 'manifest-link';
      document.head.appendChild(link);
    }
    // Follow the build epoch the page was served with. A second copy of the
    // number here went stale for two builds and pointed the switch at the
    // previous build's manifest; the page's own link is the single source.
    const current = link.getAttribute('href') || '';
    const query = current.indexOf('?') === -1 ? '' : current.slice(current.indexOf('?'));
    const href = (theme === 'dark' ? 'manifest-dark.webmanifest' : 'manifest.webmanifest') + query;
    if (link.getAttribute('href') !== href) link.setAttribute('href', href);
  }

  // Pointing the manifest at the light or dark file makes the browser fetch and
  // parse it again. That is worth doing — a fresh install should capture the
  // bottom chrome this page is using — but it is not worth doing inside the
  // frame the appearance switch is animating in, so it waits for idle.
  let manifestTimer = 0;
  function syncManifestLater() {
    window.clearTimeout(manifestTimer);
    const run = function () {
      manifestTimer = 0;
      syncManifest();
    };
    if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 1200 });
    else manifestTimer = window.setTimeout(run, 120);
  }

  // Android's WebView presents an appearance switch one frame behind on its
  // composited scrollers (the hub, a game screen, the sheet card): the controls
  // take the new colours, but the large page surface keeps the colours of the
  // previous switch until some later frame forces it out. Promoting the page
  // briefly creates the layer that carries the new colours, and dropping the
  // promotion puts it back on the normal path. It only runs in the shell; a
  // browser commits the switch on its own. will-change: opacity is the
  // promotion that does not turn the page into a containing block, so a fixed
  // banner or dialog keeps its place while it is held.
  let repaintToken = 0;

  function repaintNativePage() {
    if (!isNativeShell()) return;
    // The surfaces that own a full-page colour, not <html>: the fixed hub and
    // play screens and the sheet card are their own composited layers, so
    // promoting the root leaves their stale raster in place.
    const surfaces = document.querySelectorAll('.hub, .play-screen, .sheet-card, .app');
    if (!surfaces.length) return;
    const token = ++repaintToken;
    surfaces.forEach(function (el) { el.style.willChange = 'opacity'; });
    // Hold the layer long enough to cover a sheet that starts leaving in the
    // same task (its 320ms exit owns that window). Dropping the promotion in
    // the middle of that transition can leave the card on screen.
    window.setTimeout(function () {
      if (token !== repaintToken) return;
      surfaces.forEach(function (el) { el.style.willChange = ''; });
    }, 420);
  }

  function refreshPage() {
    tintPage();
    paintBrowserChrome();
    syncManifestLater();
    repaintNativePage();
  }

  // High contrast replaces --page with pure white or black, and it can be
  // switched while a palette has already tinted the page inline. The settings
  // module only writes the attribute, so this is the pass that resolves the new
  // page colour and takes the bar and the window surface with it.
  window.addEventListener('sixfold:settings', refreshPage);

  // The result image is drawn from the page colours, so tell the game when they
  // change and an open result card can redraw it with the new appearance.
  function announceAppearance() {
    try {
      window.dispatchEvent(new CustomEvent('merge:appearance'));
    } catch (err) {
      /* an old browser: the preview keeps the colours it opened with */
    }
  }

  /* ---------- theme ---------- */

  function resolvedTheme() {
    return state.theme === 'auto' ? (mq.matches ? 'dark' : 'light') : state.theme;
  }

  function syncThemeButtons() {
    document.querySelectorAll('[data-theme-opt]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.dataset.themeOpt === state.theme ? 'true' : 'false');
    });
    // The header button is a plain light/dark switch, independent of the Auto setting.
    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
      const isDark = root.dataset.theme === 'dark';
      toggle.setAttribute('aria-pressed', isDark ? 'true' : 'false');
      const label = isDark ? 'Switch to light theme' : 'Switch to dark theme';
      toggle.setAttribute('aria-label', label);
      toggle.title = label;
    }
  }

  function applyTheme(pref, persist) {
    state.theme = pref;
    if (switchIsVisible(persist)) crossFade();
    root.dataset.theme = resolvedTheme();
    if (persist) {
      try { localStorage.setItem(THEME_KEY, pref); } catch (err) {}
    }
    syncThemeButtons();
    refreshPage();
    announceAppearance();
  }

  /* ---------- palettes ---------- */

  function syncPaletteButtons() {
    document.querySelectorAll('[data-palette-opt]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.dataset.paletteOpt === state.palette ? 'true' : 'false');
    });
  }

  function syncHubPalette() {
    const label = document.getElementById('hub-palette-label');
    if (label) label.textContent = activePalette().label;
  }

  // Where a palette write came from, as one stack frame. Run #163's artifact
  // showed the app back on Warm with nothing to say what put it there: the
  // palette changed between the swatch sample and the strip check, and the
  // capture could only show the result. The caller is the whole cause a logcat
  // line can carry, so each write names its own. The frame after applyPalette
  // is the caller; the two helpers themselves sit above it and are not named.
  function paletteCaller() {
    try {
      const frames = String(new Error().stack || '')
        .split('\n')
        .map(function (line) { return line.trim().replace(/^at\s+/, ''); })
        .filter(function (frame) { return frame && frame !== 'Error'; });
      for (let i = 0; i < frames.length; i++) {
        if (frames[i].indexOf('applyPalette') !== -1) return frames[i + 1] || frames[i];
      }
      return frames[0] || 'an unknown caller';
    } catch (err) {
      return 'an unknown caller';
    }
  }

  function applyPalette(id, persist) {
    const palette = PALETTES.filter(function (p) { return p.id === id; })[0] || PALETTES[0];
    // Opt-in only: the caller stack names the frame that moved the palette,
    // but building it on every boot is not worth a release log line.
    if (window.__sixfoldDebug) {
      try {
        console.log(
          '[appearance] palette ' + state.palette +
            (state.palette === palette.id ? ' kept' : ' -> ' + palette.id) +
            (persist ? ', saved' : ', unsaved') +
            ', at ' + paletteCaller()
        );
      } catch (err) {
        /* a logger that is not there must not stop the switch */
      }
    }
    state.palette = palette.id;
    if (switchIsVisible(persist)) crossFade();

    for (let i = 0; i < WARM.length; i++) {
      root.style.setProperty('--t' + (2 << i), recolor(WARM[i], palette));
    }
    // Shared accents for the other five games (see games.css/games.js).
    for (let i = 0; i < GAME_ACCENTS.length; i++) {
      root.style.setProperty('--g' + (i + 1), recolor(GAME_ACCENTS[i], palette));
    }
    root.style.setProperty(
      '--ink-tile-low',
      palette.mono ? hslToHex(0, 0, 0.46) : palette.shift ? hslToHex(34 + palette.shift, 0.11, 0.46) : '#857a6b'
    );

    if (persist) {
      try { localStorage.setItem(PALETTE_KEY, palette.id); } catch (err) {}
    }
    syncPaletteButtons();
    syncHubPalette();
    refreshPage();
    announceAppearance();
  }

  function buildPalettes() {
    const wrap = document.getElementById('palettes');
    if (!wrap) return;
    PALETTES.forEach(function (p) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'palette';
      // Opted in where it is built, so a palette swatch added later has to say
      // whether it takes part in the appearance cross-fade.
      btn.dataset.fade = '';
      btn.dataset.paletteOpt = p.id;
      btn.setAttribute('aria-pressed', 'false');
      // Use the visible palette name. A composed "Warm colours" label stops
      // matching the visible word once the locale translates them separately.
      btn.setAttribute('aria-label', p.label);

      const sw = document.createElement('span');
      sw.className = 'swatches';
      [2, 6, 10].forEach(function (i) {
        const dot = document.createElement('span');
        dot.style.background = recolor(WARM[i], p);
        sw.appendChild(dot);
      });

      const label = document.createElement('span');
      label.textContent = p.label;

      btn.appendChild(sw);
      btn.appendChild(label);
      btn.addEventListener('click', function () {
        applyPalette(p.id, true);
      });
      wrap.appendChild(btn);
    });
  }

  /* ---------- fullscreen ---------- */

  function fullscreenAvailable() {
    return !!(root.requestFullscreen || root.webkitRequestFullscreen || root.webkitRequestFullScreen);
  }

  function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function standaloneDisplay() {
    try {
      return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
        (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches) ||
        window.navigator.standalone === true;
    } catch (err) {
      return false;
    }
  }

  const homeFocusBtn = document.getElementById('home-focus-toggle');
  if (homeFocusBtn) {
    if (!fullscreenAvailable() || isNativeShell() || standaloneDisplay()) {
      homeFocusBtn.hidden = true;
    } else {
      const syncHomeFocus = function () {
        homeFocusBtn.setAttribute('aria-pressed', String(!!fullscreenElement()));
      };

      const toggleHomeFocus = function () {
        if (fullscreenElement()) {
          const exit = document.exitFullscreen || document.webkitExitFullscreen || document.webkitCancelFullScreen;
          if (!exit) return;
          try {
            const pending = exit.call(document);
            if (pending && typeof pending.catch === 'function') pending.catch(function () {});
          } catch (err) {}
          return;
        }
        const request = root.requestFullscreen || root.webkitRequestFullscreen || root.webkitRequestFullScreen;
        if (!request) return;
        try {
          const pending = request.call(root);
          if (pending && typeof pending.catch === 'function') pending.catch(function () {});
        } catch (err) {}
      };

      homeFocusBtn.addEventListener('click', toggleHomeFocus);
      document.addEventListener('fullscreenchange', syncHomeFocus);
      document.addEventListener('webkitfullscreenchange', syncHomeFocus);
      syncHomeFocus();
    }
  }

  /* ---------- sheet ---------- */

  const appEl = document.querySelector('.app');
  const hubEl = document.getElementById('hub');
  const sheetOpeners = new WeakMap();
  const sheetCloseTimers = new WeakMap();

  function openSheet(sheet, opener) {
    if (!sheet) return;
    const pendingClose = sheetCloseTimers.get(sheet);
    if (pendingClose) {
      window.clearTimeout(pendingClose);
      sheetCloseTimers.delete(sheet);
    }
    sheetOpeners.set(sheet, opener || null);
    sheet.hidden = false;
    // Commit the display change before the entering styles, so the card rises
    // rather than appearing on the same frame it is revealed.
    void sheet.offsetWidth;
    traceSheetPaint(sheet);
    sheet.classList.remove('is-closing');
    sheet.classList.add('is-open');
    // The page behind the sheet can't be tabbed into or tapped while it's open.
    // Hub, Merge and the five game screens each have their own top-level layer.
    const screen = document.body.dataset.screen;
    const background = screen === 'hub' ? hubEl : screen === 'merge' ? appEl : document.getElementById(screen);
    if (background && 'inert' in background && !background.inert) {
      background.inert = true;
      sheet._inertBackground = background;
    }
    document.documentElement.classList.add('sheet-open');
    const doneBtn = sheet.querySelector('.sheet-done');
    if (doneBtn) {
      doneBtn.focus();
      // Applying inert to the page can move focus to the document in some
      // browsers, so re-assert the dialog focus on the next frame.
      window.setTimeout(function () {
        if (!sheet.hidden && !sheet.classList.contains('is-closing')) {
          doneBtn.focus({ preventScroll: true });
        }
      }, 40);
    }
  }

  /* A device trace for the first frame that carries the scrim. Playwright can
     read the computed style, but only the phone can say when the compositor
     actually painted the backdrop-filter. The marker is deliberately tiny and
     fires once per open; it is not a polling loop. */
  function traceSheetPaint(sheet) {
    if (!window.performance || typeof window.performance.now !== 'function' || !window.requestAnimationFrame) return;
    const start = window.performance.now();
    const id = sheet.id || 'sheet';
    window.requestAnimationFrame(function () {
      const backdrop = sheet.querySelector('.sheet-backdrop');
      const style = backdrop ? window.getComputedStyle(backdrop) : null;
      const record = {
        sheet: id,
        ms: Math.round((window.performance.now() - start) * 10) / 10,
        lite: Boolean(window.MergePerf && window.MergePerf.lite),
        filter: style ? (style.webkitBackdropFilter || style.backdropFilter || 'none') : 'none',
        background: style ? style.backgroundColor : ''
      };
      window.__sixfoldSheetPaint = record;
      try {
        const from = 'sixfold-sheet-' + id + '-start';
        const to = 'sixfold-sheet-' + id + '-first-frame';
        window.performance.mark(from);
        window.performance.mark(to);
        window.performance.measure(to, from, to);
      } catch (err) {}
      if (typeof window.CustomEvent === 'function' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('sixfold:sheet-paint', { detail: record }));
      }
    });
  }

  function closeSheet(sheet) {
    if (!sheet || sheet.hidden || sheet.classList.contains('is-closing')) return;
    // The sheet's own leave animation owns the next 320ms. A colour fade
    // raised by a theme tap a moment ago would replace it, so end it here.
    endCrossFade();
    // Let the scrim and card leave before removing the dialog from the page.
    sheet.classList.remove('is-open');
    sheet.classList.add('is-closing');
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(function () {
      sheet.hidden = true;
      sheet.classList.remove('is-open', 'is-closing');
      sheet.removeAttribute('data-context');
      document.documentElement.classList.remove('sheet-open');
      if (sheet._inertBackground) {
        sheet._inertBackground.inert = false;
        sheet._inertBackground = null;
      }
      // Send focus back to whatever opened the sheet.
      const opener = sheetOpeners.get(sheet);
      if (opener) opener.focus();
      sheetOpeners.delete(sheet);
      sheetCloseTimers.delete(sheet);
    }, reduced ? 0 : 320);
    sheetCloseTimers.set(sheet, timer);
  }

  const appearanceSheet = document.getElementById('sheet');
  const appearanceBtn = document.getElementById('appearance');
  const sizeSheet = document.getElementById('size-sheet');
  const sizeBtn = document.getElementById('merge-size');
  const helpSheet = document.getElementById('help');
  const helpBtn = document.getElementById('how-to');
  const aboutSheet = document.getElementById('about');
  const aboutBtn = document.getElementById('hub-about');
  const welcomeSheet = document.getElementById('welcome');
  const welcomeStart = document.getElementById('welcome-start');
  const welcomeOpen = document.getElementById('welcome-open');
  const WELCOME_KEY = 'sixfold.welcome.v1';
  const resetSheet = document.getElementById('reset-sheet');
  const sudokuSettingsSheet = document.getElementById('sudoku-settings');
  const sudokuSettingsBtn = document.getElementById('sudoku-settings-open');
  const wipeSheet = document.getElementById('wipe-sheet');
  const wipeBtn = document.getElementById('wipe-open');
  const wipeConfirmBtn = document.getElementById('wipe-confirm');
  const resetTitleEl = document.getElementById('reset-title');
  const resetCopyEl = document.getElementById('reset-copy');
  const resetConfirmBtn = document.getElementById('reset-confirm');
  let resetAction = null;
  const helpTitleEl = document.getElementById('help-title');
  const helpStepsEl = document.getElementById('help-steps');
  const defaultHelpTitle = helpTitleEl ? helpTitleEl.textContent : 'How to play';
  const defaultHelpSteps = helpStepsEl
    ? Array.prototype.map.call(helpStepsEl.children, function (item) { return item.textContent; })
    : [];

  function localize(value) {
    return window.SixfoldI18n ? window.SixfoldI18n.t(value) : value;
  }

  function renderHelp(title, steps) {
    if (!helpTitleEl || !helpStepsEl) return;
    helpTitleEl.textContent = localize(title || defaultHelpTitle);
    helpStepsEl.textContent = '';
    (steps && steps.length ? steps : defaultHelpSteps).forEach(function (copy) {
      const item = document.createElement('li');
      item.textContent = localize(copy);
      helpStepsEl.appendChild(item);
    });
  }

  function wireSheet(sheet, openerBtn) {
    if (!sheet || !openerBtn) return;
    openerBtn.addEventListener('click', function () {
      // Merge's own help button always sees Merge's instructions, even after
      // another game has borrowed the sheet.
      if (sheet === helpSheet) renderHelp(defaultHelpTitle, defaultHelpSteps);
      openSheet(sheet, openerBtn);
    });
    sheet.querySelectorAll('[data-close], .sheet-done').forEach(function (el) {
      el.addEventListener('click', function () {
        closeSheet(sheet);
      });
    });
  }

  wireSheet(appearanceSheet, appearanceBtn);
  wireSheet(sizeSheet, sizeBtn);
  wireSheet(helpSheet, helpBtn);
  wireSheet(aboutSheet, aboutBtn);
  wireSheet(sudokuSettingsSheet, sudokuSettingsBtn);

  /* ---------- first-run welcome ---------- */
  // A fresh install gets one short guide in the same sheet language as Look &
  // feel: where the six games live, what the daily set is, and where the rest
  // of the app hides. Seeing it, or tapping past it, records it; Look & feel
  // can replay it at any time.
  function welcomeSeen() {
    try { return localStorage.getItem(WELCOME_KEY) === '1'; } catch (err) { return false; }
  }

  function markWelcomeSeen() {
    try { localStorage.setItem(WELCOME_KEY, '1'); } catch (err) {}
  }

  function closeWelcome() {
    if (!welcomeSheet || welcomeSheet.hidden) return;
    markWelcomeSeen();
    closeSheet(welcomeSheet);
    // Hand the reader to the collection rather than leaving focus on a dialog
    // that no longer exists.
    window.setTimeout(function () {
      const first = document.querySelector('.home-game');
      if (first) first.focus({ preventScroll: true });
    }, 340);
  }

  function openWelcome(opener) {
    if (!welcomeSheet) return;
    markWelcomeSeen();
    openSheet(welcomeSheet, opener || null);
    if (welcomeStart) {
      window.setTimeout(function () {
        if (!welcomeSheet.hidden && !welcomeSheet.classList.contains('is-closing')) {
          welcomeStart.focus({ preventScroll: true });
        }
      }, 60);
    }
  }

  function maybeWelcome() {
    if (!welcomeSheet || welcomeSeen()) return;
    if (document.body.dataset.screen !== 'hub') return;
    if (document.querySelector('.sheet.is-open:not(.is-closing)')) return;
    openWelcome(null);
  }

  if (welcomeSheet) {
    welcomeSheet.querySelectorAll('[data-close]').forEach(function (el) {
      el.addEventListener('click', closeWelcome);
    });
    if (welcomeStart) welcomeStart.addEventListener('click', closeWelcome);
    if (welcomeOpen) {
      welcomeOpen.addEventListener('click', function () {
        closeSheet(appearanceSheet);
        window.setTimeout(function () { openWelcome(appearanceBtn); }, 340);
      });
    }

    // The launch layer marks home-ready once the hub has built. Wait past its
    // entrance before covering the first screen, so the guide lands on a
    // settled page instead of during the build.
    if (document.documentElement.classList.contains('home-ready')) {
      window.setTimeout(maybeWelcome, 520);
    } else if ('MutationObserver' in window) {
      const readyObserver = new MutationObserver(function () {
        if (!document.documentElement.classList.contains('home-ready')) return;
        readyObserver.disconnect();
        window.setTimeout(maybeWelcome, 520);
      });
      readyObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    }
  }

  // Erasing everything is deliberately two separate taps: the quiet button in
  // Look & feel opens a warning sheet, and only its red button clears data.
  function wipeEverything() {
    // Merge keeps its board in memory and rewrites it on pagehide. Suspend that
    // write before clearing the keys, or the old board returns after the reload.
    if (window.MergeGame && window.MergeGame.suspendSaving) window.MergeGame.suspendSaving();
    [window.localStorage, window.sessionStorage].forEach(function (store) {
      try {
        Object.keys(store).forEach(function (key) {
          if (/^(merge2048\.|merge-games\.|sixfold\.)/.test(key)) store.removeItem(key);
        });
      } catch (err) {
        /* storage blocked — reload still returns a clean page */
      }
    });
    try {
      document.cookie = 'merge2048_theme=; Max-Age=0; path=/';
      document.cookie = 'merge2048_theme=; Max-Age=0; path=/Sixfold';
    } catch (err) {
      /* cookies blocked */
    }
    window.setTimeout(function () {
      window.location.replace(window.location.pathname + window.location.search);
    }, 140);
  }

  if (wipeSheet) {
    wipeSheet.querySelectorAll('[data-close], .sheet-done').forEach(function (el) {
      el.addEventListener('click', function () { closeSheet(wipeSheet); });
    });
  }
  if (wipeBtn && wipeSheet) {
    wipeBtn.addEventListener('click', function () {
      closeSheet(appearanceSheet);
      window.setTimeout(function () { openSheet(wipeSheet, wipeBtn); }, 340);
    });
  }
  if (wipeConfirmBtn) {
    wipeConfirmBtn.addEventListener('click', function () {
      if (wipeConfirmBtn.disabled) return;
      wipeConfirmBtn.disabled = true;
      wipeConfirmBtn.textContent = 'Erasing…';
      wipeEverything();
    });
  }

  if (resetSheet) {
    resetSheet.querySelectorAll('[data-close]').forEach(function (el) {
      el.addEventListener('click', function () {
        resetAction = null;
        closeSheet(resetSheet);
      });
    });
    if (resetConfirmBtn) {
      resetConfirmBtn.addEventListener('click', function () {
        const action = resetAction;
        resetAction = null;
        closeSheet(resetSheet);
        if (action) action();
      });
    }
  }

  function openGameReset(options) {
    if (!options) return;
    if (!resetSheet || !resetTitleEl || !resetCopyEl || !resetConfirmBtn) {
      if (options.onConfirm) options.onConfirm();
      return;
    }
    resetTitleEl.textContent = localize('Reset ' + options.name + '?');
    resetCopyEl.textContent = localize(options.copy || ('This clears ' + options.name + ' data on this device.'));
    resetConfirmBtn.textContent = localize('Reset ' + options.name);
    resetAction = options.onConfirm || null;
    openSheet(resetSheet, options.opener || null);
  }

  function activeSheet() {
    const open = document.querySelector('.sheet.is-open:not(.is-closing)');
    if (open) return open;
    if (welcomeSheet && !welcomeSheet.hidden) return welcomeSheet;
    if (appearanceSheet && !appearanceSheet.hidden) return appearanceSheet;
    if (sizeSheet && !sizeSheet.hidden) return sizeSheet;
    if (helpSheet && !helpSheet.hidden) return helpSheet;
    if (aboutSheet && !aboutSheet.hidden) return aboutSheet;
    if (sudokuSettingsSheet && !sudokuSettingsSheet.hidden) return sudokuSettingsSheet;
    if (wipeSheet && !wipeSheet.hidden) return wipeSheet;
    if (resetSheet && !resetSheet.hidden) return resetSheet;
    return null;
  }

  function sheetFocusables(sheet) {
    return Array.prototype.slice.call(
      sheet.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ).filter(function (el) {
      return !el.hidden && !el.disabled && el.getClientRects().length > 0;
    });
  }

  if (appearanceSheet || helpSheet || aboutSheet || resetSheet) {
    document.addEventListener('keydown', function (e) {
      const sheet = activeSheet();
      if (!sheet) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (sheet === welcomeSheet) closeWelcome();
        else closeSheet(sheet);
        return;
      }
      if (e.key !== 'Tab') return;

      const focusables = sheetFocusables(sheet);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !sheet.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !sheet.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  // The in-game coach handles the first moves; Help stays available in Look.

  if (appearanceSheet) {
    appearanceSheet.querySelectorAll('[data-theme-opt]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyTheme(btn.dataset.themeOpt, true);
      });
    });
  }

  /* ---------- start ---------- */

  buildPalettes();
  applyTheme(state.theme, false);
  applyPalette(state.palette, false);

  // Display controls on the other game screens use the same theme state and
  // persistence as Merge's footer toggle, without duplicating the theme logic.
  window.MergeTheme = {
    toggle: function () {
      applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true);
    },
    isDark: function () {
      return root.dataset.theme === 'dark';
    },
    openHelp: function (title, steps, opener) {
      if (!helpSheet) return;
      renderHelp(title, steps);
      openSheet(helpSheet, opener || helpBtn);
    },
    palette: function () {
      return state.palette;
    },
    // Recolour any accent hex with the active palette. Canvas games call this.
    colour: function (hex) {
      return recolor(hex, activePalette());
    },
    // Android's SystemBars restyles the window background while it changes the
    // bar icons, which undoes the report made just before it. Send the page
    // colour again, past the memo, so that write is the one that stays.
    repaintSurface: function () {
      reportedSurface = null;
      paintWindowSurface(chromeColour());
    },
    confirmReset: openGameReset,
    closeSheet: closeSheet,
    openSheet: openSheet
  };

  const onSchemeChange = function () {
    if (state.theme === 'auto') applyTheme('auto', false);
  };
  if (mq.addEventListener) mq.addEventListener('change', onSchemeChange);
  else if (mq.addListener) mq.addListener(onSchemeChange);
})();
