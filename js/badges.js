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
  const gridLabel = document.getElementById('badges-grid');
  const scoreEl = page.querySelector('.badges-score');

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

  function render() {
    if (!grid || !window.SixfoldDaily || !window.SixfoldDaily.badgeList) return;
    const badges = window.SixfoldDaily.badgeList();
    const summary = window.SixfoldDaily.badgeSummary();
    const earned = badges.filter(function (badge) { return badge.earned; }).length;

    if (titleEl) titleEl.textContent = tr('Badges');
    if (kickerEl) kickerEl.textContent = tr('Daily Sixfold');
    if (earnedEl) earnedEl.textContent = number(earned);
    if (totalEl) totalEl.textContent = '/ ' + number(badges.length);
    if (bestEl) bestEl.textContent = tr('Best') + ' ' + number(summary.best) + ' ' + tr('day streak');
    if (gridLabel) gridLabel.setAttribute('aria-label', tr('Badges'));
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
    if (window.SixfoldDaily && window.SixfoldDaily.hideFinish) window.SixfoldDaily.hideFinish();
    if (window.MergeGames && window.MergeGames.openBadges) {
      window.MergeGames.openBadges();
    }
  }

  document.querySelectorAll('[data-open-badges]').forEach(function (button) {
    button.addEventListener('click', open);
  });

  window.addEventListener('sixfold:daily-change', render);
  window.addEventListener('storage', function (event) {
    if (event.key === 'sixfold.daily.v1') render();
  });
  // The locale packs load after this file, so render once more when everything
  // is ready. The first pass keeps the page usable if they fail to load.
  window.addEventListener('load', render);

  render();
  window.SixfoldBadges = { render: render, open: open };
})();
