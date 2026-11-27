const { test, expect } = require('@playwright/test');

const SAVED_GAME_OVER = {
  size: 4,
  score: 128,
  moves: 24,
  won: false,
  cells: [
    [2, 0, 0], [4, 0, 1], [2, 0, 2], [4, 0, 3],
    [4, 1, 0], [2, 1, 1], [4, 1, 2], [2, 1, 3],
    [2, 2, 0], [4, 2, 1], [2, 2, 2], [4, 2, 3],
    [4, 3, 0], [2, 3, 1], [4, 3, 2], [2, 3, 3]
  ]
};

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
  expect(during.cardDuration).toBe('0.16s');
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
  // instead of replacing it. Shadows are deliberately not transitioned: a card
  // casting a new shadow every frame was the expensive part of the switch.
  expect(during.tabProperties).toContain('transform');
  expect(during.cardProperties).toContain('transform');
  expect(during.cardProperties).not.toContain('box-shadow');
});

test('a palette switch fades the tiles with the page', async ({ page }) => {
  await openLook(page);
  const warm = await appearance(page);

  await page.locator('[data-palette-opt="ocean"]').click();
  const during = await appearance(page);

  expect(during.fading).toBe(true);
  expect(during.cardDuration).toBe('0.16s');
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

/* The pointer tilt used to be wired only when the page loaded in Full, so a
   reduced-motion desktop that chose Full got the motion back everywhere but
   on the cover until a reload. */
test('choosing Full restores the desktop pointer tilt without a reload', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sixfold.settings.v1', JSON.stringify({ motion: 'reduced' }));
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openLook(page);
  expect(await page.evaluate(() => document.documentElement.dataset.motion)).toBe('reduced');

  await page.locator('[data-motion-opt="full"]').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#sheet')).toBeHidden();

  const cover = await page.evaluate(() => {
    const piece = document.querySelector('.home-six-piece');
    return {
      animation: getComputedStyle(piece).animationName,
      opacity: Number(getComputedStyle(piece).opacity)
    };
  });
  expect(cover.animation, 'choosing Full does not replay the launch build').toBe('none');
  expect(cover.opacity).toBeGreaterThan(0.5);

  const box = await page.locator('.home-hero-art').boundingBox();
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.25);
  await expect.poll(() => page.evaluate(() => (
    document.querySelector('.home-six').classList.contains('is-tilting')
  ))).toBe(true);
  const tilt = await page.evaluate(() => (
    document.querySelector('.home-six').style.getPropertyValue('--six-tilt-y')
  ));
  expect(tilt).not.toBe('');
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

// The result card is removed by its own timer, not by the CSS transition. In
// Reduced both surfaces fade in place for 160ms, so a 200ms timer has to leave
// them mounted long enough for both transitionend events.
test('a Reduced result card finishes its fade before the overlay is removed', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript((saved) => {
    localStorage.setItem('sixfold.welcome.v1', '1');
    localStorage.setItem('sixfold.settings.v1', JSON.stringify({ motion: 'reduced' }));
    localStorage.setItem('merge2048.save', JSON.stringify(saved));
  }, SAVED_GAME_OVER);

  await page.goto('/?perf=full');
  await page.waitForSelector('#daily');
  await page.waitForFunction(() => document.documentElement.classList.contains('home-ready'));
  await page.locator('.home-game[data-game="merge"]').click();
  await expect(page.locator('#overlay')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (
    Number(getComputedStyle(document.getElementById('overlay')).opacity)
  ))).toBe(1);

  const result = await page.evaluate(() => new Promise((resolve) => {
    const overlay = document.getElementById('overlay');
    const card = overlay.querySelector('.overlay-card');
    const fades = [];
    const start = performance.now();
    let hiddenAt = null;

    overlay.addEventListener('transitionend', (event) => {
      if (event.propertyName !== 'opacity') return;
      if (event.target !== overlay && event.target !== card) return;
      fades.push({
        target: event.target === overlay ? 'overlay' : 'card',
        at: performance.now() - start
      });
    });

    document.getElementById('overlay-btn').click();
    const tick = () => {
      if (overlay.hidden) {
        hiddenAt = performance.now() - start;
        resolve({ hiddenAt, fades });
        return;
      }
      if (performance.now() - start < 600) requestAnimationFrame(tick);
      else resolve({ hiddenAt: null, fades });
    };
    requestAnimationFrame(tick);
  }));

  expect(result.hiddenAt, 'the overlay is removed').not.toBeNull();
  expect(result.hiddenAt, 'the close timer leaves room for the 160ms fade').toBeGreaterThanOrEqual(170);
  expect(result.fades.map((event) => event.target), 'both opacity transitions finish').toEqual(
    expect.arrayContaining(['overlay', 'card'])
  );
  const lastFade = Math.max(...result.fades.map((event) => event.at));
  expect(result.hiddenAt, 'the hide timer does not cut off a fade').toBeGreaterThan(lastFade);
});

// Android's back gesture asks the page first: js/native.js dispatches a
// cancelable sixfold:back and leaves the app alone when the page says it
// handled it. Without that a sheet over the hub closed the whole app.
test('back closes the open sheet and leaves the hub on the next press', async ({ page }) => {
  await openLook(page);

  const handled = await page.evaluate(() => {
    const event = new CustomEvent('sixfold:back', { cancelable: true });
    document.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(handled, 'the sheet answers back').toBe(true);
  await expect(page.locator('#sheet')).toBeHidden();

  // With nothing of its own open the page leaves the decision to the shell,
  // which is what lets back reach the hub's history or minimise the app.
  const unhandled = await page.evaluate(() => {
    const event = new CustomEvent('sixfold:back', { cancelable: true });
    document.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(unhandled, 'the hub has nothing left to close').toBe(false);
});

function pressBack(page) {
  return page.evaluate(() => {
    const event = new CustomEvent('sixfold:back', { cancelable: true });
    document.dispatchEvent(event);
    return event.defaultPrevented;
  });
}

// A finished round is a modal of its own. Back has to dismiss it rather than
// walk out of the game, the same way it closes a sheet; each game owns its
// card, so each one answers the same event.
test('back dismisses the Merge result card and stays in Merge', async ({ page }) => {
  await page.addInitScript((saved) => {
    localStorage.setItem('sixfold.welcome.v1', '1');
    localStorage.setItem('merge2048.save', JSON.stringify(saved));
  }, SAVED_GAME_OVER);

  await page.goto('/?perf=full');
  await page.waitForSelector('#daily');
  await page.waitForFunction(() => document.documentElement.classList.contains('home-ready'));
  await page.locator('.home-game[data-game="merge"]').click();
  await expect(page.locator('#overlay')).toBeVisible();

  expect(await pressBack(page), 'the result card answers back').toBe(true);
  await expect(page.locator('#overlay')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'merge');
});

test('back dismisses the Sudoku result and stays in Sudoku', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sixfold.welcome.v1', '1'));
  await page.goto('/#sudoku');
  await page.waitForSelector('#sudoku-board .sudoku-cell');
  const solved = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('sixfold.sudoku.state.v1'));
    state.grid = state.solution.slice();
    state.solved = true;
    state.hints = 1;
    state.elapsed = 252;
    return state;
  });
  await page.addInitScript((state) => {
    localStorage.setItem('sixfold.sudoku.state.v1', JSON.stringify(state));
  }, solved);
  await page.reload();
  await page.waitForFunction(() => !document.getElementById('sudoku-result').hidden);

  expect(await pressBack(page), 'the solved card answers back').toBe(true);
  await expect(page.locator('#sudoku-result')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'sudoku');
});

test('back dismisses the Wordle result and stays in Wordle', async ({ page }) => {
  test.setTimeout(60000);
  await page.addInitScript(() => {
    localStorage.setItem('sixfold.welcome.v1', '1');
    localStorage.setItem('sixfold.locale.v1', 'en');
  });
  await page.goto('/');
  await page.waitForSelector('#daily');
  await page.waitForFunction(() => document.documentElement.classList.contains('home-ready'));
  // The seventh game stays hidden behind the six-piece mark on the hub.
  for (let i = 0; i < 6; i += 1) {
    await page.evaluate((index) => {
      const piece = document.querySelectorAll('.home-six-piece')[index];
      if (piece) piece.click();
    }, i);
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(400);
  if (await page.locator('#hidden-reveal').isVisible()) {
    await page.evaluate(() => document.querySelector('#hidden-reveal-skip').click());
  }
  await page.waitForSelector('body[data-screen="wordle"]');
  await page.waitForSelector('#wordle-board .wordle-tile');

  const answer = await page.evaluate(() => {
    const game = JSON.parse(localStorage.getItem('sixfold.wordle.game.v1'));
    return game.answer;
  });
  for (const character of answer) {
    await page.locator('#wordle-keyboard [data-key="' + character + '"]').click();
  }
  await page.locator('#wordle-keyboard [data-key="Enter"]').click();
  await expect(page.locator('#wordle-result')).toBeVisible();

  expect(await pressBack(page), 'the result card answers back').toBe(true);
  await expect(page.locator('#wordle-result')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'wordle');
});

// A sheet adds one history entry while it is up, so the browser's own back
// closes the panel instead of leaving the screen it was opened from.
test('browser back closes the open sheet', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sixfold.welcome.v1', '1'));
  await page.goto('/?perf=full');
  await page.waitForSelector('#daily');
  await page.waitForFunction(() => document.documentElement.classList.contains('home-ready'));
  await page.locator('#appearance').click();
  await expect(page.locator('#sheet')).toBeVisible();
  expect(await page.evaluate(() => history.length), 'the sheet added a history entry').toBeGreaterThan(1);

  await page.evaluate(() => history.back());
  await expect(page.locator('#sheet')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'hub');
  expect(new URL(page.url()).pathname, 'the page did not navigate').toBe('/');
});

// Escape belongs to any sheet, including the per-game settings panels.
test('Escape closes a game settings sheet', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sixfold.welcome.v1', '1'));
  await page.goto('/#sudoku');
  await page.waitForSelector('#sudoku-board .sudoku-cell');
  await page.locator('#sudoku-settings-open').click();
  await expect(page.locator('#sudoku-settings')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('#sudoku-settings')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'sudoku');
});

// The solved card is a dialog, not a decoration: the board and the screen's own
// controls are inert while it is up, and dismissing it hands them back.
test('a solved card keeps the board behind it inert', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sixfold.welcome.v1', '1'));
  await page.goto('/#sudoku');
  await page.waitForSelector('#sudoku-board .sudoku-cell');
  const solved = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('sixfold.sudoku.state.v1'));
    state.grid = state.solution.slice();
    state.solved = true;
    state.hints = 1;
    state.elapsed = 252;
    return state;
  });
  await page.addInitScript((state) => {
    localStorage.setItem('sixfold.sudoku.state.v1', JSON.stringify(state));
  }, solved);
  await page.reload();
  await page.waitForFunction(() => !document.getElementById('sudoku-result').hidden);

  expect(await page.evaluate(() => document.getElementById('sudoku-board').inert), 'board inert').toBe(true);
  expect(await page.evaluate(() => document.querySelector('#sudoku .play-head').inert), 'header inert').toBe(true);

  expect(await pressBack(page), 'the card answers back').toBe(true);
  await expect(page.locator('#sudoku-result')).toBeHidden();
  expect(await page.evaluate(() => document.getElementById('sudoku-board').inert), 'board released').toBe(false);
});

// The hidden game's reveal is a layer of its own, and back is the same exit as
// its scrim: skip the intro and open the game rather than leaving the app.
test('back dismisses the hidden-game reveal', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sixfold.welcome.v1', '1'));
  await page.goto('/');
  await page.waitForSelector('#daily');
  await page.waitForFunction(() => document.documentElement.classList.contains('home-ready'));
  for (let i = 0; i < 6; i += 1) {
    await page.evaluate((index) => {
      const piece = document.querySelectorAll('.home-six-piece')[index];
      if (piece) piece.click();
    }, i);
    await page.waitForTimeout(50);
  }
  await expect(page.locator('#hidden-reveal')).toBeVisible();

  expect(await pressBack(page), 'the reveal answers back').toBe(true);
  await expect(page.locator('#hidden-reveal')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'wordle');
});

/* Water Sort, Tic Tac Toe, Minesweeper and Fruit Merge finish in a card that
   covers the board. Each card is a dialog of its own, so one gesture never
   dismisses it and leaves the game at the same time: back and Escape close the
   card, the board behind it leaves the tab order, and the footer's Result chip
   brings the finished round back once the card is closed. */

// Level 1 is already sorted, which is the state the game saves when the last
// pour clears it. Restoring it renders the win card the way a real win does.
const SOLVED_WATER = {
  level: 0,
  tubes: [[0, 0, 0, 0], [1, 1, 1, 1], [2, 2, 2, 2], [], []],
  moves: 9,
  history: [],
  solved: true
};

async function finishWaterSort(page) {
  await page.addInitScript((saved) => {
    localStorage.setItem('merge-games.water.state.v3', JSON.stringify(saved));
  }, SOLVED_WATER);
  await page.goto('/#water');
  await page.waitForSelector('#water-tubes .water-tube');
  await expect(page.locator('#water-win')).toBeVisible();
  await page.evaluate(() => window.MergeAutoNext.cancel());
}

async function finishTicTacToe(page) {
  await page.goto('/#ttt');
  await page.waitForSelector('#ttt-board .ttt-cell');
  await page.locator('[data-ttt-mode="two"]').click();
  const cells = page.locator('#ttt-board .ttt-cell');
  // X takes the top row while O answers in the middle column.
  for (const index of [0, 1, 4, 2, 8]) {
    await cells.nth(index).click();
    await page.waitForTimeout(60);
  }
  await expect(page.locator('#ttt-result')).toBeVisible();
  await page.evaluate(() => window.MergeAutoNext.cancel());
}

async function finishMinesweeper(page) {
  await page.goto('/#mines');
  await page.waitForSelector('#mines-board .mines-cell');
  const cells = page.locator('#mines-board .mines-cell');
  const total = await cells.count();
  // Dig in order until the field ends itself: a mine is hit, or every safe
  // square is open. Either way the round is over for real, not forced open.
  for (let index = 0; index < total; index += 1) {
    const over = await page.evaluate(() => !document.getElementById('mines-result').hidden);
    if (over) break;
    await cells.nth(index).click();
  }
  await expect(page.locator('#mines-result')).toBeVisible();
  await page.evaluate(() => window.MergeAutoNext.cancel());
}

async function finishFruitMerge(page) {
  // The query flag is the game's own seam for ending a run while a fruit is
  // still moving; it is the only handle that ends Fruit Merge on demand.
  await page.goto('/?fruit-loop-test=1#fruit');
  await page.waitForSelector('#fruit-canvas');
  await page.evaluate(() => window.__sixfoldFruitTest.finishWithMovingFruit());
  await expect(page.locator('#fruit-over')).toBeVisible();
  await page.evaluate(() => window.MergeAutoNext.cancel());
}

const COMPACT_RESULTS = [
  {
    name: 'Water Sort',
    screen: 'water',
    card: '#water-win',
    board: '#water-tubes',
    chip: '#water .play-result-chip',
    primary: '#water-next',
    settings: '#water-settings-open',
    sheet: '#water-settings',
    open: finishWaterSort
  },
  {
    name: 'Tic Tac Toe',
    screen: 'ttt',
    card: '#ttt-result',
    board: '#ttt-board',
    chip: '#ttt .play-result-chip',
    primary: '#ttt-again',
    open: finishTicTacToe
  },
  {
    name: 'Minesweeper',
    screen: 'mines',
    card: '#mines-result',
    board: '#mines-board',
    chip: '#mines .play-result-chip',
    primary: '#mines-again',
    settings: '#mines-settings-open',
    sheet: '#mines-settings',
    open: finishMinesweeper
  },
  {
    name: 'Fruit Merge',
    screen: 'fruit',
    card: '#fruit-over',
    board: '#fruit-canvas',
    chip: '#fruit .play-result-chip',
    primary: '#fruit-again',
    settings: '#fruit-settings-open',
    sheet: '#fruit-settings',
    open: finishFruitMerge
  }
];

// The card is never the only inert layer: an ancestor of the board is what
// keeps a tap or a tab from reaching it.
function boardCovered(page, selector) {
  return page.evaluate((sel) => {
    const board = document.querySelector(sel);
    return Boolean(board && board.closest('[inert]'));
  }, selector);
}

// The frame around the board is not part of the celebration. Its settings
// control and the footer have to stay usable while the result is up, or the
// reader has to wait out the clock to reach them.
function framePartInert(page, game, part) {
  return page.evaluate(([screen, selector]) => {
    const host = document.getElementById(screen);
    const el = host && host.querySelector(selector);
    return Boolean(el && el.closest('[inert]'));
  }, [game.screen, part]);
}

for (const game of COMPACT_RESULTS) {
  test('back and Escape dismiss the ' + game.name + ' result and the chip brings it back', async ({ page }) => {
    await game.open(page);
    const card = page.locator(game.card);
    await expect(card).toHaveAttribute('role', 'dialog');
    // A panel over the board, not a wall around the frame: the header and
    // footer stay available, so the card is not a modal dialog.
    await expect(card).not.toHaveAttribute('aria-modal', 'true');
    expect(await boardCovered(page, game.board), 'the board behind the card is inert').toBe(true);
    expect(await framePartInert(page, game, '.play-head'), 'the header stays live').toBe(false);
    expect(await framePartInert(page, game, '.play-foot'), 'the footer stays live').toBe(false);

    if (game.settings) {
      // A real tap at the header's settings control, with a deadline. The
      // celebration used to hold the frame inert for the whole pause, so this
      // click waited out the clock and the sheet could never open.
      await page.locator(game.settings).click({ timeout: 2000 });
      await expect(page.locator(game.sheet)).toBeVisible();
      await page.locator(game.sheet + ' .sheet-done').click({ timeout: 2000 });
      await expect(page.locator(game.sheet)).toBeHidden();
      await expect(card, 'the result survives a sheet raised over it').toBeVisible();
    }

    await page.keyboard.press('Escape');
    await expect(card, 'Escape closes the card').toBeHidden();
    await expect(page.locator('body'), 'Escape does not leave the game').toHaveAttribute(
      'data-screen',
      game.screen
    );
    expect(await boardCovered(page, game.board), 'Escape hands the board back').toBe(false);

    const chip = page.locator(game.chip);
    await expect(chip, 'the footer keeps the finished round reachable').toBeVisible();
    await expect(chip).toHaveText(/result/i);
    await chip.click();
    await expect(card, 'the chip reopens the round').toBeVisible();
    await expect(page.locator(game.primary), 'the reopened card takes focus').toBeFocused();
    expect(await boardCovered(page, game.board), 'the reopened card covers the board again').toBe(true);

    expect(await pressBack(page), 'the reopened card answers back').toBe(true);
    await expect(card).toBeHidden();
    await expect(page.locator('body'), 'back does not leave the game').toHaveAttribute(
      'data-screen',
      game.screen
    );
    expect(await boardCovered(page, game.board), 'back hands the board back').toBe(false);
    await expect(chip, 'focus returns to the chip that reopened the card').toBeFocused();
  });
}

// A finished round starts the next one after a short pause. The clock is a
// clock, not a timer: opening a sheet over the result freezes the remaining
// time, and closing it lets the same amount of time run out.
test('the auto-next clock freezes behind a sheet and resumes after it', async ({ page }) => {
  await page.addInitScript((saved) => {
    localStorage.setItem('merge-games.water.state.v3', JSON.stringify(saved));
  }, SOLVED_WATER);
  await page.goto('/#water');
  await page.waitForSelector('#water-tubes .water-tube');
  await expect(page.locator('#water-win')).toBeVisible();
  await expect(page.locator('#water-next'), 'the pause is running').toHaveClass(/is-counting/);

  const left = () => page.evaluate(() => Number(
    getComputedStyle(document.getElementById('water-next')).getPropertyValue('--auto-next-left')
  ));

  // A real tap reaches the header's settings control while the result is up;
  // the dimmer is paint only and the frame never leaves the pointer.
  await page.locator('#water-settings-open').click({ timeout: 2000 });
  await expect(page.locator('#water-settings')).toBeVisible();
  const frozen = await left();
  expect(frozen, 'the pause still has time left when the sheet opens').toBeGreaterThan(0);

  await page.waitForTimeout(900);
  expect(await left(), 'the clock does not run behind the sheet').toBe(frozen);
  await expect(page.locator('#water-level'), 'no new round starts behind the sheet').toHaveText('1');
  await expect(page.locator('#water-win')).toBeVisible();

  await page.locator('#water-settings .sheet-done').click();
  await expect(page.locator('#water-settings')).toBeHidden();
  // The remaining time, not a fresh three seconds, is what runs out next.
  await expect(page.locator('#water-level'), 'the next level starts once the sheet is gone').toHaveText(
    '2',
    { timeout: 6000 }
  );
  await expect(page.locator('#water-win')).toBeHidden();
  await expect(page.locator('#water-next')).not.toHaveClass(/is-counting/);
});

/* The hub's entrance is a launch moment. The hub is display:none while a game
   is up, and a browser restarts a CSS animation when its element is shown
   again, so the cover build and the card stagger used to replay on every
   return. Only the first view of the collection should animate. */
test('returning from a game does not replay the hub entrance', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => document.documentElement.classList.contains('home-ready'));
  await page.waitForFunction(() => !document.getElementById('boot-splash'));
  // Let the launch entrance finish, so anything running later is a replay.
  await page.waitForTimeout(1200);

  // The masthead is the Sixfold word alone; the icon and tagline are gone.
  await expect(page.locator('#hub .hub-mark')).toHaveCount(0);
  await expect(page.locator('#hub .hub-tagline')).toHaveCount(0);
  await expect(page.locator('#hub .hub-word')).toHaveText('Sixfold');

  await page.locator('.home-game[data-game="ttt"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'ttt');

  const state = await page.evaluate(() => new Promise((resolve) => {
    let frames = 0;
    const sample = () => {
      frames += 1;
      if (document.body.dataset.screen !== 'hub' && frames < 240) {
        requestAnimationFrame(sample);
        return;
      }
      const hub = document.getElementById('hub');
      // An entrance is a CSS animation; the pointer resting on the card the
      // reader tapped can leave a hover transition running, which is not one.
      const running = (nodes) => nodes.filter((node) =>
        node.getAnimations().some((animation) =>
          animation.playState === 'running' && Boolean(animation.animationName)
        )
      ).length;
      resolve({
        screen: document.body.dataset.screen,
        returning: hub.classList.contains('is-returning'),
        shellAnimation: getComputedStyle(hub.querySelector('.hub-shell')).animationName,
        runningPieces: running(Array.from(hub.querySelectorAll('.home-six-piece'))),
        runningCards: running(Array.from(hub.querySelectorAll('.home-game')))
      });
    };
    document.querySelector('#ttt .games-home').click();
    requestAnimationFrame(sample);
  }));

  expect(state.screen).toBe('hub');
  expect(state.returning, 'the hub return lift is gone').toBe(false);
  expect(state.shellAnimation).toBe('none');
  expect(state.runningPieces, 'the cover does not rebuild').toBe(0);
  expect(state.runningCards, 'the cards do not stagger again').toBe(0);
});

/* Like the hub, a play screen arrives once. The screens are display:none
   behind each other, so a browser restarts their shell animation on every
   re-entry; the first visit is the launch moment, and a return is a cut. */
test('a game screen keeps its shell entrance to the first visit', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => document.documentElement.classList.contains('home-ready'));
  await page.waitForFunction(() => !document.getElementById('boot-splash'));

  const shell = () => page.evaluate(() => {
    const el = document.querySelector('#water .play-shell');
    return {
      settled: document.getElementById('water').classList.contains('shell-settled'),
      running: el.getAnimations().some((animation) =>
        animation.playState === 'running' && Boolean(animation.animationName)
      )
    };
  });

  await page.locator('.home-game[data-game="water"]').click();
  const first = await shell();
  expect(first.settled, 'the first visit is not settled yet').toBe(false);
  expect(first.running, 'the first visit plays the shell lift').toBe(true);

  await page.locator('#water .games-home').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'hub');

  await page.locator('.home-game[data-game="water"]').click();
  const again = await shell();
  expect(again.settled, 'the screen is marked as it is left').toBe(true);
  expect(again.running, 'a re-entry is a cut, not a second entrance').toBe(false);

  // The word game has its own arrival on top of the shared shell lift, so its
  // selector is checked directly rather than through the six-tap reveal.
  const wordle = await page.evaluate(() => {
    const screen = document.getElementById('wordle');
    const shellEl = screen.querySelector('.wordle-shell');
    screen.hidden = false;
    const first = getComputedStyle(shellEl).animationName;
    screen.classList.add('shell-settled');
    const settled = getComputedStyle(shellEl).animationName;
    screen.classList.remove('shell-settled');
    screen.hidden = true;
    return { first, settled };
  });
  expect(wordle.first, 'the first visit still gets the word game arrival').toBe('wordleArrive');
  expect(wordle.settled, 'a settled word game arrives as a cut').toBe('none');
});

// A custom hex is a third colour source next to the fixed ramps and the
// wallpaper. The panel previews while typing, commits on Apply, and the choice
// has to survive a reload just like a palette swatch.
test('a custom hex recolours the app and survives a reload', async ({ page }) => {
  await openLook(page);
  const warmTile = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--t8').trim()
  );

  await page.locator('#colour-custom summary').click();
  await page.locator('#colour-hex').fill('#2f6fed');
  await page.locator('#colour-apply').click();

  expect(await page.evaluate(() => localStorage.getItem('merge2048.palette'))).toBe('custom');
  expect(await page.evaluate(() => localStorage.getItem('merge2048.palette.custom'))).toBe('#2f6fed');
  expect(await page.locator('#colour-hint')).toHaveText('Custom colour applied.');

  const painted = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--t8').trim()
  );
  expect(painted, 'the board takes the seed hue').not.toBe(warmTile);

  await page.reload();
  await page.waitForSelector('#daily');
  await page.waitForFunction(() => document.documentElement.classList.contains('home-ready'));
  expect(await page.evaluate(() => localStorage.getItem('merge2048.palette'))).toBe('custom');
  expect(await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--t8').trim()
  )).toBe(painted);
});

test('an invalid hex is refused without changing the palette', async ({ page }) => {
  await openLook(page);
  await page.locator('#colour-custom summary').click();
  await page.locator('#colour-hex').fill('#12');
  await page.locator('#colour-apply').click();

  await expect(page.locator('#colour-hint')).toHaveText('Enter a hex colour such as #RRGGBB.');
  await expect(page.locator('#colour-hex')).toHaveAttribute('aria-invalid', 'true');
  expect(await page.evaluate(() => localStorage.getItem('merge2048.palette'))).toBe(null);
});

// The wallpaper source is native-only, so the plugin is stubbed here the way
// the APK answers. The swatch has to appear only when a shell can read the
// wallpaper, take the primary colour, cache it for the next launch, and apply
// it through the same palette pipeline the fixed ramps use.
test('the wallpaper palette takes the phone colour and caches it', async ({ page }) => {
  await page.addInitScript(() => {
    window.Capacitor = window.Capacitor || {};
    window.Capacitor.Plugins = window.Capacitor.Plugins || {};
    window.Capacitor.Plugins.WallpaperColors = {
      colors: () => Promise.resolve({ primary: '#0a7d57', secondary: '#0f5f45' })
    };
  });
  await openLook(page);
  const warmTile = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--t8').trim()
  );

  const swatch = page.locator('[data-palette-opt="wallpaper"]');
  await expect(swatch, 'a shell that can read the wallpaper offers it').toBeVisible();
  await swatch.click();

  await expect.poll(() => page.evaluate(() => localStorage.getItem('merge2048.palette'))).toBe('wallpaper');
  expect(await page.evaluate(() => localStorage.getItem('merge2048.palette.wallpaper'))).toBe('#0a7d57');
  const painted = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--t8').trim()
  );
  expect(painted, 'the board follows the wallpaper').not.toBe(warmTile);
});

test('a browser without the wallpaper plugin does not offer the swatch', async ({ page }) => {
  await openLook(page);
  await expect(page.locator('[data-palette-opt="wallpaper"]')).toHaveCount(0);
  await expect(page.locator('[data-palette-opt="custom"]'), 'custom needs no native part').toHaveCount(1);
});

// Android repaints the wallpaper on some phones every time the screen locks.
// A resume therefore reads the colour again, but a colour that has not moved
// must not rebuild the ramp, repaint the page or run the switch fade.
test('a resume with the same wallpaper repaints nothing and does not fade', async ({ page }) => {
  await page.addInitScript(() => {
    window.__wallpaperCalls = 0;
    localStorage.setItem('merge2048.palette', 'wallpaper');
    localStorage.setItem('merge2048.palette.wallpaper', '#0a7d57');
    window.Capacitor = window.Capacitor || {};
    window.Capacitor.Plugins = window.Capacitor.Plugins || {};
    window.Capacitor.Plugins.WallpaperColors = {
      colors: function () {
        window.__wallpaperCalls += 1;
        return Promise.resolve({ primary: '#0a7d57' });
      }
    };
  });
  await openLook(page);
  await expect.poll(() => page.evaluate(() => window.__wallpaperCalls)).toBe(1);
  const before = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--t8').trim()
  );

  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => page.evaluate(() => window.__wallpaperCalls)).toBe(2);
  await page.waitForTimeout(80);

  const after = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--t8').trim()
  );
  expect(after, 'the same colour keeps the same ramp').toBe(before);
  expect(
    await page.evaluate(() => document.documentElement.classList.contains('is-theme-fading')),
    'a resume is not a palette switch'
  ).toBe(false);
});

test('a changed wallpaper applies on resume without the switch fade', async ({ page }) => {
  await page.addInitScript(() => {
    window.__wallpaperSeed = '#0a7d57';
    localStorage.setItem('merge2048.palette', 'wallpaper');
    localStorage.setItem('merge2048.palette.wallpaper', '#0a7d57');
    window.Capacitor = window.Capacitor || {};
    window.Capacitor.Plugins = window.Capacitor.Plugins || {};
    window.Capacitor.Plugins.WallpaperColors = {
      colors: function () {
        return Promise.resolve({ primary: window.__wallpaperSeed });
      }
    };
  });
  await openLook(page);
  const before = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--t8').trim()
  );

  await page.evaluate(() => {
    window.__wallpaperSeed = '#1f5fd0';
    document.dispatchEvent(new Event('visibilitychange'));
  });

  await expect
    .poll(() =>
      page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--t8').trim())
    )
    .not.toBe(before);
  expect(
    await page.evaluate(() => document.documentElement.classList.contains('is-theme-fading')),
    'the new colour is in place, not fading into place'
  ).toBe(false);
});

test('the colour panel is localised at runtime', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sixfold.locale.v1', 'fr');
    localStorage.setItem('sixfold.locale.explicit.v1', '1');
  });
  await page.goto('/?perf=full');
  await page.waitForSelector('#daily');
  await page.waitForFunction(() => document.documentElement.lang === 'fr' && window.SixfoldI18n);
  await page.locator('#appearance').click();
  await expect(page.locator('#sheet')).toBeVisible();

  await expect(page.locator('#colour-custom summary strong')).toHaveText('Couleur personnalisée');
  await expect(page.locator('#colour-apply')).toHaveText('Appliquer');
  await expect(page.locator('#colour-picker')).toHaveAttribute('aria-label', 'Choisir une couleur');
  await expect(page.locator('[data-palette-opt="custom"]')).toContainText('Personnalisé');
  const warmName = await page.evaluate(() => window.SixfoldI18n.t('Warm'));
  expect(warmName, 'the palette names use the catalog').not.toBe('Warm');
  await expect(page.locator('[data-palette-opt="warm"]')).toContainText(warmName);

  await page.locator('#colour-custom summary').click();
  await page.locator('#colour-hex').fill('#zzz');
  await page.locator('#colour-apply').click();
  await expect(page.locator('#colour-hint')).toHaveText('Saisissez une couleur hexadécimale comme #RRGGBB.');
});

// The cover's build animation used fill-mode both, so its final transform kept
// winning over :active and a finished tile could not show a press. The mark
// settles on animationend; the tile must then carry no animation of its own.
test('a settled six-piece tile is free to press', async ({ page }) => {
  await page.goto('/?perf=full');
  await page.waitForFunction(() => document.documentElement.classList.contains('home-ready'));
  await page.waitForFunction(
    () => document.documentElement.classList.contains('six-settled'),
    null,
    { timeout: 8000 }
  );
  expect(
    await page.evaluate(() => getComputedStyle(document.querySelector('.home-six-piece')).animationName)
  ).toBe('none');
});
