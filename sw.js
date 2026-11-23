/* Offline cache for Sixfold. Bump VERSION whenever the assets change. */
// Internal build 6.0.0: 6.0 development baseline; the public release remains 5.0.
const VERSION = 'sixfold-6.0.33';
// A build reuses the cache name so an installed app keeps its offline shell.
// The staging cache is only visible during install; it never serves a page.
const STAGING = VERSION + '-install';
// Cache Storage is shared by every app on the origin. Only remove Sixfold's
// own older caches, never another project's offline data.
const CACHE_PREFIX = 'sixfold-';
// Keep these matching index.html. A new cache version refreshes the shell even
// when the asset URLs themselves do not change. The game code has its own
// query suffix, so it must be listed separately or offline play would look for
// files that were never cached.
const ASSET = '5.0.0';
// Haptics has its own suffix: its patterns change without touching the other
// shared-baseline scripts, and an installed app must pick the new pulse up.
const HAPTICS_JS = '5.0.1';
const SHARE_CARD = '5.3.2';
const STYLE_ASSET = '5.2.9';
const FONT_ASSET = '4.0.1';
const THEME_JS = '6.0.10';
const OVERSCROLL_JS = '6.0.2';
const GAME_CODE = '5.3.2';
const WORDLE_CODE = '5.3.1-wordle';
const SUDOKU_GAME_CODE = '5.3.1';
const LOCALE_FONT = '5.1.4';
const GAMES_CSS = '5.3.6';
const POLISH_CSS = '4.0.4-w21';
const GAMES_JS = '5.4.2';
const SUDOKU_CSS = '4.0.4';
const V5_CSS = '5.6.1';
const BLUR_CSS = '1.3.1';
const HOME_CSS = '4.1.6';
const DAILY_CODE = '5.4.4';
const PROFILE_CODE = '1.0.0';
const BADGES_CODE = '1.1.0';
const GAUNTLET_CODE = '1.0.1';
const I18N_CODE = '5.4.6';

// Runtime assets are deliberately small. The shell is protected separately,
// so this budget caps everything the app can add after install.
const MAX_DYNAMIC_ENTRIES = 12;
const MAX_DYNAMIC_BYTES = 2 * 1024 * 1024;
const ACTIVE_LOCALE = './__sixfold-active-locale';

const LOCALE_CATALOG = {
  fr: 'i18n-fr.js',
  de: 'i18n-de.js',
  'zh-Hans': 'i18n-zh-hans.js',
  'zh-Hant': 'i18n-zh-hant.js',
  ja: 'i18n-ja.js',
  ko: 'i18n-ko.js',
  'pt-BR': 'i18n-pt-br.js',
  hi: 'i18n-hi.js',
  kn: 'i18n-kn.js',
  ar: 'i18n-ar.js'
};

const WORDLE_PACK = {
  es: 'es.js',
  fr: 'fr.js',
  de: 'de.js',
  'pt-BR': 'pt-BR.js',
  ar: 'ar.js',
  ja: 'ja.js',
  hi: 'hi.js',
  kn: 'kn.js',
  ko: 'ko.js',
  'zh-Hans': 'zh-Hans.js',
  'zh-Hant': 'zh-Hant.js'
};

const SCRIPT_FONTS = {
  'zh-Hans': ['sixfold-sc.woff2'],
  'zh-Hant': ['sixfold-tc.woff2'],
  ja: ['sixfold-jp.woff2'],
  ko: ['sixfold-kr.woff2'],
  hi: ['sixfold-devanagari.woff2', 'sixfold-devanagari-digits.woff2'],
  kn: ['sixfold-kannada.woff2'],
  ar: ['sixfold-arabic.woff2', 'sixfold-arabic-digits.woff2']
};

const SHELL = [
  './',
  './index.html',
  './licenses.html',
  './LICENSE',
  './css/styles.css?v=' + STYLE_ASSET,
  './js/theme.js?v=' + THEME_JS,
  './js/game.js?v=' + GAME_CODE,
  './js/haptics.js?v=' + HAPTICS_JS,
  './js/overscroll.js?v=' + OVERSCROLL_JS,
  './js/celebrate.js?v=' + ASSET,
  './js/sharecard.js?v=' + SHARE_CARD,
  './js/install.js?v=' + ASSET,
  './css/games.css?v=' + GAMES_CSS,
  './css/home.css?v=' + HOME_CSS,
  './css/polish.css?v=' + POLISH_CSS,
  './css/sudoku.css?v=' + SUDOKU_CSS,
  './css/v5.css?v=' + V5_CSS,
  './css/progressive-blur.css?v=' + BLUR_CSS,
  './js/settings.js?v=5.4.0',
  './js/sudoku.js?v=' + SUDOKU_GAME_CODE,
  './js/games.js?v=' + GAMES_JS,
  './js/daily.js?v=' + DAILY_CODE,
  './js/profile.js?v=' + PROFILE_CODE,
  './js/badges.js?v=' + BADGES_CODE,
  './js/gauntlet.js?v=' + GAUNTLET_CODE,
  './js/update.js?v=5.1.0',
  // Locale catalogs are not in the install shell. The page loads only the
  // active catalog; i18n.js warms that catalog after the worker controls it.
  './i18n/i18n-locale.js?v=' + I18N_CODE,
  './i18n/i18n.js?v=' + I18N_CODE,
  './js/native.js?v=5.1.5',
  './js/wordle-loader.js?v=' + WORDLE_CODE,
  // The hidden word game is loaded on demand, but it still belongs in the
  // offline shell so unlocking it works with no connection. The active locale
  // pack and script face are cached after their first fetch.
  './js/wordle-words.js?v=' + WORDLE_CODE,
  './i18n/wordle-i18n.js?v=' + WORDLE_CODE,
  './js/wordle.js?v=' + WORDLE_CODE,
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-1024.png',
  './icons/icon-maskable-512.png',
  './icons/icon-maskable-1024.png',
  './fonts/google-sans-flex.woff2?v=' + FONT_ASSET
];

let shellKeyCache = null;
let activeLocaleKeyCache = null;

function shellKeys() {
  if (!shellKeyCache) {
    shellKeyCache = new Set(SHELL.map((entry) => new URL(entry, self.registration.scope).href));
  }
  return shellKeyCache;
}

function activeLocaleKey() {
  if (!activeLocaleKeyCache) {
    activeLocaleKeyCache = new URL(ACTIVE_LOCALE, self.registration.scope).href;
  }
  return activeLocaleKeyCache;
}

function fileName(url) {
  return url.pathname.slice(url.pathname.lastIndexOf('/') + 1);
}

function dynamicKind(url) {
  if (/\/(?:i18n-patterns|i18n-[a-z-]+)\.js$/.test(url.pathname)) return 'catalog';
  if (/\/wordle-locales\/[^/]+\.js$/.test(url.pathname)) return 'wordle';
  if (/\/fonts\/sixfold-[a-z-]+\.woff2$/.test(url.pathname)) return 'font';
  if (/\/manifest(?:-dark)?\.webmanifest$/.test(url.pathname)) return 'manifest';
  return '';
}

/* Runtime caching is an allowlist. Unknown same-origin assets are left to the
   browser so a cache-busting URL or a new large file cannot grow the offline
   cache without a corresponding policy change. */
function isCurrentDynamic(url) {
  const kind = dynamicKind(url);
  const version = url.searchParams.get('v');
  if (!kind || !version) return false;
  if (kind === 'catalog') return version === I18N_CODE;
  if (kind === 'wordle') return version === WORDLE_CODE;
  if (kind === 'font') return version === LOCALE_FONT;
  if (kind === 'manifest') return version === THEME_JS;
  return false;
}

/* Only the selected language is useful offline. Until a page announces its
   locale (for example on the first activation after this change), keep every
   current-version asset so an offline reader is never stripped early. */
function isActiveDynamic(url, locale) {
  const kind = dynamicKind(url);
  if (!kind) return false;
  if (kind === 'manifest' || !locale) return true;
  const file = fileName(url);
  if (kind === 'catalog') {
    if (file === 'i18n-patterns.js') return Boolean(LOCALE_CATALOG[locale]);
    return LOCALE_CATALOG[locale] === file;
  }
  if (kind === 'wordle') return WORDLE_PACK[locale] === file;
  if (kind === 'font') return (SCRIPT_FONTS[locale] || []).indexOf(file) !== -1;
  return false;
}

async function readActiveLocale(cache) {
  const response = await cache.match(activeLocaleKey());
  if (!response) return null;
  const locale = (await response.text()).trim();
  return locale || null;
}

async function cacheEntryBytes(cache, request) {
  const response = await cache.match(request);
  if (!response) return 0;
  const length = Number(response.headers.get('Content-Length'));
  if (Number.isFinite(length) && length > 0) return length;
  try {
    return (await response.clone().blob()).size;
  } catch (err) {
    return 0;
  }
}

/* The byte budget is a hard backstop. Inactive and unknown entries go first;
   if the selected offline set itself ever exceeds the budget, the oldest
   entries are still dropped so quota pressure cannot silently break writes. */
async function trimDynamicCache(cache, locale, aggressive) {
  const keep = shellKeys();
  const marker = activeLocaleKey();
  const maxEntries = aggressive ? Math.max(1, Math.floor(MAX_DYNAMIC_ENTRIES / 2)) : MAX_DYNAMIC_ENTRIES;
  const maxBytes = aggressive ? Math.floor(MAX_DYNAMIC_BYTES / 2) : MAX_DYNAMIC_BYTES;
  const entries = [];
  let count = 0;
  let bytes = 0;

  const requests = await cache.keys();
  for (let index = 0; index < requests.length; index += 1) {
    const request = requests[index];
    const url = new URL(request.url);
    if (keep.has(url.href) || url.href === marker) continue;
    const size = await cacheEntryBytes(cache, request);
    count += 1;
    bytes += size;
    entries.push({
      request: request,
      size: size,
      index: index,
      priority: isCurrentDynamic(url) && isActiveDynamic(url, locale) ? 2 : 1
    });
  }

  if (count <= maxEntries && bytes <= maxBytes) return;
  entries.sort((a, b) => a.priority - b.priority || a.index - b.index);
  for (let i = 0; i < entries.length; i += 1) {
    if (count <= maxEntries && bytes <= maxBytes) break;
    await cache.delete(entries[i].request);
    count -= 1;
    bytes -= entries[i].size;
  }
  if (count > maxEntries || bytes > maxBytes) {
    console.warn('Sixfold: runtime cache is still above its budget', count, bytes);
  }
}

async function remember(request, response) {
  const cache = await caches.open(VERSION);
  const locale = await readActiveLocale(cache);
  try {
    await cache.put(request, response.clone());
  } catch (err) {
    await trimDynamicCache(cache, locale, true).catch(() => {});
    try {
      await cache.put(request, response.clone());
    } catch (retryErr) {
      console.warn('Sixfold: runtime cache write failed', retryErr);
      return;
    }
  }
  await trimDynamicCache(cache, locale);
}

async function pruneStaleAssets(localeArg) {
  const cache = await caches.open(VERSION);
  const locale = localeArg === undefined ? await readActiveLocale(cache) : localeArg;
  const keep = shellKeys();
  const marker = activeLocaleKey();
  const requests = await cache.keys();

  await Promise.all(
    requests.map((request) => {
      const url = new URL(request.url);
      if (keep.has(url.href) || url.href === marker) return undefined;
      // Assets without a build query are not part of the versioned shell
      // history this pass owns; the runtime allowlist prevents new ones.
      if (!url.searchParams.has('v')) return undefined;
      if (isCurrentDynamic(url) && isActiveDynamic(url, locale)) return undefined;
      return cache.delete(request);
    })
  );
  await trimDynamicCache(cache, locale);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      await caches.delete(STAGING);
      const staged = await caches.open(STAGING);
      const results = await Promise.allSettled(
        SHELL.map(async (url) => {
          const response = await fetch(url, { cache: 'reload' });
          if (!response.ok) throw new Error('Failed to cache ' + url);
          await staged.put(url, response);
        })
      );
      const failed = results.find((result) => result.status === 'rejected');
      if (failed) {
        await caches.delete(STAGING);
        throw failed.reason;
      }

      // Only touch the live cache after every shell asset is staged. A failed
      // install therefore leaves the previous offline shell untouched.
      const live = await caches.open(VERSION);
      try {
        await Promise.all(
          SHELL.map(async (url) => {
            const response = await staged.match(url);
            if (!response) throw new Error('Missing staged asset ' + url);
            await live.put(url, response);
          })
        );
      } catch (err) {
        await caches.delete(STAGING);
        throw err;
      }
      await caches.delete(STAGING);
      await self.skipWaiting();
    })()
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

// The page owns the language preference. Tell the worker so changing language
// can drop the previous catalog, dictionary and script face immediately.
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'sixfold-active-locale') return;
  const locale = typeof data.locale === 'string' ? data.locale : '';
  if (locale !== 'en' && locale !== 'es' &&
      !Object.prototype.hasOwnProperty.call(LOCALE_CATALOG, locale)) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      await cache.put(activeLocaleKey(), new Response(locale, {
        headers: { 'Content-Type': 'text/plain' }
      }));
      await pruneStaleAssets(locale);
    })().catch((err) => {
      console.warn('Sixfold: active locale update failed', err);
    })
  );
});

function matchLive(request) {
  return caches.open(VERSION).then((cache) => cache.match(request));
}

/* Catalogs and word packs are only fetched for the selected language. The
   language picker is different: it renders every script name, so only a face
   the page marks as active (or the already selected face) may be cached. */
async function runtimeCacheAllowed(request, url) {
  if (!isCurrentDynamic(url)) return false;
  const kind = dynamicKind(url);
  if (kind === 'manifest') return true;
  // Catalogs and word packs are only fetched for the selected language, so
  // they can be admitted even before the page announces a language change.
  // The picker is different: it renders every script name, so only a face the
  // page explicitly marks as active (or the already selected face) may become
  // an offline asset.
  if (kind !== 'font') return true;
  if (request.headers.get('X-Sixfold-Active-Face') === '1') return true;
  const cache = await caches.open(VERSION);
  const locale = await readActiveLocale(cache);
  return !locale || isActiveDynamic(url, locale);
}

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
        .catch(() => matchLive(request))
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
          matchLive(page)
            .then((cached) => cached || matchLive('./index.html'))
            .then((cached) => cached || matchLive('./'))
        )
    );
    return;
  }

  // Everything else: serve a saved copy immediately. Only the explicit runtime
  // allowlist is refreshed or stored; unknown same-origin assets pass through.
  event.respondWith(
    (async () => {
      const cached = await matchLive(request);
      const cacheable = await runtimeCacheAllowed(request, url);
      if (cached) {
        if (!shellKeys().has(url.href) && cacheable) {
          fetch(request)
            .then((response) => {
              if (response && response.ok) remember(request, response);
            })
            .catch(() => {});
        }
        return cached;
      }

      if (!cacheable) return fetch(request);

      const response = await fetch(request);
      if (response && response.ok) {
        remember(request, response.clone()).catch(() => {});
      }
      return response;
    })()
  );
});
