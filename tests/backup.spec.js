const { test, expect } = require('@playwright/test');
const fs = require('fs');

const SEED = {
  'merge2048.best': '4242',
  'sixfold.settings.v1': JSON.stringify({ highContrast: true, dailyPuzzle: false }),
  'sixfold.daily.v1': JSON.stringify({ days: {}, best: 9 }),
  // Already in the shape the store writes: loading the app backfills an
  // unnormalized value and would change the bytes this test compares.
  'sixfold.profile.v1': JSON.stringify({
    version: 1,
    updated: '2025-03-02T00:00:00.000Z',
    games: { merge: { done: 0, first: null, last: null, replays: 1 } },
    gauntlet: { runs: 1, bestRounds: 6, bestTime: 420, last: null }
  })
};

async function seed(page) {
  await page.goto('/');
  await page.evaluate((values) => {
    Object.keys(values).forEach((key) => localStorage.setItem(key, values[key]));
  }, SEED);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
}

async function openSheet(page) {
  await page.locator('#appearance').click();
  await expect(page.locator('#sheet')).toBeVisible();
}

test('a backup downloads, and restoring it replaces the device state', async ({ page }) => {
  await seed(page);
  await openSheet(page);

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#backup-export').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^sixfold-backup-\d{4}-\d{2}-\d{2}\.json$/);

  const file = await download.path();
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(payload.app).toBe('Sixfold');
  expect(payload.data).toEqual(expect.objectContaining(SEED));

  // Wipe what a restore must overwrite. The keys are gone before the file is
  // handed back, so only the backup can bring them back.
  await page.evaluate(() => {
    localStorage.setItem('merge2048.best', '1');
    localStorage.removeItem('sixfold.daily.v1');
    localStorage.setItem('sixfold.settings.v1', JSON.stringify({ highContrast: false, dailyPuzzle: true }));
  });

  page.once('dialog', (dialog) => dialog.accept());
  const reloaded = page.waitForEvent('load');
  await page.setInputFiles('#backup-import', {
    name: 'sixfold-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload))
  });
  await reloaded;

  const restored = await page.evaluate(() => ({
    best: localStorage.getItem('merge2048.best'),
    daily: localStorage.getItem('sixfold.daily.v1'),
    settings: localStorage.getItem('sixfold.settings.v1'),
    profile: localStorage.getItem('sixfold.profile.v1')
  }));
  expect(restored.best).toBe('4242');
  expect(restored.daily).toBe(SEED['sixfold.daily.v1']);
  expect(restored.settings).toBe(SEED['sixfold.settings.v1']);
  expect(restored.profile, 'the 6.0 profile key travels with the backup').toBe(SEED['sixfold.profile.v1']);
  // The restored settings are applied, not merely written.
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
});

// The installed app has no download manager: an <a download> writes nothing.
// The export must hand a real file to the system instead.
const NATIVE_SHELL = () => {
  window.__writes = [];
  window.__shares = [];
  window.__downloads = [];
  window.Capacitor = {
    isNativePlatform: function () { return true; },
    Plugins: {
      Filesystem: {
        writeFile: function (options) {
          window.__writes.push(options);
          return Promise.resolve({ uri: 'file:///cache/' + options.path });
        }
      },
      Share: {
        share: function (options) {
          window.__shares.push(options);
          return Promise.resolve();
        }
      }
    }
  };
  HTMLAnchorElement.prototype.click = function () {
    if (this.download) window.__downloads.push(this.download);
  };
};

test('inside the app a backup is a real file, not an invisible download', async ({ page }) => {
  await page.addInitScript(NATIVE_SHELL);
  await seed(page);
  await openSheet(page);

  await page.locator('#backup-export').click();
  await expect.poll(() => page.evaluate(() => window.__writes.length)).toBe(1);

  const result = await page.evaluate(() => {
    const write = window.__writes[0];
    const binary = atob(write.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return {
      path: write.path,
      directory: write.directory,
      encoding: write.encoding,
      payload: JSON.parse(new TextDecoder().decode(bytes)),
      shares: window.__shares.slice(),
      downloads: window.__downloads.slice()
    };
  });

  expect(result.path).toMatch(/^sixfold-backup-\d{4}-\d{2}-\d{2}\.json$/);
  expect(result.directory).toBe('CACHE');
  expect(result.encoding).toBe('base64');
  expect(result.payload.app).toBe('Sixfold');
  expect(result.payload.data).toEqual(expect.objectContaining(SEED));

  expect(result.shares).toHaveLength(1);
  expect(result.shares[0].url).toBe('file:///cache/' + result.path);
  expect(result.downloads, 'the WebView cannot download, so the anchor must not run').toEqual([]);
  await expect(page.locator('#backup-status')).toContainText('Keep the file somewhere safe');
});
