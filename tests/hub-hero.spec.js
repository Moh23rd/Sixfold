const { test, expect } = require('@playwright/test');
const { LANGUAGE_NAMES, LOCALES, expectNoClippedText } = require('./helpers');

// The phone hero is the whole first screen, so it has to fit without clipping
// at both widths the design targets, and the six-piece cover must stay below
// the headline in every locale. Daily Sixfold is checked on and off because
// hiding the card changes what follows the hero, not the hero itself.

const WIDTHS = [
  { width: 357, height: 784 },
  { width: 390, height: 844 }
];
const DAILY_STATES = [true, false];

async function expectHeroLayout(page, locale, width, daily) {
  const state = 'Daily ' + (daily ? 'on' : 'off');
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await expect(page.locator('html')).toHaveAttribute('data-daily', daily ? 'on' : 'off');
  if (daily) await expect(page.locator('#daily')).toBeVisible();
  else await expect(page.locator('#daily')).toBeHidden();

  await expectNoClippedText(
    page,
    LANGUAGE_NAMES[locale] + ' hub hero at ' + width + 'px (' + state + ')',
    '#hub'
  );

  const boxes = await page.evaluate(() => {
    const rect = (selector) => {
      const box = document.querySelector(selector).getBoundingClientRect();
      return { top: box.top, right: box.right, bottom: box.bottom, left: box.left };
    };
    return {
      title: rect('#hub-title'),
      art: rect('.home-hero-art'),
      viewport: document.documentElement.clientWidth
    };
  });
  expect(boxes.art.top, 'the cover starts below the headline').toBeGreaterThanOrEqual(boxes.title.bottom);
  expect(boxes.art.left, 'the cover stays inside the viewport').toBeGreaterThanOrEqual(0);
  expect(boxes.art.right, 'the cover stays inside the viewport').toBeLessThanOrEqual(boxes.viewport + 1);
}

for (const locale of LOCALES) {
  for (const { width, height } of WIDTHS) {
    for (const daily of DAILY_STATES) {
      test(
        'the hub hero fits ' + width + 'px in ' + LANGUAGE_NAMES[locale] + ' with Daily Sixfold ' + (daily ? 'on' : 'off'),
        async ({ page }) => {
          await page.setViewportSize({ width, height });
          await page.addInitScript(({ locale, daily }) => {
            localStorage.setItem('merge2048.theme', 'light');
            localStorage.setItem('sixfold.locale.v1', locale);
            localStorage.setItem('sixfold.settings.v1', JSON.stringify({
              highContrast: false,
              dailyPuzzle: daily
            }));
          }, { locale, daily });

          await page.goto('/');
          await expect(page.locator('#boot-splash')).toBeHidden();
          await expect(page.locator('html')).toHaveClass(/home-ready/);
          await expectHeroLayout(page, locale, width, daily);
        }
      );
    }
  }
}
