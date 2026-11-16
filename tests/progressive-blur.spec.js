const { test, expect } = require('@playwright/test');

// Insets are applied through Chromium's own safe-area emulation, so env()
// returns them exactly as the edge-to-edge WebView does on a phone.
const CASES = [
  { name: '320x568 portrait', viewport: { width: 320, height: 568 }, insets: { top: 44, bottom: 34, left: 0, right: 0 } },
  { name: '390x844 portrait', viewport: { width: 390, height: 844 }, insets: { top: 47, bottom: 34, left: 0, right: 0 } },
  { name: '844x390 landscape', viewport: { width: 844, height: 390 }, insets: { top: 0, bottom: 21, left: 44, right: 44 } }
];

// Every screen the app can show: the element that scrolls, the first resting
// row (the header a reader sees at scroll position zero) and the last one.
const SCREENS = [
  { name: 'hub', path: '/', container: '#hub', first: '.hub-top', last: '.home-ticker' },
  { name: 'merge', path: '/#merge', container: 'main.app', first: 'main.app .header', last: 'main.app footer' },
  { name: 'sudoku', path: '/#sudoku', container: '#sudoku', first: '#sudoku .play-head', last: '#sudoku .play-foot' },
  { name: 'tic tac toe', path: '/#ttt', container: '#ttt', first: '#ttt .play-head', last: '#ttt .play-foot' },
  { name: 'minesweeper', path: '/#mines', container: '#mines', first: '#mines .play-head', last: '#mines .play-foot' },
  { name: 'water sort', path: '/#water', container: '#water', first: '#water .play-head', last: '#water .play-foot' },
  { name: 'fruit merge', path: '/#fruit', container: '#fruit', first: '#fruit .play-head', last: '#fruit .play-foot' }
];

async function measure(page, screen) {
  return page.evaluate(({ container, first, last }) => {
    const rect = (selector) => {
      const el = document.querySelector(selector);
      return el ? el.getBoundingClientRect() : null;
    };
    const topBand = rect('.progressive-blur--top');
    const bottomBand = rect('.progressive-blur--bottom');
    const box = document.querySelector(container);
    if (!topBand || !bottomBand || !box) return null;
    const firstBox = rect(first);
    const lastBox = rect(last);

    return {
      topBandHeight: topBand.height,
      topBandBottom: topBand.bottom,
      bottomBandHeight: bottomBand.height,
      bottomBandTop: bottomBand.top,
      firstContentTop: firstBox ? firstBox.top : null,
      lastContentBottom: lastBox ? lastBox.bottom : null,
      scrolls: box.scrollHeight > box.clientHeight + 1,
      viewportBottom: window.innerHeight
    };
  }, screen);
}

for (const testCase of CASES) {
  for (const screen of SCREENS) {
    test('progressive blur stays off resting content: ' + screen.name + ' at ' + testCase.name, async ({ page }) => {
      await page.setViewportSize(testCase.viewport);
      const session = await page.context().newCDPSession(page);
      await session.send('Emulation.setSafeAreaInsetsOverride', { insets: testCase.insets });

      await page.goto(screen.path);
      await expect(page.locator(screen.container)).toBeVisible();
      await expect(page.locator('.progressive-blur--top')).toBeVisible();
      await expect(page.locator('#boot-splash')).toBeHidden();

      // Let the screen's entrance animation finish before measuring resting
      // positions: a sliding screen reports its content away from the band
      // until the transform lands.
      await page.evaluate((container) => {
        const el = document.querySelector(container);
        if (el) el.scrollTop = 0;
      }, screen.container);
      await page.waitForTimeout(1400);
      const layout = await measure(page, screen);
      expect(layout).not.toBeNull();

      // The top band is at least as thick as the system bar it sits under.
      expect(layout.topBandHeight).toBeGreaterThanOrEqual(testCase.insets.top);

      // Nothing resting is blurred: the first resting row starts below the band.
      expect(layout.firstContentTop - layout.topBandBottom).toBeGreaterThanOrEqual(2);

      // The hub is the one screen with a bottom band, because it is the one
      // screen whose content scrolls under it.
      if (screen.name === 'hub') expect(layout.bottomBandHeight).toBeGreaterThan(0);

      expect(layout.firstContentTop).not.toBeNull();
      if (layout.bottomBandHeight > 0) {
        // The band is at least as thick as the bar it sits under and ends at
        // the viewport edge. A screen that scrolls puts content under it by
        // design; one that fits must clear it.
        expect(layout.bottomBandHeight).toBeGreaterThanOrEqual(testCase.insets.bottom);
        expect(layout.bottomBandTop + layout.bottomBandHeight).toBeCloseTo(layout.viewportBottom, 0);
        if (!layout.scrolls && layout.lastContentBottom !== null) {
          expect(layout.bottomBandTop - layout.lastContentBottom).toBeGreaterThanOrEqual(2);
        }
      }
    });
  }
}

// The Merge screen uses its own full-bleed grid on desktop, where the header
// sits 10px from the top.
test('progressive blur stays off the desktop Merge header', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.goto('/#merge');
  await expect(page.locator('main.app')).toBeVisible();
  await expect(page.locator('.progressive-blur--top')).toBeVisible();
  await page.waitForTimeout(700);

  const layout = await page.evaluate(() => {
    const header = document.querySelector('main.app .header');
    const band = document.querySelector('.progressive-blur--top');
    if (!header || !band) return null;
    return {
      headerTop: header.getBoundingClientRect().top,
      bandBottom: band.getBoundingClientRect().bottom
    };
  });
  expect(layout).not.toBeNull();
  expect(layout.headerTop - layout.bandBottom).toBeGreaterThanOrEqual(1);
});
