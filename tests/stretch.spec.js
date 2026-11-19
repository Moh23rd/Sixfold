/* The Android stretch is a touch-only effect: it runs only under an Android
   user agent, it is driven by real touch sequences, and nothing else in the
   suite can reach it. These tests pin the four rules the effect claims to
   follow — the pulled edge travels while the opposite edge stays pinned, the
   pull saturates instead of tracking the finger, a touch during the settle
   catches the frame on screen, and the settle returns to flat. */
const { test, expect } = require('@playwright/test');

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/131.0.0.0 Mobile Safari/537.36';

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
    return {
      transform: hub.style.transform || 'none',
      origin: hub.style.transformOrigin || 'none',
      travel: matrix ? Math.abs(matrix.m42) : 0,
      scaleY: matrix ? matrix.m22 : 1,
      top: box.top,
      bottom: box.bottom,
      height: hub.clientHeight,
      scrollTop: hub.scrollTop,
    };
  });
}

test('the pulled edge leaves the boundary and the opposite edge stays pinned', async ({
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

  expect(pulled.travel).toBeGreaterThan(20);
  expect(pulled.origin).toBe('50% 0%');
  // The pulled edge travels exactly as far as the transform says …
  expect(pulled.top).toBeCloseTo(pulled.travel, 0);
  // … while the opposite edge never leaves the viewport boundary.
  expect(pulled.bottom).toBeCloseTo(idle.height, 0);
  expect(pulled.scaleY).toBeLessThan(0.99);
  expect(pulled.scaleY).toBeGreaterThan(0.9);
  expect(pulled.scrollTop).toBe(0);

  await touch(cdp, 'touchEnd');
  await page.waitForTimeout(600);
});

test('the pull saturates instead of tracking the finger', async ({ page, context }) => {
  await open(page);
  const cdp = await context.newCDPSession(page);

  await touch(cdp, 'touchStart', 120);
  const samples = [];
  for (const distance of [40, 120, 240, 700]) {
    await touch(cdp, 'touchMove', 120 + distance);
    await page.waitForTimeout(40);
    samples.push({ distance, travel: (await read(page)).travel });
  }

  const [a, b, c, d] = samples;
  // Monotonic: a longer drag never goes backwards.
  expect(b.travel).toBeGreaterThan(a.travel);
  expect(c.travel).toBeGreaterThan(b.travel);
  expect(d.travel).toBeGreaterThanOrEqual(c.travel);

  // Diminishing returns: every extra pixel of finger travel moves the edge
  // less than the stretch already did.
  const firstRate = a.travel / a.distance;
  const secondRate = (b.travel - a.travel) / (b.distance - a.distance);
  const thirdRate = (c.travel - b.travel) / (c.distance - b.distance);
  expect(secondRate).toBeLessThan(firstRate);
  expect(thirdRate).toBeLessThan(secondRate);

  // And it is bounded: the edge lags the finger and never reaches the cap.
  const cap = 0.18 * (await read(page)).height;
  expect(c.travel).toBeLessThan(c.distance * 0.6);
  expect(d.travel).toBeLessThan(cap * 0.95);

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
  expect(held.travel).toBeGreaterThan(20);

  await touch(cdp, 'touchEnd');
  await page.waitForTimeout(80);

  // The touch stops the spring where the last painted frame left it.
  await touch(cdp, 'touchStart', 430);
  await page.waitForTimeout(60);
  const caught = await read(page);
  await page.waitForTimeout(180);
  const later = await read(page);

  expect(caught.transform).not.toBe('none');
  expect(caught.travel).toBeGreaterThan(0);
  expect(caught.travel).toBeLessThan(held.travel);
  expect(later.transform).toBe(caught.transform);

  await touch(cdp, 'touchEnd');
  await page.waitForTimeout(700);
});

test('the settle returns the page to flat', async ({ page, context }) => {
  await open(page);
  const cdp = await context.newCDPSession(page);
  const idle = await read(page);

  await touch(cdp, 'touchStart', 300);
  await touch(cdp, 'touchMove', 440);
  await page.waitForTimeout(40);
  const held = await read(page);
  expect(held.travel).toBeGreaterThan(20);

  await touch(cdp, 'touchEnd');
  await page.waitForTimeout(100);
  const early = await read(page);
  expect(early.travel).toBeLessThan(held.travel);

  await expect
    .poll(async () => (await read(page)).transform, { timeout: 2000 })
    .toBe('none');

  const flat = await read(page);
  expect(flat.travel).toBe(0);
  expect(flat.scaleY).toBe(1);
  expect(flat.top).toBeCloseTo(0, 0);
  expect(flat.bottom).toBeCloseTo(idle.height, 0);
  expect(flat.scrollTop).toBe(0);
});
