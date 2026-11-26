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
  const BADGES = [
    { days: 3, color: '#e85f3b' },
    { days: 7, color: '#e3b94a' },
    { days: 30, color: '#39a9a1' },
    { days: 100, color: '#5b8fd5' },
    { days: 365, color: '#9a6bb5' }
  ];
  const WEEKLY_BADGE = { days: ORDER.length, color: '#8bbd54' };
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

  // Resolve the same --six token the hub and cartridges use. The alias can be
  // one level deep (--six-1 -> --g1), so follow it before handing the canvas a
  // concrete colour.
  function gameColor(game) {
    const index = ORDER.indexOf(game);
    if (index === -1) return '#e85f3b';
    const root = document.documentElement;
    const styles = getComputedStyle(root);
    let value = styles.getPropertyValue('--six-' + (index + 1)).trim();
    const alias = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value);
    if (alias) value = styles.getPropertyValue(alias[1]).trim();
    return value || '#e85f3b';
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

  // A normalized per-game aggregate for the 6.0 profile store. The days map
  // stays private here; the profile only needs how often each game was
  // credited, plus the first and last dates it happened.
  function gameSummary() {
    const summary = {};
    ORDER.forEach(function (game) {
      summary[game] = { done: 0, first: null, last: null };
    });
    Object.keys(data.days).forEach(function (key) {
      const day = data.days[key];
      if (!day || !day.games) return;
      ORDER.forEach(function (game) {
        if (!day.games[game]) return;
        const entry = summary[game];
        entry.done += 1;
        if (!entry.first || key < entry.first) entry.first = key;
        if (!entry.last || key > entry.last) entry.last = key;
      });
    });
    return summary;
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

  function earnedBadgeFor(value) {
    let earned = null;
    BADGES.forEach(function (badge) {
      if (value >= badge.days) earned = badge;
    });
    return earned;
  }

  function nextBadgeFor(value) {
    for (let i = 0; i < BADGES.length; i += 1) {
      if (value < BADGES[i].days) return BADGES[i];
    }
    return null;
  }

  function highestMilestone(value) {
    const badge = earnedBadgeFor(value);
    return badge ? badge.days : 0;
  }

  function nextMilestone(value) {
    const badge = nextBadgeFor(value);
    return badge ? badge.days : 0;
  }

  function weekStartKey(key) {
    const date = dateFromKey(key || todayKey());
    if (!date) return key;
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return todayKey(date);
  }

  function weekProgress(key) {
    const start = weekStartKey(key || todayKey());
    const games = {};
    for (let i = 0; i < 7; i += 1) {
      const day = dayFor(shiftKey(start, i));
      if (!day) continue;
      ORDER.forEach(function (game) {
        if (day.games && day.games[game]) games[game] = true;
      });
    }
    const list = ORDER.filter(function (game) { return games[game]; });
    return {
      start: start,
      games: list,
      count: list.length,
      total: ORDER.length,
      complete: list.length === ORDER.length
    };
  }

  function weeklyBadge() {
    const weeks = {};
    Object.keys(data.days).forEach(function (key) {
      const start = weekStartKey(key);
      const games = weeks[start] || (weeks[start] = {});
      const day = data.days[key];
      if (!day || !day.games) return;
      ORDER.forEach(function (game) {
        if (day.games[game]) games[game] = true;
      });
    });
    return Object.keys(weeks).some(function (start) {
      return ORDER.every(function (game) { return weeks[start][game]; });
    });
  }

  function badgeSummary() {
    const best = bestStreak();
    return {
      best: best,
      earned: earnedBadgeFor(best),
      next: nextBadgeFor(best),
      weekly: weeklyBadge(),
      week: weekProgress(todayKey())
    };
  }

  function badgeList() {
    const best = bestStreak();
    const week = weekProgress(todayKey());
    const list = BADGES.map(function (badge) {
      return {
        days: badge.days,
        color: badge.color,
        earned: best >= badge.days,
        next: nextBadgeFor(best) === badge
      };
    });
    list.push({
      days: WEEKLY_BADGE.days,
      color: WEEKLY_BADGE.color,
      earned: weeklyBadge(),
      next: false,
      weekly: true,
      progress: week.count
    });
    return list;
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
    const credited = !day.games[game];
    // Every game finishes through here exactly once, so this is the only
    // completion boundary 6.0 needs. It fires before the duplicate check: a
    // replay is still a finished round. `credited` says whether the daily
    // store counted it, and `sixfold:daily-change` keeps its first-credit
    // meaning for the hub, badges and weekly dots.
    try {
      window.dispatchEvent(new CustomEvent('sixfold:daily-complete', {
        detail: { date: key, game: game, credited: credited, meta: meta || null }
      }));
    } catch (err) {}
    if (!credited) {
      render();
      return false;
    }
    // Read the week before the game is written, or this completion is already
    // part of the "previous" state and Perfect six can never be announced.
    const previousWeekly = weeklyBadge();
    day.games[game] = true;
    data.days[key] = day;
    const previousBest = data.best || 0;
    const current = streak();
    const previousBadge = highestMilestone(previousBest);
    const earnedBadge = highestMilestone(current);
    const weeklyEarned = !previousWeekly && weeklyBadge();
    data.best = Math.max(previousBest, current);
    save();
    render();
    const notes = [tr(GAMES[game].label) + ' · ' + tr('Done') + '.'];
    if (earnedBadge > previousBadge) {
      pulseBadge();
      notes.push(tr('Badge') + ': ' + number(earnedBadge) + ' ' + tr('day streak') + '.');
    }
    if (weeklyEarned) {
      pulseBadge();
      notes.push(tr('Perfect six') + '.');
    }
    announce(notes.join(' '));
    if (key === todayKey() && game === featuredGame(key)) {
      showFinish(game, earnedBadge > previousBadge ? earnedBadge : 0, weeklyEarned);
    }
    const total = countFor(key);
    try {
      window.dispatchEvent(new CustomEvent('sixfold:daily-change', {
        detail: { date: key, game: game, total: total, meta: meta || null }
      }));
    } catch (err) {}
    return true;
  }

  let finishTimer = 0;

  function hideFinish() {
    const el = $('daily-finish');
    if (!el) return;
    window.clearTimeout(finishTimer);
    el.classList.remove('is-on');
    finishTimer = window.setTimeout(function () {
      if (!el.classList.contains('is-on')) el.hidden = true;
    }, 220);
  }

  function showFinish(game, earnedBadge, weeklyEarned) {
    const el = $('daily-finish');
    if (!el) return;
    const title = $('daily-finish-title');
    const copy = $('daily-finish-copy');
    if (title) title.textContent = tr('Challenge finished');
    if (copy) {
      const parts = [tr(GAMES[game].label)];
      if (earnedBadge) parts.push(tr('Badge') + ' ' + number(earnedBadge));
      if (weeklyEarned) parts.push(tr('Perfect six'));
      copy.textContent = parts.join(' · ');
    }
    el.hidden = false;
    el.classList.remove('is-on');
    void el.offsetWidth;
    el.classList.add('is-on');
    if (window.MergeCelebrate && window.MergeCelebrate.play) {
      window.MergeCelebrate.play(el);
    }
    window.clearTimeout(finishTimer);
    finishTimer = window.setTimeout(hideFinish, 5200);
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
    shownKey = key;
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
    const badgeProgress = $('daily-badge-progress');
    const badgeFill = $('daily-badge-progress-fill');
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
      // Before a badge is earned, the badge itself already says "Next badge"
      // and the progress bar shows how far along it is. Repeating that in a
      // second line only adds noise; after earning one, show the way to the next.
      badgeNext.hidden = !next || !earned;
      badgeNext.textContent = next && earned
        ? number(next - best) + ' ' + tr('days to') + ' ' + number(next)
        : '';
    }
    if (badgeProgress && badgeFill) {
      const from = earned || 0;
      const to = next || 0;
      const ratio = to > from ? Math.max(0, Math.min(1, (best - from) / (to - from))) : 0;
      badgeProgress.hidden = !next;
      badgeFill.style.transform = 'scaleX(' + Math.round(ratio * 1000) / 1000 + ')';
    }

    const weekEl = $('daily-week');
    const weekTrack = $('daily-week-track');
    const weekNote = $('daily-week-note');
    if (weekTrack) {
      const week = weekProgress(key);
      weekTrack.innerHTML = '';
      ORDER.forEach(function (game) {
        const dot = document.createElement('i');
        dot.className = 'daily-week-dot' + (week.games.indexOf(game) !== -1 ? ' is-done' : '');
        dot.dataset.fade = '';
        dot.dataset.game = game;
        weekTrack.appendChild(dot);
      });
      if (weekNote) weekNote.textContent = week.complete ? tr('Perfect six') : number(week.count) + '/' + number(week.total);
      if (weekEl) {
        weekEl.classList.toggle('is-perfect', week.complete);
        weekEl.setAttribute('aria-label', tr('This week') + ': ' + number(week.count) + '/' + number(week.total) + (week.complete ? ' · ' + tr('Perfect six') : ''));
      }
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
      action.hidden = false;
      action.dataset.date = key;
      action.dataset.game = game;
      action.textContent = isToday
        ? tr('Play ' + GAMES[game].label + ' for today')
        : tr('Replay') + ' ' + tr(GAMES[game].label) + ' · ' + short(key);
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

  // A shared card should open the app wherever the reader is already playing
  // it. The native shell serves itself from https://localhost, and a link to a
  // development address is useless to whoever receives it, so both of those
  // keep the canonical public page.
  const CANONICAL = 'https://moh23rd.github.io/Sixfold/';
  function shareBase() {
    const native = Boolean(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    const host = location.hostname;
    const local = !host || host === 'localhost' || host === '127.0.0.1';
    if (native || local || !/^https?:$/.test(location.protocol)) return CANONICAL;
    return location.origin + location.pathname;
  }

  function shareData(dateKey) {
    const key = isKey(dateKey) ? dateKey : (shownKey || todayKey());
    const game = featuredGame(key);
    return {
      daily: true,
      title: tr('Daily Sixfold'),
      game: tr(GAMES[game].label),
      kind: tr(GAMES[game].kind),
      goal: tr(GAMES[game].goal),
      date: key,
      label: pretty(key),
      color: gameColor(game),
      index: ORDER.indexOf(game),
      file: 'sixfold-daily-' + key,
      url: shareBase() + '?daily=' + key
    };
  }

  // A phone is usually left asleep on the hub overnight. Coming back to a
  // stale card is what makes a saved card look like the wrong day.
  function refreshIfStale() {
    const key = todayKey();
    if (shownKey === key) return;
    selectedDay = key;
    render();
  }

  function init() {
    render();
    window.addEventListener('focus', refreshIfStale);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) refreshIfStale();
    });
    const calendarBtn = $('daily-calendar-open');
    if (calendarBtn) calendarBtn.addEventListener('click', function () { openCalendar(calendarBtn); });
    const featuredBtn = $('daily-featured');
    if (featuredBtn) featuredBtn.addEventListener('click', function () {
      play(featuredBtn.dataset.game || featuredGame(todayKey()));
    });
    const shareBtn = $('daily-share');
    if (shareBtn) shareBtn.addEventListener('click', function () {
      if (window.MergeShare && window.MergeShare.daily) window.MergeShare.daily();
    });
    const sheet = $('daily-calendar');
    if (sheet) {
      sheet.querySelectorAll('[data-close]').forEach(function (el) {
        el.addEventListener('click', closeCalendar);
      });
    }
    const finishClose = $('daily-finish-close');
    if (finishClose) finishClose.addEventListener('click', hideFinish);
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
      window.setTimeout(function () { play(featuredGame(shared), shared); }, 220);
    }
  }

  let data = load();
  let selectedDay = todayKey();
  // The day the hub is currently showing. A saved card uses this, not a fresh
  // clock read, so an app left open across midnight cannot save the wrong day.
  let shownKey = '';

  window.SixfoldDaily = {
    todayKey: todayKey,
    shiftKey: shiftKey,
    complete: complete,
    play: play,
    openCalendar: openCalendar,
    featuredGame: featuredGame,
    streak: streak,
    bestStreak: bestStreak,
    badgeSummary: badgeSummary,
    badgeList: badgeList,
    weeklyBadge: weeklyBadge,
    weekProgress: weekProgress,
    weekStartKey: weekStartKey,
    shareData: shareData,
    hideFinish: hideFinish,
    isDone: isDone,
    countFor: countFor,
    gameSummary: gameSummary,
    seededRandom: seededRandom
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
