/* The 6.0 Daily Gauntlet. It stores only the run's date, order, round index
   and per-round time; boards stay with their games, and the daily completion
   seam is the only advance signal. No account, network or telemetry. */
(function () {
  'use strict';

  const KEY = 'sixfold.gauntlet.v1';
  const VERSION = 1;
  const GAMES = ['merge', 'sudoku', 'ttt', 'mines', 'water', 'fruit'];
  const LABELS = {
    merge: 'Merge',
    sudoku: 'Sudoku',
    ttt: 'Tic Tac Toe',
    mines: 'Minesweeper',
    water: 'Water Sort',
    fruit: 'Fruit Merge'
  };
  // The run order is date-seeded, with a salt of its own.
  const SALT = 'sixfold-gauntlet-order|';
  const MAX_SECONDS = 86400;

  const $ = function (id) { return document.getElementById(id); };

  let data = load();
  let lastTick = 0;
  let tickTimer = 0;
  let roundOpen = false;
  let saveTicks = 0;

  function tr(value) {
    try { return window.SixfoldI18n ? window.SixfoldI18n.t(value) : value; } catch (err) { return value; }
  }

  function number(value) {
    try { return window.SixfoldI18n ? window.SixfoldI18n.number(String(value)) : String(value); } catch (err) { return String(value); }
  }

  // A translated message may put its numbers in a different order. Keep the
  // placeholders in the catalog and fill them after lookup.
  function format(value, parts) {
    return String(tr(value)).replace(/\{(\d+)\}/g, function (match, index) {
      var slot = Number(index) - 1;
      return slot >= 0 && slot < parts.length ? String(parts[slot]) : match;
    });
  }

  function clock(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    const minutes = Math.floor(total / 60);
    const secs = total % 60;
    return number(minutes) + ':' + number(String(secs).padStart(2, '0'));
  }

  function isDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
  }

  function localToday() {
    const date = new Date();
    const pad = function (value) { return String(value).padStart(2, '0'); };
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function today() {
    try {
      if (window.SixfoldDaily && window.SixfoldDaily.todayKey) return window.SixfoldDaily.todayKey();
    } catch (err) {}
    return localToday();
  }

  function shortDate(key) {
    const parts = String(key || '').split('-').map(Number);
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return String(key || '');
    const date = new Date(parts[0], parts[1] - 1, parts[2], 12);
    try {
      const locale = window.SixfoldI18n ? window.SixfoldI18n.formatLocale() : undefined;
      return date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    } catch (err) {
      return String(key || '');
    }
  }

  function orderFor(date) {
    const order = GAMES.slice();
    let random;
    try {
      random = window.SixfoldDaily.seededRandom(SALT + date);
    } catch (err) {
      random = Math.random;
    }
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      const temp = order[i];
      order[i] = order[j];
      order[j] = temp;
    }
    return order;
  }

  function blank() {
    return { version: VERSION, run: null };
  }

  // Only date, order, index and times are stored. A null time marks a round
  // that was already credited when it came up.
  function cleanRun(value) {
    if (!value || typeof value !== 'object') return null;
    const date = isDate(value.date) ? String(value.date) : '';
    if (!date) return null;
    const source = Array.isArray(value.order) ? value.order : [];
    const order = [];
    source.forEach(function (game) {
      if (GAMES.indexOf(game) !== -1 && order.indexOf(game) === -1) order.push(game);
    });
    if (order.length !== GAMES.length) return null;
    const index = Math.max(0, Math.min(GAMES.length, Math.floor(Number(value.index) || 0)));
    const raw = Array.isArray(value.times) ? value.times : [];
    const times = order.map(function (_, i) {
      if (i > index) return 0;
      if (raw[i] === null && i < index) return null;
      const seconds = Number(raw[i]);
      if (!Number.isFinite(seconds) || seconds <= 0) return 0;
      return Math.min(MAX_SECONDS, seconds);
    });
    return { date: date, order: order, index: index, times: times };
  }

  function load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY) || 'null');
      return { version: VERSION, run: parsed && parsed.run ? cleanRun(parsed.run) : null };
    } catch (err) {
      return blank();
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ version: VERSION, run: data.run }));
    } catch (err) {
      /* Storage blocked: the run still works for this session. */
    }
  }

  function currentGame(run) {
    return run && run.index < GAMES.length ? run.order[run.index] : null;
  }

  function onGameScreen() {
    const game = currentGame(data.run);
    return Boolean(game && document.body.dataset.screen === game);
  }

  function activeNow() {
    return Boolean(roundOpen && data.run && data.run.index < GAMES.length &&
      document.visibilityState !== 'hidden' && onGameScreen());
  }

  function addElapsed(force) {
    const now = Date.now();
    const run = data.run;
    if (run && roundOpen && run.index < GAMES.length && onGameScreen() &&
        (force || document.visibilityState !== 'hidden') && lastTick) {
      const base = Number(run.times[run.index]) || 0;
      const delta = Math.max(0, (now - lastTick) / 1000);
      run.times[run.index] = Math.min(MAX_SECONDS, base + delta);
    }
    lastTick = now;
  }

  function elapsedFor(run, i) {
    if (!run || i < 0 || i >= GAMES.length) return 0;
    if (i < run.index) return run.times[i];
    if (i > run.index) return 0;
    const base = Number(run.times[i]) || 0;
    if (!roundOpen || !activeNow()) return base;
    return base + Math.max(0, (Date.now() - lastTick) / 1000);
  }

  function totalFor(run) {
    if (!run) return 0;
    let total = 0;
    for (let i = 0; i < GAMES.length; i += 1) {
      if (i < run.index) {
        if (typeof run.times[i] === 'number') total += run.times[i];
      } else if (i === run.index) {
        total += elapsedFor(run, i);
      }
    }
    return Math.max(0, Math.round(total));
  }

  function summary() {
    const run = data.run;
    const now = today();
    if (!run) {
      return {
        today: now, hasRun: false, date: null, order: [], index: 0, rounds: 0,
        total: 0, complete: false, active: false, expired: false,
        current: null, times: []
      };
    }
    const complete = run.index >= GAMES.length;
    return {
      today: now, hasRun: true, date: run.date, order: run.order.slice(),
      index: run.index, rounds: run.index, total: totalFor(run), complete: complete,
      active: !complete && run.date === now, expired: !complete && run.date !== now,
      current: complete ? null : run.order[run.index],
      times: run.order.map(function (_, i) {
        if (i < run.index) {
          return run.times[i] === null ? null : Math.max(0, Math.round(run.times[i]));
        }
        if (i === run.index) return Math.max(0, Math.floor(elapsedFor(run, i)));
        return 0;
      })
    };
  }

  function emit() {
    try {
      window.dispatchEvent(new CustomEvent('sixfold:gauntlet', { detail: summary() }));
    } catch (err) {}
  }

  function dailyState(view) {
    if (!view.hasRun) {
      return { state: 'idle', note: tr('Six rounds. One run.'), action: tr('Start'), label: tr('Start the Daily Gauntlet') };
    }
    if (view.complete) {
      const todayRun = view.date === view.today;
      return {
        state: 'complete',
        note: (todayRun ? tr('Done today') + ' · '
          : tr('Last run') + ' · ' + shortDate(view.date) + ' · ') +
          number(6) + '/' + number(6) + ' · ' + clock(view.total),
        action: todayRun ? tr('Again') : tr('Start today'),
        label: todayRun ? tr('Start another Daily Gauntlet') : tr('Start today’s Daily Gauntlet')
      };
    }
    if (view.expired) {
      return {
        state: 'expired',
        note: tr('Run ended') + ' · ' + shortDate(view.date) + ' · ' +
          number(view.rounds) + '/' + number(6),
        action: tr('Start today'), label: tr('Start today’s Daily Gauntlet')
      };
    }
    return {
      state: 'active',
      note: format('Round {1} of {2}', [number(view.index + 1), number(6)]) + ' · ' +
        tr(LABELS[view.current]) + ' · ' + clock(view.times[view.index]),
      action: tr('Continue'), label: tr('Continue the Daily Gauntlet')
    };
  }

  function renderDaily() {
    const block = $('daily-gauntlet');
    if (!block) return;
    const title = $('daily-gauntlet-title');
    const note = $('daily-gauntlet-note');
    const action = $('daily-gauntlet-action');
    const state = dailyState(summary());
    if (title) title.textContent = tr('Daily Gauntlet');
    if (note) note.textContent = state.note;
    if (action) {
      action.textContent = state.action;
      action.setAttribute('aria-label', state.label);
    }
    block.dataset.state = state.state;
  }

  function actionLabel(view) {
    if (!view.hasRun) return tr('Start run');
    if (view.complete) return view.date === view.today ? tr('Start again') : tr('Start today’s run');
    if (view.expired) return tr('Start today’s run');
    return tr('Continue');
  }

  function roundState(view, i) {
    if (i < view.index) {
      return view.times[i] === null ? tr('Done earlier') : tr('Done') + ' · ' + clock(view.times[i]);
    }
    if (view.complete) return '';
    if (i === view.index && view.active) return tr('Now') + ' · ' + clock(view.times[i]);
    return tr('Not played');
  }

  function runAction(view) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gauntlet-run-action';
    button.dataset.gauntletStart = '';
    button.dataset.fade = '';
    button.textContent = actionLabel(view);
    button.setAttribute('aria-label', button.textContent);
    return button;
  }

  function renderRun() {
    const host = $('gauntlet-run');
    if (!host) return;
    const view = summary();
    host.innerHTML = '';
    if (!view.hasRun) {
      const empty = document.createElement('p');
      empty.className = 'gauntlet-empty';
      empty.textContent = tr('No run yet. Six games, one order, one time.');
      host.appendChild(empty);
      host.appendChild(runAction(view));
      return;
    }

    const head = document.createElement('div');
    head.className = 'gauntlet-run-head';
    const status = document.createElement('p');
    status.className = 'gauntlet-run-status';
    status.textContent = view.complete
      ? number(6) + '/' + number(6)
      : format('Round {1} / {2}', [number(view.index + 1), number(6)]);
    const time = document.createElement('p');
    time.className = 'gauntlet-run-time';
    time.textContent = clock(view.total);
    head.appendChild(status);
    head.appendChild(time);
    host.appendChild(head);

    const date = document.createElement('p');
    date.className = 'gauntlet-run-date';
    date.textContent = view.date === view.today
      ? tr('Today') + ' · ' + shortDate(view.date)
      : tr('Started') + ' · ' + shortDate(view.date);
    host.appendChild(date);

    const list = document.createElement('ol');
    list.className = 'gauntlet-rounds';
    list.setAttribute('aria-label', tr('Gauntlet rounds'));
    view.order.forEach(function (game, i) {
      const item = document.createElement('li');
      item.className = 'gauntlet-round' +
        (i < view.index ? ' is-done' : '') +
        (i === view.index && view.active ? ' is-current' : '');
      item.dataset.game = game;
      const index = document.createElement('span');
      index.className = 'gauntlet-round-index';
      index.textContent = number(String(i + 1).padStart(2, '0'));
      const copy = document.createElement('span');
      copy.className = 'gauntlet-round-copy';
      const name = document.createElement('strong');
      name.textContent = tr(LABELS[game]);
      const state = document.createElement('span');
      state.textContent = roundState(view, i);
      copy.appendChild(name);
      copy.appendChild(state);
      item.appendChild(index);
      item.appendChild(copy);
      list.appendChild(item);
    });
    host.appendChild(list);
    host.appendChild(runAction(view));
  }

  function renderAll() {
    renderDaily();
    renderRun();
    emit();
  }

  function stopTicker() {
    if (!tickTimer) return;
    window.clearInterval(tickTimer);
    tickTimer = 0;
  }

  function tick() {
    const run = data.run;
    if (!run || run.index >= GAMES.length) {
      stopTicker();
      return;
    }
    // Leaving the game pauses; Continue restarts at the round boundary.
    if (roundOpen && !onGameScreen()) {
      addElapsed();
      roundOpen = false;
      stopTicker();
      // The round boundary is also a save point: a quick reload must not fall
      // back to the last 10-second autosave.
      save();
      renderAll();
      return;
    }
    if (!activeNow()) {
      lastTick = Date.now();
      return;
    }
    addElapsed();
    saveTicks += 1;
    if (saveTicks >= 10) {
      saveTicks = 0;
      save();
    }
  }

  function startTicker() {
    if (tickTimer) return;
    lastTick = Date.now();
    tickTimer = window.setInterval(tick, 1000);
  }

  // A solved Sudoku reopens on its result and never completes again; the other
  // five restart at the round boundary and advance through the seam.
  function satisfiedOnEntry(run, game) {
    if (game !== 'sudoku') return false;
    try {
      return Boolean(window.SixfoldDaily && window.SixfoldDaily.isDone &&
        window.SixfoldDaily.isDone(run.date, 'sudoku'));
    } catch (err) {
      return false;
    }
  }

  function completeRun() {
    const run = data.run;
    if (!run || run.index < GAMES.length) return;
    roundOpen = false;
    stopTicker();
    for (let i = 0; i < run.times.length; i += 1) {
      if (typeof run.times[i] === 'number') run.times[i] = Math.max(0, Math.round(run.times[i]));
    }
    save();
    const seconds = totalFor(run);
    try {
      if (window.SixfoldProfile && window.SixfoldProfile.recordGauntlet) {
        window.SixfoldProfile.recordGauntlet({ date: run.date, rounds: GAMES.length, seconds: seconds });
      }
    } catch (err) {}
    renderAll();
  }

  function openRound() {
    const run = data.run;
    if (!run || run.index >= GAMES.length) {
      renderAll();
      return;
    }
    if (run.date !== today()) {
      start();
      return;
    }
    const game = run.order[run.index];
    if (satisfiedOnEntry(run, game)) {
      run.times[run.index] = null;
      run.index += 1;
      save();
      if (run.index >= GAMES.length) {
        completeRun();
        return;
      }
      openRound();
      return;
    }
    roundOpen = true;
    startTicker();
    lastTick = Date.now();
    try {
      if (window.SixfoldDaily && window.SixfoldDaily.play) window.SixfoldDaily.play(game, run.date);
    } catch (err) {}
    renderAll();
  }

  function start() {
    const date = today();
    const run = data.run;
    if (!run || run.date !== date || run.index >= GAMES.length) {
      data.run = { date: date, order: orderFor(date), index: 0, times: GAMES.map(function () { return 0; }) };
      roundOpen = false;
      stopTicker();
      saveTicks = 0;
      save();
    }
    openRound();
  }

  function handleComplete(event) {
    const detail = event && event.detail;
    const run = data.run;
    if (!run || !detail || run.index >= GAMES.length) return;
    if (detail.date !== run.date) return;
    if (detail.game !== run.order[run.index]) return;
    // A round open across midnight still finishes into its run; an archive
    // replay cannot resurrect an expired one.
    if (run.date !== today() && !roundOpen) return;
    addElapsed();
    run.times[run.index] = Math.max(0, Math.round(Number(run.times[run.index]) || 0));
    run.index += 1;
    roundOpen = false;
    stopTicker();
    save();
    if (run.index >= GAMES.length) {
      completeRun();
      return;
    }
    renderAll();
  }

  // Reloading on the current game's hash restores its seeded daily round.
  function resumeOnScreen() {
    const run = data.run;
    if (!run || run.index >= GAMES.length || run.date !== today()) return;
    const game = run.order[run.index];
    const hash = String(location.hash || '').replace(/^#/, '');
    if (hash !== game) return;
    window.setTimeout(function () {
      if (document.body.dataset.screen !== game) return;
      openRound();
    }, 260);
  }

  function init() {
    renderAll();

    const dailyAction = $('daily-gauntlet-action');
    if (dailyAction) dailyAction.addEventListener('click', start);
    const runHost = $('gauntlet-run');
    if (runHost) {
      runHost.addEventListener('click', function (event) {
        const button = event.target && event.target.closest
          ? event.target.closest('[data-gauntlet-start]')
          : null;
        if (button) start();
      });
    }
    document.querySelectorAll('[data-open-badges]').forEach(function (button) {
      button.addEventListener('click', renderAll);
    });

    window.addEventListener('sixfold:daily-complete', handleComplete);
    window.addEventListener('sixfold:daily-change', renderAll);
    window.addEventListener('storage', function (event) {
      if (event.key !== KEY) return;
      data = load();
      roundOpen = false;
      stopTicker();
      renderAll();
    });
    window.addEventListener('focus', function () {
      lastTick = Date.now();
      renderAll();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        addElapsed(true);
        if (data.run) save();
      } else {
        lastTick = Date.now();
        renderAll();
      }
    });
    window.addEventListener('pagehide', function () {
      addElapsed(true);
      if (data.run) save();
    });
    window.addEventListener('load', renderAll);
    resumeOnScreen();
  }

  window.SixfoldGauntlet = {
    KEY: KEY,
    VERSION: VERSION,
    start: start,
    summary: summary,
    orderFor: orderFor
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
