const { test, expect } = require('@playwright/test');

// Insets are applied through Chromium's own safe-area emulation, so env()
// returns them exactly as the edge-to-edge WebView does on a phone.
const CASES = [
  { name: '320x568 portrait', viewport: { width: 320, height: 568 }, insets: { top: 44, bottom: 34, left: 0, right: 0 } },
  { name: '390x844 portrait', viewport: { width: 390, height: 844 }, insets: { top: 47, bottom: 34, left: 0, right: 0 } },
  { name: '844x390 landscape', viewport: { width: 844, height: 390 }, insets: { top: 0, bottom: 21, left: 44, right: 44 } }
];

async function measure(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const el = document.querySelector(selector);
      return el ? el.getBoundingClientRect() : null;
    };
    const topBand = rect('.progressive-blur--top');
    const bottomBand = rect('.progressive-blur--bottom');
    const head = rect('#sudoku .play-head');
    const shell = document.querySelector('#sudoku .play-shell');
    if (!topBand || !bottomBand || !head || !shell) return null;
    return {
      topBandHeight: topBand.height,
      topBandBottom: topBand.bottom,
      bottomBandHeight: bottomBand.height,
      bottomBandTop: bottomBand.top,
      bottomBandBottom: bottomBand.bottom,
      headerTop: head.top,
      gutterBottom: parseFloat(getComputedStyle(shell).paddingBottom),
      viewportBottom: window.innerHeight
    };
  });
}

// The Merge screen uses its own full-bleed grid on desktop, where the header
// sits 10px from the top.
async function measureMergeHeader(page) {
  return page.evaluate(() => {
    const header = document.querySelector('main.app .header');
    const band = document.querySelector('.progressive-blur--top');
    if (!header || !band) return null;
    return {
      headerTop: header.getBoundingClientRect().top,
      bandBottom: band.getBoundingClientRect().bottom
    };
  });
}

for (const testCase of CASES) {
  test('progressive blur stays off resting content: ' + testCase.name, async ({ page }) => {
    await page.setViewportSize(testCase.viewport);
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setSafeAreaInsetsOverride', { insets: testCase.insets });

    await page.goto('/#sudoku');
    await page.waitForSelector('#sudoku-board .sudoku-cell');
    await expect(page.locator('#boot-splash')).toBeHidden();
    await expect(page.locator('.progressive-blur--top')).toBeVisible();
    await expect(page.locator('#sudoku')).toBeVisible();

    // Let the screen's entrance fade finish before measuring resting positions.
    await expect
      .poll(async () => (await measure(page))?.headerTop ?? 0, { timeout: 5000 })
      .toBeGreaterThan(0);
    await page.waitForTimeout(700);
    const layout = await measure(page);
    expect(layout).not.toBeNull();

    // Each band is at least as thick as the system bar it sits under.
    expect(layout.topBandHeight).toBeGreaterThanOrEqual(testCase.insets.top);
    expect(layout.bottomBandHeight).toBeGreaterThanOrEqual(testCase.insets.bottom);

    // The play header starts below the band, so nothing resting is blurred.
    expect(layout.headerTop - layout.topBandBottom).toBeGreaterThanOrEqual(2);

    // The bottom band ends inside the screen's own bottom gutter.
    expect(layout.bottomBandHeight).toBeLessThanOrEqual(layout.gutterBottom + 1);
    expect(layout.bottomBandBottom).toBeCloseTo(layout.viewportBottom, 0);
  });
}

test('progressive blur stays off the desktop Merge header', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.goto('/#merge');
  await expect(page.locator('main.app')).toBeVisible();
  await expect(page.locator('.progressive-blur--top')).toBeVisible();
  await page.waitForTimeout(700);

  const layout = await measureMergeHeader(page);
  expect(layout).not.toBeNull();
  expect(layout.headerTop - layout.bandBottom).toBeGreaterThanOrEqual(1);
});
