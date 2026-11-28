const { test, expect } = require('@playwright/test');
const { setPreferences } = require('./helpers');

// The launch layer paints a raster mark before any of the app runs. Two
// regressions must stay out: a box taller than it is wide (the img's height
// attribute used to pin 152px while the width clamp shrank to 34vw), and a
// source smaller than the screen's device pixels (the 32px header icon used to
// be upscaled at 2x and 3x). Both themes are covered because the launch screen
// swaps the page colour behind the mark.
const THEMES = [
  { name: 'light', page: 'rgb(246, 241, 232)' },
  { name: 'dark', page: 'rgb(26, 25, 24)' }
];
const PHONE = 390; // 34vw, the width where the box used to stretch
const CEILING = 480; // the 152px clamp, where the source requirement is highest
const SCALES = [1, 2, 3];

// The launch layer is removed once it fades, so capture the mark while it
// exists instead of racing the hand-off.
function captureMark() {
  window.__splashMark = null;
  const read = () => {
    const img = document.querySelector('.boot-mark');
    if (!img || !img.complete || !img.naturalWidth) return false;
    const style = getComputedStyle(img);
    window.__splashMark = {
      background: getComputedStyle(document.getElementById('boot-splash')).backgroundColor,
      width: parseFloat(style.width),
      height: parseFloat(style.height),
      source: img.naturalWidth
    };
    return true;
  };
  const poll = () => { if (!read()) requestAnimationFrame(poll); };
  if (!read()) requestAnimationFrame(poll);
}

for (const theme of THEMES) {
  for (const scale of SCALES) {
    test.describe(theme.name + ' launch screen at DPR ' + scale, () => {
      test.use({ deviceScaleFactor: scale });

      test('keeps the mark square and never upscales it', async ({ page }) => {
        await setPreferences(page, theme.name, 'en');
        await page.addInitScript(captureMark);

        // The 390px mark already needs more pixels than the old 192px icon at
        // 2x, so the ceiling only binds at 3x, where it needs 456 source px.
        for (const width of scale === 3 ? [PHONE, CEILING] : [PHONE]) {
          await page.setViewportSize({ width, height: 844 });
          await page.goto('/');
          const handle = await page.waitForFunction(() => window.__splashMark);
          const mark = await handle.jsonValue();
          const label = width + 'px ' + theme.name + ' at DPR ' + scale;
          const needed = Math.round(mark.width * scale);

          expect(mark.background, label + ' splash').toBe(theme.page);
          expect(mark.width, label + ' width').toBeGreaterThan(0);
          expect(Math.abs(mark.width - mark.height), label + ' box').toBeLessThan(0.5);
          expect(mark.source, label + ' source for ' + needed + ' device px')
            .toBeGreaterThanOrEqual(needed);
        }
      });
    });
  }
}
