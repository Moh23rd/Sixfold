const { test, expect } = require('@playwright/test');
const { LANGUAGE_NAMES, expectNoClippedText } = require('./helpers');

// This spec is the one place that starts like a new install. The shared config
// seeds the welcome flag so the one-time sheet never covers another spec.
test.use({ storageState: { cookies: [], origins: [] } });

async function boot(page, { locale = 'en', seen = false } = {}) {
  await page.addInitScript(({ locale, seen }) => {
    localStorage.setItem('merge2048.theme', 'light');
    localStorage.setItem('sixfold.locale.v1', locale);
    if (seen) localStorage.setItem('sixfold.welcome.v1', '1');
  }, { locale, seen });
  await page.goto('/');
  await expect(page.locator('#boot-splash')).toBeHidden();
  await expect(page.locator('html')).toHaveClass(/home-ready/);
}

test('a fresh install is welcomed once', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);

  const welcome = page.locator('#welcome');
  await expect(welcome).toBeVisible();
  await expect(page.locator('.welcome-steps li')).toHaveCount(3);
  // The primary action receives focus, not the small Skip in the corner.
  await expect(page.locator('#welcome-start')).toBeFocused();

  await page.locator('#welcome-start').click();
  await expect(welcome).toBeHidden();
  // Closing hands the reader to the collection.
  await expect(page.locator('.home-game').first()).toBeFocused();

  await page.reload();
  await expect(page.locator('#boot-splash')).toBeHidden();
  await expect(page.locator('#welcome')).toBeHidden();
});

// The hardware back gesture closes the guide, so it has to record the same
// thing the Skip button does; otherwise the guide is back on the next launch.
test('back records the guide as seen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  const welcome = page.locator('#welcome');
  await expect(welcome).toBeVisible();

  const handled = await page.evaluate(() => {
    const event = new CustomEvent('sixfold:back', { cancelable: true });
    document.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(handled, 'the guide answers back').toBe(true);
  await expect(welcome).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('sixfold.welcome.v1'))).toBe('1');

  await page.reload();
  await expect(page.locator('#boot-splash')).toBeHidden();
  await expect(page.locator('#welcome')).toBeHidden();
});

test('the guide can be replayed from Look & feel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page, { seen: true });
  await expect(page.locator('#welcome')).toBeHidden();

  await page.locator('#appearance').click();
  await expect(page.locator('#sheet')).toBeVisible();
  await page.locator('#welcome-open').click();

  await expect(page.locator('#welcome')).toBeVisible();
  await expect(page.locator('#welcome-title')).toBeVisible();
});

test('the welcome is translated and fits 320px in German', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await boot(page, { locale: 'de' });

  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.locator('#welcome-title')).toHaveText('Willkommen bei Sixfold');
  await expect(page.locator('#welcome .sheet-done')).toHaveText('Überspringen');
  await expectNoClippedText(page, 'German welcome at 320px', '#welcome');
  await expect(page.locator('#welcome-start')).toBeVisible();
});

for (const locale of ['ar', 'ja']) {
  test('the welcome fits 320px in ' + LANGUAGE_NAMES[locale], async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await boot(page, { locale });
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('#welcome')).toBeVisible();
    await expectNoClippedText(page, LANGUAGE_NAMES[locale] + ' welcome at 320px', '#welcome');
    await expect(page.locator('#welcome-start')).toBeVisible();
  });
}
