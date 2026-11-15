/* Offline cache for Sixfold. Bump VERSION whenever the assets change. */
// Internal build 5.2.0: localized share cards, consistent script fonts and digit faces.
const VERSION = 'sixfold-5.2.0';
// Cache Storage is shared by every app on the origin. Only remove Sixfold's
// own older caches, never another project's offline data.
const CACHE_PREFIX = 'sixfold-';
// Keep these matching index.html. A new cache version refreshes the shell even
// when the asset URLs themselves do not change. The game code has its own
// query suffix, so it must be listed separately or offline play would look for
// files that were never cached.
const ASSET = '4.0.0';
const SHARE_CARD = '5.2.7';
const STYLE_ASSET = '5.2.8';
const FONT_ASSET = '4.0.1';
const THEME_JS = '5.2.0';
const GAME_CODE = '5.2.5';
const WORDLE_CODE = '5.2.5-wordle';
const SUDOKU_GAME_CODE = '5.2.6';
const LOCALE_FONT = '5.1.4';
const GAMES_CSS = '5.2.9';
const POLISH_CSS = '4.0.0-w16';
const GAMES_JS = '5.2.8';
const SUDOKU_CSS = '4.0.0-w15';
const V5_CSS = '5.4.2';
const HOME_CSS = '4.0.0-w11';
const DAILY_CODE = '5.3.9';
const I18N_CODE = '5.4.5';

const SHELL = [
  './',
  './index.html',
  './licenses.html',
  './LICENSE',
  './APPSTORE-EXCEPTION.md',
  './css/styles.css?v=' + STYLE_ASSET,
  './js/theme.js?v=' + THEME_JS,
  './js/game.js?v=' + GAME_CODE,
  './js/haptics.js?v=' + ASSET,
  './js/overscroll.js?v=' + ASSET,
  './js/celebrate.js?v=' + ASSET,
  './js/sharecard.js?v=' + SHARE_CARD,
  './js/install.js?v=' + ASSET,
  './css/games.css?v=' + GAMES_CSS,
  './css/home.css?v=' + HOME_CSS,
  './css/polish.css?v=' + POLISH_CSS,
  './css/sudoku.css?v=' + SUDOKU_CSS,
  './v5.css?v=' + V5_CSS,
  './settings.js?v=5.2.3',
  './js/sudoku.js?v=' + SUDOKU_GAME_CODE,
  './js/games.js?v=' + GAMES_JS,
  './daily.js?v=' + DAILY_CODE,
  './js/badges.js?v=1.0.1',
  './update.js?v=5.1.0',
  // Locale catalogs are not in the install shell. The page loads only the
  // active catalog; i18n.js warms that catalog after the worker controls it.
  './i18n-locale.js?v=' + I18N_CODE,
  './i18n.js?v=' + I18N_CODE,
  './native.js?v=5.1.0',
  './js/wordle-loader.js?v=' + WORDLE_CODE,
  // The hidden word game is loaded on demand, but it still belongs in the
  // offline shell so unlocking it works with no connection. The active locale
  // pack is not in the first install; it is cached after its first fetch.
  './js/wordle-words.js?v=' + WORDLE_CODE,
  './wordle-i18n.js?v=' + WORDLE_CODE,
  './js/wordle.js?v=' + WORDLE_CODE,
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-1024.png',
  './icons/icon-maskable-512.png',
  './icons/icon-maskable-1024.png',
  './fonts/google-sans-flex.woff2?v=' + FONT_ASSET,
  './fonts/sixfold-sc.woff2?v=' + LOCALE_FONT,
  './fonts/sixfold-tc.woff2?v=' + LOCALE_FONT,
  './fonts/sixfold-jp.woff2?v=' + LOCALE_FONT,
  './fonts/sixfold-kr.woff2?v=' + LOCALE_FONT,
  './fonts/sixfold-devanagari.woff2?v=' + LOCALE_FONT,
  './fonts/sixfold-kannada.woff2?v=' + LOCALE_FONT,
  './fonts/sixfold-arabic.woff2?v=' + LOCALE_FONT,
  './fonts/sixfold-arabic-digits.woff2?v=' + LOCALE_FONT,
  './fonts/sixfold-devanagari-digits.woff2?v=' + LOCALE_FONT
];

/* A build reuses the cache name so an installed app keeps its offline shell.
   Versioned URLs from older builds would otherwise stay forever, so drop any
   entry whose version is not part of this build. Dynamic locale and Wordle
   packs are kept while they match the current asset versions. */
async function pruneStaleAssets() {
  const cache = await caches.open(VERSION);
  const requests = await cache.keys();
  const keep = new Set(SHELL.map((entry) => new URL(entry, self.registration.scope).href));
  const versions = new Set([I18N_CODE, WORDLE_CODE]);

  SHELL.forEach((entry) => {
    const version = new URL(entry, self.registration.scope).searchParams.get('v');
    if (version) versions.add(version);
  });

  await Promise.all(
    requests.map((request) => {
      const url = new URL(request.url);
      const version = url.searchParams.get('v');
      if (!version || keep.has(url.href) || versions.has(version)) return undefined;
      return cache.delete(request);
    })
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) =>
        Promise.all(
          SHELL.map((url) =>
            fetch(url, { cache: 'reload' }).then((response) => {
              if (!response.ok) throw new Error('Failed to cache ' + url);
              return cache.put(url, response);
            })
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== VERSION)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => pruneStaleAssets().catch((err) => {
        console.warn('Sixfold: stale cache prune failed', err);
      }))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // The downloadable source archive is a one-off asset, not part of the app
  // shell. Leave it entirely to the browser so a download can never be saved
  // as a page fallback.
  if (url.pathname.endsWith('.zip')) return;

  // Install details must always be current, or the phone keeps its old bar colours.
  if (url.pathname.endsWith('.webmanifest')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches
              .open(VERSION)
              .then((cache) => cache.put(request, copy))
              .catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Pages: freshest version when online, the saved copy when not. The
  // licenses page is a separate document, so keep its own offline fallback.
  if (request.mode === 'navigate') {
    const page = url.pathname.endsWith('/licenses.html') ? './licenses.html' : './index.html';
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only cache a successful HTML page. A failed navigation (including
          // GitHub Pages' 404 page) must never replace the offline app shell.
          if (response.ok &&
              (response.headers.get('Content-Type') || '').indexOf('text/html') !== -1) {
            const copy = response.clone();
            caches
              .open(VERSION)
              .then((cache) => cache.put(page, copy))
              .catch(() => {});
          }
          return response;
        })
        .catch(() =>
          caches.match(page)
            .then((cached) => cached || caches.match('./index.html'))
            .then((cached) => cached || caches.match('./'))
        )
    );
    return;
  }

  // Everything else: serve from cache immediately, refresh quietly for next time.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        fetch(request)
          .then((response) => {
            if (response && response.ok) {
              caches
                .open(VERSION)
                .then((cache) => cache.put(request, response))
                .catch(() => {});
            }
          })
          .catch(() => {});
        return cached;
      }

      return fetch(request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches
            .open(VERSION)
            .then((cache) => cache.put(request, copy))
            .catch(() => {});
        }
        return response;
      });
    })
  );
});

// The page shows the local daily nudge through its registration. A tag on the
// notification replaces an older one instead of stacking reminders.
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || './#daily';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windows) {
      for (let i = 0; i < windows.length; i += 1) {
        if ('focus' in windows[i]) {
          windows[i].navigate(target).catch(function () {});
          return windows[i].focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
