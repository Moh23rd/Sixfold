# M0 — the daily completion seam and round-start resume

**Status:** Decisions and spike complete. No 6.0 feature code is included in this
change.

**Baseline:** `release/6.0` at `c546f63`, plus this record.

**Roadmap:** [ROADMAP-6.0.md](ROADMAP-6.0.md), milestone M0.

## The question

The Daily Gauntlet has to advance when a player finishes a round, including a
replay of a daily that is already credited. `sixfold:daily-change` cannot do
that: `SixfoldDaily.complete()` returns before dispatching it when the day
already records the game. Is there a narrower seam than instrumenting six games?

## The answer

Yes — one event at the daily store. Every game already calls
`SixfoldDaily.complete()` exactly once at its finish: six call sites, one per
game. The missing replay signal is the duplicate short-circuit, not the seam.

## Measurement

The spike was a throwaway Playwright spec (deleted after the run), driving two
`complete('merge', …)` calls for the same date against the real daily store.

Before the proposed patch: `first: true`, `second: false`, one
`sixfold:daily-change`, no completion notification:

```json
{"first":true,"second":false,"credited":true,
 "events":[{"type":"change","detail":{"date":"2026-11-22","game":"merge","total":1}}]}
```

With the proposed patch applied: two `sixfold:daily-complete` events, `credited`
true then false, `daily-change` still once, both return values unchanged:

```json
{"first":true,"second":false,"credited":true,
 "events":[
  {"type":"complete","detail":{"date":"2026-11-22","game":"merge","credited":true}},
  {"type":"change","detail":{"date":"2026-11-22","game":"merge","total":1}},
  {"type":"complete","detail":{"date":"2026-11-22","game":"merge","credited":false}}]}
```

The patch was then reverted; `js/daily.js` in this tree is unchanged.

## Decision: one boundary event

`complete()` dispatches `sixfold:daily-complete` once per finished round, before
the duplicate check, with `detail: { date, game, credited, meta }`.
`sixfold:daily-change` keeps its current meaning — the first credit for that
date — because the hub, the badges shelf and the weekly dots already render on
it.

Proposed patch, not applied:

```js
const credited = !day.games[game];
try {
  window.dispatchEvent(new CustomEvent('sixfold:daily-complete', {
    detail: { date: key, game: game, credited: credited, meta: meta || null }
  }));
} catch (err) {}
if (!credited) {
  render();
  return false;
}
```

Contract:

- The event means “this game's daily round for `date` reached the end that game
  already treats as finished”, not “credit was newly earned”.
- `credited` is false on a replay. Both values advance a gauntlet round.
- An unknown game dispatches nothing and still returns false.
- The date is the one the run was started for, so a finish after midnight
  addresses its own day and cannot credit the new one.
- Listeners must be idempotent per (date, game): a resumed screen may re-render
  without calling `complete()`, and no path calls it twice for one finish.

## What each game calls “finished”

| Game | `startDaily` builds | Completion site | Trigger | Credits a loss? | Survives leaving the screen | Survives reload |
| --- | --- | --- | --- | --- | --- | --- |
| Merge | Seeded 4 × 4, fresh board | `js/game.js:791` `showResultCard` | 2048 reached **or** no moves left | Yes — a game over credits | No: `saveGame` ignores daily boards, `deactivate` ends the daily | No |
| Sudoku | Seeded unique grid at the day's difficulty | `js/sudoku.js:938` `finish` | Grid solved | No | Yes | Yes, mid-round (daily key + active key) |
| Tic Tac Toe | Seeded AI, new round | `js/games.js:1961` | X beats the computer | No: draws and losses do not | No | No |
| Minesweeper | Seeded field, first tap safe | `js/games.js:3736` | Field cleared | No | No | No |
| Water Sort | Level chosen by the date's day-of-month | `js/games.js:1565` | Level sorted | No | No: `saveState` deliberately ignores daily boards | No |
| Fruit Merge | Seeded run | `js/games.js:2776` `endRun` | Pile reaches the top | Yes — that is the end of a run | No | No |

Consequences:

- **Round-start resume needs no per-game work.** Five games already restart at
  the round boundary, with the same seed, level or difficulty. Sudoku already
  resumes mid-round, which is stronger than the round-start promise.
- **Merge and Fruit Merge credit a finished run that was lost.** For v1 the
  gauntlet inherits that boundary, because the roadmap defines a round by the
  daily credit. Add an `outcome` field only if playtests ask for win-only
  rounds.
- **Sudoku's saved solved state is the one dead end.** Reopening an
  already-solved daily shows the result and never calls `complete()`, so a
  completion event alone would leave the gauntlet waiting forever. Rule: on
  round entry, an already-credited daily counts as satisfied and advances; a
  Replay affordance is offered, not required.

## Integration rules for M2

- Advance only on `sixfold:daily-complete` whose `date` is the run's start date
  and whose `game` is the current round.
- Check `SixfoldDaily.isDone(date, game)` on round entry first, so an
  already-credited round — including the solved Sudoku — cannot dead-end.
- Leaving a screen is not a failure: re-entering restarts five rounds at their
  seeded start, and Sudoku resumes. This is the whole resume contract.
- Persist gauntlet state only: start date, round index, per-round active time,
  and the run's order. Do not persist game boards.
- Open rounds through `SixfoldDaily.play(game, date)`, which already routes
  through the game router and calls each `startDaily`.
- Do not reuse `sixfold:daily-change`; it is the first-credit signal and must
  keep its render semantics.

## Decisions

1. **Name:** Daily Gauntlet.
2. **Order:** date-seeded with a gauntlet-specific salt
   (`sixfold-gauntlet-order|<date>`), so the order is stable all day and
   independent of the featured card's `sixfold-daily-feature` salt.
3. **Scoring:** completion plus active time, with per-round times in the
   summary; no cross-game points formula.
4. **Midnight:** a run is pinned to its start date. A round finished after
   midnight still addresses the date its game was started for. No grace period
   in v1; an expired run offers one action, start today's run.
5. **Profile placement:** extend the badges page and keep `#badges`.
6. **Sudoku:** the existing daily grid, not a shortened one.
7. **Sharing:** text first; a bespoke card only if the core lands under
   estimate.

## Estimate, rechecked

| Milestone | Was | Now |
| --- | ---: | ---: |
| M0 decisions, seam, resume audit | 3–4 days | done |
| M1 profile foundation | 6–9 days | 6–9 days |
| M2 gauntlet core | 10–15 days | 8–12 days |
| M3 integration and polish | 5–8 days | 5–8 days |
| M4 release gate | 2–4 days | 2–4 days |
| **Remaining** | **26–40 days** | **21–33 days** |

The seam is one event and the resume audit found no per-game work, which is why
M2 loses its upper band. The remaining M2 risk is playtest, not engineering:
Sudoku's round length, and whether a lost Merge or Fruit Merge run should
advance. The full project from a clean start is now roughly 24–37 dev-days,
still excluding translation turnaround.

## Files

- `js/daily.js` — the seam, unchanged by this record.
- `js/game.js`, `js/sudoku.js`, `js/games.js` — audited, unchanged.
- Spike evidence: a throwaway `tests/spike-daily-seam.spec.js`, deleted after
  the measurements above.
