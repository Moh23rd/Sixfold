const { test, expect } = require('@playwright/test');

// A theme or palette switch cross-fades the surfaces that paint a theme colour.
// The scope matters as much as the fade: the document head, the hidden screens
// and the components that own their own motion must be left exactly as they
// were, and the fade must end when the switch does.

async function openLook(page) {
  // `perf=full` keeps a low-memory CI runner on the same paint path a phone
  // with headroom uses; the light path switches without a fade by design and
  // has its own coverage in perf-lite.spec.js.
  await page.goto('/?perf=full');
  await page.waitForSelector('#daily');
  await page.waitForFunction(() => document.documentElement.classList.contains('home-ready'));
  await page.locator('#appearance').click();
  await expect(page.locator('#sheet')).toBeVisible();
}

function appearance(page) {
  return page.evaluate(() => {
    const html = getComputedStyle(document.documentElement);
    const sheet = getComputedStyle(document.getElementById('sheet'));
    const card = getComputedStyle(document.querySelector('.home-game'));
    const tab = getComputedStyle(document.querySelector('#theme-seg button'));
    return {
      fading: document.documentElement.classList.contains('is-theme-fading'),
      theme: document.documentElement.dataset.theme,
      page: html.getPropertyValue('--page').trim(),
      tile: html.getPropertyValue('--t8').trim(),
      cardBackground: card.backgroundColor,
      cardProperties: card.transitionProperty,
      cardDuration: card.transitionDuration,
      tabProperties: tab.transitionProperty,
      sheetProperties: sheet.transitionProperty,
      sheetDuration: sheet.transitionDuration
    };
  });
}

test('a theme switch fades the surfaces and then lets them rest', async ({ page }) => {
  await openLook(page);
  const before = await appearance(page);

  await page.locator('[data-theme-opt="dark"]').click();
  const during = await appearance(page);

  expect(during.fading, 'the switch raises the cross-fade flag').toBe(true);
  expect(during.theme).toBe('dark');
  expect(during.cardDuration).toBe('0.22s');
  expect(during.cardProperties).toContain('background-color');

  await page.waitForFunction(() => !document.documentElement.classList.contains('is-theme-fading'));
  const after = await appearance(page);
  expect(after.theme).toBe('dark');
  expect(after.page).not.toBe(before.page);
  expect(after.cardDuration).toBe(before.cardDuration);
  expect(after.cardProperties).toBe(before.cardProperties);
});

test('a surface is halfway between the themes a moment after the tap', async ({ page }) => {
  await openLook(page);
  const before = await appearance(page);

  const mid = await page.evaluate(async () => {
    document.querySelector('[data-theme-opt="dark"]').click();
    await new Promise((resolve) => setTimeout(resolve, 90));
    return getComputedStyle(document.querySelector('.home-game')).backgroundColor;
  });
  await page.waitForFunction(() => !document.documentElement.classList.contains('is-theme-fading'));
  const after = await appearance(page);

  // An interpolated colour is a colour of its own: neither the light card nor
  // the dark one, which is what makes the switch a fade rather than a cut.
  expect(mid).not.toBe(before.cardBackground);
  expect(mid).not.toBe(after.cardBackground);
});

test('the fade leaves closed surfaces and their motion alone', async ({ page }) => {
  await openLook(page);
  const before = await appearance(page);
  await page.locator('[data-theme-opt="dark"]').click();
  const during = await appearance(page);

  // The sheet's root keeps its own leave transition, because the fade never
  // names it. The card inside it is a surface and does fade.
  expect(during.sheetProperties).toBe(before.sheetProperties);
  expect(during.sheetDuration).toBe(before.sheetDuration);

  // The theme tabs keep the press motion they own; the fade adds colour to it
  // instead of replacing it.
  expect(during.tabProperties).toContain('transform');
  expect(during.cardProperties).toContain('transform');
  expect(during.cardProperties).toContain('box-shadow');
});

test('a palette switch fades the tiles with the page', async ({ page }) => {
  await openLook(page);
  const warm = await appearance(page);

  await page.locator('[data-palette-opt="ocean"]').click();
  const during = await appearance(page);

  expect(during.fading).toBe(true);
  expect(during.cardDuration).toBe('0.22s');
  expect(await page.evaluate(() => localStorage.getItem('merge2048.palette'))).toBe('ocean');

  await page.waitForFunction(() => !document.documentElement.classList.contains('is-theme-fading'));
  const ocean = await appearance(page);
  expect(ocean.page).not.toBe(warm.page);
  expect(ocean.tile).not.toBe(warm.tile);
  expect(ocean.cardProperties).toBe(warm.cardProperties);
});

test('reduced motion switches in one frame', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openLook(page);
  const before = await appearance(page);

  await page.locator('[data-theme-opt="dark"]').click();
  const state = await appearance(page);

  expect(state.theme).toBe('dark');
  expect(state.fading, 'calm motion never raises the flag').toBe(false);
  expect(state.cardProperties).toBe(before.cardProperties);
});

test('a second switch inside the fade re-arms one flag and clears it', async ({ page }) => {
  await openLook(page);
  const before = await appearance(page);

  // Both taps in one task: a switch that lands while the first fade is still
  // running must not leave a timer behind.
  await page.evaluate(() => {
    document.querySelector('[data-theme-opt="dark"]').click();
    document.querySelector('[data-theme-opt="light"]').click();
  });

  expect((await appearance(page)).theme).toBe('light');
  expect((await appearance(page)).fading).toBe(true);

  await page.waitForFunction(() => !document.documentElement.classList.contains('is-theme-fading'));
  const rest = await appearance(page);
  expect(rest.theme).toBe('light');
  expect(rest.cardProperties).toBe(before.cardProperties);
});

test('closing the sheet hands the motion back to the sheet', async ({ page }) => {
  await openLook(page);
  await page.locator('[data-theme-opt="dark"]').click();
  expect((await appearance(page)).fading).toBe(true);

  await page.locator('#sheet-done').click();
  const closing = await page.evaluate(() => ({
    fading: document.documentElement.classList.contains('is-theme-fading'),
    closing: document.getElementById('sheet').classList.contains('is-closing')
  }));

  expect(closing.fading, 'the leave animation is not left behind a fade').toBe(false);
  expect(closing.closing).toBe(true);
});
