const { test, expect } = require('@playwright/test');
const { expectNoClippedText } = require('./helpers');

// M2: the gauntlet owns only its run state. Advancement comes from the daily
// completion seam, so a replay counts and a finish for another date or game
// does not. The daily store stays authoritative for the credit itself.

const ORDER = ['merge', 'sudoku', 'ttt', 'mines', 'water', 'fruit'];

async function ready(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.SixfoldDaily && window.SixfoldProfile && window.SixfoldGauntlet);
  await expect(page.locator('#boot-splash')).toBeHidden();
}

// addInitScript would re-seed on every navigation and hide the progress these
// tests are about, so seed once and reload.
async function seedOnce(page, values) {
  await page.goto('/');
  await page.evaluate((entries) => {
    Object.keys(entries).forEach((key) => localStorage.setItem(key, entries[key]));
  }, values);
  await page.reload();
  await page.waitForFunction(() => window.SixfoldDaily && window.SixfoldProfile && window.SixfoldGauntlet);
  await expect(page.locator('#boot-splash')).toBeHidden();
}

function runState(date, index, times, order) {
  return JSON.stringify({
    version: 1,
    run: {
      date: date,
      order: order || ORDER,
      index: index,
      times: times
    }
  });
}

test('a 6/6 run advances only on its expected completion and records once', async ({ page }) => {
  await ready(page);

  const started = await page.evaluate(() => {
    window.SixfoldGauntlet.start();
    return window.SixfoldGauntlet.summary();
  });
  expect(started.hasRun).toBe(true);
  expect(started.active).toBe(true);
  expect(started.index).toBe(0);
  expect(started.order).toHaveLength(6);
  expect(new Set(started.order).size).toBe(6);
  expect(started.order.every((game) => ORDER.includes(game))).toBe(true);

  const result = await page.evaluate(() => {
    const first = window.SixfoldGauntlet.summary();
    const date = first.date;
    const order = first.order;
    const seen = [];
    // The wrong game, then the right game under the wrong date: neither may
    // move the run.
    window.SixfoldDaily.complete(order[1], null, date);
    seen.push(window.SixfoldGauntlet.summary().index);
    window.SixfoldDaily.complete(order[0], null, '2025-01-01');
    seen.push(window.SixfoldGauntlet.summary().index);
    // The real order. order[1] was credited above, so its turn is a replay:
    // credited is false and the run still advances.
    for (let i = 0; i < order.length; i += 1) {
      window.SixfoldDaily.complete(order[i], null, date);
    }
    return {
      seen: seen,
      summary: window.SixfoldGauntlet.summary(),
      profile: window.SixfoldProfile.summary().gauntlet,
      dailyCount: window.SixfoldDaily.countFor(date)
    };
  });

  expect(result.seen).toEqual([0, 0]);
  expect(result.summary.complete).toBe(true);
  expect(result.summary.rounds).toBe(6);
  expect(result.summary.times).toHaveLength(6);
  expect(result.summary.times.every((time) => typeof time === 'number')).toBe(true);
  expect(result.dailyCount, 'the replay did not credit a seventh daily').toBe(6);
  expect(result.profile.runs).toBe(1);
  expect(result.profile.bestRounds).toBe(6);
  expect(result.profile.last).toMatchObject({ rounds: 6 });

  // Reloading a completed run must not record it a second time.
  await ready(page);
  const after = await page.evaluate(() => ({
    summary: window.SixfoldGauntlet.summary(),
    profile: window.SixfoldProfile.summary().gauntlet
  }));
  expect(after.summary.complete).toBe(true);
  expect(after.profile.runs).toBe(1);

  await page.locator('#hub-badges').click();
  await expect(page.locator('#badges')).toBeVisible();
  await expect(page.locator('#gauntlet-run .gauntlet-round')).toHaveCount(6);
  await expect(page.locator('#gauntlet-run .gauntlet-run-status')).toHaveText('6/6');
  await expect(page.locator('#gauntlet-run .gauntlet-round.is-done')).toHaveCount(6);
  await expect(page.locator('#profile-gauntlet .profile-metric strong').first()).toHaveText('1');
});

test('a replay of an already-credited round advances without a second credit', async ({ page }) => {
  await page.goto('/');
  const today = await page.evaluate(() => window.SixfoldDaily.todayKey());
  await seedOnce(page, {
    'sixfold.daily.v1': JSON.stringify({
      days: { [today]: { games: { merge: true } } },
      best: 1
    }),
    'sixfold.gauntlet.v1': runState(today, 0, [0, 0, 0, 0, 0, 0])
  });
  await ready(page);

  const result = await page.evaluate(() => {
    const date = window.SixfoldGauntlet.summary().date;
    const ok = window.SixfoldDaily.complete('merge', null, date);
    return {
      ok: ok,
      summary: window.SixfoldGauntlet.summary(),
      count: window.SixfoldDaily.countFor(date),
      profile: window.SixfoldProfile.summary()
    };
  });

  expect(result.ok, 'the daily was already credited').toBe(false);
  expect(result.count, 'the replay did not credit the day twice').toBe(1);
  expect(result.summary.index).toBe(1);
  expect(result.summary.current).toBe('sudoku');
  const merge = result.profile.games.find((entry) => entry.game === 'merge');
  expect(merge.done).toBe(1);
  expect(merge.replays).toBe(1);
});

test('a run resumes after reload at the same round with its time', async ({ page }) => {
  await ready(page);

  const started = await page.evaluate(() => {
    window.SixfoldGauntlet.start();
    return window.SixfoldGauntlet.summary();
  });
  await page.waitForFunction((game) => document.body.dataset.screen === game, started.current);
  await page.waitForTimeout(1200);

  const first = await page.evaluate(() => {
    const before = window.SixfoldGauntlet.summary();
    window.SixfoldDaily.complete(before.order[0], null, before.date);
    return { before: before, after: window.SixfoldGauntlet.summary() };
  });
  expect(first.after.index).toBe(1);
  expect(first.after.current).toBe(first.before.order[1]);
  expect(first.after.times[0]).toBeGreaterThanOrEqual(1);

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sixfold.gauntlet.v1')));
  expect(saved.run.index).toBe(1);
  expect(saved.run.order).toEqual(first.before.order);

  await ready(page);
  const resumed = await page.evaluate(() => window.SixfoldGauntlet.summary());
  expect(resumed.date).toBe(first.before.date);
  expect(resumed.index).toBe(1);
  expect(resumed.current).toBe(first.before.order[1]);
  expect(resumed.order).toEqual(first.before.order);
  expect(resumed.times[0]).toBe(first.after.times[0]);
  expect(resumed.times[0]).toBeGreaterThanOrEqual(1);

  // Continue reopens the stored current round, not round one.
  await page.locator('#daily-gauntlet-action').click();
  await page.waitForFunction((game) => document.body.dataset.screen === game, resumed.current);
  await page.waitForTimeout(1200);
  const live = await page.evaluate(() => window.SixfoldGauntlet.summary());
  expect(live.times[1]).toBeGreaterThanOrEqual(1);

  // Reloading on the round's own screen resumes that round, not just its
  // stored index: the hash is the signal, and the timer starts again.
  await page.reload();
  await page.waitForFunction(() => window.SixfoldGauntlet);
  await page.waitForFunction((game) => document.body.dataset.screen === game, resumed.current);
  await page.waitForTimeout(1200);
  const reloaded = await page.evaluate(() => ({
    screen: document.body.dataset.screen,
    summary: window.SixfoldGauntlet.summary()
  }));
  expect(reloaded.screen).toBe(resumed.current);
  expect(reloaded.summary.index).toBe(1);
  expect(reloaded.summary.current).toBe(resumed.current);
  expect(reloaded.summary.times[1]).toBeGreaterThanOrEqual(1);
});

test('leaving a round keeps the active time it had', async ({ page }) => {
  await ready(page);

  const started = await page.evaluate(() => {
    window.SixfoldGauntlet.start();
    return window.SixfoldGauntlet.summary();
  });
  await page.waitForFunction((game) => document.body.dataset.screen === game, started.current);
  await page.waitForTimeout(2200);
  expect((await page.evaluate(() => window.SixfoldGauntlet.summary())).times[0]).toBeGreaterThanOrEqual(2);

  const back = started.current === 'merge'
    ? '#back-to-games'
    : '#' + started.current + ' [data-back]';
  await page.locator(back).first().click();
  await expect(page.locator('#hub')).toBeVisible();
  await page.waitForTimeout(1200);

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sixfold.gauntlet.v1')));
  expect(saved.run.index).toBe(0);
  expect(saved.run.times[0], 'the round boundary saved its time').toBeGreaterThanOrEqual(2);
});

test('an earlier run expires and starting today replaces it', async ({ page }) => {
  await page.goto('/');
  const today = await page.evaluate(() => window.SixfoldDaily.todayKey());
  const yesterday = await page.evaluate(() => window.SixfoldDaily.shiftKey(window.SixfoldDaily.todayKey(), -1));
  await seedOnce(page, {
    'sixfold.gauntlet.v1': runState(
      yesterday,
      3,
      [10, 20, 30, 0, 0, 0],
      ['merge', 'sudoku', 'ttt', 'water', 'mines', 'fruit']
    )
  });
  await ready(page);

  const expired = await page.evaluate(() => window.SixfoldGauntlet.summary());
  expect(expired.expired).toBe(true);
  expect(expired.active).toBe(false);
  expect(expired.rounds).toBe(3);
  expect(expired.current).toBe('water');
  await expect(page.locator('#daily-gauntlet-note')).toContainText('3/6');
  await expect(page.locator('#daily-gauntlet-action')).toHaveText('Start today');

  // A completion for the expired date is ignored while no round is open.
  const pinned = await page.evaluate(() => {
    const date = window.SixfoldGauntlet.summary().date;
    window.SixfoldDaily.complete('water', null, date);
    return {
      index: window.SixfoldGauntlet.summary().index,
      daily: window.SixfoldDaily.isDone(date, 'water')
    };
  });
  expect(pinned.daily, 'the archive day still credits its own daily').toBe(true);
  expect(pinned.index).toBe(3);

  await page.locator('#daily-gauntlet-action').click();
  const fresh = await page.evaluate(() => window.SixfoldGauntlet.summary());
  expect(fresh.date).toBe(today);
  expect(fresh.index).toBe(0);
  expect(fresh.active).toBe(true);
  expect(fresh.times).toEqual([0, 0, 0, 0, 0, 0]);
  await page.waitForFunction((game) => document.body.dataset.screen === game, fresh.current);
});

test('an already-credited Sudoku round is satisfied on entry', async ({ page }) => {
  await page.goto('/');
  const today = await page.evaluate(() => window.SixfoldDaily.todayKey());
  await seedOnce(page, {
    'sixfold.daily.v1': JSON.stringify({
      days: { [today]: { games: { sudoku: true } } },
      best: 1
    }),
    'sixfold.gauntlet.v1': runState(today, 0, [0, 0, 0, 0, 0, 0], [
      'sudoku', 'merge', 'ttt', 'mines', 'water', 'fruit'
    ])
  });
  await ready(page);

  const result = await page.evaluate(() => {
    window.SixfoldGauntlet.start();
    return window.SixfoldGauntlet.summary();
  });
  expect(result.index).toBe(1);
  expect(result.current).toBe('merge');
  expect(result.times[0], 'a skipped round was not timed').toBeNull();
  await page.waitForFunction(() => document.body.dataset.screen === 'merge');

  await ready(page);
  const after = await page.evaluate(() => window.SixfoldGauntlet.summary());
  expect(after.index).toBe(1);
  expect(after.times[0]).toBeNull();
});

test('the daily card starts and continues the run', async ({ page }) => {
  await ready(page);
  await expect(page.locator('#daily-gauntlet-note')).toHaveText('Six rounds. One run.');
  await expect(page.locator('#daily-gauntlet-action')).toHaveText('Start');

  await page.locator('#daily-gauntlet-action').click();
  const started = await page.evaluate(() => window.SixfoldGauntlet.summary());
  await page.waitForFunction((game) => document.body.dataset.screen === game, started.current);

  const back = started.current === 'merge'
    ? '#back-to-games'
    : '#' + started.current + ' [data-back]';
  await page.locator(back).first().click();
  await expect(page.locator('#hub')).toBeVisible();
  await expect(page.locator('#daily-gauntlet-note')).toContainText('Round 1 of 6');
  await expect(page.locator('#daily-gauntlet-action')).toHaveText('Continue');

  await page.locator('#daily-gauntlet-action').click();
  await page.waitForFunction((game) => document.body.dataset.screen === game, started.current);
});

test('the gauntlet and profile render in Arabic with locale numerals', async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('sixfold.locale.v1', 'ar'); } catch (err) {}
  });
  await page.goto('/');
  const today = await page.evaluate(() => window.SixfoldDaily.todayKey());
  await seedOnce(page, {
    'sixfold.gauntlet.v1': runState(
      today,
      3,
      [60, 120, 180, 0, 0, 0],
      ['merge', 'sudoku', 'ttt', 'water', 'mines', 'fruit']
    )
  });
  await ready(page);

  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('#daily-gauntlet-title')).toHaveText('سباق الست اليومي');
  await expect(page.locator('#daily-gauntlet-note')).toContainText('الجولة ٤ من ٦');
  await expect(page.locator('#daily-gauntlet-action')).toHaveText('تابع');

  await page.locator('#hub-badges').click();
  await expect(page.locator('#badges')).toBeVisible();
  await expect(page.locator('#gauntlet-run .gauntlet-run-status')).toContainText('٤ / ٦');
  await expect(page.locator('#gauntlet-run .gauntlet-round-index').first()).toHaveText('٠١');
  await expect(page.locator('#profile-gauntlet')).toContainText('المحاولات');
  await expect(page.locator('#profile-gauntlet')).toContainText('لا توجد محاولات بعد.');

  const text = await page.evaluate(() => [
    document.getElementById('gauntlet-run').innerText,
    document.getElementById('profile-gauntlet').innerText,
    document.getElementById('daily-gauntlet').innerText
  ].join('\n'));
  expect(text, 'the gauntlet and profile use Arabic-Indic digits').not.toMatch(/[0-9]/);
});

test('the gauntlet uses Devanagari numerals in Hindi', async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('sixfold.locale.v1', 'hi'); } catch (err) {}
  });
  await page.goto('/');
  const today = await page.evaluate(() => window.SixfoldDaily.todayKey());
  await seedOnce(page, {
    'sixfold.gauntlet.v1': runState(
      today,
      3,
      [60, 120, 180, 0, 0, 0],
      ['merge', 'sudoku', 'ttt', 'water', 'mines', 'fruit']
    )
  });
  await ready(page);

  await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('#daily-gauntlet-title')).toHaveText('दैनिक गॉन्टलेट');
  await expect(page.locator('#daily-gauntlet-note')).toContainText('राउंड ४ / ६');

  await page.locator('#hub-badges').click();
  await expect(page.locator('#badges')).toBeVisible();
  await expect(page.locator('#gauntlet-run .gauntlet-run-status')).toContainText('राउंड ४ / ६');
  await expect(page.locator('#gauntlet-run .gauntlet-round-index').first()).toHaveText('०१');

  const text = await page.locator('#gauntlet-run').innerText();
  expect(text, 'the gauntlet uses Devanagari digits').not.toMatch(/[0-9]/);
});

// A translation may name the same argument twice; every occurrence must be
// filled, not just the first one the message happens to reach.
test('a repeated placeholder is filled everywhere it appears', async ({ page }) => {
  await page.goto('/');
  const today = await page.evaluate(() => window.SixfoldDaily.todayKey());
  await seedOnce(page, {
    'sixfold.gauntlet.v1': runState(today, 3, [60, 120, 180, 0, 0, 0])
  });
  await ready(page);

  const note = await page.evaluate(() => {
    const original = window.SixfoldI18n.t;
    window.SixfoldI18n.t = function (value) {
      if (value === 'Round {1} of {2}') return 'Round {1} of {2} · again {1} of {2}';
      return original.call(window.SixfoldI18n, value);
    };
    window.dispatchEvent(new CustomEvent('sixfold:daily-change'));
    return document.getElementById('daily-gauntlet-note').textContent;
  });

  expect(note).toContain('Round 4 of 6 · again 4 of 6');
  expect(note).not.toContain('{');
});

test('the gauntlet entry and run fit 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/');
  const today = await page.evaluate(() => window.SixfoldDaily.todayKey());
  await seedOnce(page, {
    'sixfold.gauntlet.v1': runState(
      today,
      3,
      [60, 120, 180, 0, 0, 0],
      ['merge', 'sudoku', 'ttt', 'water', 'mines', 'fruit']
    )
  });
  await ready(page);
  await expect(page.locator('#daily-gauntlet-note')).toContainText('Water Sort');
  await expectNoClippedText(page, 'daily gauntlet at 320px', '#daily');

  await page.locator('#hub-badges').click();
  await expect(page.locator('#badges')).toBeVisible();
  await expect(page.locator('#gauntlet-run .gauntlet-round')).toHaveCount(6);
  await expectNoClippedText(page, 'gauntlet run at 320px', '#badges');
});
