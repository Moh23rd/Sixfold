const { test, expect } = require('@playwright/test');

// A phone turned on its side, measured in CSS pixels, with the status and
// navigation bars the shell reports through --safe-area-inset-*. The boards
// must sit between the bars and the rail's controls must not land on each
// other; both used to happen at these sizes.
const INSETS = { top: 24, bottom: 24, left: 0, right: 0 };
const VIEWPORTS = [
  { name: '800x356', width: 800, height: 356 },
  { name: '932x430', width: 932, height: 430 },
  { name: '520x320', width: 520, height: 320 }
];

async function setSafeArea(page, insets) {
  await page.evaluate((insets) => {
    const root = document.documentElement;
    root.style.setProperty('--safe-area-inset-top', insets.top + 'px');
    root.style.setProperty('--safe-area-inset-bottom', insets.bottom + 'px');
    root.style.setProperty('--safe-area-inset-left', insets.left + 'px');
    root.style.setProperty('--safe-area-inset-right', insets.right + 'px');
  }, insets);
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

async function measure(page, shell, selectors) {
  return page.evaluate(({ shell, selectors }) => {
    const box = (element) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height
      };
    };
    const result = { viewport: { width: innerWidth, height: innerHeight } };
    Object.keys(selectors).forEach((name) => {
      result[name] = box(document.querySelector(shell).querySelector(selectors[name]));
    });
    return result;
  }, { shell, selectors });
}

// Rectangles that share more than a pixel in both axes are on top of each
// other. Rounding alone may leave a hairline of contact, which is not a bug.
function overlaps(a, b) {
  return a.right - b.left > 1 && b.right - a.left > 1 && a.bottom - b.top > 1 && b.bottom - a.top > 1;
}

function expectInsideBars(name, box, viewport) {
  expect(box, name + ' should be on screen').not.toBeNull();
  expect(box.top, name + ' starts under the status bar').toBeGreaterThanOrEqual(INSETS.top - 1);
  expect(box.bottom, name + ' ends above the navigation bar').toBeLessThanOrEqual(viewport.height - INSETS.bottom + 1);
}

function expectNoOverlaps(boxes) {
  const names = Object.keys(boxes);
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      const a = boxes[names[i]];
      const b = boxes[names[j]];
      if (!a || !b) continue;
      expect(overlaps(a, b), names[i] + ' overlaps ' + names[j] + ': ' + JSON.stringify([a, b])).toBe(false);
    }
  }
}

for (const viewport of VIEWPORTS) {
  test.describe('landscape ' + viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('Sudoku board sits between the bars and the rail never overlaps itself', async ({ page }) => {
      await page.goto('/#sudoku');
      await page.waitForSelector('#sudoku-board .sudoku-cell');
      await setSafeArea(page, INSETS);

      const m = await measure(page, '#sudoku', {
        title: '.play-title-row',
        board: '.board-stage',
        pad: '#sudoku-pad',
        tools: '.sudoku-tools',
        foot: '.play-foot'
      });

      expectInsideBars('Sudoku board', m.board, m.viewport);
      const room = m.viewport.height - INSETS.top - INSETS.bottom;
      expect(m.board.height, 'Sudoku board should use the height between the bars').toBeGreaterThan(room * 0.75);

      ['pad', 'tools', 'foot'].forEach((name) => expectInsideBars('Sudoku ' + name, m[name], m.viewport));
      expectNoOverlaps({ title: m.title, board: m.board, pad: m.pad, tools: m.tools, foot: m.foot });
    });

    test('Minesweeper board fills the play column without touching the rail', async ({ page }) => {
      await page.goto('/#mines');
      await page.waitForFunction(() => document.querySelector('#mines-board').children.length > 0);
      await setSafeArea(page, INSETS);

      const m = await measure(page, '#mines', {
        title: '.play-title-row',
        toolbar: '.mines-toolbar',
        board: '.mines-board-wrap',
        status: '.play-feedback',
        foot: '.play-foot'
      });

      expectInsideBars('Minesweeper board', m.board, m.viewport);
      const room = m.viewport.height - INSETS.top - INSETS.bottom;
      // The board is square and the column is the free height; it used to be
      // sized from a stale 201px and left most of the landscape field empty.
      expect(m.board.height, 'Minesweeper board should fill the play column').toBeGreaterThan(room * 0.8);

      ['toolbar', 'status', 'foot'].forEach((name) => expectInsideBars('Minesweeper ' + name, m[name], m.viewport));
      expectNoOverlaps({ title: m.title, toolbar: m.toolbar, board: m.board, status: m.status, foot: m.foot });
    });

    test('Water Sort stands its glasses in one rack at a natural glass ratio', async ({ page }) => {
      await page.goto('/#water');
      await page.waitForFunction(() => document.querySelectorAll('#water-tubes .water-tube').length > 0);
      await setSafeArea(page, INSETS);

      const glasses = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('#water-tubes .water-glass')).map((glass) => {
          const rect = glass.getBoundingClientRect();
          return { top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
        });
      });
      expect(glasses.length).toBeGreaterThan(1);

      const tops = glasses.map((glass) => glass.top);
      expect(Math.max(...tops) - Math.min(...tops), 'every glass should start on the same row').toBeLessThanOrEqual(1);
      glasses.forEach((glass) => {
        expect(glass.width / glass.height, 'glasses should keep the 62:148 glass shape').toBeCloseTo(62 / 148, 1);
        expect(glass.top).toBeGreaterThanOrEqual(INSETS.top - 1);
        expect(glass.bottom).toBeLessThanOrEqual(viewport.height - INSETS.bottom + 1);
      });
    });
  });
}
