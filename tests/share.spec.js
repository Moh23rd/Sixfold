const { test, expect } = require('@playwright/test');

const NON_MERGE_CARDS = [
  {
    title: 'Water Sort',
    text: 'I sorted Water Sort in 4 moves. Can you?',
    fileName: 'sixfold-water-sort.png',
    data: {
      game: 'Water Sort', number: '05', kind: 'SORTING', title: 'Water Sort',
      score: 4, label: 'MOVES', meta: ['Level 1 of 8', 'Every colour sorted'], accent: '#39a9a1'
    }
  },
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

test('non-Merge shares send a PNG during the click instead of copying text', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.addInitScript(() => {
    window.__shareCalls = [];
    window.__copiedText = [];
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: (data) => Boolean(data && data.files && data.files.length)
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: (data) => {
        window.__shareCalls.push({
          title: data.title,
          text: data.text,
          files: Array.from(data.files || [], (file) => ({
            name: file.name,
            type: file.type,
            size: file.size
          }))
        });
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

  await page.goto('/');
  await page.waitForFunction(() => window.MergeShare && window.MergeShare.result);

  for (const card of NON_MERGE_CARDS) {
    const result = await page.evaluate(({ title, text, data }) => {
      window.__shareCalls = [];
      window.__copiedText = [];
      let shareDuringClick = false;
      const button = document.createElement('button');
      button.addEventListener('click', () => {
        window.MergeShare.result(title, text, data);
        shareDuringClick = window.__shareCalls.length === 1;
      });
      button.click();
      return {
        shareDuringClick,
        calls: window.__shareCalls,
        copied: window.__copiedText
      };
    }, card);

    expect(result.shareDuringClick, card.title + ' should call navigator.share before the click returns').toBe(true);
    expect(result.calls, card.title + ' should make exactly one native share call').toHaveLength(1);
    expect(result.calls[0].files, card.title + ' should share one file').toHaveLength(1);
    expect(result.calls[0].files[0]).toMatchObject({ name: card.fileName, type: 'image/png' });
    expect(result.calls[0].files[0].size, card.title + ' should share a non-empty PNG').toBeGreaterThan(1000);
    expect(result.calls[0].text).toContain(card.title);
    expect(result.copied, card.title + ' should not fall back to copying text').toEqual([]);
  }

  expect(pageErrors).toEqual([]);
});

test('a synchronous navigator.share failure falls back to copying text', async ({ page }) => {
  await page.addInitScript(() => {
    window.__shareCalls = 0;
    window.__copiedText = [];
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: (data) => Boolean(data && data.files && data.files.length)
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: () => {
        window.__shareCalls += 1;
        throw new Error('share unavailable');
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

  await page.goto('/');
  await page.waitForFunction(() => window.MergeShare && window.MergeShare.result);

  const result = await page.evaluate(() => {
    window.__shareCalls = 0;
    window.__copiedText = [];
    let copyDuringClick = false;
    const button = document.createElement('button');
    button.addEventListener('click', () => {
      window.MergeShare.result('Water Sort', 'I sorted Water Sort in 4 moves. Can you?', {
        game: 'Water Sort', number: '05', kind: 'SORTING', title: 'Water Sort',
        score: 4, label: 'MOVES', meta: ['Level 1 of 8', 'Every colour sorted'], accent: '#39a9a1'
      });
      copyDuringClick = window.__copiedText.length === 1;
    });
    button.click();
    return {
      copyDuringClick,
      shareCalls: window.__shareCalls,
      copied: window.__copiedText
    };
  });

  expect(result.shareCalls).toBe(1);
  expect(result.copyDuringClick).toBe(true);
  expect(result.copied).toHaveLength(1);
  expect(result.copied[0]).toContain('I sorted Water Sort in 4 moves. Can you?');
  expect(result.copied[0]).toContain('http://127.0.0.1:8000/');
});
