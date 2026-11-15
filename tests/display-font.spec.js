const { test, expect } = require('@playwright/test');

test('display face stays Space Grotesk and is loaded', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#hub-title');
  await page.evaluate(async () => { await document.fonts.ready; });

  const state = await page.evaluate(async () => {
    await document.fonts.load('700 48px "Space Grotesk"', 'SIXFOLD');
    const faces = Array.from(document.fonts).filter((face) => face.family === 'Space Grotesk');
    const read = (selector) => {
      const styles = getComputedStyle(document.querySelector(selector));
      return { family: styles.fontFamily, weight: styles.fontWeight };
    };
    return {
      faces: faces.map((face) => ({ weight: face.weight, status: face.status })),
      loaded: document.fonts.check('700 48px "Space Grotesk"', 'SIXFOLD'),
      heading: read('#hub-title'),
      wordmark: read('.hub-word')
    };
  });

  expect(state.faces.length, 'Space Grotesk @font-face').toBeGreaterThan(0);
  expect(state.faces.some((face) => face.status === 'loaded'), 'Space Grotesk loads').toBe(true);
  expect(state.loaded, 'Space Grotesk covers its display text').toBe(true);

  const weights = state.faces.flatMap((face) => face.weight.split(/\s+/).map(Number));
  expect(Math.max(...weights), 'display face covers 800-weight headings').toBeGreaterThanOrEqual(800);

  for (const [name, style] of [['heading', state.heading], ['wordmark', state.wordmark]]) {
    expect(style.family, name + ' font family').toMatch(/^"?Space Grotesk"?/);
    expect(style.weight, name + ' font weight').toBe('700');
  }
});
