const { test, expect } = require('@playwright/test');

// These tests stand up the Capacitor Haptics plugin the way the APK does,
// before any page script runs. The games then go through the real
// js/haptics.js, so every assertion is on the waveform handed to the plugin —
// the boundary the native vibrator sits behind. A test machine has no motor,
// so the plugin is the last point that can be observed here.
const TAP = [18];
const MERGE_LOW = [20];
const WIN = [11, 30, 12, 30, 14, 30, 22];
const OVER = [24, 46, 15];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__pulses = [];
    window.Capacitor = window.Capacitor || {};
    window.Capacitor.Plugins = window.Capacitor.Plugins || {};
    window.Capacitor.Plugins.Haptics = {
      vibrate(options) {
        window.__pulses.push(options && options.pattern);
      },
      cancel() {}
    };
  });
});

async function resetPulses(page) {
  await page.evaluate(() => { window.__pulses.length = 0; });
}

async function openGame(page, game) {
  await page.goto('/');
  await page.waitForSelector('#daily');
  await page.waitForFunction(() => document.documentElement.classList.contains('home-ready'));
  await page.locator('.home-game[data-game="' + game + '"]').click();
  await page.waitForSelector('#' + game);
  await page.waitForTimeout(300);
}

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
  await page.waitForTimeout(400);
  if (await page.locator('#hidden-reveal').isVisible()) {
    await page.evaluate(() => document.querySelector('#hidden-reveal-skip').click());
  }
  await page.waitForSelector('body[data-screen="wordle"]');
  await page.waitForSelector('#wordle-keyboard .wordle-key');
}

test('Tic Tac Toe sends a pulse to the plugin on every square', async ({ page }) => {
  await openGame(page, 'ttt');
  await page.evaluate(() => document.querySelector('[data-ttt-mode="two"]').click());
  await resetPulses(page);

  // X takes the top row; in two-player mode each of the five marks is a move
  // the player made. The win lands in the same task as the fifth tick, so this
  // also proves the ending is not swallowed by the coalescing window.
  for (const index of [0, 3, 1, 4, 2]) {
    await page.click('.ttt-cell[data-index="' + index + '"]');
    await page.waitForTimeout(60);
  }
  expect(await page.evaluate(() => window.__pulses)).toEqual([TAP, TAP, TAP, TAP, TAP, WIN]);

  // A full board with no line is the ending that used to arrive silently.
  await page.click('#ttt-again');
  await page.waitForTimeout(150);
  await resetPulses(page);
  for (const index of [0, 1, 2, 4, 3, 5, 7, 6, 8]) {
    await page.click('.ttt-cell[data-index="' + index + '"]');
    await page.waitForTimeout(60);
  }
  expect(await page.evaluate(() => window.__pulses)).toEqual([
    TAP, TAP, TAP, TAP, TAP, TAP, TAP, TAP, TAP, OVER
  ]);
});

test('Wordle sends a pulse to the plugin for every key and the guess', async ({ page }) => {
  await openWordle(page);
  await resetPulses(page);

  // A word the game accepts but that can never be the answer, so the guess
  // lands as an ordinary merge instead of ending the round with a win. The
  // pack is answers plus valid guesses; there is no separate `guesses` list.
  const word = await page.evaluate(() => {
    const pack = window.SixfoldWordleWords;
    const answers = new Set(pack && pack.answers ? pack.answers : []);
    const valid = pack && Array.isArray(pack.valid) ? pack.valid : [];
    const guess = valid.find((entry) => /^[a-z]{5}$/.test(entry) && !answers.has(entry));
    if (!guess) throw new Error('no valid guess outside the answer pool');
    return guess;
  });
  for (const letter of word) {
    await page.locator('#wordle-keyboard [data-key="' + letter + '"]').click();
    await page.waitForTimeout(40);
  }
  await page.locator('#wordle-keyboard [data-key="Enter"]').click();
  await page.waitForTimeout(120);

  const pulses = await page.evaluate(() => window.__pulses);
  expect(pulses.slice(0, word.length)).toEqual(Array(word.length).fill(TAP));
  expect(pulses[word.length]).toEqual(MERGE_LOW);

  // Backspace is a key press too, once there is a letter to take back. The
  // reveal owns the board for a moment after a guess, so let it finish.
  await page.waitForTimeout(1100);
  await page.locator('#wordle-keyboard [data-key="a"]').click();
  await resetPulses(page);
  // Two taps inside MIN_GAP coalesce by design, so let the "a" tick fall out of
  // the window before asserting the backspace produces one of its own.
  await page.waitForTimeout(60);
  await page.locator('#wordle-keyboard [data-key="Backspace"]').click();
  expect(await page.evaluate(() => window.__pulses)).toEqual([TAP]);
});
