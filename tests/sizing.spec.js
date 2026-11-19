const { test, expect } = require('@playwright/test');
const { waitForEntrance } = require('./helpers');

// Every play screen is a fixed, non-scrolling shell: a board that grows past
// the viewport does not scroll into view, its footer is simply cut off. These
// are the phone sizes where the collection has to hold its own chrome, the
// board and the footer on one screen at once.
const GAMES = ['merge', 'sudoku', 'ttt', 'mines', 'water', 'fruit'];
const PHONES = [
  { width: 320, height: 568, name: '320x568' },
  { width: 360, height: 640, name: '360x640' },
  { width: 375, height: 667, name: '375x667' }
];

// Merge is not a fixed play screen: its columns share the page, so its content
// is measured against the page. The six games are fixed shells, where anything
// past the screen is clipped rather than scrolled to.
function screenOverflow() {
  const screen = document.body.dataset.screen;
  const merge = screen === 'merge';
  const root = merge ? document.querySelector('main.app') : document.getElementById(screen);
  const foot = root.querySelector('.play-foot, .footer');
  const footBox = foot ? foot.getBoundingClientRect() : null;
  const page = document.documentElement;
  return {
    screen,
    vertical: merge ? 0 : root.scrollHeight - root.clientHeight,
    horizontal: page.scrollWidth - page.clientWidth,
    footBottom: footBox ? Math.round(footBox.bottom) : 0,
    viewport: window.innerHeight
  };
}

for (const phone of PHONES) {
  test(phone.name + ' holds every game on one screen', async ({ page }) => {
    await page.setViewportSize({ width: phone.width, height: phone.height });
    await page.goto('/');
    await page.waitForSelector('#daily');
    await page.waitForFunction(() => document.documentElement.classList.contains('home-ready'));

    for (const game of GAMES) {
      await page.locator('.home-game[data-game="' + game + '"]').click();
      await page.waitForSelector(game === 'merge' ? 'main.app' : '#' + game);
      await waitForEntrance(page);
      const state = await page.evaluate(screenOverflow);

      expect(state.horizontal, phone.name + ' ' + game + ' scrolls sideways').toBeLessThanOrEqual(1);
      expect(state.vertical, phone.name + ' ' + game + ' is taller than its screen').toBeLessThanOrEqual(1);
      expect(state.footBottom, phone.name + ' ' + game + ' footer sits below the screen').toBeLessThanOrEqual(state.viewport);

      await page.locator('#' + (game === 'merge' ? 'back-to-games' : game + ' [data-back]')).first().click();
      await page.waitForSelector('#hub');
    }
  });
}
