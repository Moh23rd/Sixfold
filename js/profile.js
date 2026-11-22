/* The 6.0 profile store. It keeps normalized per-game results and the gauntlet
   aggregates on this device; the daily store stays authoritative for streaks,
   badges and the archive, and no game board is copied here. No account, no
   network, no telemetry. If storage is unavailable the profile degrades to the
   current session and every game keeps playing. */
(function () {
  'use strict';

  const KEY = 'sixfold.profile.v1';
  const VERSION = 1;
  // The hidden Wordle is deliberately absent: the profile covers the six public
  // games only.
  const GAMES = ['merge', 'sudoku', 'ttt', 'mines', 'water', 'fruit'];

  let data = blank();

  function blank() {
    return {
      version: VERSION,
      updated: null,
      games: {},
      gauntlet: { runs: 0, bestRounds: 0, bestTime: null, last: null }
    };
  }

  function count(value) {
    return Math.max(0, Math.min(999999, Math.floor(Number(value) || 0)));
  }

  function dateKey(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : null;
  }

  function cleanRun(value) {
    if (!value || typeof value !== 'object') return null;
    const date = dateKey(value.date);
    if (!date) return null;
    return {
      date: date,
      rounds: Math.max(0, Math.min(GAMES.length, count(value.rounds))),
      seconds: Math.max(0, Math.min(86400, Math.round(Number(value.seconds) || 0)))
    };
  }

  function cleanGame(value) {
    if (!value || typeof value !== 'object') return null;
    const first = dateKey(value.first);
    const last = dateKey(value.last);
    const done = count(value.done);
    const replays = count(value.replays);
    if (!first && !last && !done && !replays) return null;
    return { done: done, first: first, last: last, replays: replays };
  }

  function clean(value) {
    const out = blank();
    if (!value || typeof value !== 'object') return out;
    if (typeof value.updated === 'string') out.updated = value.updated;
    if (value.games && typeof value.games === 'object') {
      GAMES.forEach(function (game) {
        const entry = cleanGame(value.games[game]);
        if (entry) out.games[game] = entry;
      });
    }
    if (value.gauntlet && typeof value.gauntlet === 'object') {
      out.gauntlet.runs = count(value.gauntlet.runs);
      out.gauntlet.bestRounds = Math.min(GAMES.length, count(value.gauntlet.bestRounds));
      const best = Number(value.gauntlet.bestTime);
      out.gauntlet.bestTime = Number.isFinite(best) && best > 0 ? Math.round(best) : null;
      out.gauntlet.last = cleanRun(value.gauntlet.last);
    }
    return out;
  }

  function load() {
    try {
      return clean(JSON.parse(localStorage.getItem(KEY) || 'null'));
    } catch (err) {
      return blank();
    }
  }

  function emit() {
    try {
      window.dispatchEvent(new CustomEvent('sixfold:profile', { detail: summary() }));
    } catch (err) {}
  }

  function save() {
    data.updated = new Date().toISOString();
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (err) {}
    emit();
  }

  function entry(game) {
    return data.games[game] || (data.games[game] = {
      done: 0, first: null, last: null, replays: 0
    });
  }

  // The daily store is the source of truth: this recomputes the credited count
  // and the first/last dates from it, so the profile cannot drift after a
  // restore, a wipe of only this key, or a day finished in another tab. Replay
  // counts are the one thing the daily store does not keep, so they survive.
  function backfill() {
    let summarySource = null;
    try {
      summarySource = window.SixfoldDaily && window.SixfoldDaily.gameSummary
        ? window.SixfoldDaily.gameSummary()
        : null;
    } catch (err) {
      summarySource = null;
    }
    if (!summarySource) return false;
    let changed = false;
    GAMES.forEach(function (game) {
      const source = summarySource[game] || { done: 0, first: null, last: null };
      const target = entry(game);
      if (target.done !== source.done || target.first !== source.first || target.last !== source.last) {
        target.done = count(source.done);
        target.first = dateKey(source.first);
        target.last = dateKey(source.last);
        changed = true;
      }
    });
    if (changed) save();
    else emit();
    return changed;
  }

  // One event per finished daily round, credited or replayed. A credited round
  // also fires sixfold:daily-change, which triggers a full backfill; a replay
  // only lands here, so it is counted without touching the credited total.
  function recordComplete(detail) {
    if (!detail || GAMES.indexOf(detail.game) === -1) return summary();
    const target = entry(detail.game);
    const date = dateKey(detail.date);
    if (date) {
      if (!target.first || date < target.first) target.first = date;
      if (!target.last || date > target.last) target.last = date;
    }
    if (detail.credited) target.done = count(target.done) + 1;
    else target.replays = count(target.replays) + 1;
    save();
    return summary();
  }

  // M2 calls this with a finished or abandoned run; the profile owns only the
  // aggregate, never the round order or the current run state.
  function recordGauntlet(run) {
    const finished = cleanRun(run);
    if (!finished) return summary();
    const gauntlet = data.gauntlet;
    if (finished.rounds >= GAMES.length) {
      gauntlet.runs += 1;
      if (finished.seconds > 0 && (!gauntlet.bestTime || finished.seconds < gauntlet.bestTime)) {
        gauntlet.bestTime = finished.seconds;
      }
    }
    gauntlet.bestRounds = Math.max(gauntlet.bestRounds, finished.rounds);
    gauntlet.last = finished;
    save();
    return summary();
  }

  function readNumber(key) {
    try {
      const value = Number(localStorage.getItem(key));
      return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
    } catch (err) {
      return 0;
    }
  }

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (err) { return null; }
  }

  // Bests are read live from each game's own key, never copied into the store:
  // there is only one writer per domain. Minesweeper and Water Sort keep no
  // best, so their rows show the daily count alone.
  function bestFor(game) {
    if (game === 'merge') {
      const value = Math.max(
        readNumber('merge2048.best'),
        readNumber('merge2048.best.3'),
        readNumber('merge2048.best.5')
      );
      return value ? { kind: 'score', value: value } : null;
    }
    if (game === 'sudoku') {
      const stats = readJson('sixfold.sudoku.stats.v1');
      const best = stats && stats.best;
      if (!best || typeof best !== 'object') return null;
      let fastest = 0;
      ['easy', 'medium', 'hard', 'expert'].forEach(function (level) {
        const time = Number(best[level]);
        if (Number.isFinite(time) && time > 0 && (!fastest || time < fastest)) {
          fastest = Math.round(time);
        }
      });
      return fastest ? { kind: 'time', value: fastest } : null;
    }
    if (game === 'ttt') {
      const stats = readJson('merge-games.ttt.stats.v2');
      const wins = stats ? Number(stats.wins) : 0;
      return Number.isFinite(wins) && wins > 0 ? { kind: 'wins', value: Math.floor(wins) } : null;
    }
    if (game === 'fruit') {
      const value = readNumber('merge-games.fruit.best.v3');
      return value ? { kind: 'score', value: value } : null;
    }
    return null;
  }

  function summary() {
    return {
      updated: data.updated,
      games: GAMES.map(function (game) {
        const stored = data.games[game] || { done: 0, first: null, last: null, replays: 0 };
        return {
          game: game,
          done: stored.done,
          first: stored.first,
          last: stored.last,
          replays: stored.replays,
          best: bestFor(game)
        };
      }),
      gauntlet: {
        runs: data.gauntlet.runs,
        bestRounds: data.gauntlet.bestRounds,
        bestTime: data.gauntlet.bestTime,
        last: data.gauntlet.last ? Object.assign({}, data.gauntlet.last) : null
      }
    };
  }

  data = load();

  window.addEventListener('sixfold:daily-complete', function (event) {
    recordComplete(event.detail);
  });
  window.addEventListener('sixfold:daily-change', function () {
    backfill();
  });
  window.addEventListener('storage', function (event) {
    if (event.key === KEY) {
      data = load();
      emit();
      return;
    }
    if (event.key === 'sixfold.daily.v1') backfill();
  });

  window.SixfoldProfile = {
    KEY: KEY,
    VERSION: VERSION,
    summary: summary,
    backfill: backfill,
    recordComplete: recordComplete,
    recordGauntlet: recordGauntlet
  };

  backfill();
})();
