const { test, expect } = require('@playwright/test');
const { setPreferences } = require('./helpers');
const { expectNoAxeViolations } = require('./accessibility');

const SAVED_GAME_OVER = {
  size: 4,
  score: 128,
  moves: 24,
  won: false,
  cells: [
    [2, 0, 0], [4, 0, 1], [2, 0, 2], [4, 0, 3],
    [4, 1, 0], [2, 1, 1], [4, 1, 2], [2, 1, 3],
    [2, 2, 0], [4, 2, 1], [2, 2, 2], [4, 2, 3],
    [4, 3, 0], [2, 3, 1], [4, 3, 2], [2, 3, 3]
  ]
};

async function openWordle(page) {
  await page.goto('/');
  await page.waitForSelector('#daily');
  await page.waitForFunction(() => document.documentElement.classList.contains('home-ready'));
  for (let i = 0; i < 6; i += 1) {
    await page.evaluate((index) => {
      const piece = document.querySelectorAll('.home-six-piece')[index];
      if (piece) piece.click();
    }, i);
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(450);
  const skip = page.locator('#hidden-reveal-skip');
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.waitForSelector('body[data-screen="wordle"]');
  await page.waitForSelector('#wordle-board .wordle-tile');
  await page.waitForTimeout(200);
}

async function openGame(page, game) {
  await page.goto('/');
  await page.waitForSelector('#daily');
  await page.locator('.home-game[data-game="' + game + '"]').click();
  await page.waitForSelector(game === 'merge' ? 'main.app' : '#' + game);
}

async function solveWordle(page) {
  const answer = await page.evaluate(() => {
    const game = JSON.parse(localStorage.getItem('sixfold.wordle.game.v1'));
    return game && game.answer;
  });
  expect(answer, 'Wordle has an answer').toBeTruthy();
  for (const character of Array.from(answer)) {
    await page.locator('#wordle-keyboard [data-key="' + character + '"]').click();
  }
  await page.locator('#wordle-keyboard [data-key="Enter"]').click();
  await expect(page.locator('#wordle-result')).toBeVisible();
}

async function showSudokuResult(page) {
  await openGame(page, 'sudoku');
  await page.waitForSelector('#sudoku-board .sudoku-cell');
  // Sudoku's activate() pass hides the result. Wait for the timer to tick so
  // that pass has finished before exposing the overlay for the axe scan.
  await page.waitForFunction(() => {
    const time = document.getElementById('sudoku-time');
    return time && time.textContent.trim() !== '0:00';
  });
  await page.evaluate(() => {
    document.getElementById('sudoku-result-stats').textContent = 'Easy · 4:12 · no hints';
    document.getElementById('sudoku-result').hidden = false;
  });
  await expect(page.locator('#sudoku-result')).toBeVisible();
}

async function showTttResult(page) {
  await openGame(page, 'ttt');
  await page.locator('[data-ttt-mode="two"]').click();
  const cells = page.locator('#ttt-board .ttt-cell');
  for (const index of [0, 1, 4, 2, 8]) {
    await cells.nth(index).click();
    await page.waitForTimeout(100);
  }
  await expect(page.locator('#ttt-result')).toBeVisible();
  await page.evaluate(() => window.MergeAutoNext && window.MergeAutoNext.cancel());
}

async function showMinesResult(page) {
  await openGame(page, 'mines');
  await page.evaluate(() => {
    document.querySelector('#mines .play-feedback').classList.remove('has-coach');
    document.getElementById('mines-result').hidden = false;
  });
  await expect(page.locator('#mines-result')).toBeVisible();
}

async function showWaterResult(page) {
  await openGame(page, 'water');
  await page.evaluate(() => {
    document.querySelector('#water .play-feedback').classList.remove('has-coach');
    document.getElementById('water-win').hidden = false;
  });
  await expect(page.locator('#water-win')).toBeVisible();
}

async function showFruitResult(page) {
  await openGame(page, 'fruit');
  await page.evaluate(() => { document.getElementById('fruit-over').hidden = false; });
  await expect(page.locator('#fruit-over')).toBeVisible();
}

for (const theme of ['light', 'dark']) {
  test('Wordle and every result overlay have no axe violations in ' + theme, async ({ page }) => {
    test.setTimeout(180000);
    await setPreferences(page, theme, 'en');
    await page.addInitScript((saved) => {
      localStorage.setItem('merge2048.save', JSON.stringify(saved));
    }, SAVED_GAME_OVER);

    await openWordle(page);
    await expectNoAxeViolations(page, 'Wordle ' + theme);
    await solveWordle(page);
    await expectNoAxeViolations(page, 'Wordle result ' + theme);

    await openGame(page, 'merge');
    await page.waitForSelector('#overlay:not([hidden])');
    await expectNoAxeViolations(page, 'Merge result ' + theme);

    await showSudokuResult(page);
    await expectNoAxeViolations(page, 'Sudoku result ' + theme);

    await showTttResult(page);
    await expectNoAxeViolations(page, 'Tic Tac Toe result ' + theme);

    await showMinesResult(page);
    await expectNoAxeViolations(page, 'Minesweeper result ' + theme);

    await showWaterResult(page);
    await expectNoAxeViolations(page, 'Water Sort result ' + theme);

    await showFruitResult(page);
    await expectNoAxeViolations(page, 'Fruit Merge result ' + theme);
  });
}
