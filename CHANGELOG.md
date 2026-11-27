# Changelog

> Public release label: **v6.0**.

## v6.0 — 27 November 2026

Internal build: **6.0.0**

6.0 makes the collection the daily habit. An optional Daily Gauntlet runs all
six daily challenges as one resumable round, a local profile on the badges page
gives that progress a home, and the appearance and Android shell work make the
whole set feel settled. No accounts, ads, tracking or server.

Everything below shipped after 5.0; closely related commits are grouped under
the outcome they produce, and the list runs from the headline features to the
release guards. Existing saves, daily history and backups upgrade in place.

### The Daily Gauntlet

- **One optional six-round run**: the daily card offers a Daily Gauntlet beside
  the featured challenge. A run is pinned to its start date, uses a
  date-seeded order with its own salt, and opens each game's existing daily
  seed rather than a parallel puzzle.
- **Run state is separate from the boards**: `sixfold.gauntlet.v1` keeps only
  the start date, order, completed-round index and per-round active time. No
  game board is copied, and leaving a round is not a failure: Continue reopens
  it at the round boundary, and Sudoku keeps its own mid-round save.
- **Only the expected round advances**: `sixfold:daily-complete` moves the run
  only when its date matches the run's start date and its game is the current
  round. A replay (credited false) advances; a finish for another date or game
  does not. A solved Sudoku that is already credited is satisfied on entry,
  because reopening it shows the result and never completes again.
- **Leaving a round keeps its time**: crossing the round boundary saves the
  accumulated active time, so a quick reload cannot fall back to the previous
  ten-second autosave.
- **The new surfaces join the cross-fade**: the daily-card entry and the badges
  run panel opt into the same appearance transition as the rest of the app, so
  a light or dark switch does not cut on the gauntlet.
- **A pinned run cannot resurrect an old date**: a round open across midnight
  still finishes into its run, but replaying an old archive day does not. After
  the date rolls over, the entry offers one action, start today's run.
- **Finished runs reach the profile**: a 6/6 run is recorded once through
  `SixfoldProfile.recordGauntlet`, so Runs, Best and Last run on the badges page
  stay aggregate-only. The run summary lists each round and its active time.
- **The new surfaces speak all twelve languages**: the Daily Gauntlet card, run
  panel and profile summary use catalog entries in every locale, including
  Arabic RTL and Arabic-Indic, Devanagari and Kannada digits. Round messages
  keep numbered placeholders so a translation can choose its own word order,
  and a catalog guard fails when a literal `tr()` key is missing from English.

### A local profile on the badges page

- **One completion event for every finished daily round**: `SixfoldDaily.complete()`
  dispatches `sixfold:daily-complete` with the run's date, the game and whether
  the daily was newly credited, before the duplicate check. A replay used to be
  invisible outside the daily store. `sixfold:daily-change` keeps its
  first-credit meaning for the hub, badges and weekly dots.
- **A local profile store**: `sixfold.profile.v1` keeps per-game daily counts,
  replay counts, first/last dates and the gauntlet aggregates. The daily store
  stays authoritative and the profile backfills from it on load, so a restore or
  a cleared profile cannot make the two disagree.
- **Badges page sections**: the existing `#badges` page lists the six public
  games with their daily counts and a live best where the game keeps one, plus a
  Daily Gauntlet summary. Bests are read from each game's own key and never
  copied into the profile; Minesweeper and Water Sort keep no best, and the
  hidden Wordle is excluded.
- **Storage failure degrades only the profile**: if the profile key is blocked,
  the six games and the daily store keep working for the session.
- **Backup and erase cover the new keys**: the existing `sixfold.*` export and
  erase rules include both `sixfold.profile.v1` and `sixfold.gauntlet.v1`; a
  pre-6.0 backup without them still restores and reconciles.

### Appearance that follows the phone

- **Colour from the phone**: Look & feel offers a wallpaper palette on Android
  (the shell reports the wallpaper's primary, secondary and tertiary anchors;
  the board ramp follows all three, the page keeps a low-saturation tint of the
  primary, and the game accents use the secondary and tertiary) and a custom
  colour card with a picker, a hex field and a live preview. Both persist per
  device, follow the interface language, and the fixed palette names are
  translated in all twelve catalogues.
- **Red replaces Mono**: the retired monochrome swatch is now a hand-tuned red
  ramp, and a saved Mono choice migrates to Red instead of falling back to Warm.
- **A calmer switch**: light, dark and palette changes fade colour only, over
  170 ms, with the page background joining the fade; shadows, transforms and
  opacity no longer re-raster every card on the way. Haptics send amplitudes so
  the motor is shaped rather than always at full strength, and reduced motion
  still switches instantly.
- **The switch stays off the compositor's critical path**: the appearance sheet
  suspends its backdrop blur for the fade. In a local controlled A/B on the
  same page, a switch went from six dropped frames to four and the worst frame
  from 50–66 ms to 33 ms; these are development measurements, not a checked-in
  benchmark.
- **Hidden games stop re-rendering on an appearance change**: Water Sort rebuilt
  its board and Fruit Merge re-read its palette and redrew whenever the theme
  changed, even while the hub was on screen. Both now take their colours when
  they are opened.
- **Motion is a setting, not a hidden OS switch**: every transition and entrance
  used to sit behind `prefers-reduced-motion: no-preference`, so a desktop or
  phone with the OS reduce setting opened with the whole app's motion off and no
  way to get it back. Motion now defaults to Full, with System (follow the
  device live) and Reduced next to Theme and Colours; the choice lives in the
  existing settings record, so the head boot resolves it before first paint.
- **Reduced means no movement, not a hard cut**: overlays and sheets fade over
  160 ms in place instead of snapping, and the two desktop pointer blocks that
  still read the OS query now follow the page's Motion choice too.
- **The cover and the budget heuristics follow the same answer**: the desktop
  pointer tilt was wired once at load, so choosing Full from Reduced left the
  cover flat until a reload; it now attaches for the pointer and reads the
  current choice. A 4 GB desktop with four cores no longer takes the budget-phone
  paint path (which stopped the tape and dropped the blur) unless the pointer or
  viewport is actually phone-shaped.
- **A surface opts into the fade instead of being listed**: a surface now carries
  `data-fade` — in the markup, or at the point the script builds it — and a test
  loads the hub and every game screen in both appearances and fails on any
  element whose painted background changes without the marker. Writing that test
  found surfaces the old selector list had missed: the hub's six mini previews,
  the tutorial strips, the per-game tool cluster, the Water Sort glasses, the
  Fruit Merge next-fruit dot, the Sudoku settings button and the board frames of
  three games. The badges page is not yet in that sweep.

### The 6.0 polish pass

- **The collection answers the finger again**: the hub cards' launch animation
  used `animation-fill-mode: both`, whose final transform kept winning over
  `:hover` and `:active` forever. The fill is now `backwards`, and the desktop
  hover lift has an explicit pressed state, so a settled tile keeps its lift,
  press and stage motion without replaying the entrance.
- **What's New leaves under its own momentum**: dismissal keeps the card's last
  frame as a fixed ghost and fades it out on the compositor while the page
  reflows underneath. The list stagger is re-armed on every disclosure, so the
  little word-and-row reveal is not a first-open-only effect.
- **The look sheet keeps its corners**: the sticky sheet head carries the same
  top radius as the card, and an open sheet no longer holds a permanent
  compositor promotion, so changing colour cannot flatten the top corners.
- **Daily Sixfold is a real rotation**: the featured game uses a seeded six-day
  permutation with a boundary guard, so every game appears once per block and
  the same game never runs two days in a row. The Daily Gauntlet keeps its own
  order.
- **Game screens arrive without a jump**: the shared shell entrance is now
  opacity-only instead of a scale-and-translate that made the header shrink
  into place; the Wordle arrival likewise no longer scales its title.
- **The hub headline keeps its descender**: “Six Games” gets a little more line
  box and bottom padding, so the g is not cut by “No Filler” at the tight
  display leading. This was not an intentional crop.
- **The licence page follows the chosen colour**: the standalone page resolves
  Warm, Ocean, Forest, Berry, Dusk, Red, Custom and Wallpaper from the same
  saved state, tints its page, panel and theme-color together, and repaints on
  a live scheme change.

### The Android app

- **One tree, two deliveries**: the browser build is the release at
  <https://moh23rd.github.io/Sixfold/>, installable from the page; the Android
  APK is built from the same files with `npm run native:apk:debug` and by CI's
  Android job. There is no store account, store review or store cut.
- **The APK is a real app shell, not a shortcut**: it bundles the whole offline
  shell, opens through Android's own splash screen, draws edge to edge and hands
  the back gesture to the page. The browser stays a first-class target; every
  feature keeps a browser path and native calls sit behind a platform check.
- **The choice is per device**: a phone can install the PWA from the browser or
  the APK from the built artifact, and the two share the same save format,
  twelve languages and daily seeds. Neither route needs an account or a server.
- **The APK asks Android for nothing it does not use**: every page, dictionary
  and font is served from the bundle through Capacitor's local asset loader, so
  the manifest no longer declares `INTERNET`. Android Auto Backup is off too,
  because it would upload the WebView's local saves to Google Drive; the in-app
  export/restore stays the only way data leaves the device.
- **Links leave the shell**: an http(s) link outside the bundled pages opens in
  the system browser instead of replacing the app with a chromeless WebView.
  The About sheet's Releases link is the update path: it opens the release page
  in the browser, where the APK is a manual download, so the installed app still
  never needs network access.
- **Long-press shortcuts**: the launcher offers Fruit Merge, Daily Gauntlet and
  Sudoku. Each passes an action to the one activity, which the page consumes
  once after load; returning from Recents does not replay it, and a shortcut
  pressed while the app is open routes through `onNewIntent`.
- **System text size is no longer ignored**: the WebView applies Android's font
  scale (85–130%) as text zoom. At 1.3× the hub title measured 29.3 px instead
  of 22.5 px, with no horizontal overflow. On the 320 × 592 shell a Sudoku cell
  is only 25 px, so the short-screen layout sizes its digits from the board
  (2.7 dvh) rather than the page height alone; the API 36 smoke opens Sudoku at
  the largest system size and fails if any cell's scroll box is larger than the
  cell.
- **The page no longer flashes under an IME**: the SystemBars native handler
  padded the DecorView, and Android 16 cleared that padding between inset
  passes, so the page height flipped by 48 px every few frames; typing in Hindi
  Wordle made it read as a flash. The activity content is padded once, the IME
  inset is included while the keyboard is up, and the listener consumes the
  insets. The API 36 smoke holds the hub at one height for a second and opens
  Sudoku at the largest system text size, measuring the digits against their
  cells.
- **Themed icons on Android 13+**: the adaptive icon gains a monochrome layer
  generated from the bright shapes alone, so a themed launcher tints a clean
  silhouette instead of falling back to the coloured mark.
- **Vibration reaches the motor again**: Android's WebView does not implement
  the Vibration API, so every haptic pattern in the app was a no-op — the toggle
  changed state and the phone stayed still. A small `Haptics` plugin now plays
  the same waveforms through the platform vibrator and the manifest asks for the
  permission it needs; a browser keeps the web call. Move pulses land, an ending
  is never swallowed by a new gesture, and the bridge stays quiet while a page
  is being replaced.
- **The overscroll stretch magnifies, it does not drag the page**: the previous
  rebuild translated the hub down and squeezed it so the opposite edge stayed
  pinned, which opened a band of empty background above the page and read as a
  drag with a squashed list — nothing like the stretch every other Android app
  shows. HWUI's own effect does the opposite: `StretchEffect::makeLinearStretch`
  scales by `1 + pull` about the edge being pulled, so that edge stays on the
  viewport boundary, no gap can open, and the content grows away from it with
  the far edge pushed out of view. The effect now does exactly that. How far the
  content grows is `EdgeEffect.dampStretchVector`'s own curve,
  `0.016 × (u + 1 − e^(−u·e/0.33))`, which stops at 3.2% of the viewport however
  hard the page is dragged; the first version let it grow by 18%, which read as
  the whole screen zooming instead of as a rubber band. The pull is a fraction
  of the viewport clamped at 1, a touch during the settle catches it, dragging
  back releases the stretch before the list scrolls, and a fling into the edge
  is absorbed. Recovery uses AOSP `EdgeEffect`'s spring (24.657 rad/s, damping
  ratio 0.98, absorb adjustment 13) instead of hand-tuned constants, which is
  what makes the settle land in about a quarter second without a bounce.
- **The app is edge to edge again**: the activity content was padded by the
  system-bar insets, so the page stopped short of the top and bottom edges and
  the flat window colour read as a blank border above the status bar and below
  the navigation bar. The content is full-bleed, and the shell hands the bar
  heights to the page as `--safe-area-inset-*` in CSS pixels on every change and
  after every page load, so its gutters and glass bands keep clear of the bars
  while the hub and the boards run under them. Only the keyboard pads it.
- **The system-bar strip is painted by the page**: the light and dark strips no
  longer show a flat band that differs from the page surface, and the window
  surface is repainted before the next frame when the appearance changes.
- **The window frame matches the page**: a dark appearance chosen on a phone in
  light system mode used to flash a cream frame around the app while a window
  animation ran, because the Android window surface only knew the system
  setting. The page now reports each distinct colour once whenever the
  appearance changes, and the window keeps it; separate configuration changes
  re-report the page colour after Android rewrites the window surface.
- **The splash opens in the app's appearance**: that report is remembered on the
  device, and the next launch picks a light or dark launch theme from it, so a
  dark appearance on a light-system phone no longer opens on a cream splash.
  Android 12+ still paints its starting window from the manifest theme before
  any app code runs; every frame after it matches.
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
- **Android's splash icon is native-sized**: the system draws
  `windowSplashScreenAnimatedIcon` at 288 dp and masks the inner 192 dp, so the
  108 dp adaptive layers were upscaled 2.67× on every screen. The launch theme
  now points at a generated 288 dp WebP per density (about 60 KiB in total), and
  the adaptive-icon guard fails if the theme points back at the launcher icon.
- **The iOS launch tile renders from the 1024 px mark**: every 1:1 launch image
  draws the plate at 34 vw, so the old 512 px source was upscaled by up to 1.36×
  on the 1536–2048 px iPads. All 36 images now come from `icons/icon-1024.png`,
  and the generator refuses a size whose tile would need more than the icon.
- **The browser boot splash gets a 3× mark**: the launch cover drew the 192 px
  header icon at up to 152 CSS px, so 2× and 3× phones upscaled it. A dedicated
  `icons/mark-456.webp` (about 8 KiB) is rendered from the same master; a
  same-size PNG would have added about 120 KiB to the offline shell.
- **Leaving the app shows a quiet way out**: the running theme keeps an opaque
  window surface in the page colour and the splash theme is handed off properly,
  so leaving the app no longer shows the launcher through a splash-coloured
  card. Predictive back is off for the WebView. The surface is the neutral
  day/night page colour and stays that way: it sits behind the WebView, so it
  does not follow the in-app palette and costs no native calls.
- **A cold-start WebView tear-down is retried**: if Android removes the WebView
  while the app is attaching, the activity now reattaches instead of leaving a
  blank shell, and the emulator smoke and a focused test cover the retry.
- **API 24 and 26 stay launch-only**: both images ship a Chromium 69 WebView,
  which predates the shell's structural CSS (`inset`, flex `gap`,
  `min()`/`max()`/`clamp()`, `aspect-ratio`, `dvh`, `color-mix()`), so a full
  assertion run there would exercise a degraded layout. Both entries still prove
  the APK installs and reaches first paint; API 33 and 36 run the full WebView
  assertions. The emulator job is pinned to `ubuntu-24.04`, because the 26.04
  image loses its software-rendered guest mid-assertion.
- **Android 7.1 no longer crashes at launch**: the wallpaper plugin named an
  API-27 type in its own signatures, which killed the process while the WebView
  attached on API 24 and 26. The reader now lives in its own version-guarded
  class and the plugin uses no newer types.
- **Export works in the installed app**: the backup button used an
  `<a download>` link, which an Android WebView silently drops, so nothing was
  ever written. Inside the native shell the app now writes a real JSON file and
  hands it to the system share sheet; the browser still downloads it. Restore
  accepts the file types Android hands back from Files and chat apps.

### Games and the daily habit

- **Chrome's second-install bug gets a way out**: Chrome 154–156 treats every
  app on a `github.io` origin as already installed, so a second install silently
  does nothing. On those builds the hub now shows a one-time notice with an
  Update Chrome action and a retry, and remembers a dismissal per device. The
  fix shipped in Chrome 157, so newer browsers never see the notice.
- **The daily card follows the day**: the daily card is drawn from the day the
  hub is showing, and the hub returns to today when the app regains focus, so a
  phone left open overnight cannot save the wrong date. Daily resume, the weekly
  badge and stalled game loops were repaired together.
- **Fruit Merge can play as numbers**: a new Numbers mode in the Fruit Merge
  settings swaps fruit for numbered tiles that merge the same way, and the
  choice persists with the rest of the settings. The hub card, game title, next
  piece, statuses, share text and scores all follow the mode.
- **Game-level accessibility controls**: Minesweeper gains larger mine numbers
  and a hide-timer option, while Water Sort gains colour-blind layer symbols;
  both game sheets also expose the existing high-contrast setting.
- **The four compact results are dialogs**: Water Sort, Tic Tac Toe,
  Minesweeper and Fruit Merge finish in a card that covered the board but kept
  the board tappable behind its scrim, walked out of the game on back, and could
  not be read again once dismissed. Back and Escape now close the card and keep
  the game, the board and the status line leave the tab order and the pointer
  while it is up, and the footer keeps a quiet **Result** chip that reopens the
  round. The Sudoku solved card covers the number pad and the tool row too, not
  only the board.
- **A reopened result card gives the board back**: revealing the card ran the
  inert pass twice, and the second pass recorded nothing to release, so a round
  reopened from the **Result** chip left its board and footer inert after it was
  closed again. The pass now keeps the set the first call collected.
- **A result celebration no longer makes the frame dead**: the win veil is paint
  only (a box-shadow), but the dialog pass that made the board inert also marked
  the header, the footer and everything else up to the screen root, so the
  settings control and the footer could not be tapped for the whole
  three-second pause. Only the content the card covers — the board and the
  status line — leaves the pointer and tab order now. The header and footer stay
  live, Fruit Merge's full-screen overlay lets taps outside its card through,
  and the four cards are plain dialogs instead of modal ones.
- **The pause between rounds is a clock**: the three-second auto-next spent its
  time while the app was backgrounded and re-armed every time a finished game
  was re-entered, so a result could vanish before it was read. The countdown now
  freezes in the background and behind a sheet, never re-arms over a dismissed
  result, and is drawn as a thin edge under the action instead of an English
  "Next 3s" label in every language.
- **Back closes a sheet instead of the app**: the hardware back gesture only
  knew about the URL hash, so a sheet over the hub (Look & feel, About) left the
  app from a panel the reader had opened on top of it. The page answers a
  cancelable `sixfold:back` event first, and back on the legal page returns to
  the hub through history.
- **Back closes a finished round too**: Merge's result card, the Sudoku solved
  card and the Wordle result card are modals of their own, but back walked out
  of the game to the hub and left the card mounted, so returning to that game
  showed the old result. Each one now dismisses on the same event while a sheet
  opened over it still takes precedence.
- **Back records the welcome guide**: the gesture closed the one-time guide
  without writing the flag only the Skip button set, so a fresh install saw the
  guide again on the next launch. Back now closes it the way the button does.
- **Sheets and result cards answer the browser's back**: a sheet adds one
  history entry, so back closes the panel instead of leaving the screen. The
  Sudoku solved card and the Wordle result card now make the board and the
  screen's own controls inert, keep Tab inside the card, and dismiss on Escape;
  Escape also closes a per-game settings sheet, and back skips the hidden game's
  reveal instead of leaving the app.
- **A long sheet keeps its Done button**: Look & feel is taller than a phone
  screen, and its head scrolled away with the copy, leaving the way out at the
  bottom of the panel. The head now stays on the card's top edge and paints over
  what slides beneath it.
- **Sheets sit above the notifications**: the share toast, the daily finish note
  and the update banner floated over an open panel because their layers were
  above the sheet's. The sheet is the top surface again.
- **Look & feel stretches like the hub on Android**: the sheet scrolls inside
  its own fixed card, so it never reached the platform's edge effect. The
  stretch module now drives the sheet card as its own surface — same pull curve,
  same 3.2% ceiling, same spring — with its own state, so a drag in the panel
  never moves the hub behind it.
- **Focus never lands on a closed panel**: erasing data from Look & feel closes
  that panel first, and closing the warning sheet then sent focus to its hidden
  Done button. An opener that is no longer on the page now hands focus to the
  screen's heading instead.
- **Returning from the licenses page keeps your place**: the legal page is its
  own document, so the return is a fresh launch and the hub opened at the top.
  The hub's scroll position is recorded before the link is followed and restored
  when the collection builds.
- **Leaving the legal page is a return, not a launch**: the shell reloads the app
  document when the licenses page goes back (a WebView keeps no back-forward
  cache), and that reload replayed the splash and the hub's six-piece build. The
  legal page marks the return, the app skips its launch layer for it, and the
  shell marks itself before the body is parsed so the page's own launch
  composition never paints behind the OS splash.
- **The legal page follows the app, not only the phone**: `licenses.html` reads
  the saved theme, the saved motion choice, the saved palette and the app's
  language catalogues, so it opens dark, calm, tinted and translated to match
  the app it belongs to. It re-resolves a live theme change instead of keeping
  the appearance it opened with. Its copy joined all twelve locales, it keeps
  its own title instead of the hub's marketing one, and the action button's
  arrow is mirrored in right-to-left layouts.
- **The GPL text is collapsible**: the license page opens on the dictionary
  sources and keeps the full GNU GPL v3.0 text behind a native disclosure, so
  the canonical terms are still in the page without burying everything else.
  The canonical GPL text stays English whatever the page language, and the page
  now says so, so a screen reader stops reading it with the page's phonetics.
- **Sudoku stays inside its cells**: the board sizes its digits from the cell,
  not only the page, and the landscape rail keeps its title and six tools in
  their frames. The hint card, the compact pad and the 320 px landscape controls
  were repaired together.
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
- **Minesweeper's controls are thumb-sized**: the difficulty tabs and Flag mode
  were 9 px labels in a 223 px strip, the coach card was cramped and New board
  was squeezed to 65 px and wrapped onto two lines by the footer note. The tabs
  and Flag mode share the rail's full width at 32 px, the coach is legible, the
  note steps out of the rail, and New board is a full-width 34 px button.
- **Fruit Merge's glass fills its column**: the status line sat in the board
  column and took 44 px of it, and the canvas ran 9 px past the panel's bottom
  edge. The status moves into the rail as a single line under the header, so the
  stage is 227 × 317 where it was 207 × 282, keeps its status, and nothing is
  clipped. Its 4:5 field now takes its width from the height the column can
  spare, keeping the footer and HUD on screen at 320 × 568, 360 × 640 and
  375 × 667.
- **Small portrait phones fit**: on a 320 × 568 screen the Sudoku footer and the
  Minesweeper footer ran under the home indicator. The header shares one line
  and the boards give up a little size instead, and the compact columns keep
  their footer inside the gutter.
- **Short landscape fields hold together**: a 320-tall landscape window reports
  24 px bars on both edges, which leaves the rail 48 px less height than it
  needs, and under 620 px wide the Minesweeper rail took the board's column. The
  title now shares a line with its stats, the rail keeps a narrower column and
  the Sudoku pad gives up three pixels a row, so no row lands on the footer and
  the board fills the screen.
- **Sudoku's pad takes the rail's spare height**: the keys were pinned to 24 px
  rows while ~100 px of the control column sat empty below them. The pad now
  owns the slack — 38 px keys with 17 px digits at 844 × 390 — and the six tools
  keep a 28 px row.
- **Wordle hands off**: the hidden game opens under the reveal scrim as it
  leaves, so the cover becomes the board in one movement instead of a cut.
- **Fruit Merge's settings and result follow the mode**: the hub card, game
  title, next piece, statuses, share text and scores all switch with Numbers
  mode, and the result card stays open long enough to read.
- **The browser gets fullscreen back**: the hub offers a fullscreen toggle in a
  normal browser tab, hidden in the edge-to-edge APK and an installed PWA where
  the system already removes the browser chrome. A regression test drives the
  toggle in and out, checks the pressed state and icon, and pins the button as
  hidden in the native shell and an installed app.
- **Save and share keep their promises**: a browser reports "Image downloaded."
  after a result card is saved, while the Android shell keeps "Saved to your
  gallery." The daily share text uses the page's own origin instead of
  hard-coding the public page, so a self-hosted build hands out the right
  address; the native shell and local development keep the canonical URL.
- **An abandoned save can no longer hide a photo**: a save session that the page
  never finished held its pending gallery row indefinitely. Sessions older than
  five minutes are discarded with their row, so nothing stays pending forever.
- **Saved cards stay in the gallery**: a save goes through a chunked write
  session that is only published once the last piece has landed and the stored
  byte count matches, a second tap cannot start a competing write, and every
  save gets its own file name so a fresh pending row can never replace the one
  the gallery just showed. Saved cards still carry `DATE_TAKEN`/`DATE_ADDED`, so
  the gallery files them under the time they were saved rather than an unknown
  date.
- **One play screen at a time**: the router keeps only the opened game on
  screen, so a hidden screen cannot keep a board or its preview alive behind the
  hub; the hub's mini previews keep their glass and the landscape boards stay
  whole.
- **The daily-card gap and the hub masthead were repaired**: the daily card sits
  22 px above The Collection on phones, hiding the card keeps the previous 31 px
  gap after the ticker, and the masthead is the wordmark alone instead of the
  icon beside the word.
- **The 320 px hub holds its promises**: the three promises hold one line beside
  the cover instead of wrapping onto a second one with a stranded dot, and the
  appearance pill keeps its palette name all the way down to 320 px. The pill's
  small-screen rules had spent three breakpoints across two files swapping the
  name for the "Look" kicker and hiding the label altogether; there is now one
  ladder.

### Launch, motion and press

- **First launch starts on the guide**: the welcome sheet opens over the hub, so
  the guide is the first screen and no game is ever left showing behind it.
- **The cover presses again**: the six-piece build animation used fill-mode
  `both` and kept winning over `:active`, so a finished tile stopped pressing. A
  tap now holds its whole 160 ms press transform, and the cover settles only
  after the last of the six build animations, so no tile is cut off mid-build.
  The release test records every `sixBuild` animation end in the capture phase
  and fails if `six-settled` lands before all six.
- **The cover builds as the launch layer lifts**: the six-piece build starts as
  the launch layer lifts, so its finished cover is never painted under the
  fading splash and reset a few frames later.
- **What's New leaves without a jump**: dismissing the card takes it out of the
  flow at once and fades an opaque fixed copy in its place, so the page reflows
  underneath without a height animation or a blink.
- **The hub is not relaunched on every return**: leaving the collection and
  coming back replayed the card stagger, the six-piece cover build and the shell
  lift. The hub is hidden behind a game, and a browser restarts a CSS animation
  when that element is shown again, so the entrance belongs to the launch only:
  the classes that own it are switched off the first time the reader leaves the
  collection. Returning is a cut back to the state they left.
- **A game screen arrives once**: each play screen is display:none behind the
  others, so re-entering one replayed its shell lift (and the word game's own
  arrival). The first visit is the launch moment; a screen left once comes back
  as a cut.
- **The settled board waits for its entrance**: the quiet pass that pins the
  merge tiles to the settled grid ran a flat 700 ms after parse, which inside
  the native shell landed in the middle of the hub's build rather than at the
  end of the board's reveal. It now runs when that reveal animation ends, with a
  3600 ms backstop for a launch that has no entrance at all: a hub re-entry,
  reduced motion, or a hidden tab.
- **The hub answers back**: "Choose a game" scrolls the hub to the cards instead
  of jumping the hash, the surprise die rolls and lifts the card it landed on
  before the game opens, and tapping a card fades the destination in while its
  shell rises. All three fall back to an instant change under reduced motion.
  The surprise die owns the screen for its swing, and the hub tape stops on the
  first leave signal rather than waiting for the window to hide.
- **Calmer motion across the shell**: the cover's build finishes a third sooner
  with no spring overshoot, the hidden reveal opens in 360 ms instead of 620 ms,
  the progress sweep and how-to caret animate `transform` instead of
  `width`/`margin`, the hub cards and returns finish sooner, the wordle arrival
  blurs less and for less time, and a new pull during the Android spring-back no
  longer lags behind the finger.
- **The launch cover is still under reduced motion**: the cover keeps a still
  frame, the launch layer hands over without replaying, and Full is wired
  correctly after a Reduced session.

### Look, brand and language

- **The launcher mark is the six-tile plate**: a warm ink plate holding the six
  merge tiles, a gold tile and a sparkle, with no cream ring and no black
  backing, so a launcher mask meets the art instead of a frame. The old
  "cream six with a coral hard shadow" was an earlier draft and is not the
  shipped mark.
- **One 2048 px master feeds every size**: the source is rendered at 2048 px,
  so the largest launcher asset a device asks for — 432 px for an xxxhdpi
  adaptive foreground, 1152 px for an xxxhdpi splash — is always a downscale.
  The maskable and adaptive layers scale the art inside their safe circles, the
  monochrome layer keeps only the bright shapes, and the 288 dp launch icon is
  generated per density.
- **The share card is the same mark**: the saved result card draws its mark from
  the launcher art, and `og-image.png` is regenerated as a 1200 × 630 frame from
  the same master. The icon class of the cache budget moves to 88 KiB for the
  gradient art.
- **Display text renders cleanly**: common ligatures are off, so the bundled
  display face cannot draw its broken `fi` in What's New, the hub headline or
  the share card; the stray spark beside that header is gone. The ligature-free
  font was rebuilt without a new URL once, so browsers kept the cached copy
  whose `fi`/`ffi`/`ffl` ligatures drop the i in "filler" and "offline"; the font
  URL is now `?v=5.0.2` everywhere, `og-image.png` was regenerated from the
  fixed face, and the erase button reports progress with the reader's own label
  instead of a hard-coded "Erasing…".
- **The masthead is the wordmark alone**: the hub's brand row showed the app icon
  beside the Sixfold word; the icon is gone and the word stands on its own. The
  gap under the masthead is closed.
- **Hub settings read as settings**: Accessibility is a contained row with its
  explanation instead of a bare summary, and landscape keeps the Look label and
  chevron inside the pill.
- **All save controls use the download glyph and the words "Save image"**; the
  hub no longer plays an animated variant, so the action reads the same in a
  game, a result card and the daily share.
- **What's New is 6.0**: the panel describes the Gauntlet, the profile, the
  calmer appearance switch and the sturdier app in all twelve languages. The
  seven stale 5.0 bullets were removed from every catalogue, so the locale
  payload no longer carries release notes the app cannot show.
- **The badges page and the legal page get the edge blur**: both are long
  scrolling pages, so their content now dissolves under the transparent system
  bars like the hub. The standalone `licenses.html` carries its own band because
  it does not load the app shell.
- **The hub hero fits the real phone heights**: the hero and promise row are
  guarded at 357 and 390 px in every locale, and the roomy first screen keeps
  the daily card and the collection above the fold on a phone.
- **Launcher art is losslessly recompressed**: the six densities and the web
  sizes keep their exact pixels while the icon class loses the bytes a lossless
  pass can recover.
- **Twelve languages cover the new surfaces**: the Gauntlet, profile, colour
  panel, legal page and every new status line use the existing catalogues,
  including Arabic RTL, Arabic-Indic, Devanagari and Kannada digits. Translation
  only re-reads changed nodes, once per frame, and English skips the observer
  entirely.
- **The WebView floor is measured and guarded**: `npm run test:webview-floor`
  parses every shell script and every root HTML page's inline blocks as ES2018,
  rejects async generators and `for await`, and fails on a curated list of
  post-Chromium-60 globals and methods. A dotAll `/s` regex in `i18n/i18n.js`
  would have disabled every translation on Chromium 60; it now uses `[\s\S]`.
  The emulator smoke prints the Chromium version that actually painted on every
  API row, and a launch-only row whose engine meets the stylesheet floor warns
  in CI instead of relying on the image number.
- **Translation survives the old WebView**: the i18n loader, the locale epoch and
  the service-worker catalog cache move together, so an installed app cannot
  read a catalog the worker rejects.
- **Accessibility is part of every screen**: axe scans cover light, dark and the
  interactive states; the new result dialogs keep focus inside, Escape and back
  close them, the board and status line leave the tab order while they are up,
  and the closed colour panel no longer lays out a hidden Apply button. Sudoku's
  high contrast, colour-blind cues, larger digits, left-handed layout, hidden
  timer and cell-first/digit-first entry remain, and the game sheets expose the
  settings where players need them.
- **The shared daily card links where the app is played**: the share text uses
  the page's own origin and keeps the canonical URL only for the native shell
  and local development.
- **The legal page mirrors every arrow and keeps the GPL in English**: the
  action button's arrow sits outside `.bar`, so the right-to-left rule missed
  it; it is mirrored now, and the canonical GPL text is explicitly English
  whatever the page language.

### Reliability, performance and storage

- **One source for the safe area**: the screens and the blur band read the same
  `--sa-*`, `--pb-feather-*` and `--pb-gutter-*` tokens, so a band edge and the
  content gutter can no longer drift apart. The bottom band is trimmed with those
  tokens and every screen keeps its footer inside the gutter.
- **The blur band no longer costs frames**: three slice-sized passes replace six
  full-height ones. In a local measurement, scroll frame times matched the app
  with the band switched off (p95 16.9 ms, no frame over 25 ms), and the ramp
  still matched the old render within ~1/255 mean channel difference.
- **The lite sheet scrim keeps its veil on older WebViews**: low-end mode paints
  the page colour as a fallback and only blends it with `color-mix()` where that
  is supported, so API 33's Chromium 109 no longer computes the About sheet's
  scrim to transparent.
- **Low-end mode**: a phone reporting 2 GB or fewer, 4 GB or less with four
  threads or fewer, or a data saver paints the blur band as one solid surface,
  drops the full-screen backdrop blurs and the blurred wordle arrival, and
  starts the hub's tape still. `?perf=lite` / `?perf=full` force either mode.
- **The offline cache keeps its install manifest**: the worker pruned the cached
  `manifest.webmanifest` on every activation, because it compared the URL's
  version with the theme script's pin while `index.html` stamps the manifest
  with the build epoch. It compares against the epoch the cache name already
  carries, so an installed app can still read its manifest offline.
- **The cache stays bounded and current**: stale paths are pruned by path and
  version on takeover, the install pass collects a failed asset itself instead
  of calling `Promise.allSettled()`, and only the active locale is warmed on a
  first visit. Asset and shell manifests record every byte the worker serves.
- **A failed profile write does not take a game down**: profile and gauntlet
  storage are versioned and additive; a blocked key degrades the profile to the
  session while the games and daily store keep working.
- **A restore is a real file**: the browser downloads JSON and the native shell
  writes and shares it, and restore accepts the file types Files and chat apps
  hand back. Old backups restore and reconcile the new keys.
- **The launch path is guarded on the device**: CI records a launch death report,
  retries a WebView attach, and reports an app removal as a platform event
  instead of a product crash. The API 36 smoke holds one height, opens Sudoku at
  the largest system text size, and samples both system-bar strips in light and
  dark. It reads the display's size and density once and compares them with the
  page's viewport and `--safe-area-inset-*` values, so a padded content view or
  a shell that stopped reporting the heights fails instead of passing quietly;
  a page that reports a viewport with no bar heights still fails, because that
  is the padded-content-view defect. The old poller re-ran `wm size` and
  `wm density` inside its 20 s window, so one slow adb call could time out a
  healthy page; it measures once, polls only the page, reattaches to the newest
  visible WebView target, and gives a slow software-rendered guest 60 s.
- **The cache budget has guardrails**: successful core jobs retain the
  per-locale footprint report, compare it with the previous successful baseline,
  warn in the final 10% of the 2 MiB budget, and publish the drift table in the
  job summary. A focused test covers the near-ceiling warning and summary.
- **The app stays offline**: the APK declares no `INTERNET` permission, Auto
  Backup is off, and every page, dictionary and font is served from the bundle.

### Release engineering

- **One version across every surface**: the package, lockfile, web label,
  manifest epoch, service-worker cache, locale catalog epoch and Android
  `versionName` move together, and the release-label test checks all of them.
  Android moves to `versionCode 600` / `versionName "6.0.0"`.
- **The APK is built and signed by CI**: the Android job stages the shell, runs
  Capacitor sync, builds the debug APK, verifies the signer and contents, and
  uploads `sixfold-debug-apk` for direct install. The APK is also built locally
  with `npm run native:apk:debug`.
- **The emulator matrix proves the shell**: API 24 and 26 launch, API 33/34/36
  run the full assertions, the AVD has an on-screen navigation bar, the guest
  renders with `swangle`, and a lost emulator is a retryable row rather than a
  product failure. The smoke self-tests the exit-4 retry on every build.
- **Shell pins are checked against history**: a guard fails when a shell file
  changes after the commit that last set its `?v=` pin, every pin site is
  checked, and a fixture proves the guard fails on drift and passes after a
  bump. Native pins, the asset manifest and the icon snapshots are checked the
  same way.
- **The unload bridge is guarded**: a local alias of the Capacitor proxy is
  followed through `pagehide`, `unload` and `beforeunload`, so a plugin call
  during page teardown cannot reintroduce the WebView 109 crash. A fixture
  proves the guard fails on a bridge call.
- **Preflight runs before a push**: `npm run preflight` checks i18n, the asset
  manifest, shell pins and native pins, and `npm run hooks:install` wires it in
  as the pre-push hook. The hook runs preflight with Node so a bare git shell
  still checks.
- **Current GitHub Actions**: checkout, setup-node and upload-artifact use v7,
  download-artifact v8, setup-java v6, setup-android v4 and cache v6. The
  emulator cache and the retry self-test run on every build.
- **Fresh toolchain**: Playwright 1.65.1, axe-core 4.14.1, Capacitor 8.6.3 and
  Filesystem 8.1.6. AndroidX and AGP stay on the current Capacitor 8 stable
  line; alpha/beta AndroidX and AGP 9 releases are deliberately not adopted.
- **The release notes and platform docs agree with the build**: the Android
  guide describes the `versionCode` scheme and the API 24/26 launch-only rows,
  and the 6.0 roadmap records the Gauntlet and profile as release-candidate
  verified. The developer notes are grouped under `docs/`, the README is
  tighter, and the About sheet no longer points at the repository's disabled
  Discussions page; the issue form is the single feedback link, and the
  release-label test rejects any shipped link to a GitHub surface the project
  does not use.

### Verification

- **The full Playwright suite is 378 tests across 39 files**, one worker: the
  twelve-locale layouts and axe scans, every game, daily/Gauntlet/profile,
  share and save, cache footprint and budgets, launch/welcome/motion, and the
  shell guards. The final release run passes all 378 in 23m 26s.
- **The appearance checks no longer race their own clock**: the switch tests
  sample the 170 ms fade in the same task as the tap, and the all-surfaces
  sweep gets a realistic budget for fourteen cold contexts, so a loaded runner
  cannot report a cut the page did not make.
- **The focused release gates pass**: i18n, the WebView floor, the Wordle audit,
  the death report, attach retry, app removal, the unload bridge and its fixture,
  shell pins and their fixture, the asset manifest, cache budgets, static icons
  and the adaptive-icon guard.
- **The APK is checked on a real emulator**: the debug APK was built locally
  against SDK 36 and run through the full shell assertions on an API 36
  emulator (Chromium 133.0.6943): first paint, the welcome sheet, the About
  scrim fallback, palette and system-theme persistence, Merge, haptics and
  rotation. The same run passes with no `INTERNET` permission and Auto Backup
  disabled, so the bundled shell really is offline. A first attempt on a host
  with under 1 GiB free lost the first frame to Android's 5 s input-dispatch
  timeout; the smoke now warns when memory is that tight, so a starved host is
  not read as an app ANR.
- **CI runs the same matrix**: the Playwright groups, the signed APK job and the
  API 24/26/33/36 emulator smoke run from the release commit.

### Deliberate follow-up

- **Gauntlet text sharing is not in 6.0**: the run summary and profile are
  local, and the daily share remains the share path. The roadmap records text
  sharing as the next Gauntlet follow-up; the release note does not promise it.
- **No accounts, cloud sync, leaderboards, analytics or a seventh game**: the
  collection stays offline and account-free.

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
