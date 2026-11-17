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

// The plugin the shell actually talks to: a chunked session whose publish step
// can fail. `write` collects the base64 so the test can prove the pieces add up
// to a whole PNG.
const CHUNKED_SHELL = (failOnEnd) => {
  window.__chunks = [];
  window.__aborted = 0;
  window.__downloads = [];
  window.Capacitor = {
    isNativePlatform: function () { return true; },
    Plugins: {
      GallerySave: {
        begin: function () { return Promise.resolve({ id: 'session' }); },
        write: function (payload) { window.__chunks.push(payload.data); return Promise.resolve({ received: 1 }); },
        end: function () {
          return failOnEnd ? Promise.reject(new Error('publish failed')) : Promise.resolve({ uri: 'content://x' });
        },
        abort: function () { window.__aborted += 1; return Promise.resolve(); }
      }
    }
  };
  HTMLAnchorElement.prototype.click = function () {
    if (this.download) window.__downloads.push(this.download);
  };
};

test.describe('chunked gallery session', () => {
  test('a failed publish aborts the session and reports failure', async ({ page }) => {
    await page.addInitScript(CHUNKED_SHELL, true);
    await page.goto('/');
    await page.waitForFunction(() => window.MergeShareCard && window.MergeShareCard.save);

    const result = await page.evaluate(async (card) => {
      const file = window.MergeShareCard.fileSync(card);
      return {
        saved: await window.MergeShareCard.save(file),
        chunks: window.__chunks.length,
        aborted: window.__aborted,
        downloads: window.__downloads.slice()
      };
    }, CARD);

    expect(result.saved).toBe(false);
    expect(result.chunks).toBeGreaterThan(1);
    expect(result.aborted, 'a half-written session is thrown away').toBe(1);
    expect(result.downloads).toEqual([]);
  });

  test('the chunks add up to one whole 1080px PNG', async ({ page }) => {
    await page.addInitScript(CHUNKED_SHELL, false);
    await page.goto('/');
    await page.waitForFunction(() => window.MergeShareCard && window.MergeShareCard.save);

    const result = await page.evaluate(async (card) => {
      const file = window.MergeShareCard.fileSync(card);
      const saved = await window.MergeShareCard.save(file);
      const joined = window.__chunks.join('');
      const binary = atob(joined);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const view = new DataView(bytes.buffer);
      return {
        saved,
        chunks: window.__chunks.length,
        signature: Array.from(bytes.slice(0, 4)).join(','),
        width: view.getUint32(16),
        height: view.getUint32(20),
        bytes: bytes.length
      };
    }, CARD);

    expect(result.saved).toBe(true);
    expect(result.chunks).toBeGreaterThan(1);
    expect(result.signature, 'PNG magic').toBe('137,80,78,71');
    expect([result.width, result.height]).toEqual([1080, 1080]);
    expect(result.bytes).toBeGreaterThan(1000);
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
