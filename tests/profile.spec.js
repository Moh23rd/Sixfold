const { test, expect } = require('@playwright/test');
const { expectNoClippedText } = require('./helpers');

// M1: the profile store is additive and local. The daily store stays
// authoritative, per-game bests are read from their own keys, and a storage
// failure may cost the profile but never a game.

const DAILY = {
  days: {
    '2025-03-01': { games: { merge: true, sudoku: true } },
    '2025-03-02': { games: { merge: true } },
    '2025-03-04': { games: { fruit: true } }
  },
  best: 2
};

async function seed(page, values) {
  await page.addInitScript((entries) => {
    Object.keys(entries).forEach((key) => localStorage.setItem(key, entries[key]));
  }, values);
}

async function ready(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.SixfoldDaily && window.SixfoldProfile);
  await expect(page.locator('#boot-splash')).toBeHidden();
}

// For flows that reload or wipe: addInitScript would put the seed back on the
// next navigation, which is exactly what a wipe test must not do.
async function seedOnce(page, values) {
  await page.goto('/');
  await page.evaluate((entries) => {
    Object.keys(entries).forEach((key) => localStorage.setItem(key, entries[key]));
  }, values);
  await page.reload();
  await page.waitForFunction(() => window.SixfoldDaily && window.SixfoldProfile);
  await expect(page.locator('#boot-splash')).toBeHidden();
}

function byGame(summary, game) {
  return summary.games.find((entry) => entry.game === game);
}

test('the profile backfills per-game daily results from the daily store', async ({ page }) => {
  await seed(page, {
    'sixfold.daily.v1': JSON.stringify(DAILY),
    'sixfold.locale.v1': 'en'
  });
  await ready(page);

  const summary = await page.evaluate(() => window.SixfoldProfile.summary());
  const merge = byGame(summary, 'merge');
  expect(merge.done).toBe(2);
  expect(merge.first).toBe('2025-03-01');
  expect(merge.last).toBe('2025-03-02');
  expect(byGame(summary, 'sudoku').done).toBe(1);
  expect(byGame(summary, 'fruit').done).toBe(1);
  expect(byGame(summary, 'mines').done).toBe(0);
  // The six public games, in collection order, and no hidden Wordle.
  expect(summary.games.map((entry) => entry.game)).toEqual([
    'merge', 'sudoku', 'ttt', 'mines', 'water', 'fruit'
  ]);

  // The aggregate is persisted, and the badges page shows it.
  expect(await page.evaluate(() => localStorage.getItem('sixfold.profile.v1'))).toContain('"done":2');
  await page.locator('#hub-badges').click();
  await expect(page.locator('#badges')).toBeVisible();
  await expect(page.locator('#profile-games .profile-game')).toHaveCount(6);
  await expect(page.locator('.profile-game[data-game="merge"]')).toContainText('Played 2');
  await expect(page.locator('.profile-game[data-game="mines"]')).toContainText('Played 0');
});

test('a replay updates the profile without double-counting the daily', async ({ page }) => {
  await ready(page);

  const before = await page.evaluate(() => {
    const date = window.SixfoldDaily.todayKey();
    const first = window.SixfoldDaily.complete('merge', null, date);
    const second = window.SixfoldDaily.complete('merge', null, date);
    return { first: first, second: second, summary: window.SixfoldProfile.summary() };
  });
  expect(before.first).toBe(true);
  expect(before.second).toBe(false);
  expect(byGame(before.summary, 'merge').done).toBe(1);
  expect(byGame(before.summary, 'merge').replays).toBe(1);

  // Reload: the credited count comes back from the daily store, and the replay
  // count survives even though it is not part of daily state.
  await page.reload();
  await page.waitForFunction(() => window.SixfoldProfile);
  const after = await page.evaluate(() => window.SixfoldProfile.summary());
  expect(byGame(after, 'merge').done).toBe(1);
  expect(byGame(after, 'merge').replays).toBe(1);

  // The row counts both the credit and the replay as plays.
  await expect(page.locator('#boot-splash')).toBeHidden();
  await page.locator('#hub-badges').click();
  await expect(page.locator('.profile-game[data-game="merge"]')).toContainText('Played 2');
});

test('the six-game section reads each best from its own game store', async ({ page }) => {
  await seed(page, {
    'merge2048.best': '2048',
    'merge2048.best.5': '4096',
    'merge-games.fruit.best.v3': '512',
    'merge-games.ttt.stats.v2': JSON.stringify({ wins: 4, draws: 1, losses: 2 }),
    'sixfold.sudoku.stats.v1': JSON.stringify({
      played: 2,
      wins: 1,
      streak: 1,
      best: { easy: 125, medium: 300, hard: null, expert: null }
    }),
    'sixfold.locale.v1': 'en'
  });
  await ready(page);

  const summary = await page.evaluate(() => window.SixfoldProfile.summary());
  expect(byGame(summary, 'merge').best, 'the highest Merge size wins').toEqual({ kind: 'score', value: 4096 });
  expect(byGame(summary, 'sudoku').best, 'the fastest Sudoku time wins').toEqual({ kind: 'time', value: 125 });
  expect(byGame(summary, 'ttt').best).toEqual({ kind: 'wins', value: 4 });
  expect(byGame(summary, 'fruit').best).toEqual({ kind: 'score', value: 512 });
  expect(byGame(summary, 'mines').best).toBeNull();
  expect(byGame(summary, 'water').best).toBeNull();

  await page.locator('#hub-badges').click();
  await expect(page.locator('#badges')).toBeVisible();
  await expect(page.locator('.profile-game[data-game="merge"]')).toContainText('4096');
  await expect(page.locator('.profile-game[data-game="sudoku"]')).toContainText('2:05');
  await expect(page.locator('.profile-game[data-game="ttt"]')).toContainText('4 Wins');
});

test('the gauntlet aggregate records completed runs and survives reload', async ({ page }) => {
  await ready(page);

  const summary = await page.evaluate(() => {
    window.SixfoldProfile.recordGauntlet({ date: '2025-03-04', rounds: 4, seconds: 300 });
    window.SixfoldProfile.recordGauntlet({ date: '2025-03-05', rounds: 6, seconds: 420 });
    window.SixfoldProfile.recordGauntlet({ date: '2025-03-06', rounds: 6, seconds: 360 });
    return window.SixfoldProfile.summary();
  });
  expect(summary.gauntlet.runs).toBe(2);
  expect(summary.gauntlet.bestRounds).toBe(6);
  expect(summary.gauntlet.bestTime).toBe(360);
  expect(summary.gauntlet.last).toEqual({ date: '2025-03-06', rounds: 6, seconds: 360 });

  await page.reload();
  await page.waitForFunction(() => window.SixfoldProfile);
  const after = await page.evaluate(() => window.SixfoldProfile.summary().gauntlet);
  expect(after).toEqual(summary.gauntlet);

  await page.locator('#hub-badges').click();
  await expect(page.locator('#badges')).toBeVisible();
  await expect(page.locator('#profile-gauntlet .profile-metric strong').first()).toHaveText('2');
  await expect(page.locator('#profile-gauntlet .profile-metric strong').nth(1)).toHaveText('6:00');
});

test('the extended badges page fits a 320px screen without clipped text', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await seed(page, {
    'sixfold.daily.v1': JSON.stringify(DAILY),
    'sixfold.locale.v1': 'en',
    'merge2048.best': '4096',
    'merge-games.ttt.stats.v2': JSON.stringify({ wins: 12, draws: 1, losses: 2 })
  });
  await ready(page);
  await page.locator('#hub-badges').click();
  await expect(page.locator('#badges')).toBeVisible();
  await expectNoClippedText(page, 'profile at 320px', '#badges');
});

test('blocked profile storage degrades the profile, not the games', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'sixfold.profile.v1') throw new Error('profile storage blocked');
      return original.call(this, key, value);
    };
  });
  await ready(page);

  const result = await page.evaluate(() => {
    const ok = window.SixfoldDaily.complete('merge', null, '2025-02-02');
    return { ok: ok, summary: window.SixfoldProfile.summary() };
  });
  expect(result.ok, 'the daily still credits').toBe(true);
  expect(byGame(result.summary, 'merge').done, 'the profile still works in memory').toBe(1);
  expect(await page.evaluate(() => localStorage.getItem('sixfold.profile.v1'))).toBeNull();

  await page.locator('#hub-badges').click();
  await expect(page.locator('#badges')).toBeVisible();
  await expect(page.locator('#profile-games .profile-game')).toHaveCount(6);
});

test('a pre-6.0 backup without a profile key still restores and reconciles', async ({ page }) => {
  await seedOnce(page, {
    'sixfold.daily.v1': JSON.stringify({ days: {}, best: 0 }),
    'sixfold.settings.v1': JSON.stringify({ highContrast: false, dailyPuzzle: true }),
    'sixfold.profile.v1': JSON.stringify({
      version: 1,
      updated: '2025-03-02T00:00:00.000Z',
      games: { merge: { done: 5, first: '2025-03-01', last: '2025-03-02', replays: 0 } },
      gauntlet: { runs: 0, bestRounds: 0, bestTime: null, last: null }
    })
  });

  // A version-5 backup: no sixfold.profile.v1 at all.
  const payload = {
    app: 'Sixfold',
    version: 5,
    exportedAt: '2025-01-01T00:00:00.000Z',
    data: {
      'merge2048.best': '777',
      'sixfold.settings.v1': JSON.stringify({ highContrast: true, dailyPuzzle: false }),
      'sixfold.daily.v1': JSON.stringify({ days: { '2025-03-01': { games: { sudoku: true } } }, best: 1 })
    }
  };

  await page.locator('#appearance').click();
  await expect(page.locator('#sheet')).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  const reloaded = page.waitForEvent('load');
  await page.setInputFiles('#backup-import', {
    name: 'sixfold-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload))
  });
  await reloaded;
  await page.waitForFunction(() => window.SixfoldProfile);

  const restored = await page.evaluate(() => {
    const summary = window.SixfoldProfile.summary();
    return {
      best: localStorage.getItem('merge2048.best'),
      contrast: document.documentElement.getAttribute('data-contrast'),
      merge: summary.games.find((entry) => entry.game === 'merge').done,
      sudoku: summary.games.find((entry) => entry.game === 'sudoku').done
    };
  });
  expect(restored.best).toBe('777');
  expect(restored.contrast, 'restored settings are applied').toBe('high');
  // The profile follows the restored daily store, not the pre-restore one.
  expect(restored.merge).toBe(0);
  expect(restored.sudoku).toBe(1);
});

test('erasing app data clears the profile with the daily store', async ({ page }) => {
  await seedOnce(page, {
    'sixfold.daily.v1': JSON.stringify(DAILY),
    'sixfold.profile.v1': JSON.stringify({
      version: 1,
      games: { merge: { done: 2, first: '2025-03-01', last: '2025-03-02', replays: 1 } },
      gauntlet: { runs: 1, bestRounds: 6, bestTime: 420, last: { date: '2025-03-02', rounds: 6, seconds: 420 } }
    })
  });
  await ready(page);
  await page.locator('#appearance').click();
  await expect(page.locator('#sheet')).toBeVisible();
  await page.locator('#wipe-open').click();
  await expect(page.locator('#wipe-sheet')).toBeVisible();

  const reloaded = page.waitForEvent('load');
  await page.locator('#wipe-confirm').click();
  await reloaded;

  const left = await page.evaluate(() => ({
    daily: localStorage.getItem('sixfold.daily.v1'),
    profile: localStorage.getItem('sixfold.profile.v1')
  }));
  expect(left).toEqual({ daily: null, profile: null });
});
