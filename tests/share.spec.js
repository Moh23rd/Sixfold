const { test, expect } = require('@playwright/test');

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
  await page.addInitScript(() => {
    window.__shareMode = 'resolve';
    window.__shareCalls = [];
    window.__copiedText = [];
    window.__canShareFiles = true;
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: (data) => window.__canShareFiles !== false && Boolean(data && data.files && data.files.length)
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: (data) => {
        const call = {
          title: data.title,
          text: data.text,
          url: data.url,
          files: Array.from(data.files || [], (file) => ({
            name: file.name,
            type: file.type,
            size: file.size
          }))
        };
        window.__shareCalls.push(call);
        if (window.__shareMode === 'throw') throw new Error('share unavailable');
        if (window.__shareMode === 'reject-files' && call.files.length) {
          return Promise.reject(new Error('file share failed'));
        }
        return Promise.resolve();
      }
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text) => {
          window.__copiedText.push(text);
          return Promise.resolve();
        }
      }
    });
  });
});

async function openSharePage(page, mode = 'resolve') {
  await page.goto('/');
  await page.waitForFunction(() => window.MergeShare && window.MergeShare.result);
  await page.evaluate((nextMode) => { window.__shareMode = nextMode; }, mode);
}

async function expectShareFallback(scope, note) {
  const fallback = scope.locator('#share-fallback');
  await expect(fallback).toBeVisible();
  await expect(fallback.locator('#share-fallback-title')).toHaveText('Save your result');
  await expect(fallback.locator('.share-fallback-image')).toHaveAttribute('src', /^blob:/);
  await expect(fallback.locator('.share-fallback-save')).toHaveAttribute('download', /^sixfold-.+\.png$/);
  await expect(fallback.locator('.share-fallback-save')).toHaveAttribute('href', /^blob:/);
  await expect(fallback.locator('#share-fallback-note')).toContainText(note);
}

async function shareFromClick(page, card) {
  return page.evaluate(({ title, text, data }) => {
    window.__shareCalls = [];
    window.__copiedText = [];
    let shareDuringClick = false;
    let copyDuringClick = false;
    const button = document.createElement('button');
    button.addEventListener('click', () => {
      window.MergeShare.result(title, text, data);
      shareDuringClick = window.__shareCalls.length === 1;
      copyDuringClick = window.__copiedText.length === 1;
    });
    button.click();
    return {
      shareDuringClick,
      copyDuringClick,
      calls: window.__shareCalls,
      copied: window.__copiedText
    };
  }, card);
}

test('non-Merge shares send a PNG during the click instead of copying text', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await openSharePage(page);

  for (const card of NON_MERGE_CARDS) {
    const result = await shareFromClick(page, card);

    expect(result.shareDuringClick, card.title + ' should call navigator.share before the click returns').toBe(true);
    expect(result.calls, card.title + ' should make exactly one native share call').toHaveLength(1);
    expect(result.calls[0].files, card.title + ' should share one file').toHaveLength(1);
    expect(result.calls[0].files[0]).toMatchObject({ name: card.fileName, type: 'image/png' });
    expect(result.calls[0].files[0].size, card.title + ' should share a non-empty PNG').toBeGreaterThan(1000);
    expect(result.calls[0].title, card.title + ' should send only the file, without title').toBeUndefined();
    expect(result.calls[0].text, card.title + ' should send only the file, without text').toBeUndefined();
    expect(result.calls[0].url, card.title + ' should send only the file, without a URL').toBeUndefined();
    expect(result.copied, card.title + ' should not fall back to copying text').toEqual([]);
  }

  expect(pageErrors).toEqual([]);
});

test('a synchronous navigator.share failure shows the save-card fallback', async ({ page }) => {
  await openSharePage(page, 'throw');
  const result = await shareFromClick(page, WATER_SORT);

  expect(result.shareDuringClick).toBe(true);
  expect(result.copyDuringClick).toBe(false);
  expect(result.calls).toHaveLength(1);
  expect(result.copied).toEqual([]);
  await expectShareFallback(page, 'native image share sheet');
});

test('an asynchronous navigator.share rejection shows the save-card fallback', async ({ page }) => {
  await openSharePage(page, 'reject-files');
  const firstCall = await shareFromClick(page, WATER_SORT);

  expect(firstCall.shareDuringClick).toBe(true);
  await expectShareFallback(page, 'native image share sheet');
  const result = await page.evaluate(() => ({
    calls: window.__shareCalls,
    copied: window.__copiedText
  }));

  expect(result.calls).toHaveLength(1);
  expect(result.calls[0].files).toHaveLength(1);
  expect(result.calls[0].files[0].type).toBe('image/png');
  expect(result.copied).toEqual([]);
});

test('when the browser cannot share image files, the generated card can be saved', async ({ page }) => {
  await openSharePage(page);
  await page.evaluate(() => { window.__canShareFiles = false; });
  const result = await shareFromClick(page, WATER_SORT);

  expect(result.shareDuringClick).toBe(false);
  expect(result.calls).toEqual([]);
  expect(result.copied).toEqual([]);
  await expectShareFallback(page, 'native image share sheet');
});

test('the share fallback explains when the embedded preview blocks sharing', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const frame = document.createElement('iframe');
    frame.id = 'share-preview-frame';
    frame.src = '/';
    frame.style.cssText = 'position:fixed;left:0;top:0;width:390px;height:700px;border:0;z-index:9999';
    document.body.appendChild(frame);
  });
  const handle = await page.locator('#share-preview-frame').elementHandle();
  const frame = await handle.contentFrame();
  expect(frame).not.toBeNull();
  await frame.waitForFunction(() => window.MergeShare && window.MergeShare.result && window.MergeShareCard);
  await frame.evaluate((card) => {
    window.__canShareFiles = false;
    window.MergeShare.result(card.title, card.text, card.data);
  }, WATER_SORT);
  await expectShareFallback(frame, 'embedded preview');
});

test('Merge shares only its PNG with navigator.share', async ({ page }) => {
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

  const result = await page.evaluate(() => {
    window.__shareCalls = [];
    window.__copiedText = [];
    const button = document.getElementById('overlay-share');
    button.click();
    return {
      shareDuringClick: window.__shareCalls.length === 1,
      calls: window.__shareCalls,
      copied: window.__copiedText
    };
  });

  expect(result.shareDuringClick).toBe(true);
  expect(result.calls).toHaveLength(1);
  expect(result.calls[0].files).toHaveLength(1);
  expect(result.calls[0].files[0]).toMatchObject({ name: 'sixfold-merge.png', type: 'image/png' });
  expect(result.calls[0].files[0].size).toBeGreaterThan(1000);
  expect(result.calls[0].title).toBeUndefined();
  expect(result.calls[0].text).toBeUndefined();
  expect(result.calls[0].url).toBeUndefined();
  expect(result.copied).toEqual([]);
  expect(pageErrors).toEqual([]);
});
