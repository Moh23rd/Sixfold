const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { LOCALES, chooseLocale } = require('./helpers');

const SW_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const SHELL_BLOCK = SW_SOURCE.match(/const SHELL = \[([\s\S]*?)\n\];/)[1];
const SHELL_ENTRIES = (SHELL_BLOCK.match(/^  ['"]/gm) || []).length;

test('all six hub cards open their game screen', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.home-game[data-game="merge"]');
  const expected = {
    merge: 'Merge',
    sudoku: 'Sudoku',
    ttt: 'Tic Tac Toe',
    mines: 'Minesweeper',
    water: 'Water Sort',
    fruit: 'Fruit Merge'
  };
  for (const [game, title] of Object.entries(expected)) {
    await page.locator('.home-game[data-game="' + game + '"]').click();
    await expect(page.locator('body')).toHaveAttribute('data-screen', game);
    if (game === 'merge') {
      await expect(page.locator('main.app')).toBeVisible();
      await expect(page.locator('main.app h1')).toContainText(title);
      await page.locator('#back-to-games').click();
    } else {
      await expect(page.locator('#' + game)).toBeVisible();
      await expect(page.locator('#' + game + '-title')).toContainText(title);
      await page.locator('#' + game + ' [data-back]').first().click();
    }
    await expect(page.locator('#hub')).toBeVisible();
  }
});

test('the surprise die opens one game, not a card tapped mid-swing', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.home-game[data-game="merge"]');
  await page.evaluate(() => {
    window.__screens = [];
    new MutationObserver(() => {
      window.__screens.push(document.body.dataset.screen);
    }).observe(document.body, { attributes: true, attributeFilter: ['data-screen'] });
  });

  // Tap the die, then a different card before the 430 ms swing lands. The tap
  // used to open its own game and be replaced by the pick a moment later.
  const picked = await page.evaluate(() => {
    document.getElementById('home-surprise').click();
    const lifted = document.querySelector('.home-game.is-picked');
    const other = document.querySelector('.home-game[data-game="' + (lifted.dataset.game === 'ttt' ? 'sudoku' : 'ttt') + '"]');
    other.click();
    return { game: lifted.dataset.game, other: other.dataset.game };
  });
  expect(picked.game).not.toBe(picked.other);

  await expect(page.locator('body')).toHaveAttribute('data-screen', picked.game);
  expect(await page.evaluate(() => window.__screens)).toEqual([picked.game]);
});

test('Daily Sixfold picks a date-seeded featured game', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#daily')).toBeVisible();
  await expect(page.locator('#daily-date')).not.toBeEmpty();
  await expect(page.locator('#daily-games')).toHaveCount(0);
  await expect(page.locator('.daily-feature')).toHaveCount(1);

  const info = await page.evaluate(() => {
    const picks = [];
    for (let day = 1; day <= 12; day += 1) {
      const date = new Date(2026, 0, day);
      const key = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
      picks.push(window.SixfoldDaily.featuredGame(key));
    }
    const current = window.SixfoldDaily.featuredGame(window.SixfoldDaily.todayKey());
    return {
      varied: new Set(picks).size,
      current: current,
      buttonGame: document.getElementById('daily-featured').dataset.game,
      buttonText: document.getElementById('daily-featured-label').textContent
    };
  });
  expect(info.varied, 'the seeded featured game should vary by day').toBeGreaterThan(1);
  expect(info.buttonGame).toBe(info.current);
  expect(info.buttonText).not.toBe('Play daily Sudoku');

  await page.locator('#daily-featured').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', info.current);
});

test('daily calendar shows the selected day\'s game', async ({ page }) => {
  await page.goto('/');
  const expected = await page.evaluate(() => {
    const labels = {
      merge: ['Merge', 'Numbers'],
      sudoku: ['Sudoku', 'Numbers'],
      ttt: ['Tic Tac Toe', 'Classic'],
      mines: ['Minesweeper', 'Logic'],
      water: ['Water Sort', 'Sorting'],
      fruit: ['Fruit Merge', 'Merging']
    };
    let key = window.SixfoldDaily.todayKey();
    let game = 'sudoku';
    for (let i = 0; i < 30 && game === 'sudoku'; i += 1) {
      key = window.SixfoldDaily.shiftKey(key, -1);
      game = window.SixfoldDaily.featuredGame(key);
    }
    return { key: key, game: game, label: labels[game][0], kind: labels[game][1] };
  });

  await page.locator('#daily-calendar-open').click();
  await expect(page.locator('#daily-calendar')).toBeVisible();
  const day = page.locator('.daily-day[data-date="' + expected.key + '"]');
  await day.click();
  await expect(day).toHaveClass(/is-selected/);
  await expect(page.locator('#daily-day-title')).toContainText(expected.label);
  await expect(page.locator('#daily-day-copy')).toHaveText(expected.kind);
  expect(expected.game).not.toBe('sudoku');
  await expect(page.locator('#daily-day-play')).toBeVisible();
  await expect(page.locator('#daily-day-play')).toContainText('Replay');
});

test('daily milestone badge is earned from the best streak', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('sixfold.daily.v1', JSON.stringify({ days: {}, best: 7 }));
  });
  await page.reload();
  await expect(page.locator('#daily-badge')).toHaveClass(/is-earned/);
  await expect(page.locator('#daily-badge-value')).toHaveText('7');
  await expect(page.locator('#daily-badge-next')).toContainText('30');
});

test('earned badge progress never grows wider than the badge', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('sixfold.daily.v1', JSON.stringify({ days: {}, best: 7 }));
  });
  await page.reload();
  await expect(page.locator('#daily-badge-next')).toBeVisible();

  const measure = () => page.evaluate(() => {
    const badge = document.getElementById('daily-badge').getBoundingClientRect();
    const progress = document.getElementById('daily-badge-progress').getBoundingClientRect();
    return {
      badgeWidth: badge.width,
      badgeLeft: badge.left,
      badgeRight: badge.right,
      progressWidth: progress.width,
      progressLeft: progress.left,
      progressRight: progress.right
    };
  });

  const earned = await measure();
  expect(earned.progressWidth).toBeCloseTo(earned.badgeWidth, 1);
  expect(earned.progressLeft).toBeCloseTo(earned.badgeLeft, 1);
  expect(earned.progressRight).toBeCloseTo(earned.badgeRight, 1);

  // A longer next-badge line must widen the badge with the track, not leave
  // the track hanging past the badge edge.
  await page.evaluate(() => {
    const next = document.getElementById('daily-badge-next');
    next.hidden = false;
    next.textContent = '265 days to 365 · keep going';
  });
  const stretched = await measure();
  expect(stretched.progressWidth).toBeCloseTo(stretched.badgeWidth, 1);
  expect(stretched.progressLeft).toBeCloseTo(stretched.badgeLeft, 1);
  expect(stretched.progressRight).toBeCloseTo(stretched.badgeRight, 1);
});

test('daily section can be hidden and restored from Look & feel', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#daily')).toBeVisible();
  await page.locator('#appearance').click();
  await expect(page.locator('#sheet')).toBeVisible();
  await page.locator('[data-setting="dailyPuzzle"]').click();
  await expect(page.locator('#daily')).toBeHidden();

  await page.reload();
  await expect(page.locator('#daily')).toBeHidden();
  await page.locator('#appearance').click();
  await expect(page.locator('[data-setting="dailyPuzzle"]')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('[data-setting="dailyPuzzle"]').click();
  await expect(page.locator('#daily')).toBeVisible();
});

 test('Sudoku settings live in the Sudoku screen', async ({ page }) => {
  await page.goto('/#sudoku');
  await page.waitForSelector('#sudoku-board .sudoku-cell');
  await expect(page.locator('#sheet [data-setting="largeDigits"]')).toHaveCount(0);

  await page.locator('#sudoku-settings-open').click();
  await expect(page.locator('#sudoku-settings')).toBeVisible();
  await page.locator('#sudoku-settings [data-setting="largeDigits"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-large-digits', 'on');
  await page.locator('#sudoku-settings .sheet-done').click();
  await expect(page.locator('#sudoku-settings')).toBeHidden();
});

test('Arabic, Hindi and Kannada interface numbers use native digits', async ({ page }) => {
  await page.goto('/');
  for (const [locale, zero, digitPattern] of [
    ['ar', '٠', /[٠-٩]/],
    ['hi', '०', /[०-९]/],
    ['kn', '೦', /[೦-೯]/]
  ]) {
    await page.evaluate((next) => localStorage.setItem('sixfold.locale.v1', next), locale);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('#daily-streak')).toHaveText(zero);
    const date = await page.locator('#daily-date').innerText();
    expect(date).toMatch(digitPattern);
    expect(date).not.toMatch(/[0-9]/);
  }
});

test('Sudoku hint opens the learning panel', async ({ page }) => {
  await page.goto('/#sudoku');
  await page.waitForSelector('#sudoku-board .sudoku-cell');
  await page.locator('#sudoku-hint').click();
  await expect(page.locator('#sudoku-hint-panel')).toBeVisible();
  await expect(page.locator('#sudoku-hint-title')).not.toBeEmpty();
  await expect(page.locator('#sudoku-hint-copy')).not.toBeEmpty();
});

test('appearance settings update the document and backup downloads', async ({ page }) => {
  await page.goto('/');
  await page.locator('#appearance').click();
  await expect(page.locator('#sheet')).toBeVisible();
  await expect(page.locator('#accessibility-settings')).not.toHaveAttribute('open', '');
  await expect(page.locator('[data-setting="sound"]')).toHaveCount(0);
  await page.locator('#accessibility-settings summary').click();
  await expect(page.locator('#accessibility-settings')).toHaveAttribute('open', '');
  await page.locator('[data-setting="highContrast"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
  await page.locator('[data-setting="highContrast"]').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-contrast', 'high');

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#backup-export').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^sixfold-backup-.*\.json$/);
});

test('language switch to Spanish survives a reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.locator('#appearance').click();
  await expect(page.locator('#sheet')).toBeVisible();
  await expect(page.locator('#language-picker')).not.toHaveAttribute('open', '');
  await expect(page.locator('#language-seg')).toBeHidden();

  const switched = page.waitForEvent('load');
  await chooseLocale(page, 'es');
  await switched;

  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.locator('#daily-today')).toHaveText('Hoy');
  expect(await page.evaluate(() => localStorage.getItem('sixfold.locale.v1'))).toBe('es');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.locator('#daily-today')).toHaveText('Hoy');

  await page.locator('#appearance').click();
  await expect(page.locator('#sheet')).toBeVisible();
  await expect(page.locator('[data-locale="es"]')).toHaveAttribute('aria-pressed', 'true');
});

test('language switch back to English survives a reload', async ({ page }) => {
  // Seed Spanish once. addInitScript re-runs on every navigation and would
  // overwrite the English choice that this test is verifying.
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('sixfold.locale.v1', 'es'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await page.locator('#appearance').click();
  await expect(page.locator('#sheet')).toBeVisible();

  const switched = page.waitForEvent('load');
  await chooseLocale(page, 'en');
  await switched;

  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#daily-today')).toHaveText('Today');
  expect(await page.evaluate(() => localStorage.getItem('sixfold.locale.v1'))).toBe('en');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#daily-today')).toHaveText('Today');

  await page.locator('#appearance').click();
  await expect(page.locator('#sheet')).toBeVisible();
  await expect(page.locator('[data-locale="en"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-locale="es"]')).toHaveAttribute('aria-pressed', 'false');
});

test('every added language switches from settings and persists', async ({ page }) => {
  // Every added locale, each with a full reload in and out of the picker.
  test.setTimeout(180000);
  await page.goto('/');
  for (const locale of LOCALES.filter((code) => code !== 'en')) {
    await expect(page.locator('#boot-splash')).toBeHidden();
    await page.locator('#appearance').click();
    await expect(page.locator('#sheet')).toBeVisible();
    const switched = page.waitForEvent('load');
    await chooseLocale(page, locale);
    await switched;
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    const today = await page.evaluate(() => SixfoldI18n.t('Today'));
    await expect(page.locator('#daily-today')).toHaveText(today);
    expect(await page.evaluate(() => localStorage.getItem('sixfold.locale.v1'))).toBe(locale);

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('#daily-today')).toHaveText(today);
    await expect(page.locator('#boot-splash')).toBeHidden();
    await page.locator('#appearance').click();
    await expect(page.locator('[data-locale="' + locale + '"]')).toHaveAttribute('aria-pressed', 'true');

    const reset = page.waitForEvent('load');
    await chooseLocale(page, 'en');
    await reset;
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    expect(await page.evaluate(() => localStorage.getItem('sixfold.locale.v1'))).toBe('en');
  }
});

test('first visit loads only the active language catalog', async ({ page }) => {
  const catalogs = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (/\/i18n-(fr|de|zh-hans|zh-hant|ja|ko|pt-br|hi|kn|ar)\.js$/.test(url.pathname)) catalogs.push(url.pathname);
  });
  await page.addInitScript(() => localStorage.setItem('sixfold.locale.v1', 'fr'));
  await page.goto('/');
  await page.waitForFunction(() => window.SixfoldI18n && document.documentElement.lang === 'fr');
  await expect.poll(() => catalogs.slice()).toEqual(['/i18n/i18n-fr.js']);
});

test.describe('service worker locale cache', () => {
  test.use({ serviceWorkers: 'allow' });

  test('installs without unused catalogs and warms only the active pack', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('sixfold.locale.v1', 'fr'));
    await page.goto('/');
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller);

    const cachedLocaleFiles = () => page.evaluate(async () => {
      const files = [];
      for (const name of (await caches.keys()).filter((value) => value.startsWith('sixfold-'))) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          const path = new URL(request.url).pathname;
          if (/^\/i18n\/i18n-(?!locale\.js$|js$)/.test(path)) files.push(path);
        }
      }
      return [...new Set(files)].sort();
    });

    await expect.poll(cachedLocaleFiles).toEqual(['/i18n/i18n-fr.js', '/i18n/i18n-patterns.js']);
  });

  test('a new worker prunes stale versioned assets', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('sixfold.locale.v1', 'fr'));
    await page.goto('/');
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller);
    const currentLocaleVersion = await page.evaluate(() => window.SixfoldLocale.VERSION);

    await page.evaluate(async (version) => {
      const name = (await caches.keys()).find((value) => value.startsWith('sixfold-'));
      if (!name) throw new Error('No Sixfold cache');
      const cache = await caches.open(name);
      await cache.put(new Request('/css/home.css?v=4.0.0-w10'), new Response('stale css'));
      await cache.put(new Request('/i18n/i18n-fr.js?v=4.0.0'), new Response('stale catalog'));
      await cache.put(new Request('/wordle-locales/fr.js?v=4.0.0'), new Response('stale wordle pack'));
      await cache.put(new Request('/i18n/i18n-fr.js?v=' + version), new Response('current catalog'));
    }, currentLocaleVersion);

    await page.evaluate(async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    });
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller);

    const cachedPaths = () => page.evaluate(async () => {
      const paths = [];
      for (const name of (await caches.keys()).filter((value) => value.startsWith('sixfold-'))) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          const url = new URL(request.url);
          paths.push(url.pathname + url.search);
        }
      }
      return paths;
    });

    await expect.poll(async () => {
      const paths = await cachedPaths();
      return paths.includes('/css/home.css?v=4.0.0-w10') ||
        paths.includes('/i18n/i18n-fr.js?v=4.0.0') ||
        paths.includes('/wordle-locales/fr.js?v=4.0.0');
    }).toBe(false);

    const paths = await cachedPaths();
    expect(paths).toContain('/index.html');
    expect(paths).toContain('/i18n/i18n-fr.js?v=' + currentLocaleVersion);
  });

  test('runtime caching stays an allowlist and within its entry budget', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller);

    const probe = '/splash/ios-640x1136-light.png?probe=' + Date.now();
    await page.evaluate(async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Probe asset is missing');
      await response.blob();
    }, probe);
    await page.waitForTimeout(400);

    const paths = await page.evaluate(async () => {
      const paths = [];
      for (const name of (await caches.keys()).filter((value) => value.startsWith('sixfold-'))) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          const url = new URL(request.url);
          paths.push(url.pathname + url.search);
        }
      }
      return paths;
    });

    expect(paths.some((entry) => entry.indexOf('?probe=') !== -1)).toBe(false);
    expect(paths.length).toBeLessThanOrEqual(SHELL_ENTRIES + 13);
  });

  test('keeps only the selected script face', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('sixfold.locale.v1', 'ja'));
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller);

    const scriptFonts = () => page.evaluate(async () => {
      const fonts = [];
      for (const name of (await caches.keys()).filter((value) => value.startsWith('sixfold-'))) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          const pathname = new URL(request.url).pathname;
          if (pathname.indexOf('/fonts/sixfold-') === 0) fonts.push(pathname);
        }
      }
      return [...new Set(fonts)].sort();
    });

    await expect.poll(scriptFonts).toEqual(['/fonts/sixfold-jp.woff2']);

    // The picker renders every language name; those font downloads must not
    // turn into offline cache entries for a Japanese reader.
    await page.locator('#appearance').click();
    await page.locator('#language-picker summary').click();
    await page.waitForTimeout(500);
    await expect.poll(scriptFonts).toEqual(['/fonts/sixfold-jp.woff2']);

    await page.evaluate(() => localStorage.setItem('sixfold.locale.v1', 'en'));
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller);
    await expect.poll(scriptFonts).toEqual([]);
  });

  test('caches the selected script face on a first visit', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('sixfold.locale.v1', 'ja'));
    await page.goto('/');
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller);

    const scriptFonts = () => page.evaluate(async () => {
      const fonts = [];
      for (const name of (await caches.keys()).filter((value) => value.startsWith('sixfold-'))) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          const pathname = new URL(request.url).pathname;
          if (pathname.indexOf('/fonts/sixfold-') === 0) fonts.push(pathname);
        }
      }
      return [...new Set(fonts)].sort();
    });

    await expect.poll(scriptFonts).toEqual(['/fonts/sixfold-jp.woff2']);
    await page.context().setOffline(true);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
    await expect.poll(scriptFonts).toEqual(['/fonts/sixfold-jp.woff2']);
  });

  test('a failed shell install leaves the live cache unchanged', async ({ page, context }) => {
    await page.goto('/');
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller);
    const cachedPaths = () => page.evaluate(async () => {
      const paths = [];
      for (const name of (await caches.keys()).filter((value) => value.startsWith('sixfold-'))) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          const url = new URL(request.url);
          paths.push(url.pathname + url.search);
        }
      }
      return paths.sort();
    });
    const before = await cachedPaths();

    await context.route('**/css/home.css*', (route) => route.abort());
    await page.evaluate(async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    });
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});

    await expect.poll(() => page.evaluate(async () => {
      return Boolean(await navigator.serviceWorker.getRegistration());
    })).toBe(false);
    const after = await cachedPaths();
    const cacheNames = await page.evaluate(async () => {
      return (await caches.keys()).filter((value) => value.startsWith('sixfold-'));
    });
    expect(after).toEqual(before);
    expect(cacheNames.some((name) => name.endsWith('-install'))).toBe(false);
  });

  test('trims an oversized runtime entry', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller);

    const manifest = '/manifest.webmanifest?v=6.0.41';
    const cached = (url) => page.evaluate(async (target) => {
      for (const name of (await caches.keys()).filter((value) => value.startsWith('sixfold-'))) {
        const cache = await caches.open(name);
        if (await cache.match(target)) return true;
      }
      return false;
    }, url);

    await page.evaluate(async (url) => {
      const name = (await caches.keys()).find((value) => value.startsWith('sixfold-'));
      if (!name) throw new Error('No Sixfold cache');
      const cache = await caches.open(name);
      await cache.put(new Request(url), new Response('x'.repeat(2.5 * 1024 * 1024)));
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration || !registration.active) throw new Error('No active worker');
      registration.active.postMessage({ type: 'sixfold-active-locale', locale: 'en' });
    }, manifest);

    await expect.poll(() => cached(manifest)).toBe(false);
  });

  test('an install leaves no staging cache behind', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller);
    const stagingName = await page.evaluate(async () => {
      const name = (await caches.keys()).find((value) => value.startsWith('sixfold-'));
      if (!name) throw new Error('No Sixfold cache');
      const staging = name + '-install';
      const cache = await caches.open(staging);
      await cache.put('/staging-probe.js', new Response('probe'));
      return staging;
    });

    await page.evaluate(async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    });
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller);

    await expect.poll(() => page.evaluate(async (name) => (await caches.keys()).includes(name), stagingName)).toBe(false);
  });
});

test('Water Sort pour effects use a real light tint', async ({ page }) => {
  await page.goto('/#water');
  await page.waitForSelector('#water-tubes .water-tube');

  const colours = await page.evaluate(() => {
    const tubes = document.querySelectorAll('#water-tubes .water-tube');
    tubes[0].click();
    tubes[3].click();
    const ring = document.querySelector('.water-pour-ring');
    const drop = document.querySelector('.water-pour-drop');
    return {
      ring: ring && ring.getAttribute('stroke'),
      drop: drop && drop.getAttribute('fill')
    };
  });

  // A missing light tone used to become the literal SVG attribute "undefined",
  // so the splash ring and droplets painted with no colour at all.
  expect(colours.ring).toMatch(/^#[0-9a-f]{6}$/i);
  expect(colours.drop).toMatch(/^#[0-9a-f]{6}$/i);
});

test('an in-progress daily Sudoku resumes after a reload', async ({ page }) => {
  await page.goto('/#sudoku');
  await page.waitForSelector('#sudoku-board .sudoku-cell');
  await page.waitForFunction(() => window.SixfoldSudoku);
  await page.evaluate(() => window.SixfoldSudoku.startDaily('2026-11-21'));
  await page.waitForFunction(() => {
    const cells = Array.from(document.querySelectorAll('#sudoku-board .sudoku-cell'));
    return window.SixfoldSudoku.currentDaily() === '2026-11-21' &&
      cells.length === 81 && cells.some((cell) => cell.textContent.trim());
  });

  await page.reload();
  await page.waitForSelector('#sudoku-board .sudoku-cell');
  await expect.poll(() => page.evaluate(() => window.SixfoldSudoku.currentDaily())).toBe('2026-11-21');
});

test('finishing the sixth game of a week announces Perfect six', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const start = window.SixfoldDaily.weekStartKey(window.SixfoldDaily.todayKey());
    const days = {};
    days[start] = { games: { merge: true, sudoku: true, ttt: true, mines: true, water: true } };
    localStorage.setItem('sixfold.daily.v1', JSON.stringify({ days, best: 0 }));
  });
  await page.reload();
  await page.waitForFunction(() => window.SixfoldDaily);

  const result = await page.evaluate(() => {
    const ok = window.SixfoldDaily.complete('fruit', null, window.SixfoldDaily.todayKey());
    return {
      ok: ok,
      weekly: window.SixfoldDaily.weeklyBadge(),
      pulse: document.getElementById('daily-badge').classList.contains('is-new')
    };
  });

  expect(result.ok).toBe(true);
  expect(result.weekly).toBe(true);
  // The completion itself used to be counted before the "previous" week was
  // read, which made this branch unreachable on the sixth game.
  expect(result.pulse, 'the weekly badge is celebrated').toBe(true);
});

test('Sudoku hint places the digit it announces after a wrong entry', async ({ page }) => {
  const solution = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'.split('').map(Number);
  const puzzle = '530070000600195000098000060800060003400803001700020006060000280000419005000080079'.split('').map(Number);
  const grid = puzzle.slice();
  // Cell 3 needs 6 and has candidates {2,6}. Put 6 in empty cell 2 on the same
  // row: a hint built from the current grid sees cell 3 as a naked 2, while
  // applying it writes the solution 6. That mismatch is the regression.
  grid[2] = 6;
  await page.addInitScript((state) => {
    localStorage.setItem('sixfold.sudoku.state.v1', JSON.stringify(state));
  }, {
    puzzle: puzzle,
    solution: solution,
    grid: grid,
    notes: new Array(81).fill(0),
    difficulty: 'easy',
    elapsed: 0,
    hints: 0,
    mistakes: 0,
    solved: false
  });

  await page.goto('/#sudoku');
  await page.waitForSelector('#sudoku-board .sudoku-cell');
  // The first-visit coach sits in the same feedback slot as the hint panel.
  const skipCoach = page.locator('#sudoku .coach-skip');
  if (await skipCoach.isVisible()) await skipCoach.click();
  await expect(page.locator('.sudoku-cell[data-index="2"]')).toHaveText('6');
  await expect(page.locator('.sudoku-cell[data-index="3"]')).toHaveText('');

  await page.locator('.sudoku-cell[data-index="3"]').click();
  await page.locator('#sudoku-hint').click();
  await expect(page.locator('#sudoku-hint-panel')).toBeVisible();

  const targetIndex = await page.evaluate(() =>
    Number(document.querySelector('#sudoku-board .sudoku-cell.is-selected').dataset.index));
  const announced = Number((await page.locator('#sudoku-hint-place').innerText()).match(/\d+/)[0]);
  await page.locator('#sudoku-hint-place').click();
  const placed = Number((await page.locator('.sudoku-cell[data-index="' + targetIndex + '"]').innerText()).trim());

  expect(placed, 'the hint must place the digit it just announced').toBe(announced);
});

test('Fruit Merge stops its frame loop after a moving game over', async ({ page }) => {
  await page.goto('/?fruit-loop-test=1#fruit');
  await page.waitForSelector('body[data-screen="fruit"]');
  await page.waitForFunction(() => window.__sixfoldFruitTest);

  const started = await page.evaluate(() => window.__sixfoldFruitTest.finishWithMovingFruit());
  expect(started.over).toBe(true);
  expect(started.running, 'the frame loop is running before it is expected to stop').toBe(true);
  expect(started.maxSpeed, 'the frozen fruit is still above the rest threshold').toBeGreaterThan(4);

  await expect.poll(() => page.evaluate(() => window.__sixfoldFruitTest.state().running)).toBe(false);
});
