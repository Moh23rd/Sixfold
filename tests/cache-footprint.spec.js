const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const SW_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

function workerConstant(name) {
  const match = SW_SOURCE.match(new RegExp('const ' + name + " = '([^']+)'"));
  if (!match) throw new Error('Could not read ' + name + ' from sw.js');
  return match[1];
}

const I18N_VERSION = workerConstant('I18N_CODE');
const WORDLE_VERSION = workerConstant('WORDLE_CODE');
const FONT_VERSION = workerConstant('LOCALE_FONT');

// The shell is about 1.40 MiB. The largest localized install is Arabic at
// roughly 1.70 MiB; 2 MiB leaves room for normal asset updates but fails
// before another script face or dictionary can silently double storage.
const MAX_LOCALE_BYTES = 2 * 1024 * 1024;

const LOCALES = [
  { code: 'en', catalog: false, dictionary: null, faces: [] },
  { code: 'es', catalog: false, dictionary: 'es.js', faces: [] },
  { code: 'fr', catalog: true, dictionary: 'fr.js', faces: [] },
  { code: 'de', catalog: true, dictionary: 'de.js', faces: [] },
  { code: 'zh-Hans', catalog: true, dictionary: 'zh-Hans.js', faces: ['sixfold-sc.woff2'] },
  { code: 'zh-Hant', catalog: true, dictionary: 'zh-Hant.js', faces: ['sixfold-tc.woff2'] },
  { code: 'ja', catalog: true, dictionary: 'ja.js', faces: ['sixfold-jp.woff2'] },
  { code: 'ko', catalog: true, dictionary: 'ko.js', faces: ['sixfold-kr.woff2'] },
  { code: 'pt-BR', catalog: true, dictionary: 'pt-BR.js', faces: [] },
  { code: 'hi', catalog: true, dictionary: 'hi.js', faces: ['sixfold-devanagari.woff2', 'sixfold-devanagari-digits.woff2'] },
  { code: 'kn', catalog: true, dictionary: 'kn.js', faces: ['sixfold-kannada.woff2'] },
  { code: 'ar', catalog: true, dictionary: 'ar.js', faces: ['sixfold-arabic.woff2', 'sixfold-arabic-digits.woff2'] }
];

function activeAssets(locale) {
  const assets = [];
  if (locale.catalog) {
    assets.push({ path: 'i18n/i18n-patterns.js?v=' + I18N_VERSION, face: false });
    assets.push({ path: 'i18n/i18n-' + locale.code.toLowerCase() + '.js?v=' + I18N_VERSION, face: false });
  }
  if (locale.dictionary) {
    assets.push({ path: 'wordle-locales/' + locale.dictionary + '?v=' + WORDLE_VERSION, face: false });
  }
  for (const face of locale.faces) {
    assets.push({ path: 'fonts/' + face + '?v=' + FONT_VERSION, face: true });
  }
  return assets;
}

test('records the installed Cache Storage footprint for all twelve locales', async ({ browser }, testInfo) => {
  // Twelve isolated installs, each with a worker install and a few warm fetches.
  test.setTimeout(120000);
  const baseURL = testInfo.project.use.baseURL;
  const footprints = [];

  for (const locale of LOCALES) {
    const context = await browser.newContext({ serviceWorkers: 'allow' });
    const page = await context.newPage();
    try {
      await page.addInitScript((code) => localStorage.setItem('sixfold.locale.v1', code), locale.code);
      await page.goto(baseURL, { waitUntil: 'load' });
      await page.waitForFunction(
        () => !!(navigator.serviceWorker && navigator.serviceWorker.controller),
        null,
        { timeout: 30000 }
      );

      // The page announces its locale on first control. Wait for that marker
      // before warming, otherwise the worker could prune the newly cached
      // catalog or face as inactive.
      await expect
        .poll(() => page.evaluate(async () => {
          const registration = await navigator.serviceWorker.getRegistration();
          const name = (await caches.keys()).find((value) => value.startsWith('sixfold-') && !value.endsWith('-install'));
          if (!name) return '';
          const cache = await caches.open(name);
          const response = await cache.match(new URL('__sixfold-active-locale', registration.scope).href);
          return response ? (await response.text()).trim() : '';
        }), { timeout: 20000 })
        .toBe(locale.code);

      const assets = activeAssets(locale);

      // Warm exactly the assets this locale needs offline. This is the same
      // set i18n.js and the Wordle loader fetch after the worker takes control,
      // but explicit warming keeps the measurement independent of idle timing.
      await page.evaluate(async (entries) => {
        for (const entry of entries) {
          const response = await fetch(entry.path, {
            cache: 'reload',
            headers: entry.face ? { 'X-Sixfold-Active-Face': '1' } : {}
          });
          if (!response.ok) throw new Error('Could not fetch ' + entry.path + ': ' + response.status);
          await response.blob();
        }
      }, assets);

      const assetURLs = await page.evaluate((entries) => entries.map((entry) => new URL(entry.path, location.href).href), assets);
      await expect.poll(() => page.evaluate(async (urls) => {
        const name = (await caches.keys()).find((value) => value.startsWith('sixfold-') && !value.endsWith('-install'));
        if (!name) return false;
        const cache = await caches.open(name);
        for (const url of urls) {
          if (!(await cache.match(url))) return false;
        }
        return true;
      }, assetURLs), { timeout: 20000 }).toBe(true);

      const footprint = await page.evaluate(async () => {
        const names = (await caches.keys()).filter((name) => name.startsWith('sixfold-'));
        const entries = [];
        for (const name of names) {
          const cache = await caches.open(name);
          for (const request of await cache.keys()) {
            const response = await cache.match(request);
            const url = new URL(request.url);
            let bytes = 0;
            if (response) {
              try { bytes = (await response.clone().blob()).size; } catch (err) {}
            }
            let kind = 'shell';
            if (url.pathname.endsWith('/__sixfold-active-locale')) kind = 'marker';
            else if (/\/i18n\/i18n-(?!locale\.js$|js$)/.test(url.pathname) || /\/i18n\/i18n-patterns\.js$/.test(url.pathname)) kind = 'catalog';
            else if (/\/wordle-locales\//.test(url.pathname)) kind = 'wordle';
            else if (/\/fonts\/sixfold-/.test(url.pathname)) kind = 'font';
            else if (/\/manifest(?:-dark)?\.webmanifest$/.test(url.pathname)) kind = 'manifest';
            entries.push({ path: url.pathname + url.search, kind, bytes });
          }
        }
        const byKind = {};
        for (const entry of entries) {
          byKind[entry.kind] = byKind[entry.kind] || { entries: 0, bytes: 0 };
          byKind[entry.kind].entries += 1;
          byKind[entry.kind].bytes += entry.bytes;
        }
        return {
          entries: entries.length,
          totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
          byKind
        };
      });

      footprints.push({
        locale: locale.code,
        totalBytes: footprint.totalBytes,
        entries: footprint.entries,
        byKind: footprint.byKind
      });
      console.log(
        '[cache footprint] ' + locale.code.padEnd(7) +
        (footprint.totalBytes / 1024).toFixed(1).padStart(8) + ' KiB' +
        '  ' + String(footprint.entries).padStart(2) + ' entries'
      );
    } finally {
      await context.close();
    }
  }

  const report = {
    measuredAt: new Date().toISOString(),
    maxLocaleBytes: MAX_LOCALE_BYTES,
    locales: footprints
  };
  console.log('[cache footprint] ceiling ' + (MAX_LOCALE_BYTES / 1024).toFixed(0) + ' KiB per locale');

  const reportPath = testInfo.outputPath('locale-cache-footprints.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  await testInfo.attach('locale-cache-footprints', {
    path: reportPath,
    contentType: 'application/json'
  });

  const overCeiling = footprints
    .filter((footprint) => footprint.totalBytes > MAX_LOCALE_BYTES)
    .map((footprint) => footprint.locale + ': ' + (footprint.totalBytes / 1024).toFixed(1) + ' KiB');
  expect(
    overCeiling,
    'Cache Storage exceeded the ' + (MAX_LOCALE_BYTES / 1024).toFixed(0) + ' KiB per-locale ceiling'
  ).toEqual([]);
});
