# Sixfold 6.0 — Daily Gauntlet + Profile/Stats

**Status:** Release candidate verified. The Daily Gauntlet, the local profile,
the badges-page sections and their backup coverage are implemented in 6.0.0.
The debug APK passed the full API 36 shell assertions locally (Chromium
133.0.6943), including first paint, palette and system-theme persistence,
navigation, haptics and rotation. Remaining before publication: merge the
release branch and deploy the web build. Gauntlet text sharing remains a
follow-up; the 6.0 release note does not promise it.

**Baseline:** `release/6.0` started at `5dbfd74`. The internal package/cache
version and the public label are now `6.0.0` and `v6.0`.

**M0 output:** [M0-DAILY-SEAM.md](M0-DAILY-SEAM.md) records the completion-seam
decision, the per-game finish and resume audit, and the rechecked estimate.

## Thesis

Sixfold already has the hard parts: six seeded daily challenges, a local-date
streak, badges, a 30-day archive and a share card. 6.0 should make the
**collection** the daily habit, not add a seventh game or a backend.

Two pieces, one release:

1. **Daily Gauntlet** — an optional, resumable run through all six daily
   challenges, with one completion time and one shareable result.
2. **Profile/stats foundation** — a local, account-free view of daily progress,
   per-game bests and gauntlet results.

The gauntlet is the headline. The profile is the foundation that makes its
results meaningful and gives existing progress a home.

## Scope

### In

- A local-only Profile surface that extends the existing badges page. It shows
  the daily streak/badge summary, the six public games' bests and recent
  gauntlet results. No new route, account or network call.
- An optional, date-bound Daily Gauntlet: all six games once, using the existing
  daily seeds. Completion is measured by rounds finished and active time.
- Round-start resume. Closing the tab does not lose the run; exact mid-round
  restore is not promised.
- Daily integration: finishing a gauntlet round counts only if the game was
  actually completed. A 6/6 run earns the same Perfect Six as playing each daily
  individually; replays never create duplicate daily credit.
- Backup, restore and clear-data coverage for the new local keys. Existing
  backups must keep working.

### Out

- Accounts, cloud sync, leaderboards, social graph, analytics or telemetry.
- A seventh game, challenge links, game depth packs, onboarding redesign, new
  languages or native-store release work.
- Replacing the current Daily Sixfold card or making the gauntlet mandatory.
- Custom share artwork, date deep links, replay-for-practice and a full
  historical play-by-play profile.
- Changing the public label before the release gate.

## Estimate

The earlier 16–23 dev-day estimate was too low. It assumed a clean six-game
completion seam and treated 12-locale, accessibility and device QA as polish.
The revised estimate is **26–40 focused dev-days**:

| Milestone | Deliverable | Estimate |
| --- | --- | ---: |
| **M0** | Decisions, completion-seam spike, per-game resume audit | 3–4 days |
| **M1** | Profile store/read facade, migration, UI, backup coverage | 6–9 days |
| **M2** | Gauntlet state machine, six-round integration, resume, summary | 10–15 days |
| **M3** | Share text, i18n, accessibility, cache and release polish | 5–8 days |
| **M4** | Full release matrix and public label flip | 2–4 days |

- **Profile-only fallback:** M0 + M1 + release is **11–17 dev-days**.
- **Minimum profile + gauntlet core:** M0 + M1 + M2 is **19–28 dev-days**.
- Add roughly 20% contingency for translation turnaround, native WebView issues
  and playtest-driven changes: **31–48 dev-days**.

At 4–5 focused days per week, the full release is about 6–10 weeks, excluding
store review. These are planning ranges, not commitments.

**The honest cut line:** if 6.0 must ship in roughly 15 dev-days, ship the
profile foundation and defer the gauntlet. Do not compress M2 by skipping resume,
daily-credit or accessibility work; that is where the hidden cost lives.

## Deliberate cuts

These are the choices that keep the release from becoming a platform project:

- Reuse the existing daily seeds and starters. Do not build a parallel puzzle
  generator.
- Guarantee round-start resume only. Mid-round persistence is a per-game project
  and would multiply the integration surface.
- Use completion + active time, not a cross-game points formula. Revisit scoring
  only after playtests.
- Start with text sharing and the existing share-card language. A bespoke
  six-tile card is optional polish, not a release requirement.
- Backfill profile aggregates from daily data and existing bests only. Do not
  reconstruct years of per-game history.
- Extend the badges page instead of adding a new navigation destination.
- No date deep links or replay mode in v1. They add state and edge cases without
  proving the core loop.

## Milestones

### M0 — Decisions and spike

- Choose the gauntlet name, date-seeded order and midnight behavior.
- Spike the narrowest completion seam. The current `sixfold:daily-change` event
  fires only on the first daily completion, so it cannot observe a gauntlet
  replay. Prefer one boundary event or a gauntlet callback over instrumenting all
  six games.
- Audit each game's daily start path to confirm what “resume at round start”
  actually means.
- Confirm the share text/card scope and the translated-string budget.
- Recheck the estimate after the spike.

**Exit:** the completion seam, round targets and resume contract are explicit;
no UI is committed before this is settled.

### M1 — Profile/stats foundation

- Keep the daily store authoritative for streaks, badges and archive. Add one
  versioned local profile store for normalized new results and gauntlet
  aggregates; do not duplicate daily state.
- Backfill only what can be derived safely from existing daily data and per-game
  bests. Make the migration idempotent and non-blocking on storage failure.
- Extend the badges page with daily, six-game and gauntlet sections. Keep it
  local, account-free and readable at 320px.
- Include the new keys in backup, restore and clear-data behavior; verify that an
  existing backup still restores.
- Exclude the hidden Wordle from the six-game profile.

**Exit:** the profile survives reload, backup/restore and clear; existing games
remain playable if the new store is unavailable.

### M2 — Daily Gauntlet

- Add an optional entry point beside the current daily action.
- Run all six games once in a deterministic order, using that date's existing
  daily challenges. Sudoku is the long round and the main playtest risk.
- Own gauntlet run state separately from each game's board state. Advance only
  on the expected game/date completion, including replays that are already
  credited to the daily.
- Support round-start resume, leaving without failure, and a clean date rollover.
- Show a simple summary (6/6, total active time, per-round times) and a text
  share result. Do not replace the current daily share.
- Test the completed-run path, the replay path, reload/resume, date rollover and
  the “daily already done outside the gauntlet” case.

**Exit:** a player can complete 6/6, leave and resume, and see correct daily and
profile records without double-counting.

### M3 — Integration and polish

- Connect gauntlet results to the profile.
- Finalize short copy in all 12 locales; verify RTL for the progress rail and
  summary.
- Check keyboard, focus, screen-reader announcements and color-independent
  status.
- Measure cache footprint after the new JS and strings; no locale may cross the
  1.8 MiB warning or the 2 MiB ceiling.
- Update the changelog and release notes. Do not add What's New copy until the
  release commit.

### M4 — Release gate

- Existing smoke, cache, i18n, release-label and drift tests pass.
- New profile/gauntlet tests pass in the core matrix.
- Existing daily flow is unchanged for players who ignore the gauntlet.
- 320px and RTL checks pass in all 12 locales; axe has no critical/serious
  findings.
- Backup restore, backup round-trip and clear-data behavior pass.
- Android/iOS WebView smoke tests pass where those wrappers are part of the
  release.
- The public label flipped from `v5.0` to `v6.0` in the release commit.

## Data and compatibility

- One writer per domain: daily state stays in the daily store, game state stays
  in each game, and the profile only records normalized results/aggregates.
- New keys are versioned and additive. A failed migration or unavailable storage
  degrades the profile, not the games.
- Keep local history small and capped; lifetime aggregates are enough for the
  Profile surface.
- The existing backup include/validate/clear behavior is the compatibility
  boundary. Old backups restore; new keys export and clear with the rest.
- No telemetry. Any counters are local, user-visible and included in backup.

## Risks

| Risk | Mitigation |
| --- | --- |
| Six-game completion seam is inconsistent | M0 spike; one boundary event/callback; do not instrument each game |
| Gauntlet is too long, especially Sudoku | Optional run; target 5–8 minutes; playtest Sudoku separately; round-start pause |
| Resume is weaker than players expect | Promise round-start resume only; state it in the UI |
| Profile backfill drifts from daily state | Daily store remains authoritative; profile only normalizes new results and aggregates |
| Translation/accessibility/cache work expands | Short copy, no new art, measure each milestone, hold the 1.8 MiB warning gate |
| Estimate is still optimistic | 20% contingency and a profile-only fallback; cut scope before cutting QA |

## Decisions for M0

1. **Name/order:** “Daily Gauntlet” working title; date-seeded order for v1.
2. **Scoring:** completion + active time; no points formula in v1.
3. **Midnight:** date-bound run; add a grace period only if playtests show a real
   need.
4. **Profile placement:** extend the badges page, preserving `#badges`.
5. **Sudoku:** existing daily grid first; shorten only if playtests show fatigue.
6. **Sharing:** text first; custom card only if the core milestone lands under
   estimate.

## Success measures

No analytics. Use a small playtest and local, user-visible signals:

- A new player can start and finish a run without help.
- Players understand that leaving is safe and resume works.
- The 5–8 minute target is realistic on low-end phones, especially with Sudoku.
- Players use the share action and can explain the result.
- The Profile page makes existing progress visible without adding pressure.

## Definition of done

A player can open Profile and see accurate daily, six-game and gauntlet progress;
start an optional six-round run, leave and resume it, finish 6/6, see a correct
summary, share a text result, and restore all of it from a backup — with the
current daily flow, 12 locales, accessibility, offline behavior and cache budget
intact, and without an account or network call.
