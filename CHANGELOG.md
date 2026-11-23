# Changelog

> Public release label: **v5.0**. Current development build: **6.0.33**.

## Unreleased — v6.0 development

Internal build: **6.0.33**

The 6.0 baseline refreshes the development toolchain and CI while the public
release stays at 5.0 until the 6.0 feature set lands.

### Profile foundation

- **One completion event for every finished daily round**: `SixfoldDaily.complete()`
  dispatches `sixfold:daily-complete` with the run's date, the game and whether
  the daily was newly credited, before the duplicate check. A replay used to be
  invisible outside the daily store. `sixfold:daily-change` keeps its
  first-credit meaning for the hub, badges and weekly dots.
- **A local profile store**: `sixfold.profile.v1` keeps per-game daily counts,
  replay counts, first/last dates and the gauntlet aggregates. The daily store
  stays authoritative and the profile backfills from it on load, so a restore or
  a cleared profile cannot make the two disagree.
- **Badges page sections**: the existing `#badges` page now also lists the six
  public games with their daily counts and live bests, plus a Daily Gauntlet
  summary. Bests are read from each game's own key and never copied into the
  profile; the hidden Wordle is excluded.
- **Backup and erase cover the new key**: the existing `sixfold.*` export and
  erase rules already include `sixfold.profile.v1`.

### Daily Gauntlet

- **An optional six-round run**: the daily card now offers a Daily Gauntlet
  beside the featured challenge. A run is pinned to its start date, uses a
  date-seeded order with its own salt, and opens each game's existing daily
  seed rather than a parallel puzzle.
- **Run state is separate from the boards**: `sixfold.gauntlet.v1` keeps only
  the start date, order, completed-round index and per-round active time. No
  game board is copied, and leaving a round is not a failure: Continue reopens
  it at the round boundary, and Sudoku keeps its own mid-round save.
- **Only the expected round advances**: `sixfold:daily-complete` moves the run
  only when its date is the run's start date and its game is the current
  round. A replay (credited false) advances; a finish for another date or
  game does not. A solved Sudoku that is already credited is satisfied on
  entry, because reopening it shows the result and never completes again.
- **Leaving a round keeps its time**: crossing the round boundary now saves
  the accumulated active time, so a quick reload cannot fall back to the
  previous 10-second autosave.
- **A pinned run cannot resurrect an old date**: a round open across midnight
  still finishes into its run, but replaying an old archive day does not. After
  the date rolls over, the entry offers one action, start today's run.
- **Finished runs reach the profile**: a 6/6 run is recorded once through
  `SixfoldProfile.recordGauntlet`, so Runs, Best and Last run on the badges page
  stay aggregate-only. The run summary lists each round and its active time.

### Appearance and fluidity

- **Light and dark cross-fade**: switching the theme or a colour palette used to
  repaint the page, the cards, the labels and every tile in one frame, which
  read as a cut. The surfaces that paint a theme colour — panels, cards, tiles,
  cells, labels, buttons — now cross-fade over 220ms, driven by a flag that
  exists only for the length of the switch, so nothing pays for the transitions
  while a game is being played. Elements that own a press or hover motion keep
  it during the switch, the sheet keeps its own leave animation, and reduced
  motion still switches in one frame.
- **The switch stays off the compositor's critical path**: the appearance sheet
  used to re-blur the page behind itself on every frame of the fade. The blur
  is suspended for those 220ms, which took the number of dropped frames in a
  switch from six to four in a controlled A/B on the same page, and the worst
  frame from 50–66ms to 33ms.
- **Hidden games stop re-rendering on an appearance change**: Water Sort rebuilt
  its board and Fruit Merge re-read its palette and redrew whenever the theme
  changed, even while the hub was on screen. Both now take their colours when
  they are opened.
- **A surface opts into the fade instead of being listed**: the cross-fade was a
  long selector list in the stylesheet, and anything added later silently cut
  while the rest of the app faded. A surface now carries `data-fade` — in the
  markup, or at the point the script builds it — and a test loads every screen
  in both appearances and fails on any element whose painted background changes
  without the marker. Writing that test found forty surfaces the list had
  missed: the hub's six mini previews, the tutorial strips, the per-game tool
  cluster, the Water Sort glasses, the Fruit Merge next-fruit dot, the Sudoku
  settings button and the board frames of three games.

### Android shell

- **Vibration reaches the motor again**: Android's WebView does not implement the
  Vibration API, so every haptic pattern in the app was a no-op — the toggle
  changed state and the phone stayed still. A small `Haptics` plugin now plays
  the same waveforms through the platform vibrator and the manifest asks for the
  permission it needs; a browser keeps the web call.
- **The overscroll stretch magnifies, it does not drag the page**: the previous
  rebuild translated the hub down and squeezed it so the opposite edge stayed
  pinned, which opened a band of empty background above the page and read as a
  drag with a squashed list — nothing like the stretch every other Android app
  shows. HWUI's own effect does the opposite: `StretchEffect::makeLinearStretch`
  scales by `1 + pull` about the edge being pulled, so that edge stays on the
  viewport boundary, no gap can open, and the content grows away from it with
  the far edge pushed out of view. The effect now does exactly that, so the
  pulled edge stays on the boundary and no gap opens above the page. How far the
  content grows is `EdgeEffect.dampStretchVector`'s own curve,
  `0.016 × (u + 1 − e^(−u·e/0.33))`, which stops at 3.2% of the viewport however
  hard the page is dragged; the first version of this fix let it grow by 18%,
  which read as the whole screen zooming instead of as a rubber band. The pull
  is still a fraction of the viewport clamped at 1, a touch during the
  settle catches it, dragging back releases the stretch before the list scrolls,
  and a fling into the edge is absorbed. Recovery uses AOSP `EdgeEffect`'s spring
  (24.657 rad/s, damping ratio 0.98, absorb adjustment 13) instead of hand-tuned
  constants, which is what makes the settle land in about a quarter second
  without a bounce.

### Landscape controls

- **Sudoku's pad takes the rail's spare height**: the keys were pinned to 24px
  rows while ~100px of the control column sat empty below them. The pad now owns
  the slack — 38px keys with 17px digits at 844 × 390 — and the six tools keep a
  28px row.
- **Minesweeper's controls are thumb-sized**: the difficulty tabs and Flag mode
  were 9px labels in a 223px strip, the coach card was cramped and New board was
  squeezed to 65px and wrapped onto two lines by the footer note. The tabs and
  Flag mode share the rail's full width at 32px, the coach is legible, the note
  steps out of the rail, and New board is a full-width 34px button.
- **Fruit Merge's glass fills its column**: the status line sat in the board
  column and took 44px of it, and the canvas ran 9px past the panel's bottom
  edge. The status moves into the rail as a single line under the header, so the
  stage is 227 × 317 where it was 207 × 282, keeps its status, and nothing is
  clipped.

### Sizing, landscape and backups

- **Landscape measures the bars**: Sudoku's grid was sized from the raw viewport,
  so on a phone it began under the status bar and ended under the navigation
  bar, and the rail's last rows were pushed onto the number pad. The board now
  takes the space between the bars, the title and its two stats share a line,
  and the six tools sit in one row so the footer keeps a row of its own.
- **Minesweeper and Tic Tac Toe fill their column**: the difficulty tabs sat
  above each board inside the same column, so a landscape phone showed a small
  square in a wide empty screen. The tabs and the status line now live in the
  left rail and the board uses the whole column.
- **Water Sort keeps one rack**: in landscape its tubes wrapped three-and-two,
  which flattened every glass into a squat cup. Every tube now shares one row,
  so the glasses keep their tall proportions at any level.
- **Export works in the installed app**: the backup button used an
  `<a download>` link, which an Android WebView silently drops, so nothing was
  ever written. Inside the native shell the app now writes a real JSON file and
  hands it to the system share sheet; the browser still downloads it. Restore
  accepts the file types Android hands back from Files and chat apps.
- **Small portrait phones fit**: on a 320 × 568 screen the Sudoku footer and the
  Minesweeper footer ran under the home indicator. The header shares one line
  and the boards give up a little size instead.
- **Fruit Merge's footer comes back on screen**: its 4:5 field was capped by a
  flat pixel offset, so the run button sat 9px below a 320 × 568 screen, 28px
  below a 360 × 640 one and 38px below a 375 × 667 one. The field now takes its
  width from the height its column can spare, which keeps the footer and the
  whole HUD on screen at every portrait size.
- **Short landscape fields hold together**: a 320-tall landscape window reports
  24px bars on both edges, which leaves the rail 48px less height than it
  needs, and under 620px wide the Minesweeper rail took the board's column.
  The title now shares a line with its stats, the rail keeps a narrower column
  and the Sudoku pad gives up three pixels a row, so no row lands on the footer
  and the board fills the screen.

### Licence

- **GPL-3.0-only, nothing else**: the Apple App Store additional permission and
  its section in the in-app licences view are gone. Sixfold ships from GitHub as
  source and a direct-install APK, so the section 7 carve-out covered no
  distribution and only added a second document to keep in step.

### Edge, gutter and motion

- **One splash, then the app**: the WebView painted white until the page had a
  background, which read as a blank second splash, and the launch screen could
  expire before a slow first paint. The WebView now carries the surface colour
  from its first frame, the splash is dismissed on the page's first painted
  frame, and the 1200 ms auto-hide is only a safety net. Dismissing it that
  early then exposed the page's own launch layer, which held the same
  composition for another second and replayed the launch screen. Inside the
  native shell that layer now keeps only its surface, fades over 280 ms and
  hands the hub to its cascade once it is gone; the browser and installed-PWA
  timings are unchanged, because there the layer is the only launch screen.
- **The settled board waits for its entrance**: the quiet pass that pins the
  merge tiles to the settled grid ran a flat 700 ms after parse, which inside
  the native shell landed in the middle of the hub's build rather than at the
  end of the board's reveal. It now runs when that reveal animation ends, with
  a 3600 ms backstop for a launch that has no entrance at all: a hub
  re-entry, reduced motion, or a hidden tab.
- **The window frame matches the page**: a dark appearance chosen on a phone in
  light system mode used to flash a cream frame around the app while a window
  animation ran, because the Android window surface only knew the system
  setting. The page now reports each distinct colour once, whenever the
  appearance changes, and the window keeps it. Nothing is retried or polled.
- **The splash opens in the app's appearance**: that report is remembered on the
  device, and the next launch picks a light or dark launch theme from it, so a
  dark appearance on a light-system phone no longer opens on a cream splash. Android 12+ still paints its starting window from the manifest theme
  before any app code runs; every frame after it matches.

- **The 320px hub**: the three promises hold one line beside the cover instead
  of wrapping onto a second one with a stranded dot, and the appearance pill
  keeps its palette name all the way down to 320px. The pill's small-screen
  rules had spent three breakpoints across two files swapping the name for the
  "Look" kicker and hiding the label altogether; there is now one ladder.

- **A quiet way out**: the running theme keeps an opaque window surface in the
  page colour and the splash theme is handed off properly, so leaving the app
  no longer shows the launcher through a splash-coloured card. Predictive back
  is off for the WebView. The surface is the neutral day/night page colour and
  stays that way: it sits behind the WebView, so it does not follow the in-app
  palette and costs no native calls.
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
- **GPL-3.0-only licensing**, the in-app licences view and the privacy notes.
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
