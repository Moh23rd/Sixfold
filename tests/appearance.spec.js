const { test, expect } = require('@playwright/test');

// A theme or palette switch cross-fades the surfaces that paint a theme colour.
// A surface joins the fade by carrying [data-fade]; the scope matters as much
// as the fade: the document head, the hidden screens and the components that
// own their own motion must be left exactly as they were, and the fade must end
// when the switch does. The last test is the guard for that contract: any
// surface that repaints between appearances without opting in fails it.

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
      hubPromotion: getComputedStyle(document.getElementById('hub')).willChange,
      sheetPromotion: getComputedStyle(document.querySelector('.sheet-card')).willChange,
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

test('the native shell fades with its page surfaces promoted', async ({ page }) => {
  await openLook(page);
  // The Android WebView composites the faded surfaces separately, and a stale
  // layer leaves the page background at the previous appearance's colour. The
  // shell keeps the fade, and pairs it with a temporary opacity promotion on
  // the surfaces that own a full-page colour, so the compositor has to carry
  // the new raster. If the promotion ever stops covering a surface the shell
  // paints, this fails before the fade can leave it behind.
  await page.evaluate(() => {
    window.Capacitor = { isNativePlatform: () => true };
    document.documentElement.classList.add('is-native');
  });

  const before = await appearance(page);
  expect(before.hubPromotion, 'no promotion is held before the switch').not.toBe('opacity');
  await page.locator('[data-theme-opt="dark"]').click();
  const during = await appearance(page);
  expect(during.theme).toBe('dark');
  expect(during.fading, 'the native shell keeps the cross-fade').toBe(true);
  expect(during.hubPromotion, 'the hub is promoted for the switch').toBe('opacity');
  expect(during.sheetPromotion, 'the sheet card is promoted for the switch').toBe('opacity');

  await page.waitForFunction(() => !document.documentElement.classList.contains('is-theme-fading'));
  await page.waitForFunction(() =>
    getComputedStyle(document.getElementById('hub')).willChange !== 'opacity'
  );
  const after = await appearance(page);
  expect(after.page).not.toBe(before.page);
  expect(after.theme).toBe('dark');
  expect(after.hubPromotion, 'the promotion is dropped once the switch settles').not.toBe('opacity');
});

test('a native theme switch reports the surface without waiting for the bars', async ({ page }) => {
  // SystemBars.setStyle() rewrites the decor background from the theme's
  // windowBackground. The repair has to be queued behind that write, so the
  // report cannot wait for the bar call's promise to come back over the bridge:
  // that took up to a second on the emulator and left the strip on the launch
  // colour until it landed.
  await page.addInitScript(() => {
    const reported = [];
    window.__surfaces = reported;
    window.Capacitor = {
      isNativePlatform: () => true,
      Plugins: {
        // Never resolves: the report has to happen without it.
        SystemBars: { setStyle: () => new Promise(() => {}) },
        WindowSurface: {
          setColor: ({ color }) => {
            reported.push(color);
            return Promise.resolve();
          }
        }
      }
    };
  });
  await openLook(page);
  const before = await page.evaluate(() => window.__surfaces.length);

  await page.locator('[data-theme-opt="dark"]').click();
  await page.waitForFunction((count) => window.__surfaces.length > count, before);
  const state = await appearance(page);
  const calls = await page.evaluate(() => window.__surfaces.slice());

  expect(state.theme).toBe('dark');
  expect(calls.length, 'the switch reports the surface').toBeGreaterThan(before);
  expect(calls[calls.length - 1], 'the last report is the new page colour').toBe(state.page);
});

test('the surface report is queued behind the bar restyle, not behind a timer', async ({ page }) => {
  // SystemBars.setStyle() is what rewrites the decor background to the theme's
  // windowBackground, so the repair report has to reach native after it. The
  // switch does report the new page colour while it paints (before the bars are
  // restyled), and that report is the one the bar call overwrites; what matters
  // is the repair sent afterwards.
  //
  // The deadline is a microtask. Capacitor posts a plugin call from one, so the
  // stub queues setStyle the same way, and the tap queues one more microtask as
  // a sentinel. The repair has to land between them: made inline it overtakes
  // the bar call, and deferred to a timer it lands after the sentinel — which on
  // a phone is after a frame has already shown the launch colour.
  await page.addInitScript(() => {
    const calls = [];
    window.__bridge = calls;
    window.Capacitor = {
      isNativePlatform: () => true,
      Plugins: {
        SystemBars: {
          setStyle: () => {
            Promise.resolve().then(() => calls.push('SystemBars.setStyle'));
            // Never resolves: the answer coming back over the bridge is not
            // part of this ordering.
            return new Promise(() => {});
          }
        },
        WindowSurface: {
          setColor: ({ color }) => {
            calls.push('WindowSurface.setColor ' + color);
            return Promise.resolve();
          }
        }
      }
    };
  });
  await openLook(page);

  // Tap and arm the sentinel in one task: whatever the switch queues behind the
  // click runs before the sentinel, and anything it hands to a timer runs after.
  await page.evaluate(() => {
    window.__bridge.length = 0;
    document.querySelector('[data-theme-opt="dark"]').click();
    Promise.resolve().then(() => window.__bridge.push('sentinel'));
  });
  await page.waitForFunction(() => window.__bridge.includes('sentinel'));

  const calls = await page.evaluate(() => window.__bridge.slice());
  const bar = calls.indexOf('SystemBars.setStyle');
  const sentinel = calls.indexOf('sentinel');
  const report = calls.reduce(
    (last, call, index) => (call.startsWith('WindowSurface.setColor') ? index : last),
    -1
  );

  expect(bar, 'the switch restyles the bars').toBeGreaterThan(-1);
  expect(report, 'the switch reports the surface').toBeGreaterThan(-1);
  expect(report, 'the bar restyle is not the last write').toBeGreaterThan(bar);
  expect(sentinel, 'the sentinel runs after the tap').toBeGreaterThan(-1);
  expect(report, 'the repair report lands before the sentinel').toBeLessThan(sentinel);
  expect(calls[report], 'the repair report is the page colour').toMatch(
    /^WindowSurface\.setColor #[0-9a-f]{6}$/
  );
});

test('reduced motion switches in one frame', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openLook(page);
  // Full is the default now; choose Reduced explicitly.
  await page.locator('[data-motion-opt="reduced"]').click();
  const before = await appearance(page);

  await page.locator('[data-theme-opt="dark"]').click();
  const state = await appearance(page);

  expect(state.theme).toBe('dark');
  expect(state.fading, 'calm motion never raises the flag').toBe(false);
  expect(state.cardProperties).toBe(before.cardProperties);
});

/* The app used to hide every transition behind the device's reduced-motion
   query, so a machine with that setting opened with no motion at all and no
   way to get it back. Full is the default now; System follows the device live
   and Reduced is the explicit opt-out. */
test('Motion defaults to Full and System follows the device', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openLook(page);

  const read = () => page.evaluate(() => ({
    motion: document.documentElement.dataset.motion,
    ticker: getComputedStyle(document.querySelector('.home-ticker-track')).animationName,
    pressed: document.querySelector('[data-motion-opt="full"]').getAttribute('aria-pressed')
  }));

  const fresh = await read();
  expect(fresh.motion, 'a fresh install animates even when the device asks for less').toBe('full');
  expect(fresh.ticker, 'the tape runs on a fresh install').not.toBe('none');
  expect(fresh.pressed, 'Full is the default option').toBe('true');

  // System follows the device.
  await page.locator('[data-motion-opt="system"]').click();
  expect((await read()).motion).toBe('reduced');
  expect((await read()).ticker, 'the tape stops on a reduced-motion device').toBe('none');

  // An explicit Reduced survives a reload.
  await page.locator('[data-motion-opt="reduced"]').click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sixfold.settings.v1')).motion)).toBe('reduced');
  await page.reload();
  await page.waitForSelector('#daily');
  expect(await page.evaluate(() => document.documentElement.dataset.motion)).toBe('reduced');

  // Full overrides the device and persists.
  await page.locator('#appearance').click();
  await page.locator('[data-motion-opt="full"]').click();
  expect((await read()).motion).toBe('full');
  expect((await read()).ticker).not.toBe('none');

  // A live device change is followed on System.
  await page.locator('[data-motion-opt="system"]').click();
  expect((await read()).motion).toBe('reduced');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  expect((await read()).motion).toBe('full');
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

/* The opt-in list is only worth having if something notices when a surface
   forgets it. Load each screen in both appearances and compare what every
   element actually paints: an element whose background changes between them
   and has no [data-fade] on it (or above it) is a surface that would cut
   instead of fades. */
test('every surface that repaints between appearances opts into the fade', async ({ browser }) => {
  const screens = [
    { name: 'hub', hash: '', ready: '#daily' },
    { name: 'merge', hash: '#merge', ready: '#grid .cell' },
    { name: 'sudoku', hash: '#sudoku', ready: '#sudoku-board .sudoku-cell' },
    { name: 'ttt', hash: '#ttt', ready: '#ttt-board .ttt-cell' },
    { name: 'mines', hash: '#mines', ready: '#mines-board .mines-cell' },
    { name: 'water', hash: '#water', ready: '#water-tubes .water-tube' },
    { name: 'fruit', hash: '#fruit', ready: '#fruit-canvas' }
  ];

  async function painted(theme, screen) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce'
    });
    await context.addInitScript((value) => {
      try { localStorage.setItem('merge2048.theme', value); } catch (err) { /* ignore */ }
    }, theme);
    const page = await context.newPage();
    await page.goto('/?perf=full' + screen.hash);
    await page.waitForSelector(screen.ready);
    await page.waitForTimeout(250);
    const rows = await page.evaluate(() => {
      const visible = Array.from(document.querySelectorAll('body *')).filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && !el.closest('[hidden]');
      });
      return visible.map((el) => {
        const style = getComputedStyle(el);
        const cls = String(el.getAttribute('class') || '');
        return {
          cls: el.tagName.toLowerCase() + (cls ? '.' + cls.trim().split(/\s+/).join('.') : ''),
          paint: style.backgroundColor + '|' + style.backgroundImage,
          // The marker has to be on the surface itself: an ancestor's opt-in
          // would quietly cover every element added inside it.
          opted: el.hasAttribute('data-fade')
        };
      });
    });
    await context.close();
    return rows;
  }

  const misses = [];
  for (const screen of screens) {
    const light = await painted('light', screen);
    const dark = await painted('dark', screen);
    const count = Math.min(light.length, dark.length);
    for (let i = 0; i < count; i += 1) {
      if (light[i].paint === dark[i].paint) continue;
      if (light[i].opted || dark[i].opted) continue;
      misses.push(screen.name + ': ' + light[i].cls);
    }
  }

  expect(misses, 'these surfaces repaint between appearances without opting into the fade').toEqual([]);
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

test('the surface report is the page colour under high contrast', async ({ page }) => {
  await page.addInitScript(() => {
    const reported = [];
    window.__surfaces = reported;
    window.Capacitor = {
      isNativePlatform: () => true,
      Plugins: {
        SystemBars: { setStyle: () => Promise.resolve() },
        WindowSurface: {
          setColor: ({ color }) => {
            reported.push(color);
            return Promise.resolve();
          }
        }
      }
    };
  });
  await openLook(page);

  // High contrast replaces --page with pure white or black, and #000 has to be
  // expanded before it crosses the bridge. The report is read back from the
  // cascade, so the strip follows the page instead of the tinted base colour.
  const state = await page.evaluate(() => {
    window.SixfoldSettings.set('highContrast', true);
    document.querySelector('[data-theme-opt="dark"]').click();
    return {
      page: getComputedStyle(document.documentElement).getPropertyValue('--page').trim(),
      last: window.__surfaces[window.__surfaces.length - 1]
    };
  });

  expect(state.page).toBe('#000');
  expect(state.last, 'the last report is the high-contrast page itself').toBe('#000000');
});

test('a configuration change asks native for the page colour again', async ({ page }) => {
  await page.addInitScript(() => {
    const reported = [];
    window.__surfaces = reported;
    window.Capacitor = {
      isNativePlatform: () => true,
      Plugins: {
        SystemBars: { setStyle: () => Promise.resolve() },
        WindowSurface: {
          setColor: ({ color }) => {
            reported.push(color);
            return Promise.resolve();
          }
        }
      }
    };
  });
  await openLook(page);
  await page.locator('[data-theme-opt="dark"]').click();
  await page.waitForFunction(() => !document.documentElement.classList.contains('is-theme-fading'));
  const pageColour = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--page').trim()
  );
  const before = await page.evaluate(() => window.__surfaces.length);

  // Android's SystemBars re-applies its style on every configuration change,
  // and that writes the theme's day/night window background over the page
  // colour. No appearance event fires with it, so the shell reports the page
  // colour again — a rotation must not leave the strip on the launch colour.
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForFunction((count) => window.__surfaces.length > count, before, { timeout: 3000 });
  const calls = await page.evaluate(() => window.__surfaces.slice());

  expect(calls[calls.length - 1]).toBe(pageColour);
});

test('the page colour lands while the content is still fading', async ({ page }) => {
  await openLook(page);
  const state = await page.evaluate(async () => {
    document.querySelector('[data-theme-opt="dark"]').click();
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const html = getComputedStyle(document.documentElement);
    return {
      fading: document.documentElement.classList.contains('is-theme-fading'),
      page: html.backgroundColor,
      body: getComputedStyle(document.body).backgroundColor,
      hub: getComputedStyle(document.getElementById('hub')).backgroundColor
    };
  });

  // The system bar has no transition, so the page has to be on the new colour
  // in the same frame; only the content on top is allowed to be in flight. A
  // background transition on the full-page layers is what could leave the
  // WebView on the previous appearance's colour after a switch.
  expect(state.fading, 'the content is still cross-fading').toBe(true);
  expect(state.body, 'the body is already on the new page colour').toBe(state.page);
  expect(state.hub, 'the hub is already on the new page colour').toBe(state.page);
});

test('a theme switch keeps the build epoch on the manifest link', async ({ page }) => {
  // The light and dark manifests are separate files, but the build epoch is
  // what busts the install surface's cache. A second hard-coded epoch in the
  // theme code went stale and asked for the previous build's manifest.
  await openLook(page);
  const before = await page.evaluate(() => document.getElementById('manifest-link').getAttribute('href'));
  expect(before).toMatch(/^manifest\.webmanifest\?v=[^&]+$/);
  const version = before.slice(before.indexOf('?v='));

  await page.locator('[data-theme-opt="dark"]').click();
  await expect
    .poll(() => page.evaluate(() => document.getElementById('manifest-link').getAttribute('href')))
    .toBe('manifest-dark.webmanifest' + version);
});

test('the about sheet paints its blur before the card enters', async ({ page }) => {
  await page.goto('/?perf=full');
  await page.waitForSelector('#daily');
  await page.waitForFunction(() => document.documentElement.classList.contains('home-ready'));
  await page.locator('#hub-about').click();
  await page.waitForFunction(() => window.__sixfoldSheetPaint && window.__sixfoldSheetPaint.sheet === 'about');

  const backdrop = await page.locator('#about .sheet-backdrop').evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      opacity: style.opacity,
      transition: style.transitionProperty,
      filter: style.webkitBackdropFilter || style.backdropFilter
    };
  });

  // The blur must be in the first painted frame. Animating the scrim's
  // opacity leaves the backdrop-filter visibly late on a phone GPU.
  expect(backdrop.opacity).toBe('1');
  expect(backdrop.transition).toBe('none');
  expect(backdrop.filter).toContain('blur(3px)');

  const paint = await page.evaluate(() => window.__sixfoldSheetPaint);
  expect(paint.sheet).toBe('about');
  expect(paint.ms).toBeGreaterThanOrEqual(0);
  expect(paint.ms).toBeLessThan(1000);
  expect(paint.filter).toContain('blur(3px)');
});
