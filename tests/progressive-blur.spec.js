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
  { name: 'hub', path: '/', container: '#hub', first: '.hub-top', last: '.home-ticker', blur: true },
  // The badge collection is a scrolling page, not a fixed game frame. It gets
  // the same bands as the hub so its cards dissolve under the status bar.
  { name: 'badges', path: '/#badges', container: '#badges', first: '.badges-head', last: '#badges .profile-gauntlet', blur: true },
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
    const title = screen.blur
      ? 'progressive blur stays off resting content: '
      : 'play screens carry no blur band: ';
    test(title + screen.name + ' at ' + testCase.name, async ({ page }) => {
      await page.setViewportSize(testCase.viewport);
      const session = await page.context().newCDPSession(page);
      await session.send('Emulation.setSafeAreaInsetsOverride', { insets: testCase.insets });

      await page.goto(screen.path);
      await expect(page.locator(screen.container)).toBeVisible();
      await expect(page.locator('#boot-splash')).toBeHidden();

      // The bands belong to the hub and the badge collection, the two screens
      // that scroll under the bars. A play screen owns its frame, so nothing
      // sits over a board.
      if (!screen.blur) {
        await expect(page.locator('.progressive-blur--top')).toBeHidden();
        await expect(page.locator('.progressive-blur--bottom')).toBeHidden();
        return;
      }
      await expect(page.locator('.progressive-blur--top')).toBeVisible();

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

      expect(layout.bottomBandHeight).toBeGreaterThanOrEqual(testCase.insets.bottom);

      // Nothing resting is blurred: the first resting row starts below the band.
      expect(layout.firstContentTop - layout.topBandBottom).toBeGreaterThanOrEqual(2);

      expect(layout.firstContentTop).not.toBeNull();
      // A screen that scrolls puts content under the band by design; one that
      // fits must keep its last row (the footer) inside the gutter.
      expect(layout.bottomBandTop + layout.bottomBandHeight).toBeCloseTo(layout.viewportBottom, 0);
      if (!layout.scrolls && layout.lastContentBottom !== null) {
        expect(layout.bottomBandTop - layout.lastContentBottom).toBeGreaterThanOrEqual(2);
      }
    });
  }
}

// The standalone legal page has its own edge blur because it does not load the
// app shell. The GPL is kept behind a native disclosure so the page opens on
// the licenses that are actually short enough to scan.
test('the legal page blurs its edges and keeps the GPL collapsible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setSafeAreaInsetsOverride', {
    insets: { top: 47, bottom: 34, left: 0, right: 0 }
  });

  await page.goto('/licenses.html');
  const details = page.locator('#gpl-text');
  await expect(details).not.toHaveAttribute('open', '');
  await expect(page.locator('.edge-blur--top')).toBeVisible();
  await expect(page.locator('.edge-blur--top > span').first()).toHaveCSS('backdrop-filter', 'blur(0.6px)');
  // Each band feathers toward its own edge. Reusing the top band's direction
  // left the navigation bar sharp and peaked the blur mid-band.
  const direction = await page.locator('.edge-blur--bottom').evaluate((el) =>
    getComputedStyle(el).getPropertyValue('--edge-direction').trim()
  );
  expect(direction).toBe('to bottom');

  // The bands are fixed to the page, not left at their static position after
  // the content. Scroll first so a missing `top: 0` cannot pass at rest.
  await page.evaluate(() => window.scrollTo(0, 520));
  const topBand = await page.locator('.edge-blur--top').boundingBox();
  const bottomBand = await page.locator('.edge-blur--bottom').boundingBox();
  expect(topBand?.y).toBe(0);
  expect(Math.round((bottomBand?.y ?? 0) + (bottomBand?.height ?? 0))).toBe(844);

  await details.locator('summary').click();
  await expect(details).toHaveAttribute('open', '');
  await expect(details.locator('pre')).toContainText('GNU GENERAL PUBLIC LICENSE');
});

// Merge is a play screen too, including its full-bleed desktop grid.
test('the Merge board carries no blur band', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.goto('/#merge');
  await expect(page.locator('main.app')).toBeVisible();
  await expect(page.locator('.progressive-blur--top')).toBeHidden();
  await expect(page.locator('.progressive-blur--bottom')).toBeHidden();
});
