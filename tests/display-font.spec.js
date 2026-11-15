const { test, expect } = require('@playwright/test');

test('heading, wordmark and labels use Google Sans Flex', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#hub-title');
  await page.evaluate(async () => { await document.fonts.ready; });

  const state = await page.evaluate(async () => {
    await document.fonts.load('700 48px "Google Sans Flex"', 'SIXFOLD');
    const faces = Array.from(document.fonts).filter((face) => face.family === 'Google Sans Flex');
    const read = (selector) => {
      const styles = getComputedStyle(document.querySelector(selector));
      return { family: styles.fontFamily, weight: styles.fontWeight };
    };
    return {
      faces: faces.map((face) => ({ status: face.status })),
      loaded: document.fonts.check('700 48px "Google Sans Flex"', 'SIXFOLD'),
      heading: read('#hub-title'),
      wordmark: read('.hub-word'),
      label: read('.hub-tagline'),
      removedDisplayFace: Array.from(document.fonts).some((face) => face.family === 'Space Grotesk')
    };
  });

  expect(state.faces.length, 'Google Sans Flex @font-face').toBeGreaterThan(0);
  expect(state.faces.some((face) => face.status === 'loaded'), 'Google Sans Flex loads').toBe(true);
  expect(state.loaded, 'Google Sans Flex covers display text').toBe(true);
  expect(state.removedDisplayFace, 'no separate display face is registered').toBe(false);

  for (const [name, style] of [
    ['heading', state.heading],
    ['wordmark', state.wordmark],
    ['label', state.label]
  ]) {
    expect(style.family, name + ' font family').toMatch(/^"?Google Sans Flex"?/);
    expect(style.weight, name + ' font weight').toBe('700');
  }
});

test('generated share cards draw with Google Sans Flex', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.MergeShareCard);

  const fonts = await page.evaluate(() => {
    const seen = [];
    const proto = CanvasRenderingContext2D.prototype;
    const original = proto.fillText;
    proto.fillText = function (...args) {
      seen.push(this.font);
      return original.apply(this, args);
    };
    try {
      window.MergeShareCard.draw({
        game: 'Merge',
        title: 'Result',
        score: 2048,
        label: 'POINTS',
        meta: ['Best 4096']
      });
    } finally {
      proto.fillText = original;
    }
    return seen;
  });

  expect(fonts.length, 'share card text').toBeGreaterThan(0);
  expect(fonts.every((font) => font.includes('Google Sans Flex')), 'all share card text uses Google Sans Flex').toBe(true);
});
