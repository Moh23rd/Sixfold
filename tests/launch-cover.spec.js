const { test, expect } = require('@playwright/test');

// The cover used to paint fully built under the fading splash, then restart
// from its first keyframe when home-ready arrived. Full is the default, so this
// has to hold on a machine that asks the OS for reduced motion too.
test('the cover builds as the launch layer lifts, never as a static flash', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    window.__launchCover = { app: null, home: null, afterApp: null, afterHome: null };

    const read = () => {
      const pieces = Array.from(document.querySelectorAll('.home-six-piece'));
      return {
        opacity: pieces.map((piece) => Number(getComputedStyle(piece).opacity)),
        animation: pieces.map((piece) => getComputedStyle(piece).animationName),
        delay: pieces.map((piece) => {
          const value = getComputedStyle(piece).animationDelay;
          return Math.round(value.endsWith('ms') ? parseFloat(value) : parseFloat(value) * 1000);
        })
      };
    };

    const sample = () => {
      const state = window.__launchCover;
      const html = document.documentElement;
      if (state.app === null && html.classList.contains('app-ready')) {
        state.app = performance.now();
        state.afterApp = read();
      }
      if (state.home === null && html.classList.contains('home-ready')) {
        state.home = performance.now();
        state.afterHome = read();
      }
    };

    const attach = () => {
      new MutationObserver(sample).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class']
      });
      sample();
    };

    if (document.documentElement) attach();
    else document.addEventListener('DOMContentLoaded', attach, { once: true });
  });

  await page.goto('/');
  await page.waitForFunction(() => document.documentElement.classList.contains('home-ready'));
  const cover = await page.evaluate(() => window.__launchCover);

  expect(cover.app, 'the launch layer marked app-ready').not.toBeNull();
  expect(cover.home, 'the hub marked home-ready').not.toBeNull();
  expect(
    cover.afterApp.animation,
    'the six-piece build is armed before the cover can be seen'
  ).toEqual(Array(6).fill('sixBuild'));
  for (const opacity of cover.afterApp.opacity) {
    expect(opacity, 'the finished cover is not painted under the fading splash').toBeLessThan(0.25);
  }
  for (let index = 1; index < cover.afterApp.delay.length; index += 1) {
    expect(cover.afterApp.delay[index], 'the pieces are staggered').toBeGreaterThan(
      cover.afterApp.delay[index - 1]
    );
  }
  expect(
    cover.afterHome.delay,
    'the hand-off does not retime the running build'
  ).toEqual(cover.afterApp.delay);
  expect(
    cover.afterHome.opacity[0],
    'the first piece is already building at the hand-off'
  ).toBeGreaterThan(0.5);
});
