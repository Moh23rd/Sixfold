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

// Settling makes the finished tiles pressable, but settling on the first
// piece's animationend used to cancel the other five mid-build. The class may
// only land after every piece has finished its own sixBuild animation.
test('the cover settles only after all six pieces finish building', async ({ page }) => {
  await page.addInitScript(() => {
    window.__coverSettle = { ends: [], endsAtSettle: 0, settledAt: null };
    const state = window.__coverSettle;

    // Capture phase: the page's own listener adds `six-settled` while handling
    // the final animationend, and a microtask can be delivered between the two
    // listeners. Counting on the way down records the end first.
    document.addEventListener('animationend', (event) => {
      if (event.animationName !== 'sixBuild') return;
      const pieces = document.querySelectorAll('.home-six-piece');
      const index = Array.prototype.indexOf.call(pieces, event.target);
      if (index === -1) return;
      state.ends.push({ index: index, at: performance.now() });
    }, true);

    // documentElement does not exist yet at document-start, so the class
    // observer has to wait for the parser to build it.
    document.addEventListener('DOMContentLoaded', () => {
      const root = document.documentElement;
      const sample = () => {
        if (state.settledAt !== null || !root.classList.contains('six-settled')) return;
        state.settledAt = performance.now();
        state.endsAtSettle = state.ends.length;
      };
      new MutationObserver(sample).observe(root, { attributes: true, attributeFilter: ['class'] });
      sample();
    }, { once: true });
  });

  await page.goto('/');
  await page.waitForFunction(() => document.documentElement.classList.contains('six-settled'), null, {
    timeout: 10000
  });
  const result = await page.evaluate(() => window.__coverSettle);

  expect(result.ends.map((end) => end.index).sort(), 'all six pieces built').toEqual([0, 1, 2, 3, 4, 5]);
  expect(result.endsAtSettle, 'settling does not cut off a running build').toBe(6);
  const lastEnd = Math.max.apply(null, result.ends.map((end) => end.at));
  expect(result.settledAt, 'the settle class lands after the final animationend').toBeGreaterThanOrEqual(lastEnd);
});

// The legal page is a document of its own. Leaving it for the hub used to be a
// fresh launch on the web: the splash and the hub's entrances replayed over a
// collection that was already built. The return is now a cut on both paths.
test('returning from the legal page does not replay the launch', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => document.documentElement.classList.contains('home-ready'));

  await page.goto('/licenses.html');
  await Promise.all([
    page.waitForURL((url) => !url.pathname.endsWith('licenses.html')),
    page.getByRole('link', { name: /Back to Sixfold/i }).click()
  ]);
  await page.waitForFunction(() => !document.getElementById('boot-splash'));
  const linked = await page.evaluate(() => {
    const running = [];
    document.querySelectorAll('.home-six-piece, .home-grid .home-game').forEach((el) => {
      el.getAnimations().forEach((animation) => {
        if (animation.playState === 'running') running.push(animation.animationName);
      });
    });
    return {
      splash: Boolean(document.getElementById('boot-splash')),
      settled: document.documentElement.classList.contains('hub-settled'),
      running: running
    };
  });
  expect(linked.splash, 'the launch layer is not built on the way back').toBe(false);
  expect(linked.settled, 'the hub comes back already settled').toBe(true);
  expect(linked.running, 'no launch entrance runs on the way back').toEqual([]);

  // A back navigation that reloads the hub takes the same path.
  await page.goto('/licenses.html');
  await page.goBack();
  await page.waitForFunction(() => document.documentElement.classList.contains('home-ready'));
  await page.waitForFunction(() => !document.getElementById('boot-splash'));
  const backed = await page.evaluate(() => {
    const running = [];
    document.querySelectorAll('.home-six-piece, .home-grid .home-game').forEach((el) => {
      el.getAnimations().forEach((animation) => {
        if (animation.playState === 'running') running.push(animation.animationName);
      });
    });
    return { splash: Boolean(document.getElementById('boot-splash')), running: running };
  });
  expect(backed.splash, 'back is not a launch either').toBe(false);
  expect(backed.running, 'back does not replay the entrance').toEqual([]);
});
