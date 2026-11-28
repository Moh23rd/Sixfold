const { test, expect } = require('@playwright/test');

test.describe('PWA install and offline shell', () => {
  test.use({ serviceWorkers: 'allow' });

  test('install icons resolve and the offline shell keeps only the active locale', async ({ page, context }) => {
    await page.goto('/');
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller);

    const manifest = await page.evaluate(async () => {
      const response = await fetch('manifest.webmanifest');
      if (!response.ok) throw new Error('manifest returned ' + response.status);
      return response.json();
    });

    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);

    const icons = await page.evaluate(async (entries) => {
      const results = [];
      for (const entry of entries) {
        const response = await fetch(entry.src);
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob);
        results.push({
          src: entry.src,
          status: response.status,
          type: response.headers.get('Content-Type') || '',
          width: bitmap.width,
          height: bitmap.height
        });
        bitmap.close();
      }
      return results;
    }, manifest.icons);

    expect(icons).toHaveLength(manifest.icons.length);
    for (const icon of icons) {
      expect(icon.status, icon.src).toBe(200);
      expect(icon.type, icon.src).toContain('image/png');
      expect(icon.width, icon.src).toBe(icon.height);
    }
    expect(icons.some((icon) => new URL(icon.src, page.url()).pathname.endsWith('/icons/icon-1024.png'))).toBe(true);

    const cached = await page.evaluate(async () => {
      const paths = [];
      for (const name of (await caches.keys()).filter((value) => value.startsWith('sixfold-'))) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) paths.push(new URL(request.url).pathname);
      }
      return [...new Set(paths)];
    });

    // The 1024px art exists for install surfaces, but it is deliberately not
    // part of the offline shell. The catalog for a language the reader has not
    // selected is not downloaded either.
    expect(cached).not.toContain('/icons/icon-1024.png');
    expect(cached).not.toContain('/icons/icon-maskable-1024.png');
    expect(cached.some((path) => /^\/i18n\/i18n-(fr|de|zh-hans|ja|ko|pt-br|hi|kn|ar)\.js$/.test(path))).toBe(false);

    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('#hub')).toBeVisible();
  });
});
