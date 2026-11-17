# Changelog

> Public release label: **v5.0**. Current development build: **6.0.6**.

## Unreleased — v6.0 development

Internal build: **6.0.6**

The 6.0 baseline refreshes the development toolchain and CI while the public
release stays at 5.0 until the 6.0 feature set lands.

### Edge, gutter and motion

- **A quiet way out**: the running theme keeps an opaque window surface in the
  page colour and the splash theme is handed off properly, so leaving the app
  no longer shows the launcher through a splash-coloured card. Predictive back
  is off for the WebView, and the page reports its palette colour to the
  window on every theme change.
- **Low-end mode**: a phone reporting 2 GB or fewer, four threads or fewer, or
  a data saver paints the blur band as one solid surface, drops the full-screen
  backdrop blurs and the blurred wordle arrival, and starts the hub's tape
  still. `?perf=lite` / `?perf=full` force either mode.
- **Calmer motion**: the cover's build finishes a third sooner with no spring
  overshoot, the hidden reveal opens in 360 ms instead of 620 ms, and the hub's
  tape stops under reduced motion and pauses with the window.

- **The hub answers back**: "Choose a game" scrolls the hub to the cards
  instead of jumping the hash, the surprise die rolls and lifts the card it
  landed on before the game opens, and tapping a card fades the destination in
  while its shell rises. All three fall back to an instant change under
  reduced motion.

- **One source for the safe area**: the screens and the blur band read the
  same `--sa-*`, `--pb-feather-*` and `--pb-gutter-*` tokens, so a band edge and
  the content gutter can no longer drift apart.
- **Bottom band on every screen**: it is trimmed with those tokens and the
  compact columns now keep their footer inside the gutter instead of letting it
  slide under the band.
- **Compact 320px columns**: the body grows the shell (so the screen scrolls)
  instead of spilling past its padding; the tic-tac-toe board, the fruit stage
  and the water glasses shrink on short screens, where a 44/34 inset costs 78px
  of height.
- **Download glyph**: all save controls use the download icon and say "Save
  image". The icon is still everywhere; the hub no longer plays an animated
  variant.
- **Saved cards stay in the gallery**: a save goes through a chunked write
  session that is only published once the last piece has landed and the stored
  byte count matches, a second tap cannot start a competing write, and every
  save gets its own file name so a fresh pending row can never replace the one
  the gallery just showed. Saved cards still carry `DATE_TAKEN`/`DATE_ADDED`,
  so the gallery files them under the time they were saved rather than an
  unknown date.
- **One compact block**: the short-phone overrides live in a single rule, and
  the board caps measure the usable height as `100dvh - --sa-top - --sa-bottom`
  rather than a fixed pixel offset.
- **Motion**: the progress sweep and the how-to caret animate `transform`
  instead of `width`/`margin`, the hub cards and returns finish sooner, the
  wordle arrival blurs less and for less time, and a new pull during the
  Android spring-back no longer lags behind the finger.

### Scrolling and saving

- **The blur band no longer costs frames**: three slice-sized passes replace
  six full-height ones. Scroll frame times now match the app with the band
  switched off (p95 16.9ms, no frame over 25ms), and the ramp still matches the
  old render within ~1/255 mean channel difference.
- **Saved cards keep their own day**: the daily card is drawn from the day the
  hub is showing, and the hub returns to today when the app regains focus, so a
  phone left open overnight cannot save the wrong date.
- **Save path covered by tests**: a rejecting GallerySave plugin must report
  failure without attempting a download, and the browser path must still
  download the PNG.

### Release engineering

- **Fresh toolchain**: Playwright 1.65, axe-core 4.14 and Capacitor 8.6.2.
- **Current GitHub Actions**: checkout, setup-node and upload-artifact now use
  their v7 releases, removing the Node 20 deprecation warnings.
- **Cache budget guardrails**: successful core jobs retain the per-locale
  footprint report, compare it with the previous successful baseline, warn in
  the final 10% of the 2 MiB budget, and publish the drift table in the job
  summary. A focused test covers the near-ceiling warning and summary output.
- **Cleaner release metadata**: the 6.0 development build and public 5.0 label
  are now checked independently by the release-label test.

### Still to come

- 6.0 feature work and the public release label change.

## v5.0 — 15 November 2026

Internal build: **5.2.0**

5.0 is the twelve-language Daily Sixfold release. It rolls up every change
since 4.0: Wordle in every interface language, Daily Sixfold, Sudoku Learn,
twelve languages including Spanish, native wrappers, and one coherent finish
across the hub, games and generated share cards.

### Also since 4.0

- **Spanish localization and the language switch**, plus **native Android and
  iOS wrappers** built with Capacitor 8, native splash/status-bar handling,
  store listings, review notes and privacy material.
- **Daily Sixfold**: a date-seeded featured game, a 30-day archive, a local
  streak and best, milestone badges and reminders, spoiler-free daily sharing,
  and daily runs kept separate from normal saves.
- **Sudoku Learn**, technique-aware hints, auto-notes, mistake checking, pause
  and resume, plus high-contrast, colour-blind, left-handed and larger-digit
  controls. Backup/restore, persistent storage and the update prompt complete
  the collection shell.
- **GPL-3.0-only licensing**, the App Store additional permission, the in-app
  licences view and the localized store and privacy material.
- **Share and settings polish**: image sharing falls back to a save-card flow
  when the platform blocks it; share text and cards follow the selected
  language; accessibility options collapse into one row and interface sounds
  are gone; the What’s New panel is localized and fits 320px/RTL.
- **Performance and motion**: Water Sort updates only changed tubes, game art is
  cached between moves, Fruit Merge caps DPR and batches aim redraws, and the
  expanded reduced-motion paths keep every new transition still when asked.
- **A lighter first visit**: the What’s New panel is a compact disclosure,
  startup loads only the active language catalog, and the service worker warms
  that pack instead of downloading every locale.
- **One six-colour palette** across the hub, game results and generated share
  cards, with **Google Sans Flex** on headings, the wordmark, labels and cards.
- **A release-quality finish**: balanced short copy, quieter Daily badges, the
  earned-badge progress aligned to the badge, Wordle cartridge and Tic Tac Toe
  contrast fixes found by the expanded axe coverage, and smoother Daily
  progress and badge state transitions.
- **Broader verification**: axe scans for Wordle and every result overlay in
  light and dark, a 320px locale layout pass, share-card palette checks, and
  the complete Playwright suite in CI.

### Changed

- **Daily Sixfold** now uses the same flat paper surfaces and hard edge as the
  rest of the hub, with no gradient wash. The section can be hidden from
  **Look & feel → Home** without losing streaks or check-ins.
- **Home spacing** — on phones, the Daily card now sits 22px above The
  Collection; hiding the Daily keeps the previous 31px gap after the ticker.
- **The language picker** is a compact collapsed row that expands only when
  needed, instead of showing every language at once.
- **Sudoku settings** — larger digits, left-handed layout, hidden timer,
  mistake checking and input order — moved from the hub sheet into a
  **Sudoku settings** sheet on the Sudoku screen.

### Fixed

- Wordle now opens with the English word list when the selected language's
  dictionary has not been cached yet, such as the first visit while offline,
  instead of failing to load the game. That fallback round has its own save,
  separate from both the English game and localized games, so reconnecting
  starts the language's own round without touching an English round.
- Wordle shows a small localized note when an offline round is using the
  English word list, explaining that the selected language’s dictionary is
  unavailable offline and that the fallback round is saved separately.
- Interface numbers now use Arabic-Indic digits in Arabic and Devanagari
  digits in Hindi, including scores, timers, daily counters and Sudoku
  digits, while dates and share text use the same locale-aware numerals.
- Share cards now follow the selected interface language: card chrome,
  game titles, labels, metadata, fallback copy and generated PNGs are all
  localized, with script-specific fonts and overflow-safe text fitting.
- Arabic and Hindi share cards now render their native numerals from bundled
  digit faces instead of losing the score and level digits.
- Sudoku share cards show the hint count again, localized with the active
  interface language.
- Unified headings, the wordmark, game labels and generated share cards on
  Google Sans Flex, with one consistent face across the app.

### Added

- **Wordle pack prefetch**: after an online visit or a language change, the
  active language's dictionary is downloaded in the background and retried
  when the connection returns, so offline play opens in the selected language
  before the game is first launched.
- **Wordle dictionary audit**: `npm run audit:wordle` enforces five-grapheme
  entries, duplicate-free arrays, answer/guess consistency, IME mode and
  keyboard-row coverage, then reports provenance and answer-pool policy
  findings from a reviewed denylist. It runs in CI; `--strict` additionally
  gates the known review findings. See [WORDLE-AUDIT.md](WORDLE-AUDIT.md).
- **Wordle all-locale matrix**: the Playwright suite now wins a Wordle round in
  every interface language, covering native IME entry, Arabic RTL, localized
  Arabic/Hindi digits and the copied share text. The matrix takes about 1.3
  minutes locally, keeping the 20-minute CI job within budget.
- **Multilingual Wordle**: the hidden game now has localized board copy,
  result text and five-character dictionaries for all twelve interface
  languages, with a native input method for scripts that do not use the
  on-screen letter grid. Only the active language's dictionary is downloaded
  and cached.
- **Localization audit in CI**: `npm run test:i18n` checks every catalog against
  the English source for missing or unknown keys, empty copy and mismatched
  numbered placeholders, including the shared dynamic-copy templates. It also
  guards the Wordle strings and all twelve locale dictionaries.
- **Localized store listings and privacy policies** for Simplified and
  Traditional Chinese, Japanese, Korean, Brazilian Portuguese, Hindi and
  Arabic, alongside the English and Spanish store copy.
- **Eight more interface languages**: Simplified and Traditional Chinese,
  Japanese, Korean, Brazilian Portuguese, Hindi, Kannada and Arabic. Each includes a
  complete catalog for the hub, all six games, settings, help, accessibility
  labels, validation messages, game status lines, dates and daily share text.
  Arabic switches the interface to right-to-left.
- **Offline script fonts** for Chinese, Japanese, Korean, Devanagari, Kannada and
  Arabic, subset to the characters Sixfold actually uses, so translated screens keep a
  consistent face without a network request.
- **French and German localization**: complete catalogs for the hub, all six
  games, settings, help, accessibility labels, validation messages, game
  status lines, dates and daily share text. The language picker now offers
  twelve languages in a responsive grid on phones.
- **Locale layout tests** at 320px and 390px for every language, checking for
  clipped text and horizontal overflow alongside the existing light/dark axe
  scans.

## 5.1.0 — 12 November 2026

5.1 adds Spanish localization and native app-store wrappers while keeping the
game offline, account-free and free of ads or tracking.

### Added

- **Spanish localization**: an English/Spanish catalog covering the hub, game
  screens, settings, help, accessibility labels, validation messages, game
  status lines, dates and daily share text.
- **Language switch** in Look & feel, with the choice persisted on the device.
  The first visit follows the device language.
- **Native Android and iOS projects** generated with Capacitor 8, using the
  same app id `com.moh23rd.sixfold`, branded icons and light/dark splash
  screens.
- **Native-only plugin bundle** for the launch screen, status-bar colours and
  Android back navigation. The PWA never loads Capacitor core.
- **Native release material**: build and signing notes, English and Spanish
  store listings, review answers and a privacy policy.
- **Native build scripts** that stage only the public static shell and keep
  `native/www` reproducible.

### Changed

- The app version, service-worker cache and native build numbers move to
  5.1.0 / 510.
- The service worker is disabled inside the native shells; local storage and
  the existing save format are unchanged.
- Store-facing privacy copy now states that the Android WebView declares
  internet permission but the app sends no gameplay or personal data.

### Not shipped in this workspace

- No signed Android or iOS binary and no store upload. Both require the
  platform toolchains, signing identities and store accounts.

### Still deliberately out of scope

- No accounts, ads, subscriptions, global leaderboard or server-dependent
  daily puzzle.
- No friend-to-friend challenge inbox; the daily share link remains the first
  challenge primitive.

## 5.0.0 — 11 November 2026

5.0 is the Daily Sixfold release. It adds a reason to come back each day
without adding accounts, ads, tracking or a server.

### Added

- **Daily Sixfold**: a date-seeded challenge in every game — a seeded Merge
  board, Sudoku grid, Tic Tac Toe computer, Minesweeper field, Water Sort level
  and Fruit Merge run — plus a local streak, a best streak and a 30-day
  calendar. It works offline.
- **Daily runs stay separate**: a daily board never overwrites the player’s
  normal saved game, and only a finished daily challenge checks off the slot.
- **Daily Sudoku archive**: every date in the calendar produces the same seeded
  grid, and past days can be replayed.
- **Spoiler-free daily sharing**: a link carries the date, not the solution.
- **Sudoku Learn mode**: technique-aware hints for naked and hidden singles,
  auto-notes, optional mistake checking, a technique guide and a richer
  post-game summary.
- **Accessibility controls**: high contrast, colour-blind cues, larger Sudoku
  digits, left-handed landscape layout, timer hiding and cell-first or
  digit-first number entry.
- **Sudoku pause/resume**, so the timer can be stopped during a break.
- **Backup and restore**: a JSON export of every board, score, streak and
  setting, and a guarded restore flow.
- **Persistent storage**: `navigator.storage.persist()` is requested where the
  browser supports it.
- **Update prompt**: a waiting service worker can be applied without a hard
  refresh.
- **Playwright and axe test suite**, plus GitHub Actions CI.
- **Feedback routes**: in-app Discussions and issue links, with bug and idea
  templates.

### Changed

- Sudoku hints now teach a technique before offering to place a digit. When no
  single is available, the panel says that it is revealing a cell.
- Daily progress is part of the collection shell, not a separate mode.
- Settings and backup live together under Look & feel.

### Still deliberately out of scope

- No accounts, ads, subscriptions, global leaderboard or server-dependent
  daily puzzle.
- Localization, a native app-store wrapper and a friend-to-friend challenge
  inbox remain separate future work; the daily share link is the first
  challenge primitive.

## 4.0.0 — 11 November 2026

4.0 is the Sudoku release. It rolls up every change since Sixfold 3.0,
including the 3.0.x refinements, and finishes the short-landscape and
six-piece cover work.

### Added

- **Sudoku replaces One Line** as the second game: a 9 × 9 grid in Easy,
  Medium, Hard and Expert, a guaranteed unique solution, notes, erase, undo,
  hints, a timer, per-difficulty best times, saved progress and a shareable
  result.
- **A board-left Sudoku landscape layout**, with the grid on the left and one
  control rail beside it. Short phones keep the tutorial, status line, number
  pad, tools and footer visible without a dead band between the board and the
  controls.
- **A three-step Sudoku coach** that teaches selecting a cell, placing a
  number, and using Notes and Hint.
- **Hidden-game discovery**: the six-piece cover assembles, tapping 01 through
  06 in order unlocks a short reveal, and the cover replays its build when you
  return to the hub.
- **A six-piece launch splash** with a staggered mark and progress rail.
- **Wordle image share cards**, alongside the existing result shares.
- **A versioned What's New note** above the hero.
- **A 4.0 offline shell** and refreshed asset versions.

### Changed

- The collection now reads Merge, Sudoku, Tic Tac Toe, Minesweeper, Water Sort,
  Fruit Merge. Meta, Open Graph, Twitter, both manifests, the ticker and the
  README all list Sudoku and no longer mention One Line.
- One Line and its 100-shape, four-chapter mode are removed, along with its hub
  card, game screen, level sheet and related code.
- Every result card now uses the same three-second auto-next beat and shared
  result shape.
- Wordle keeps its in-page keyboard on phones and pointer devices, with Enter
  in the bottom-right key position, and its offline guess list now covers the
  full five-letter Wordle list.
- Water Sort pours multiple layers in one move, with splash, ring and droplet
  impact effects on the receiving tube.
- Fruit Merge has an opaque aim ghost, batched aim redraws, a capped DPR and
  tighter collision checks.
- Tic Tac Toe two-player results and share stats are corrected.
- Short-landscape sizing across the arcade keeps controls, share cards and
  result overlays inside the viewport.
- The service worker now scopes cached responses, checks successful responses
  and cleans up older cache generations.

### Fixed

- The six-piece cover no longer replaces its entrance with the old fast tap
  animation. Tiles are real buttons, a touch fallback absorbs the delayed
  synthetic click, a tap is a transient press state, and the build uses
  backwards fill so hover and press transforms still work afterwards.
- Sudoku's short-landscape layout no longer hides the first-play tutorial or
  strands the board away from its controls.
- Wordle's result dialog takes focus so Enter cannot immediately start a new
  round.
- Reduced-motion coverage now includes the splash, cover, reveal and hub-return
  motion.

## 3.0.0

Sixfold 3.0 introduced the current collection shell and result-card flow. The
3.0.x follow-ups are included in the 4.0.0 entry above.

Earlier release history lives in
[GitHub Releases](https://github.com/Moh23rd/Sixfold/releases).
