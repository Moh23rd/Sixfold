const { test, expect } = require('@playwright/test');

const GAMES = ['merge', 'sudoku', 'ttt', 'mines', 'water', 'fruit'];
const COVER = ['#e85f3b', '#efb07a', '#e3b94a', '#8bbd54', '#39a9a1', '#5b8fd5'];

test('six game colours stay in cover order on every shared surface', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.MergeShareCard && window.MergeTheme);

  for (const palette of ['warm', 'ocean', 'dusk']) {
    await page.evaluate((id) => {
      document.querySelector('[data-palette-opt="' + id + '"]').click();
    }, palette);

    const surfaces = await page.evaluate(({ games, cover }) => {
      const expected = cover.map((hex) => window.MergeTheme.colour(hex));
      const hub = games.map((game) => {
        const card = document.querySelector('.home-game[data-game="' + game + '"]');
        return getComputedStyle(card).getPropertyValue('--game-accent').trim();
      });
      const cartridges = games.map((game) => {
        const screen = document.querySelector(game === 'merge' ? '.app' : '#' + game);
        return getComputedStyle(screen).getPropertyValue('--cart').trim();
      });
      const dots = games.map((game) => {
        const dot = document.querySelector('.daily-week-dot[data-game="' + game + '"]');
        return getComputedStyle(dot).getPropertyValue('--dot-color').trim();
      });

      const pixel = (canvas, x, y) => {
        const data = canvas.getContext('2d').getImageData(x, y, 1, 1).data;
        return '#' + [data[0], data[1], data[2]].map((value) => value.toString(16).padStart(2, '0')).join('');
      };
      const daily = window.MergeShareCard.draw({
        daily: true, game: 'Merge', kind: 'Numbers', goal: 'Test goal',
        date: '2026-01-01', label: 'Thursday, January 1', color: expected[0], index: 0
      });
      const result = window.MergeShareCard.draw({
        game: 'Merge', number: '01', kind: 'NUMBERS', title: 'Test',
        score: 2048, label: 'POINTS', meta: [], accent: expected[0]
      });

      return {
        expected,
        hub,
        cartridges,
        dots,
        dailyStrip: [0, 1, 2, 3, 4, 5].map((i) => pixel(daily, 118 + i * 86, 670)),
        resultStrip: [0, 1, 2, 3, 4, 5].map((i) => pixel(result, 112 + i * 74, 748)),
        resultAccent: pixel(result, 90, 538)
      };
    }, { games: GAMES, cover: COVER });

    if (palette === 'warm') expect(surfaces.expected, 'Warm should be the hand-tuned cover colours').toEqual(COVER);
    for (const surface of ['hub', 'cartridges', 'dots', 'dailyStrip', 'resultStrip']) {
      expect(surfaces[surface], palette + ' ' + surface).toEqual(surfaces.expected);
    }
    expect(surfaces.resultAccent, palette + ' share-card accent').toBe(surfaces.expected[2]);
  }
});
