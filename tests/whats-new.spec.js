const { test, expect } = require('@playwright/test');
const { LANGUAGE_NAMES, LOCALES, expectNoClippedText } = require('./helpers');

const WHATS_NEW_ITEMS = [
  'Daily Gauntlet: play all six daily challenges in one run, leave and resume at any round, and keep one finish time.',
  'A local profile on the badges page: daily and replay counts, bests, and every finished Gauntlet — stored on this device.',
  'A calmer finish: light, dark and palette changes fade smoothly, hidden games stop redrawing, and reduced motion still switches instantly.',
  'A sturdier app: saved cards reach the gallery, the window frame follows the app, and older Android WebViews stay supported.'
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
