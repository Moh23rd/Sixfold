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

// The tape is the one thing on the hub that animates forever, so it has to stop
// on the first signal that the app is leaving, not on visibilitychange, which
// the Android shell only delivers once the window is already gone.
async function tape(page) {
  return page.evaluate(() => ({
    away: document.documentElement.classList.contains('is-app-hidden'),
    play: getComputedStyle(document.querySelector('.home-ticker-track')).animationPlayState,
    visibility: document.visibilityState
  }));
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

test('a four-core desktop keeps the full paint path', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await withDevice(page, { memory: 4, cores: 4 });
  await page.goto('/');

  const state = await page.evaluate(() => ({
    lite: document.documentElement.classList.contains('perf-lite'),
    ticker: getComputedStyle(document.querySelector('.home-ticker-track')).animationName
  }));

  // Four gigabytes and four cores read as a budget phone only when the
  // pointer or viewport is actually phone-shaped.
  expect(state.lite).toBe(false);
  expect(state.ticker).not.toBe('none');
});

test('the query string can force either mode for testing', async ({ page }) => {
  await withDevice(page, { memory: 8, cores: 8 });
  await page.goto('/?perf=lite');
  expect(await page.evaluate(() => document.documentElement.classList.contains('perf-lite'))).toBe(true);

  await page.goto('/?perf=full');
  expect(await page.evaluate(() => document.documentElement.classList.contains('perf-lite'))).toBe(false);
});

test('the lite sheet uses a readable solid scrim instead of a blur', async ({ page }) => {
  await withDevice(page, { memory: 2, cores: 8 });
  await page.goto('/');
  await page.locator('#hub-about').click();

  const backdrop = await page.locator('#about .sheet-backdrop').evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      filter: style.webkitBackdropFilter || style.backdropFilter,
      background: style.backgroundColor
    };
  });

  expect(backdrop.filter).toBe('none');
  expect(backdrop.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(backdrop.background).toContain('0.96');
});

test('reduced motion stops the tape', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Full is the page default now; System is the choice that follows the device.
  await page.addInitScript(() => {
    localStorage.setItem('sixfold.settings.v1', JSON.stringify({ motion: 'system' }));
  });
  await withDevice(page, { memory: 8, cores: 8 });
  await page.goto('/');

  const state = await page.evaluate(() => ({
    lite: document.documentElement.classList.contains('perf-lite'),
    ticker: getComputedStyle(document.querySelector('.home-ticker-track')).animationName
  }));

  expect(state.lite).toBe(false);
  expect(state.ticker).toBe('none');
});

test('blur stops the tape while the page is still visible', async ({ page }) => {
  await withDevice(page, { memory: 8, cores: 8 });
  await page.goto('/');
  expect((await tape(page)).play).toBe('running');

  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const leaving = await tape(page);
  // The recents gesture starts compositing the hub before the WebView admits
  // the page is hidden, so blur on its own has to be enough.
  expect(leaving.visibility).toBe('visible');
  expect(leaving.away).toBe(true);
  expect(leaving.play).toBe('paused');

  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  expect((await tape(page)).play).toBe('running');
});

test("the shell's appStateChange stops the tape with no DOM signal", async ({ page }) => {
  await withDevice(page, { memory: 8, cores: 8 });
  await page.addInitScript(() => {
    const handlers = {};
    window.__appState = (isActive) => {
      if (handlers.appStateChange) handlers.appStateChange({ isActive });
    };
    // Only the App plugin's event contract is stood up here; the web build of
    // the shell glue stays out of the way so nothing else is stubbed.
    window.Capacitor = {
      isNativePlatform: () => false,
      Plugins: {
        App: {
          addListener(event, handler) {
            handlers[event] = handler;
            return Promise.resolve({ remove() {} });
          }
        }
      }
    };
  });
  await page.goto('/');
  expect((await tape(page)).play).toBe('running');

  await page.evaluate(() => window.__appState(false));
  const paused = await tape(page);
  expect(paused.visibility).toBe('visible');
  expect(paused.play).toBe('paused');

  // A stray focus or pageshow cannot restart the tape while the shell still
  // says it is in the background.
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('pageshow'));
  });
  expect((await tape(page)).play).toBe('paused');

  // A tap means the shell is in front again, so a resume the bridge dropped
  // cannot leave the tape frozen for the rest of the session.
  await page.evaluate(() => {
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  });
  expect((await tape(page)).play).toBe('running');

  await page.evaluate(() => window.__appState(false));
  expect((await tape(page)).play).toBe('paused');

  await page.evaluate(() => window.__appState(true));
  expect((await tape(page)).play).toBe('running');
});
