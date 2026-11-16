const { test, expect } = require('@playwright/test');
const fs = require('fs');

const WATER_SORT = {
  title: 'Water Sort',
  text: 'I sorted Water Sort in 4 moves. Can you?',
  fileName: 'sixfold-water-sort.png',
  data: {
    game: 'Water Sort', number: '05', kind: 'SORTING', title: 'Water Sort',
    score: 4, label: 'MOVES', meta: ['Level 1 of 8', 'Every colour sorted'], accent: '#39a9a1'
  }
};

const NON_MERGE_CARDS = [
  WATER_SORT,
  {
    title: 'Sudoku',
    text: 'I solved a Medium Sudoku in 4:12 with no hints. Can you?',
    fileName: 'sixfold-sudoku.png',
    data: {
      game: 'Sudoku', number: '02', kind: 'LOGIC', title: 'Sudoku',
      score: '4:12', label: 'TIME', meta: ['Medium', 'no hints'], accent: '#39a9a1'
    }
  },
  {
    title: 'Tic Tac Toe',
    text: 'I beat the Medium computer at Tic Tac Toe.',
    fileName: 'sixfold-tic-tac-toe.png',
    data: {
      game: 'Tic Tac Toe', number: '03', kind: 'CLASSIC', title: 'You win',
      score: '3–1', label: 'WINS – LOSSES', meta: ['Medium computer', '2 draws'], accent: '#8bbd54'
    }
  },
  {
    title: 'Minesweeper',
    text: 'I cleared Minesweeper on Beginner in 0:42.',
    fileName: 'sixfold-minesweeper.png',
    data: {
      game: 'Minesweeper', number: '04', kind: 'LOGIC', title: 'Field cleared',
      score: '0:42', label: 'TIME', meta: ['Beginner', 'Every safe square open'], accent: '#5b8fd5'
    }
  },
  {
    title: 'Fruit Merge',
    text: 'I scored 512 in Fruit Merge. My best is 1024. Can you beat it?',
    fileName: 'sixfold-fruit-merge.png',
    data: {
      game: 'Fruit Merge', number: '06', kind: 'MERGING', title: 'Run complete',
      score: 512, label: 'POINTS', meta: ['Best 1024', 'Endless mode'], accent: '#e3b94a'
    }
  }
];

test.beforeEach(async ({ page }) => {
  // Any native share call would now be a regression, so record them.
  await page.addInitScript(() => {
    window.__shareCalls = [];
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: (data) => {
        window.__shareCalls.push(data);
        return Promise.resolve();
      }
    });
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: () => true
    });
  });
});

async function openPage(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.MergeShare && window.MergeShare.result);
}

async function saveCard(page, card) {
  const downloadPromise = page.waitForEvent('download');
  await page.evaluate(({ title, text, data }) => {
    window.MergeShare.result(title, text, data);
  }, card);
  const download = await downloadPromise;
  const size = fs.statSync(await download.path()).size;
  const shareCalls = await page.evaluate(() => window.__shareCalls.length);
  return { name: download.suggestedFilename(), size, shareCalls };
}

test('every game saves its PNG to the gallery instead of opening a share sheet', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await openPage(page);

  for (const card of NON_MERGE_CARDS) {
    const result = await saveCard(page, card);
    expect(result.shareCalls, card.title + ' should not call navigator.share').toBe(0);
    expect(result.name, card.title + ' saved file name').toBe(card.fileName);
    expect(result.size, card.title + ' saved a non-empty PNG').toBeGreaterThan(1000);
    await expect(page.locator('#toast')).toHaveText('Saved to your gallery.');
  }

  expect(pageErrors).toEqual([]);
});

test('the hub saves the collection card', async ({ page }) => {
  await openPage(page);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#hub-share').click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('sixfold-collection.png');
  expect(fs.statSync(await download.path()).size).toBeGreaterThan(1000);
  expect(await page.evaluate(() => window.__shareCalls.length)).toBe(0);
});

test('the daily share saves the daily card', async ({ page }) => {
  await openPage(page);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#daily-share').click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^sixfold-daily-\d{4}-\d{2}-\d{2}\.png$/);
  expect(fs.statSync(await download.path()).size).toBeGreaterThan(1000);
  expect(await page.evaluate(() => window.__shareCalls.length)).toBe(0);
});

test('Merge saves its PNG from the result card and offers no share button', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('merge2048.save', JSON.stringify({
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
    }));
  });
  await page.goto('/');
  await page.locator('.home-game[data-game="merge"]').click();
  await expect(page.locator('#overlay')).toBeVisible();
  await expect(page.locator('#result-preview-img')).toBeVisible();
  await expect(page.locator('#overlay-share')).toHaveCount(0);

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#overlay-save').click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('sixfold-merge.png');
  expect(fs.statSync(await download.path()).size).toBeGreaterThan(1000);
  expect(await page.evaluate(() => window.__shareCalls.length)).toBe(0);
  await expect(page.locator('#overlay-save')).toHaveText('Saved');
  expect(pageErrors).toEqual([]);
});
