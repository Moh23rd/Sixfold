/* Daily Sixfold — one local-date check-in for the collection, plus a seeded
   daily challenge for every game. No server, no account and no network
   required. */
(function () {
  'use strict';

  const KEY = 'sixfold.daily.v1';
  const ORDER = ['merge', 'sudoku', 'ttt', 'mines', 'water', 'fruit'];
  const GAMES = {
    merge: { label: 'Merge', kind: 'Numbers', goal: 'Finish seeded 4 × 4' },
    sudoku: { label: 'Sudoku', kind: 'Numbers', goal: 'Solve the daily grid' },
    ttt: { label: 'Tic Tac Toe', kind: 'Classic', goal: 'Beat today’s computer' },
    mines: { label: 'Minesweeper', kind: 'Logic', goal: 'Clear today’s field' },
    water: { label: 'Water Sort', kind: 'Sorting', goal: 'Clear today’s level' },
    fruit: { label: 'Fruit Merge', kind: 'Merging', goal: 'Finish today’s run' }
  };
  const MAX_ARCHIVE = 30;
  // Milestones follow the widely used 7 / 30 / 100 / 365 rhythm, with a
  // shorter 3-day first step so a new player can earn a badge without waiting
  // a full week. A badge is permanent: it is earned from the best streak, not
  // the current one, so a missed day never takes it away.
  const MILESTONES = [3, 7, 30, 100, 365];
  const $ = function (id) { return document.getElementById(id); };

  function pad(value) { return String(value).padStart(2, '0'); }

  function todayKey(date) {
    const d = date instanceof Date ? date : new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function seedValue(text) {
    let hash = 2166136261;
    const source = String(text);
    for (let i = 0; i < source.length; i += 1) {
      hash ^= source.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededRandom(text) {
    let value = seedValue(text);
    return function () {
      value |= 0;
      value = value + 0x6D2B79F5 | 0;
      let t = Math.imul(value ^ value >>> 15, 1 | value);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function featuredGame(key) {
    const safe = isKey(key) ? key : todayKey();
    return ORDER[seedValue('sixfold-daily-feature|' + safe) % ORDER.length];
  }

  function dateFromKey(key) {
    const parts = String(key || '').split('-').map(Number);
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
    const d = new Date(parts[0], parts[1] - 1, parts[2], 12);
    if (d.getFullYear() !== parts[0] || d.getMonth() !== parts[1] - 1 || d.getDate() !== parts[2]) return null;
    return d;
  }

  function shiftKey(key, delta) {
    const d = dateFromKey(key);
    if (!d) return key;
    d.setDate(d.getDate() + delta);
    return todayKey(d);
  }

  function locale() {
    try { return window.SixfoldI18n ? window.SixfoldI18n.locale() : undefined; } catch (err) { return undefined; }
  }

  function formatLocale() {
    try { return window.SixfoldI18n ? window.SixfoldI18n.formatLocale() : undefined; } catch (err) { return undefined; }
  }

  function tr(value) {
    try { return window.SixfoldI18n ? window.SixfoldI18n.t(value) : value; } catch (err) { return value; }
  }

  function number(value) {
    try { return window.SixfoldI18n ? window.SixfoldI18n.number(value) : String(value); } catch (err) { return String(value); }
  }

  function pretty(key) {
    const d = dateFromKey(key);
    if (!d) return '';
    try {
      return d.toLocaleDateString(formatLocale(), { weekday: 'long', day: 'numeric', month: 'long' });
    } catch (err) {
      return key;
    }
  }

  function short(key) {
    const d = dateFromKey(key);
    if (!d) return '';
    try {
      return d.toLocaleDateString(formatLocale(), { weekday: 'short', day: 'numeric', month: 'short' });
    } catch (err) {
      return key;
    }
  }

  function isKey(key) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(key || '')) && Boolean(dateFromKey(key));
  }

  function load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY) || 'null');
      return clean(parsed);
    } catch (err) {
      return clean(null);
    }
  }

  function clean(value) {
    const out = { days: {}, best: 0 };
    if (!value || typeof value !== 'object' || !value.days || typeof value.days !== 'object') return out;
    Object.keys(value.days).slice(0, 800).forEach(function (key) {
      if (!isKey(key)) return;
      const day = value.days[key];
      if (!day || typeof day !== 'object') return;
      const games = {};
      ORDER.forEach(function (game) {
        if (day.games && day.games[game]) games[game] = true;
      });
      if (Object.keys(games).length) out.days[key] = { games: games };
    });
    out.best = Math.max(0, Math.floor(Number(value.best) || 0));
    return out;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (err) {}
  }

  function dayFor(key) {
    return data.days[key] || null;
  }

  function countFor(key) {
    const day = dayFor(key);
    return day ? Object.keys(day.games).filter(function (game) { return GAMES[game]; }).length : 0;
  }

  function isDone(key, game) {
    const day = dayFor(key);
    return Boolean(day && day.games && day.games[game]);
  }

  function streak() {
    let cursor = countFor(todayKey()) ? todayKey() : shiftKey(todayKey(), -1);
    let total = 0;
    while (countFor(cursor) && total < 3660) {
      total += 1;
      cursor = shiftKey(cursor, -1);
    }
    return total;
  }

  function bestStreak() {
    return Math.max(data.best || 0, streak());
  }

  function highestMilestone(value) {
    let earned = 0;
    MILESTONES.forEach(function (milestone) {
      if (value >= milestone) earned = milestone;
    });
    return earned;
  }

  function nextMilestone(value) {
    for (let i = 0; i < MILESTONES.length; i += 1) {
      if (value < MILESTONES[i]) return MILESTONES[i];
    }
    return 0;
  }

  function pulseBadge() {
    const badge = $('daily-badge');
    if (!badge) return;
    badge.classList.remove('is-new');
    void badge.offsetWidth;
    badge.classList.add('is-new');
    window.setTimeout(function () { badge.classList.remove('is-new'); }, 900);
  }

  function announce(message) {
    const live = $('daily-live');
    if (live) {
      live.textContent = '';
      window.setTimeout(function () { live.textContent = message; }, 20);
    }
  }

  function complete(game, meta, dateKey) {
    if (!GAMES[game]) return false;
    const key = isKey(dateKey) ? dateKey : todayKey();
    const day = data.days[key] || { games: {} };
    if (day.games[game]) {
      render();
      return false;
    }
    day.games[game] = true;
    data.days[key] = day;
    const previousBest = data.best || 0;
    const current = streak();
    const previousBadge = highestMilestone(previousBest);
    const earnedBadge = highestMilestone(current);
    data.best = Math.max(previousBest, current);
    save();
    render();
    if (earnedBadge > previousBadge) {
      pulseBadge();
      announce(tr('Badge') + ': ' + number(earnedBadge) + ' ' + tr('day streak') + '.');
    }
    announce(tr(GAMES[game].label) + ' · ' + tr('Done') + '.');
    const total = countFor(key);
    try {
      window.dispatchEvent(new CustomEvent('sixfold:daily-change', {
        detail: { date: key, game: game, total: total, meta: meta || null }
      }));
    } catch (err) {}
    return true;
  }

  function play(game, dateKey) {
    if (!GAMES[game]) return;
    const date = isKey(dateKey) ? dateKey : todayKey();
    if (game === 'sudoku') {
      if (window.MergeGames && window.MergeGames.open) window.MergeGames.open('sudoku');
      else location.hash = '#sudoku';
      window.setTimeout(function () {
        if (window.SixfoldSudoku && window.SixfoldSudoku.startDaily) {
          window.SixfoldSudoku.startDaily(date);
        }
      }, 80);
      announce(tr('Daily Sudoku for ' + short(date) + '.'));
      return;
    }
    if (date !== todayKey()) {
      announce(tr('Only the Sudoku archive can be replayed. Other games count today.'));
      return;
    }
    if (window.MergeGames && window.MergeGames.open) window.MergeGames.open(game);
    else location.hash = '#' + game;
    window.setTimeout(function () {
      if (window.MergeGames && window.MergeGames.startDaily) {
        window.MergeGames.startDaily(game, 'sixfold-daily-v1|' + date + '|' + game, date);
      }
    }, 100);
    announce(tr(GAMES[game].goal) + ' · ' + short(date) + '.');
  }

  function render() {
    const key = todayKey();
    const dateEl = $('daily-date');
    const streakEl = $('daily-streak');
    const bestEl = $('daily-best');
    const featuredBtn = $('daily-featured');
    const featuredLabel = $('daily-featured-label');
    const featured = featuredGame(key);
    const dailyEl = $('daily');
    const gameNameEl = $('daily-game-name');
    const gameKindEl = $('daily-game-kind');
    const todayEl = $('daily-today');

    if (dateEl) dateEl.textContent = pretty(key);
    if (streakEl) streakEl.textContent = String(streak());
    if (bestEl) bestEl.textContent = String(bestStreak());
    if (dailyEl) {
      dailyEl.dataset.dailyGame = featured;
      dailyEl.classList.toggle('is-done', isDone(key, featured));
    }
    if (todayEl) todayEl.textContent = tr('Today');
    if (gameNameEl) gameNameEl.textContent = tr(GAMES[featured].label);
    if (gameKindEl) gameKindEl.textContent = tr(GAMES[featured].kind);
    if (featuredBtn) {
      featuredBtn.dataset.game = featured;
      featuredBtn.setAttribute('aria-label', tr('Play ' + GAMES[featured].label + ' for today'));
    }
    if (featuredLabel) featuredLabel.textContent = tr('Play ' + GAMES[featured].label + ' for today');

    const best = bestStreak();
    const earned = highestMilestone(best);
    const next = nextMilestone(best);
    const badge = $('daily-badge');
    const badgeTitle = $('daily-badge-title');
    const badgeValue = $('daily-badge-value');
    const badgeUnit = $('daily-badge-unit');
    const badgeNext = $('daily-badge-next');
    if (badge) {
      badge.classList.toggle('is-earned', Boolean(earned));
      badge.classList.toggle('is-next', !earned);
      const shown = earned || next;
      if (badgeTitle) badgeTitle.textContent = tr(earned ? 'Badge' : 'Next badge');
      if (badgeValue) badgeValue.textContent = number(shown);
      if (badgeUnit) badgeUnit.textContent = tr('day streak');
      badge.setAttribute('aria-label', tr(earned ? 'Badge' : 'Next badge') + ': ' + number(shown) + ' ' + tr('day streak'));
    }
    if (badgeNext) {
      badgeNext.hidden = !(earned && next);
      badgeNext.textContent = earned && next ? tr('Next badge') + ' · ' + number(next) : '';
    }
    renderCalendar();
  }

  function renderCalendar() {
    const grid = $('daily-calendar-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const today = todayKey();
    for (let i = MAX_ARCHIVE - 1; i >= 0; i -= 1) {
      const key = shiftKey(today, -i);
      const count = countFor(key);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'daily-day' + (key === today ? ' is-today' : '') +
        (count ? ' is-started' : '');
      button.dataset.date = key;
      button.setAttribute('aria-label', tr(short(key) + (count ? ', ' + tr('Done') : '')));
      const d = dateFromKey(key);
      button.innerHTML = '<span>' + (d ? d.getDate() : '') + '</span>' +
        '<i class="daily-day-dots" aria-hidden="true"><b class="' + (count ? 'on' : '') + '"></b></i>';
      button.addEventListener('click', function () { selectDay(key); });
      grid.appendChild(button);
    }
    if (!selectedDay) selectedDay = today;
    showDay(selectedDay);
  }

  function showDay(key) {
    selectedDay = key;
    const title = $('daily-day-title');
    const copy = $('daily-day-copy');
    const action = $('daily-day-play');
    const count = countFor(key);
    const isToday = key === todayKey();
    const game = featuredGame(key);
    if (title) title.textContent = pretty(key) + ' · ' + tr(GAMES[game].label);
    if (copy) {
      copy.textContent = tr(GAMES[game].kind) + (count ? ' · ' + tr('Done') : '');
    }
    if (action) {
      action.hidden = !isToday;
      action.dataset.date = key;
      action.dataset.game = game;
      action.textContent = tr('Play ' + GAMES[game].label + ' for today');
    }
    const grid = $('daily-calendar-grid');
    if (grid) {
      grid.querySelectorAll('.daily-day').forEach(function (button) {
        const selected = button.dataset.date === key;
        button.classList.toggle('is-selected', selected);
        button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      });
    }
  }

  function selectDay(key) {
    if (!isKey(key)) return;
    showDay(key);
  }

  function openCalendar(opener) {
    selectedDay = todayKey();
    renderCalendar();
    const sheet = $('daily-calendar');
    if (!sheet) return;
    if (window.MergeTheme && window.MergeTheme.openSheet) window.MergeTheme.openSheet(sheet, opener);
    else { sheet.hidden = false; sheet.classList.add('is-open'); }
  }

  function closeCalendar() {
    const sheet = $('daily-calendar');
    if (!sheet) return;
    if (window.MergeTheme && window.MergeTheme.closeSheet) window.MergeTheme.closeSheet(sheet);
    else { sheet.hidden = true; sheet.classList.remove('is-open'); }
  }

  function init() {
    render();
    const calendarBtn = $('daily-calendar-open');
    if (calendarBtn) calendarBtn.addEventListener('click', function () { openCalendar(calendarBtn); });
    const featuredBtn = $('daily-featured');
    if (featuredBtn) featuredBtn.addEventListener('click', function () {
      play(featuredBtn.dataset.game || featuredGame(todayKey()));
    });
    const sheet = $('daily-calendar');
    if (sheet) {
      sheet.querySelectorAll('[data-close]').forEach(function (el) {
        el.addEventListener('click', closeCalendar);
      });
    }
    const archivePlay = $('daily-day-play');
    if (archivePlay) {
      archivePlay.addEventListener('click', function () {
        play(archivePlay.dataset.game || 'sudoku', archivePlay.dataset.date || todayKey());
        closeCalendar();
      });
    }
    window.addEventListener('storage', function (event) {
      if (event.key !== KEY) return;
      data = load();
      render();
    });
    try { window.addEventListener('sixfold:daily-change', render); } catch (err) {}

    const url = new URL(location.href);
    const shared = url.searchParams.get('daily');
    if (isKey(shared) && shared <= todayKey() && shared >= shiftKey(todayKey(), -(MAX_ARCHIVE - 1))) {
      url.searchParams.delete('daily');
      try { history.replaceState({ game: 'hub' }, '', url.pathname + url.search + url.hash); } catch (err) {}
      window.setTimeout(function () { play('sudoku', shared); }, 220);
    }
  }

  let data = load();
  let selectedDay = todayKey();

  window.SixfoldDaily = {
    todayKey: todayKey,
    shiftKey: shiftKey,
    complete: complete,
    play: play,
    openCalendar: openCalendar,
    featuredGame: featuredGame,
    streak: streak,
    bestStreak: bestStreak,
    isDone: isDone,
    countFor: countFor,
    seededRandom: seededRandom
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
