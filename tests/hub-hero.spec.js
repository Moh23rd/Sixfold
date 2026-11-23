const { test, expect } = require('@playwright/test');
const { LANGUAGE_NAMES, LOCALES, expectNoClippedText } = require('./helpers');

// The phone hero is the whole first screen, so it has to fit without clipping
// from the narrowest phone up, the six-piece cover must stay below the
// headline, and the promise row must sit on the cover's foot instead of
// hovering above the caption. The description column starts at the cover's
// top, never below it, and the hero's last line has to clear the fold with the
// What's-new note showing, because that note is the first thing above the
// hero. The leftover height is shared above and below the CTAs, so the promise
// row cannot strand far under the buttons again. Daily Sixfold is checked on
// and off because hiding the card changes what follows the hero, not the hero
// itself.

const WIDTHS = [
  { width: 320, height: 568 },
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
      body: rect('.home-body'),
      sub: rect('.home-sub'),
      ctas: rect('.home-ctas'),
      promises: rect('.home-promises'),
      art: rect('.home-hero-art'),
      viewport: document.documentElement.clientWidth,
      fold: document.documentElement.clientHeight
    };
  });
  expect(boxes.art.top, 'the cover starts below the headline').toBeGreaterThanOrEqual(boxes.title.bottom);
  // The description column fills its grid row, so a body taller than the
  // bottom-aligned cover starts above it; it must never start below it, which
  // is the empty band above the description this hero was built to remove.
  expect(
    boxes.body.top,
    'the description never starts below the cover'
  ).toBeLessThanOrEqual(boxes.art.top + 1);
  expect(boxes.art.left, 'the cover stays inside the viewport').toBeGreaterThanOrEqual(0);
  expect(boxes.art.right, 'the cover stays inside the viewport').toBeLessThanOrEqual(boxes.viewport + 1);
  expect(
    Math.abs(boxes.promises.bottom - boxes.art.bottom),
    'the promise row meets the cover\'s foot'
  ).toBeLessThanOrEqual(1);

  // The flex column shares the cover's leftover height between the two gaps.
  // The promise row's own margin is a few pixels smaller than the CTAs', so
  // the space below may be slightly tighter, never much larger. Eight pixels
  // of tolerance leaves room for margins while catching the old layout, which
  // dumped every spare pixel between the buttons and the promise row.
  const gapAbove = boxes.ctas.top - boxes.sub.bottom;
  const gapBelow = boxes.promises.top - boxes.ctas.bottom;
  expect(
    gapBelow,
    'the promise row stays with the CTAs instead of stranding below them'
  ).toBeLessThanOrEqual(gapAbove + 8);

  // The hero is the first screen: the promise row, its last line, has to end
  // above the fold before the ticker starts. Measured with the release note
  // visible (asserted by the caller), since dismissing it would buy the hero
  // about 39px it does not have on a fresh visit.
  expect(
    boxes.promises.bottom,
    'the hero ends above the fold with the release note showing'
  ).toBeLessThanOrEqual(boxes.fold + 0.5);
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
          // A fresh visit shows the current release note above the hero. Pin
          // that on, or a stale dismissal key would make the fold check easier
          // than the real first screen.
          await expect(page.locator('#whats-new')).toBeVisible();
          await expectHeroLayout(page, locale, width, daily);
        }
      );
    }
  }
}
