const { test, expect } = require('@playwright/test');

// The daily store is the only completion boundary 6.0 needs: one event per
// finished round, credited or replayed. These tests pin the contract recorded in
// docs/M0-DAILY-SEAM.md, so a future game cannot quietly change it.

async function ready(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.SixfoldDaily);
}

test('a credited finish and its replay both dispatch sixfold:daily-complete', async ({ page }) => {
  await ready(page);

  const result = await page.evaluate(() => {
    const completes = [];
    const changes = [];
    window.addEventListener('sixfold:daily-complete', (event) => completes.push(event.detail));
    window.addEventListener('sixfold:daily-change', (event) => changes.push(event.detail));
    const date = '2025-03-04';
    const first = window.SixfoldDaily.complete('merge', { seed: 7 }, date);
    const second = window.SixfoldDaily.complete('merge', null, date);
    return {
      first: first,
      second: second,
      completes: completes,
      changes: changes,
      credited: window.SixfoldDaily.isDone(date, 'merge'),
      total: window.SixfoldDaily.countFor(date)
    };
  });

  expect(result.first).toBe(true);
  expect(result.second).toBe(false);
  // The daily store still credits the day exactly once; the replay is not a
  // second credit.
  expect(result.credited).toBe(true);
  expect(result.total).toBe(1);
  expect(result.changes, 'sixfold:daily-change stays the first-credit signal').toHaveLength(1);
  expect(result.completes).toEqual([
    { date: '2025-03-04', game: 'merge', credited: true, meta: { seed: 7 } },
    { date: '2025-03-04', game: 'merge', credited: false, meta: null }
  ]);
});

test('an unknown game dispatches nothing and still returns false', async ({ page }) => {
  await ready(page);

  const result = await page.evaluate(() => {
    const completes = [];
    window.addEventListener('sixfold:daily-complete', (event) => completes.push(event.detail));
    const ok = window.SixfoldDaily.complete('wordle', null, '2025-03-04');
    return { ok: ok, completes: completes };
  });

  expect(result.ok).toBe(false);
  expect(result.completes).toEqual([]);
});

test('a finish addresses the day its round started for, not today', async ({ page }) => {
  await ready(page);

  const result = await page.evaluate(() => {
    const completes = [];
    window.addEventListener('sixfold:daily-complete', (event) => completes.push(event.detail));
    const today = window.SixfoldDaily.todayKey();
    const started = '2025-02-17';
    const ok = window.SixfoldDaily.complete('sudoku', null, started);
    return {
      ok: ok,
      today: today,
      completes: completes,
      startedDone: window.SixfoldDaily.isDone(started, 'sudoku'),
      todayDone: window.SixfoldDaily.isDone(today, 'sudoku')
    };
  });

  expect(result.ok).toBe(true);
  expect(result.completes).toEqual([
    { date: '2025-02-17', game: 'sudoku', credited: true, meta: null }
  ]);
  expect(result.startedDone, 'the run credits the day it started for').toBe(true);
  expect(result.todayDone, 'a finish after midnight cannot credit the new day').toBe(false);
});
