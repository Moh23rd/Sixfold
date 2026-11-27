const { test, expect } = require('@playwright/test');
const { chooseLocale } = require('./helpers');

const BASE = 'http://127.0.0.1:8000';
const KEY = 'sixfold.locale.v1';
const EXPLICIT = 'sixfold.locale.explicit.v1';

function storageState(entries = {}) {
  return {
    cookies: [],
    origins: [{
      origin: BASE,
      localStorage: [
        { name: 'sixfold.welcome.v1', value: '1' },
        ...Object.entries(entries).map(([name, value]) => ({ name, value }))
      ]
    }]
  };
}

async function open(browser, { locale, entries = {} } = {}) {
  const context = await browser.newContext({
    baseURL: BASE,
    locale,
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
    storageState: storageState(entries)
  });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('#boot-splash')).toBeHidden();
  await expect(page.locator('html')).toHaveClass(/home-ready/);
  // The favicon is static; language selection must not rewrite these links.
  await expect(page.locator('link[rel="icon"][sizes="192x192"]'))
    .toHaveAttribute('href', 'icons/icon-192.png?v=6.0.2');
  await expect(page.locator('link[rel="apple-touch-icon"]'))
    .toHaveAttribute('href', 'icons/icon-180.png?v=6.0.2');
  expect(await page.locator('html').getAttribute('data-icon')).toBeNull();
  return { context, page };
}

test('a fresh install takes the phone language and does not freeze it', async ({ browser }) => {
  const { context, page } = await open(browser, { locale: 'ar-EG' });
  try {
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBeNull();
  } finally {
    await context.close();
  }
});

for (const [device, lang, dir] of [
  ['hi-IN', 'hi', 'ltr'],
  ['kn-IN', 'kn', 'ltr'],
  ['zh-TW', 'zh-Hant', 'ltr'],
  ['zh-CN', 'zh-Hans', 'ltr'],
  ['ja-JP', 'ja', 'ltr'],
  ['ko-KR', 'ko', 'ltr'],
  ['de-AT', 'de', 'ltr'],
  ['pt-PT', 'pt-BR', 'ltr']
]) {
  test('device ' + device + ' resolves to ' + lang, async ({ browser }) => {
    const { context, page } = await open(browser, { locale: device });
    try {
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.locator('html')).toHaveAttribute('dir', dir);
      expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBeNull();
    } finally {
      await context.close();
    }
  });
}

test('a legacy auto-saved locale is migrated back to the phone', async ({ browser }) => {
  const { context, page } = await open(browser, { locale: 'ar-EG', entries: { [KEY]: 'ar' } });
  try {
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), KEY)).toBeNull();
  } finally {
    await context.close();
  }
});

test('an explicit picker choice survives a different phone language', async ({ browser }) => {
  const { context, page } = await open(browser, {
    locale: 'de-DE',
    entries: { [KEY]: 'fr', [EXPLICIT]: '1' }
  });
  try {
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe('fr');
  } finally {
    await context.close();
  }
});

test('the picker records an explicit choice', async ({ browser }) => {
  const { context, page } = await open(browser, { locale: 'en-US' });
  try {
    await page.locator('#appearance').click();
    await expect(page.locator('#sheet')).toBeVisible();
    const switched = page.waitForEvent('load');
    await chooseLocale(page, 'es');
    await switched;
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe('es');
    expect(await page.evaluate((key) => localStorage.getItem(key), EXPLICIT)).toBe('1');
  } finally {
    await context.close();
  }
});

test('a phone language change while open reloads into the new language', async ({ browser }) => {
  const { context, page } = await open(browser, { locale: 'en-US' });
  try {
    await page.addInitScript(() => {
      const forced = sessionStorage.getItem('sixfold.test.device');
      if (forced) {
        Object.defineProperty(navigator, 'languages', {
          configurable: true,
          get: () => [forced]
        });
      }
    });
    await page.evaluate(() => {
      sessionStorage.setItem('sixfold.test.device', 'fr-FR');
      Object.defineProperty(navigator, 'languages', {
        configurable: true,
        get: () => ['fr-FR']
      });
      window.dispatchEvent(new Event('languagechange'));
    });
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBeNull();
  } finally {
    await context.close();
  }
});

test('a phone language change does not override an explicit choice', async ({ browser }) => {
  const { context, page } = await open(browser, {
    locale: 'en-US',
    entries: { [KEY]: 'es', [EXPLICIT]: '1' }
  });
  try {
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'languages', {
        configurable: true,
        get: () => ['fr-FR']
      });
      window.dispatchEvent(new Event('languagechange'));
    });
    await page.waitForTimeout(400);
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe('es');
  } finally {
    await context.close();
  }
});
