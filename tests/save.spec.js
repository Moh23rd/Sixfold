const { test, expect } = require('@playwright/test');
const fs = require('fs');

const CARD = {
  game: 'Sudoku',
  number: '02',
  kind: 'LOGIC',
  title: 'Sudoku',
  score: '4:12',
  label: 'TIME',
  meta: ['Medium', 'no hints'],
  accent: '#39a9a1'
};

// A native shell whose gallery plugin refuses the write. The anchor stub keeps
// the download path observable without letting it touch the disk.
const REJECTING_SHELL = () => {
  window.__nativeSaves = [];
  window.__downloads = [];
  window.Capacitor = {
    isNativePlatform: function () { return true; },
    Plugins: {
      GallerySave: {
        save: function (payload) {
          window.__nativeSaves.push(payload && payload.name);
          return Promise.reject(new Error('storage denied'));
        }
      }
    }
  };
  HTMLAnchorElement.prototype.click = function () {
    if (this.download) window.__downloads.push(this.download);
  };
};

test.describe('failed native save', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(REJECTING_SHELL);
  });

  test('reports failure and never falls back to a download', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.MergeShareCard && window.MergeShareCard.save);

    const result = await page.evaluate(async (card) => {
      const file = window.MergeShareCard.fileSync(card);
      const saved = await window.MergeShareCard.save(file);
      return {
        saved,
        native: window.__nativeSaves.slice(),
        downloads: window.__downloads.slice()
      };
    }, CARD);

    expect(result.native, 'the plugin was asked once, with the card name').toEqual(['sixfold-sudoku.png']);
    expect(result.saved, 'a rejected plugin must not report success').toBe(false);
    expect(result.downloads, 'inside the shell a download is invisible, so it must not run').toEqual([]);
  });

  test('tells the reader the image was not saved', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.MergeShare && window.MergeShare.save);

    await page.locator('#hub-share').click();
    await expect(page.locator('#toast')).toHaveText('Couldn’t save the image.');
    expect(await page.evaluate(() => window.__nativeSaves.length)).toBe(1);
    expect(await page.evaluate(() => window.__downloads.length)).toBe(0);
  });
});

test('without a native shell the card is downloaded', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.MergeShareCard && window.MergeShareCard.save);
  expect(await page.evaluate(() => Boolean(
    window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()
  ))).toBe(false);

  const downloadPromise = page.waitForEvent('download');
  const saved = await page.evaluate(async (card) => {
    const file = window.MergeShareCard.fileSync(card);
    return window.MergeShareCard.save(file);
  }, CARD);
  const download = await downloadPromise;

  expect(saved).toBe(true);
  expect(download.suggestedFilename()).toBe('sixfold-sudoku.png');
  expect(fs.statSync(await download.path()).size).toBeGreaterThan(1000);
});
