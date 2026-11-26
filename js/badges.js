/* The badge collection page reads the same milestone streak and weekly
   Perfect Six data as the daily card, so the shelf and card cannot disagree. */
(function () {
  'use strict';

  const page = document.getElementById('badges');
  if (!page) return;

  const grid = document.getElementById('badges-grid');
  const earnedEl = document.getElementById('badges-earned');
  const totalEl = document.getElementById('badges-total');
  const bestEl = document.getElementById('badges-best');
  const titleEl = document.getElementById('badges-title');
  const kickerEl = page.querySelector('.badges-kicker');
  const scoreEl = page.querySelector('.badges-score');
  const gamesList = document.getElementById('profile-games');
  const gauntletEl = document.getElementById('profile-gauntlet');

  // The six public games, in the collection's order. Wordle is deliberately
  // absent from the profile.
  const GAMES = ['merge', 'sudoku', 'ttt', 'mines', 'water', 'fruit'];
  const GAME_LABELS = {
    merge: 'Merge',
    sudoku: 'Sudoku',
    ttt: 'Tic Tac Toe',
    mines: 'Minesweeper',
    water: 'Water Sort',
    fruit: 'Fruit Merge'
  };

  function tr(value) {
    try { return window.SixfoldI18n ? window.SixfoldI18n.t(value) : value; } catch (err) { return value; }
  }

  function number(value) {
    try { return window.SixfoldI18n ? window.SixfoldI18n.number(String(value)) : String(value); } catch (err) { return String(value); }
  }

  function stateFor(badge) {
    if (badge.weekly) {
      return badge.earned ? tr('Perfect six') : number(badge.progress) + '/' + number(badge.days);
    }
    if (badge.earned) return tr('Done');
    if (badge.next) return tr('Next');
    return tr('Locked');
  }

  function medal() {
    const el = document.createElement('span');
    el.className = 'badge-medal';
    el.setAttribute('aria-hidden', 'true');
    const star = document.createElement('span');
    star.className = 'badge-medal-star';
    el.appendChild(star);
    return el;
  }

  function clock(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    const minutes = Math.floor(total / 60);
    const secs = total % 60;
    return number(minutes) + ':' + number(String(secs).padStart(2, '0'));
  }

  function bestText(best) {
    if (!best) return '';
    if (best.kind === 'time') return tr('Best') + ' ' + clock(best.value);
    if (best.kind === 'wins') return number(best.value) + ' ' + tr('Wins');
    return tr('Best') + ' ' + number(best.value);
  }

  function profileGameRow(entry) {
    const item = document.createElement('li');
    item.className = 'profile-game';
    item.dataset.game = entry.game;

    const copy = document.createElement('span');
    copy.className = 'profile-game-copy';
    const name = document.createElement('strong');
    name.textContent = tr(GAME_LABELS[entry.game]);
    const played = document.createElement('span');
    // A credited round and a replay are both plays. The daily store keeps only
    // the credit, so the profile adds the replays it has observed.
    played.textContent = tr('Played') + ' ' + number(entry.done + entry.replays);
    copy.appendChild(name);
    copy.appendChild(played);
    item.appendChild(copy);

    const best = bestText(entry.best);
    if (best) {
      const value = document.createElement('span');
      value.className = 'profile-game-best';
      value.textContent = best;
      item.appendChild(value);
    }
    return item;
  }

  function profileMetric(value, label) {
    const el = document.createElement('div');
    el.className = 'profile-metric';
    const amount = document.createElement('strong');
    amount.textContent = value;
    const name = document.createElement('span');
    name.textContent = label;
    el.appendChild(amount);
    el.appendChild(name);
    return el;
  }

  // M1 shows the aggregates the store already owns. M2 records runs through
  // SixfoldProfile.recordGauntlet, and this surface updates from the event.
  function renderProfile() {
    if (!window.SixfoldProfile || !window.SixfoldProfile.summary) return;
    const summary = window.SixfoldProfile.summary();

    if (gamesList) {
      gamesList.innerHTML = '';
      summary.games.forEach(function (entry) {
        gamesList.appendChild(profileGameRow(entry));
      });
    }

    if (gauntletEl) {
      const gauntlet = summary.gauntlet;
      gauntletEl.innerHTML = '';
      const metrics = document.createElement('div');
      metrics.className = 'profile-metrics';
      metrics.appendChild(profileMetric(number(gauntlet.runs), tr('Runs')));
      metrics.appendChild(profileMetric(
        gauntlet.bestTime ? clock(gauntlet.bestTime) : '—',
        tr('Best')
      ));
      gauntletEl.appendChild(metrics);

      const note = document.createElement('p');
      note.className = 'profile-empty';
      note.textContent = gauntlet.last
        ? tr('Last run') + ' · ' + number(gauntlet.last.rounds) + ' / ' + number(GAMES.length) +
          ' · ' + clock(gauntlet.last.seconds)
        : tr('No runs yet.');
      gauntletEl.appendChild(note);
    }
  }

  function render() {
    renderProfile();
    if (!grid || !window.SixfoldDaily || !window.SixfoldDaily.badgeList) return;
    const badges = window.SixfoldDaily.badgeList();
    const summary = window.SixfoldDaily.badgeSummary();
    const earned = badges.filter(function (badge) { return badge.earned; }).length;

    if (titleEl) titleEl.textContent = tr('Badges');
    if (kickerEl) kickerEl.textContent = tr('Daily Sixfold');
    if (earnedEl) earnedEl.textContent = number(earned);
    if (totalEl) totalEl.textContent = '/ ' + number(badges.length);
    if (bestEl) bestEl.textContent = tr('Best') + ' ' + number(summary.best) + ' ' + tr('day streak');
    if (grid) grid.setAttribute('aria-label', tr('Badges'));
    if (scoreEl) scoreEl.setAttribute('aria-label', number(earned) + ' / ' + number(badges.length) + ' ' + tr('Badges'));

    grid.innerHTML = '';
    badges.forEach(function (badge) {
      const card = document.createElement('li');
      card.className = 'badge-card' +
        (badge.earned ? ' is-earned' : ' is-locked') +
        (badge.next ? ' is-next' : '') +
        (badge.weekly ? ' is-weekly' : '');
      card.dataset.days = String(badge.days);
      card.style.setProperty('--badge-color', badge.color);

      const state = stateFor(badge);
      card.setAttribute(
        'aria-label',
        badge.weekly
          ? tr('Perfect six') + ' · ' + state
          : number(badge.days) + ' ' + tr('day streak') + ' · ' + state
      );

      const days = document.createElement('span');
      days.className = 'badge-card-days';
      const amount = document.createElement('strong');
      amount.className = 'badge-card-number';
      amount.textContent = number(badge.days);
      const unit = document.createElement('span');
      unit.className = 'badge-card-unit';
      unit.textContent = badge.weekly ? tr('games / week') : tr('day streak');
      days.appendChild(amount);
      days.appendChild(unit);

      const status = document.createElement('span');
      status.className = 'badge-card-state';
      status.textContent = state;

      card.appendChild(medal());
      card.appendChild(days);
      card.appendChild(status);
      grid.appendChild(card);
    });
  }

  function open() {
    render();
    if (window.SixfoldDaily && window.SixfoldDaily.hideFinish) window.SixfoldDaily.hideFinish();
    if (window.MergeGames && window.MergeGames.openBadges) {
      window.MergeGames.openBadges();
    }
  }

  document.querySelectorAll('[data-open-badges]').forEach(function (button) {
    button.addEventListener('click', open);
  });

  window.addEventListener('sixfold:daily-change', render);
  window.addEventListener('sixfold:profile', renderProfile);
  window.addEventListener('storage', function (event) {
    if (event.key === 'sixfold.daily.v1') render();
  });
  // The locale packs load after this file, so render once more when everything
  // is ready. The first pass keeps the page usable if they fail to load.
  window.addEventListener('load', render);

  render();
  window.SixfoldBadges = { render: render, open: open };
})();
