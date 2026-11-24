const { test, expect } = require('@playwright/test');

// The hub's fullscreen toggle is browser chrome the APK does not need: the
// edge-to-edge shell and an installed app already own the whole screen. It was
// lost once when the shell moved edge-to-edge, so this pins the wiring: a tap
// asks the document to go fullscreen, the button follows the browser's state
// rather than the tap, and the second tap exits.

async function openHub(page) {
  await page.goto('/');
  await page.waitForSelector('#daily');
  await page.waitForFunction(() => document.documentElement.classList.contains('home-ready'));
}

test('the hub fullscreen toggle enters and leaves fullscreen', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await openHub(page);

  const toggle = page.locator('#home-focus-toggle');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle.locator('.focus-enter')).toBeVisible();

  await toggle.click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle.locator('.focus-exit')).toBeVisible();

  await toggle.click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle.locator('.focus-enter')).toBeVisible();

  expect(errors, 'the toggle raised no page error').toEqual([]);
});

test('the native shell does not offer a redundant fullscreen toggle', async ({ page }) => {
  // The APK draws the page edge to edge; there is no browser chrome to remove.
  await page.addInitScript(() => {
    window.Capacitor = { isNativePlatform: () => true };
  });
  await openHub(page);

  await expect(page.locator('#home-focus-toggle')).toBeHidden();
});

test('an installed app does not offer a redundant fullscreen toggle', async ({ page }) => {
  // A PWA opened from its icon is already in standalone display mode.
  await page.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = function (query) {
      if (/display-mode:\s*(standalone|fullscreen)/.test(String(query))) {
        return {
          matches: true,
          media: String(query),
          onchange: null,
          addListener: function () {},
          removeListener: function () {},
          addEventListener: function () {},
          removeEventListener: function () {},
          dispatchEvent: function () { return false; }
        };
      }
      return real(query);
    };
  });
  await openHub(page);

  await expect(page.locator('#home-focus-toggle')).toBeHidden();
});
