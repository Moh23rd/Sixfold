const { test, expect } = require('@playwright/test');
const { LANGUAGE_NAMES, LOCALES, expectNoClippedText } = require('./helpers');

const WHATS_NEW_ITEMS = [
  'Colour that follows the phone: take the wallpaper palette on Android, or pick any hex of your own.',
  'A softer feel: smoother light and dark changes, refined haptics, and a calmer What’s New card.',
  'The welcome guide now lands before the hub, so a first launch never flashes the collection.',
  'The hidden seventh game opens with a smooth hand-off from the six-piece cover.',
  'Two ways to play: the installable web app and the direct Android APK — both on 6.0.'
];

test.describe('What’s New 6.0', () => {
  for (const locale of LOCALES) {
    test(LANGUAGE_NAMES[locale] + ' translations and 320px layout', async ({ page }) => {
      await page.addInitScript(({ locale }) => {
        localStorage.setItem('sixfold.locale.v1', locale);
        localStorage.removeItem('sixfold.whats-new.dismissed');
      }, { locale });
      await page.goto('/');
      await page.waitForFunction((locale) => document.documentElement.lang === locale && window.SixfoldI18n, locale);

      const panel = page.locator('#whats-new');
      await expect(panel).toBeVisible();
      const rendered = await panel.locator('.whats-new-list li').evaluateAll((items) => items.map((item) => item.textContent.trim()));
      const expected = await page.evaluate((keys) => keys.map((key) => window.SixfoldI18n.t(key)), WHATS_NEW_ITEMS);
      expect(rendered).toEqual(expected);

      const heading = (await panel.locator('.whats-new-label').textContent()).trim();
      const expectedHeading = await page.evaluate(() => {
        const i18n = window.SixfoldI18n;
        return i18n.number(i18n.t('What’s new in 6.0'));
      });
      expect(heading).toBe(expectedHeading);

      if (locale !== 'en') {
        expect(heading, locale + ' heading').not.toBe('What’s new in 6.0');
        expected.forEach((text, index) => {
          expect(text, locale + ' item ' + (index + 1)).not.toBe(WHATS_NEW_ITEMS[index]);
        });
      }

      // First visit stays a one-line release note: the collection is visible
      // before the reader asks for the changelog. Opening it reveals the list.
      const details = panel.locator('.whats-new-details');
      expect(await details.getAttribute('open'), locale + ' starts collapsed').toBeNull();
      await expect(panel.locator('.whats-new-list')).toBeHidden();
      const collapsedHeight = await panel.evaluate((element) => Math.round(element.getBoundingClientRect().height));
      expect(collapsedHeight, locale + ' collapsed panel height').toBeLessThanOrEqual(64);

      await details.locator('summary').click();
      await expect(details).toHaveAttribute('open', '');
      await expect(panel.locator('.whats-new-list')).toBeVisible();

      await page.setViewportSize({ width: 320, height: 720 });
      await expectNoClippedText(page, LANGUAGE_NAMES[locale] + ' What’s New at 320px', '#whats-new');

      if (locale === 'ar') {
        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
        const direction = await panel.evaluate((element) => getComputedStyle(element).direction);
        expect(direction, 'Arabic What’s New direction').toBe('rtl');
        const width = await panel.evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
        expect(width.scrollWidth, 'Arabic What’s New must not overflow').toBeLessThanOrEqual(width.clientWidth + 1);
      }
    });
  }
});

test('dismissing the card fades a ghost instead of animating layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.removeItem('sixfold.whats-new.dismissed');
  });
  await page.goto('/');
  const panel = page.locator('#whats-new');
  await expect(panel).toBeVisible();
  // Keep Playwright's click from scrolling the hub between the measurement
  // and the dismissal.
  await panel.scrollIntoViewIfNeeded();
  const before = await panel.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { height: rect.height };
  });
  expect(before.height).toBeGreaterThan(20);

  // Read the ghost as it is inserted. A Playwright click round-trip can outlast
  // the ghost's short life, which made this measurement a race.
  await page.evaluate(() => {
    window.__ghostBox = null;
    const observer = new MutationObserver(() => {
      const element = document.querySelector('.whats-new-ghost');
      if (!element || window.__ghostBox) return;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      window.__ghostBox = {
        position: style.position,
        transition: style.transitionProperty,
        height: rect.height,
        top: rect.top
      };
      observer.disconnect();
    });
    observer.observe(document.body, { childList: true });
  });
  await page.locator('#whats-new-close').click();
  await expect(panel).toBeHidden();

  // The page reflowed at once, and a fixed copy keeps the card's old place
  // while it fades: nothing animates height, margin or padding.
  const ghostBox = await page.evaluate(() => window.__ghostBox);
  expect(ghostBox, 'the dismissal inserted a ghost').not.toBeNull();
  expect(ghostBox.position).toBe('fixed');
  expect(ghostBox.transition).not.toContain('height');
  expect(ghostBox.transition).not.toContain('margin');
  expect(ghostBox.transition).toContain('opacity');
  expect(ghostBox.transition).toContain('transform');
  expect(ghostBox.height).toBeCloseTo(before.height, 0);

  await expect(page.locator('.whats-new-ghost')).toHaveCount(0, { timeout: 1500 });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sixfold.whats-new.dismissed'))).not.toBeNull();
});

test('the list reveal replays after the note is closed and opened again', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.removeItem('sixfold.whats-new.dismissed');
  });
  await page.goto('/');
  const panel = page.locator('#whats-new');
  const details = panel.locator('.whats-new-details');
  await expect(panel).toBeVisible();

  const revealRunning = () => page.evaluate(() => {
    const item = document.querySelector('.whats-new-details.is-opening .whats-new-list li');
    return Boolean(item && item.getAnimations().some((animation) =>
      animation.playState === 'running' && animation.animationName === 'whats-new-item'
    ));
  });

  await details.locator('summary').click();
  await expect(details).toHaveAttribute('open', '');
  await expect.poll(revealRunning, { message: 'the first opening staggers the list' }).toBe(true);

  await details.locator('summary').click();
  await expect(details).not.toHaveAttribute('open', '');
  await details.locator('summary').click();
  await expect(details).toHaveAttribute('open', '');
  await expect.poll(revealRunning, { message: 'the second opening staggers the list again' }).toBe(true);
});
