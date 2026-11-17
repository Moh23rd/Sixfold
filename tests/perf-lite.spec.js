const { test, expect } = require('@playwright/test');

// The lite switch is decided by the inline script before the stylesheets
// arrive, so the first paint is already the version the phone keeps using.
// Device signals are overridden per context to stand in for real hardware.

async function withDevice(page, { memory, cores }) {
  await page.addInitScript(({ memory, cores }) => {
    Object.defineProperty(navigator, 'deviceMemory', { get: () => memory, configurable: true });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => cores, configurable: true });
  }, { memory, cores });
}

test('a phone with little memory gets the light paint path', async ({ page }) => {
  await withDevice(page, { memory: 2, cores: 8 });
  await page.goto('/');

  const state = await page.evaluate(() => ({
    lite: document.documentElement.classList.contains('perf-lite'),
    slices: Array.from(document.querySelectorAll('.progressive-blur--top > span'))
      .map((span) => getComputedStyle(span).display),
    bandHeight: document.querySelector('.progressive-blur--top').getBoundingClientRect().height,
    ticker: getComputedStyle(document.querySelector('.home-ticker-track')).animationName
  }));

  expect(state.lite).toBe(true);
  // The band keeps its geometry but is painted as one surface instead of
  // three masked backdrop filters.
  expect(state.slices).toEqual(['none', 'none', 'none']);
  expect(state.bandHeight).toBeGreaterThan(0);
  expect(state.ticker).toBe('none');
});

test('a capable phone keeps the blurred band', async ({ page }) => {
  await withDevice(page, { memory: 8, cores: 8 });
  await page.goto('/');

  const state = await page.evaluate(() => {
    const slice = document.querySelector('.progressive-blur--top > span');
    return {
      lite: document.documentElement.classList.contains('perf-lite'),
      display: getComputedStyle(slice).display,
      blur: getComputedStyle(slice).webkitBackdropFilter || getComputedStyle(slice).backdropFilter
    };
  });

  expect(state.lite).toBe(false);
  expect(state.display).not.toBe('none');
  expect(state.blur).toContain('blur');
});

test('the query string can force either mode for testing', async ({ page }) => {
  await withDevice(page, { memory: 8, cores: 8 });
  await page.goto('/?perf=lite');
  expect(await page.evaluate(() => document.documentElement.classList.contains('perf-lite'))).toBe(true);

  await page.goto('/?perf=full');
  expect(await page.evaluate(() => document.documentElement.classList.contains('perf-lite'))).toBe(false);
});

test('reduced motion stops the tape', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await withDevice(page, { memory: 8, cores: 8 });
  await page.goto('/');

  const state = await page.evaluate(() => ({
    lite: document.documentElement.classList.contains('perf-lite'),
    ticker: getComputedStyle(document.querySelector('.home-ticker-track')).animationName
  }));

  expect(state.lite).toBe(false);
  expect(state.ticker).toBe('none');
});
