/* The Android stretch is a touch-only effect: it runs only under an Android
   user agent, it is driven by real touch sequences, and nothing else in the
   suite can reach it. These tests pin the rules the effect claims to follow —
   the pulled edge stays on the viewport boundary while the content grows away
   from it (the platform magnifies, it never translates the page and leaves a
   gap), the growth follows EdgeEffect's own damping and stops at its 3.2%
   ceiling instead of tracking the finger, a touch during the settle catches the
   frame on screen, the settle returns to flat, and momentum that reaches the
   edge is absorbed into a pulse instead of stopping dead on the boundary. Both
   edges are covered: the bottom pull flips the direction and has to move the
   transform origin with it, so the top's assertions do not stand in for it. */
const { test, expect } = require('@playwright/test');

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/131.0.0.0 Mobile Safari/537.36';

/* EdgeEffect.dampStretchVector, as a fraction of the viewport: what the
   platform draws for a pull of `u` viewports. The tests compare against it so a
   change in how hard the page stretches fails here rather than on a phone. */
function platformStretch(pull) {
  const u = Math.max(0, Math.min(1, pull));
  return 0.016 * (u + 1 - Math.exp((-u * Math.E) / 0.33));
}

const STRETCH_MAX = 0.016 * 2;

test.use({ userAgent: ANDROID_UA, hasTouch: true, isMobile: true });

async function open(page) {
  await page.goto('/');
  // The launch layer covers the hub until the cover has finished building and
  // is removed; a touch before that lands on the splash, not on the page.
  await page.waitForFunction(() =>
    document.documentElement.classList.contains('home-ready')
  );
  await page.waitForFunction(() => !document.getElementById('boot-splash'));
  await page.waitForFunction(() =>
    document.documentElement.classList.contains('has-stretch')
  );
  await page.evaluate(() => {
    document.getElementById('hub').scrollTop = 0;
  });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  );
}

function touch(cdp, type, y) {
  return cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' ? [] : [{ x: 195, y, id: 1 }],
  });
}

function read(page) {
  return page.evaluate(() => {
    const hub = document.getElementById('hub');
    const box = hub.getBoundingClientRect();
    const computed = getComputedStyle(hub).transform;
    const matrix = computed === 'none' ? null : new DOMMatrix(computed);
    const scaleY = matrix ? matrix.m22 : 1;
    return {
      transform: hub.style.transform || 'none',
      origin: hub.style.transformOrigin || 'none',
      // The platform stretch is pure magnification about the pulled edge, so a
      // translation here would be the bug this suite exists to catch.
      offset: matrix ? matrix.m42 : 0,
      scaleY,
      growth: (scaleY - 1) * hub.clientHeight,
      top: box.top,
      bottom: box.bottom,
      height: hub.clientHeight,
      scrollTop: hub.scrollTop,
    };
  });
}

test('the pulled edge stays on the boundary and the content stretches away from it', async ({
  page,
  context,
}) => {
  await open(page);
  const cdp = await context.newCDPSession(page);

  const idle = await read(page);
  expect(idle.transform).toBe('none');
  expect(idle.top).toBeCloseTo(0, 0);

  await touch(cdp, 'touchStart', 320);
  await touch(cdp, 'touchMove', 440);
  await page.waitForTimeout(40);
  const pulled = await read(page);

  expect(pulled.growth).toBeGreaterThan(4);
  expect(pulled.origin).toBe('50% 0%');
  // StretchEffect magnifies about the pulled edge: no translation, so the page
  // never slides down and no gap can open above it…
  expect(pulled.offset).toBe(0);
  expect(pulled.top).toBeCloseTo(0, 0);
  expect(pulled.scaleY).toBeGreaterThan(1.005);
  // …by exactly as much as the platform's damping allows for that pull…
  expect(pulled.growth).toBeCloseTo(
    platformStretch(120 / pulled.height) * pulled.height,
    0
  );
  // …and the far edge is pushed past the viewport, which is the stretch.
  expect(pulled.bottom).toBeGreaterThan(idle.height + 4);
  expect(pulled.scrollTop).toBe(0);

  await touch(cdp, 'touchEnd');
  await page.waitForTimeout(600);
});

test('the pull saturates at the platform ceiling instead of tracking the finger', async ({
  page,
  context,
}) => {
  await open(page);
  const cdp = await context.newCDPSession(page);

  await touch(cdp, 'touchStart', 120);
  const samples = [];
  for (const distance of [40, 120, 240, 700]) {
    await touch(cdp, 'touchMove', 120 + distance);
    await page.waitForTimeout(40);
    const seen = await read(page);
    samples.push({ distance, height: seen.height, growth: seen.growth });
  }

  // Every sample is the platform's own curve for that pull. Dragging twice as
  // far is not twice the stretch, and the growth never reaches the ceiling.
  for (const sample of samples) {
    const expected = platformStretch(sample.distance / sample.height) * sample.height;
    expect(sample.growth).toBeCloseTo(expected, 0);
  }

  const [a, b, c, d] = samples;
  // Monotonic: a longer drag never goes backwards.
  expect(b.growth).toBeGreaterThan(a.growth);
  expect(c.growth).toBeGreaterThan(b.growth);
  expect(d.growth).toBeGreaterThanOrEqual(c.growth);

  // Diminishing returns: every extra pixel of finger travel grows the content
  // less than the stretch already did.
  const firstRate = a.growth / a.distance;
  const secondRate = (b.growth - a.growth) / (b.distance - a.distance);
  const thirdRate = (c.growth - b.growth) / (c.distance - b.distance);
  expect(secondRate).toBeLessThan(firstRate);
  expect(thirdRate).toBeLessThan(secondRate);

  // A drag of most of the screen is still under 3.2% of the viewport, which is
  // what keeps the effect a rubber band rather than a zoom of the whole page.
  const cap = STRETCH_MAX * d.height;
  expect(d.growth).toBeLessThan(cap);
  expect(d.growth).toBeGreaterThan(cap * 0.85);
  expect(c.growth).toBeLessThan(c.distance * 0.3);

  await touch(cdp, 'touchEnd');
  await page.waitForTimeout(600);
});

test('a touch during the settle catches the frame that is on screen', async ({
  page,
  context,
}) => {
  await open(page);
  const cdp = await context.newCDPSession(page);

  await touch(cdp, 'touchStart', 300);
  await touch(cdp, 'touchMove', 440);
  await page.waitForTimeout(40);
  const held = await read(page);
  expect(held.growth).toBeGreaterThan(4);

  await touch(cdp, 'touchEnd');
  await page.waitForTimeout(80);

  // The touch stops the spring where the last painted frame left it.
  await touch(cdp, 'touchStart', 430);
  await page.waitForTimeout(60);
  const caught = await read(page);
  await page.waitForTimeout(180);
  const later = await read(page);

  expect(caught.transform).not.toBe('none');
  expect(caught.growth).toBeGreaterThan(0);
  expect(caught.growth).toBeLessThan(held.growth);
  expect(later.transform).toBe(caught.transform);

  await touch(cdp, 'touchEnd');
  await page.waitForTimeout(700);
});

test('momentum that reaches the edge is absorbed and decays back to flat', async ({ page }) => {
  await open(page);
  const idle = await read(page);
  expect(idle.transform).toBe('none');

  // The pulse is short — it peaks in a couple of frames — so it is sampled
  // every frame rather than probed from the test thread.
  await page.evaluate(() => {
    window.__pulse = [];
    const hub = document.getElementById('hub');
    const started = performance.now();
    const tick = () => {
      const computed = getComputedStyle(hub).transform;
      const matrix = computed === 'none' ? null : new DOMMatrix(computed);
      const scaleY = matrix ? matrix.m22 : 1;
      window.__pulse.push({
        t: Math.round(performance.now() - started),
        growth: (scaleY - 1) * hub.clientHeight,
        origin: hub.style.transformOrigin || 'none',
      });
      if (performance.now() - started < 1000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  // Park the hub away from the edge and cross back on the very next frame.
  // Both moves have to be delivered as separate scroll events (otherwise they
  // coalesce and there is no crossing) and close enough together that the
  // momentum stays above the effect's fling threshold no matter how busy the
  // test runner is — that is what a finger fling looks like to the handler.
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const hub = document.getElementById('hub');
        hub.addEventListener(
          'scroll',
          () => {
            if (hub.scrollTop === 0) return;
            requestAnimationFrame(() => {
              hub.scrollTop = 0;
              resolve();
            });
          },
          { passive: true }
        );
        hub.scrollTop = 160;
      })
  );
  await page.waitForTimeout(1100);

  const samples = await page.evaluate(() => window.__pulse);
  expect(samples.length).toBeGreaterThan(20);
  const peak = samples.reduce((best, sample) =>
    sample.growth > best.growth ? sample : best
  );
  // A pulse with no finger anywhere near the screen.
  expect(peak.growth).toBeGreaterThan(5);
  expect(peak.origin).toBe('50% 0%');
  expect(peak.growth).toBeLessThan(STRETCH_MAX * (await read(page)).height);
  // It decays to nothing and stays there: the tail is flat.
  const tail = samples.slice(-6);
  expect(tail.every((sample) => sample.growth === 0)).toBe(true);
  expect(peak.growth).toBeGreaterThan(tail[0].growth);

  await expect
    .poll(async () => (await read(page)).transform, { timeout: 2500 })
    .toBe('none');

  const flat = await read(page);
  expect(flat.growth).toBe(0);
  expect(flat.scaleY).toBe(1);
  expect(flat.top).toBeCloseTo(0, 0);
  expect(flat.bottom).toBeCloseTo(idle.height, 0);
  expect(flat.scrollTop).toBe(0);
});

test('the settle returns the page to flat', async ({ page, context }) => {
  await open(page);
  const cdp = await context.newCDPSession(page);
  const idle = await read(page);

  await touch(cdp, 'touchStart', 300);
  await touch(cdp, 'touchMove', 440);
  await page.waitForTimeout(40);
  const held = await read(page);
  expect(held.growth).toBeGreaterThan(4);

  await touch(cdp, 'touchEnd');
  await page.waitForTimeout(100);
  const early = await read(page);
  expect(early.growth).toBeLessThan(held.growth);

  await expect
    .poll(async () => (await read(page)).transform, { timeout: 2000 })
    .toBe('none');

  const flat = await read(page);
  expect(flat.growth).toBe(0);
  expect(flat.scaleY).toBe(1);
  expect(flat.top).toBeCloseTo(0, 0);
  expect(flat.bottom).toBeCloseTo(idle.height, 0);
  expect(flat.scrollTop).toBe(0);
});

/* The bottom is the mirror of the top and not a repeat of it: the pull comes
   from the other direction, the origin has to move to the bottom edge, and the
   content has to grow upwards out of the viewport instead of downwards. */

async function parkAtBottom(page) {
  const parked = await page.evaluate(() => {
    const hub = document.getElementById('hub');
    hub.scrollTop = hub.scrollHeight;
    return { scrollTop: hub.scrollTop, max: hub.scrollHeight - hub.clientHeight };
  });
  // The scroll has to be committed before a touch reads atBottom().
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  );
  return parked;
}

test('pulling past the bottom grows the page about the bottom edge', async ({
  page,
  context,
}) => {
  await open(page);
  const cdp = await context.newCDPSession(page);

  const parked = await parkAtBottom(page);
  expect(parked.max).toBeGreaterThan(100);
  expect(parked.scrollTop).toBe(parked.max);

  const idle = await read(page);
  expect(idle.transform).toBe('none');
  expect(idle.scrollTop).toBe(parked.max);

  // 150px up from the bottom edge.
  await touch(cdp, 'touchStart', 520);
  await touch(cdp, 'touchMove', 445);
  await page.waitForTimeout(40);
  await touch(cdp, 'touchMove', 370);
  await page.waitForTimeout(40);
  const pulled = await read(page);

  // The origin follows the edge being pulled.
  expect(pulled.origin).toBe('50% 100%');
  // Still pure magnification: no translation, so the pulled edge stays on the
  // viewport boundary and no gap opens below the page…
  expect(pulled.offset).toBe(0);
  expect(pulled.bottom).toBeCloseTo(idle.height, 0);
  // …while the far edge is pushed out of view above the top of the screen.
  expect(pulled.top).toBeLessThan(-4);
  expect(pulled.growth).toBeGreaterThan(4);
  // The same platform curve, measured from the bottom.
  expect(pulled.growth).toBeCloseTo(
    platformStretch(150 / pulled.height) * pulled.height,
    0
  );
  // A stretch never scrolls the content: the hub is still at its end.
  expect(pulled.scrollTop).toBe(parked.max);

  await touch(cdp, 'touchEnd');
  await expect
    .poll(async () => (await read(page)).transform, { timeout: 2000 })
    .toBe('none');

  const flat = await read(page);
  expect(flat.top).toBeCloseTo(0, 0);
  expect(flat.bottom).toBeCloseTo(idle.height, 0);
  expect(flat.scrollTop).toBe(parked.max);
});

test('a drag down at the bottom scrolls instead of stretching', async ({ page, context }) => {
  await open(page);
  const cdp = await context.newCDPSession(page);
  const parked = await parkAtBottom(page);

  await touch(cdp, 'touchStart', 300);
  await touch(cdp, 'touchMove', 360);
  await touch(cdp, 'touchMove', 430);
  await page.waitForTimeout(80);
  const seen = await read(page);

  // Away from the bottom edge the list owns the gesture: no transform, no
  // origin, and the content moves.
  expect(seen.transform).toBe('none');
  expect(seen.origin).toBe('none');
  expect(seen.scrollTop).toBeLessThan(parked.max);

  await touch(cdp, 'touchEnd');
  await page.waitForTimeout(300);
});
