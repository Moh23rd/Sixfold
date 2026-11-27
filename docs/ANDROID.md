# Android APK

Sixfold's Android target is a **direct-install APK for GitHub distribution**.

## What the APK is

- A native Android app shell with package ID `io.github.moh23rd.sixfold`.
- It launches directly into Sixfold. There is no address bar, tab strip, browser
  menu or web-server requirement.
- The HTML, CSS, JavaScript, fonts, icons and game data are bundled inside the
  APK, so the game works offline.
- Android's native splash screen, edge-to-edge system bars and back gesture are
  wired through Capacitor and `js/native.js`.
- It declares no `INTERNET` permission, and Android Auto Backup is off: the
  shell and its saves stay on the device, and the app's own export/restore is
  the way to move them.
- Links to other sites open in the system browser, so the shell keeps its own
  page and the browser keeps an address bar; the About sheet's Releases link
  is the manual update path.
- Long-pressing the launcher icon offers Fruit Merge, Daily Gauntlet and
  Sudoku. The shortcut passes an action extra, consumed once after the page
  loads and routed through the hub's own cover buttons. The emulator smoke
  drives a cold Fruit Merge, a cold Daily Gauntlet and a warm delivery through
  `onNewIntent`, and proves a consumed action does not replay.
- The WebView follows Android's font-size setting (85–130%) instead of
  rendering every device at the same fixed text size. The activity keeps the
  page across the change, so a game in progress survives it; 130% is the
  ceiling the fixed Sudoku board holds — at 150% a digit no longer fits its
  cell — so the accessibility sizes above Android's largest preset are capped
  instead of allowed to break the chrome.

Capacitor renders the bundled interface in Android's **WebView**. This is an
installable app, not a browser shortcut or PWA install, but it is not a
Kotlin/Java rewrite. If "no web stuff" means no WebView at all, that would be a
separate fully native port.

## Web parity

The browser build is a first-class target, not a leftover: the same files serve
the website and the APK bundle, and only the APK carries the extra native glue.
Every feature therefore needs a working browser path, and native calls stay
behind `Capacitor.isNativePlatform()` or a missing-plugin guard, as haptics
(`navigator.vibrate`), card saving (`<a download>`) and backup export (a normal
download) already do. An APK-only change must not be the only way to reach a
feature the web build already has, and a new native feature needs a browser
fallback before it ships. In a browser tab the hub also offers a fullscreen
toggle; it is hidden in the edge-to-edge APK and in an installed PWA, where the
system already removes the browser chrome.

## Old WebView compatibility

The APK does not bundle a browser engine: it renders in whatever Android System
WebView the device has. Real phones update that component through the Play
Store, but the API 24 and 26 CI images ship a Chromium 69 WebView, so the shell
has a compatibility floor that is audited in source. The emulator matrix runs API
24 and 26 as launch checks, and the full WebView assertions on 33, 34 and 36. The
emulator job stays on `ubuntu-24.04`: on the 26.04 image the software-rendered
guest is lost mid-assertion (API 33's qemu disappears, and the newer WebViews
trip Android's 5s input-dispatch ANR while painting their first frame).

The guest renders with `swangle`, not the emulator's older SwiftShader GLES
path: emulator 37's GLES renderer segfaults in its host `RenderThread` when
`screencap` reads the composited window, which is exactly the read behind the
window-strip checks. `swangle` (ANGLE over SwiftShader Vulkan) completes the
same screenshot, palette and rotation assertions. A workstation with a
different host stack can compare renderers by setting `EMULATOR_GPU`.

In JavaScript the shell parses as ES2018, the newest syntax that WebView
supports. The boot path itself only needs `async`/`await` and object
rest/spread. The shell does not use optional chaining, nullish coalescing,
async generators, `for await`, `Element.toggleAttribute()` (Chromium 69) or
`Promise.allSettled()` (Chromium 76). `ResizeObserver`, `visualViewport`,
`requestIdleCallback`, `Intl.Segmenter` and the clipboard API are optional and
guarded, and the fullscreen toggle uses the `webkit*` methods where that is all
the engine has.

The stylesheets are newer than that WebView. `color-mix()` (Chromium 111),
`inset` (87), `:focus-visible` (86), flex `gap` (84), `min()`/`max()`/`clamp()`
(79), `aspect-ratio` (88), `dvh` units (108) and `env()` safe areas (69) are
used directly; `backdrop-filter` and `:has()` are the only features behind an
`@supports` check. The low-end sheet scrim is the one exception: it paints the
opaque page colour first and only applies its `color-mix()` blend behind an
`@supports` guard, because Chromium 109 parses the function but computes it to
transparent, which would leave the About sheet with no veil at all. On an old engine those declarations are dropped or left
unresolved, so missing tints, spacing and sheet geometry are expected. A
fallback sheet would have to restate the layout primitives across all seven
stylesheets, which is a second design rather than a small patch, so the API 26
emulator entry stays launch-only: it proves the APK installs and reaches first
paint, while API 33, 34 and 36 run the full assertions. Real API 26 devices update
WebView through the Play Store and are not limited to the emulator's engine.

The smoke records the engine it actually got. After the first paint every API
row prints the WebView's Chromium version from `navigator.userAgent`, so a
launch-only row carries the evidence for its own exception; if such a row's
engine meets the stylesheets' Chromium 111 floor (`color-mix()` is the newest
feature the shell uses directly), the run emits a CI warning to turn the full
assertions back on.

The smoke warns when the host has less than 3 GiB available. A starved guest
still boots, but it can lose the first frame to Android's 5 s input-dispatch
timeout, which otherwise reads exactly like an app ANR. Stop the Gradle daemon
(`./gradlew --stop`) before a local emulator run on a small workstation. The API level says nothing about the WebView — a real API 26
phone updates it through the Play Store — so the version in the log is what the
decision rests on.

The JavaScript floor is enforced in source. `npm run test:webview-floor` parses
every shell script and every inline block in the root HTML pages as ES2018
(Chromium 60's syntax set, minus async generators and `for await`, which it
rejects) and fails on a curated list of globals and methods newer than the
engine. Deliberately
feature-checked APIs are listed in the guard with their reason, and an
allowance that stops matching is itself an error. The guard found a dotAll
`/s` regex in `i18n/i18n.js`: a parse error on this WebView, which would have
disabled translation on every page, now replaced by `[\s\S]`. The CSS floor
remains a static audit, because those declarations are dropped rather than
throwing; the API 26 row does not assert the modern design.

One WebView 109 defect is worked around rather than lived with, and the rule it
leaves behind is simple: **no bridge call while a document is unloading**. When a
plugin call is still in flight as the page is replaced, Capacitor answers it
through `JavaScriptReplyProxy.postMessage`, and that reply can reach a native
peer the WebView has already released. On the API 33 image
(`109.0.5414.123`) the result is a process-killing `SIGSEGV` in the WebView's own
main-thread runnable, not in the app: the CI tombstone reads
`Java_J_N_MayS5i9E+9` in `libmonochrome_64.so` ← `QO.run` ← `Looper.loop`, with
no app frame anywhere on the stack. The last bridge traffic before that crash
was the hub's two `Haptics.cancel` calls, issued from `visibilitychange` and
`pagehide` while `licenses.html` loaded; the legal page's own script had not made
a single call yet. `js/haptics.js` therefore stops the motor on the switch that
turns haptics off, not on the way out, where the longest pattern (under 150 ms)
is over before the next screen settles. Nothing else in the shell calls a plugin
from `pagehide`, `visibilitychange` or `unload`.

The rule is a check, not a comment: `scripts/check-unload-bridge.mjs` parses the
shell's scripts, follows a local alias of the Capacitor proxy (`var plugins =
cap.Plugins`), and fails on a bridge call inside a `pagehide`, `unload` or
`beforeunload` handler, naming the file, line and call. `npm run
test:unload-bridge` runs it on the shell and `npm run
test:unload-bridge:fixture` proves it still fails on one. Both are CI steps in
the test job, so re-adding an unload-time cancel fails in a second instead of
waiting for an intermittent crash on the API 33 row.

## Edge-to-edge and safe areas

`MainActivity` draws the WebView behind transparent status and navigation bars,
and the activity content is not padded for them: the page fills the window and
paints its own background under both bars, which is what edge to edge looks
like. A padded content view put a flat band of the window colour above the
status bar and below the navigation bar, so the page never reached the edges and
its glass bands stopped short of them.

`capacitor.config.json` sets Capacitor's bundled `SystemBars` plugin to
`insetsHandling: "disable"`. Leaving that plugin to pad the DecorView is not
stable on Android 16's edge-to-edge window: the framework clears the DecorView's
padding between inset passes, so the page height flipped between padded (592px
on the smoke AVD) and unpadded (640px) every few frames. That was the whole-page
jump, and an IME keeps dispatching insets, which turned the jump into the flash
seen while typing in a non-Latin Wordle.

The page still needs the bar heights: it keeps its gutters and both glass bands
clear of the bars through `--safe-area-inset-*`, which resolves into the single
`--sa-top` / `--sa-bottom` pair the stylesheets use. A WebView reports
`env(safe-area-inset-*)` as zero, and `insetsHandling: "disable"` also skips the
plugin's own injection, so `MainActivity.installStableInsets()` hands the four
heights to the page itself, in CSS pixels, whenever they change and again after
every page load (a navigation, such as the legal page, starts from a document
with no variables at all). The listener consumes the insets so nothing below it
adds a second copy, and only the keyboard pads the content view, which keeps the
focused field above the keyboard. iOS and normal browsers keep using the
`env()` values as before.

`js/native.js` uses `SystemBars.setStyle()` for both system bars, so their icons
follow Sixfold's light/dark setting. `StatusBar.setBackgroundColor()` is
deliberately not used: Android 15+ ignores it, and on older versions it made the
bars opaque instead of edge-to-edge.

The window surface behind the WebView is the static day/night `@color/app_surface`
from the theme. That is enough for a phone whose app appearance follows the
system, but not for a dark appearance chosen on a light-system phone: the window
edges would flash cream during a scale or fade. `WindowSurfacePlugin` therefore
repaints the surfaces whenever the page reports its colour (`paintWindowSurface`
in `js/theme.js`), and remembers the last report so the next launch can pick the
matching launch theme. Nothing is retried or polled.

A report paints three things, through one helper
(`WindowSurfacePlugin.applySurface`): the window background drawable, which is
the strip behind the system bars while a system animation runs; `android.R.id.content`,
which is the strip its keyboard padding exposes; and the WebView, which is
everything the page leaves transparent. `PhoneWindow` installs the window drawable as the decor's
background, so setting the decor colour as well painted the same rows twice.
The activity content has no background of its own, and once it is padded for the
bars those rows fall back to the platform default — which is where a black
border comes from.

`scripts/assert-android-shell.mjs` reads the display's own size and density from
`wm`, asks the page for its viewport and its `--safe-area-inset-*` values, and
fails unless the page fills the window and both heights arrived. That is the
guard for the edge-to-edge fix: a padded content view shortens the viewport by
the bars, and a shell that never reports the heights leaves them zero. It also
samples the band behind the status bar from a real `screencap` and fails unless
it carries the page colour, in the light and the dark appearance separately: a
band left on the launch resource matches one appearance and fails the other, and
a black band fails both. Only that edge is sampled, because the page now paints
under the navigation bar too and those rows are whatever the scroller has there.
It samples a second of animation frames at the hub and fails if the page height
moves without a size change, which is the guard against an inset handler
drifting back into the padded/unpadded loop.

The geometry wait measures the display once and then polls only the page. Each
poll used to run `wm size` and `wm density` inside a 20 s window, and each adb
call was allowed 20 s of its own, so one slow shell call could time the check out
while the page was healthy — the API 36 row failed that way once on a loaded
runner and passed on the rerun with the same APK. It now waits 30 s, and a
failure names the insets and the viewport it last saw.

The smoke AVD asks for an on-screen navigation bar (`hw.mainKeys = no` in its
config): `avdmanager`'s generic profile writes `hw.mainKeys = yes`, and Android
14 reads that as a phone with hardware keys and draws no navigation bar at all,
so the bottom inset the geometry check requires was zero. The API 36 image
ignores the flag, which is why only the API 34 row caught it.

Styling the bars has a side effect that the surface has to work around:
`SystemBars.setStyle()` sets the decor background to the theme's `windowBackground`
while it changes the status and navigation bar icons, and that is the same
drawable the page's colour is painted on. `js/native.js` therefore reports the
page colour again on the microtask after the bar call is posted
(`MergeTheme.repaintSurface`), queued behind that repaint but ahead of the next
frame, because waiting for the call's promise — or for a timer — left the strip
on the launch colour until the bridge answered or the frame rendered. It does not
restyle the bars at all when only the palette changed, because the bar icons
depend on light/dark alone. Without both parts the strip keeps the launch
colour after a swatch tap until the next appearance change or a restart.

The same drawable is rewritten on every configuration change: the bundled
plugin re-applies its stored bar style on a rotation, a window resize or a
system day/night switch, and that call takes the current configuration's
`app_surface`. No appearance event fires with it, so `js/native.js` reports the
page colour again after a resize, an orientation change, a return from the
background and a system scheme change — twice, once after the configuration
pass and once after it settles, because a slow device can land the plugin's
write after the first report. The report is the page's resolved `--page`, not a
copy of the light/dark base, so high contrast (pure white or black) and a tinted
palette both stay in step with the bar.

The same report is remembered on the device. `MainActivity` reads it before
`super.onCreate` and calls `setTheme` with the matching fixed launch theme
(`AppTheme.NoActionBarLaunch.Light` or `…Dark`), so the splash opens in the
appearance the app itself is using. Those two styles inherit the launch theme
and change only the surface, so the `postSplashScreenTheme` handoff stays
intact — the earlier bug, replacing the splash theme before the splash could
read its handoff, cannot come back. After `super.onCreate` the window is given
the exact palette colour.

Android 12 and later paint their own starting window from the app's theme
before any process code runs, so `setTheme()` in `onCreate` is too late for that
first frame: it used to keep the phone's day/night colour and open a light app
on a dark plate. The page therefore reports its appearance to
`WindowSurfacePlugin.setTheme`, which stores it and calls
`UiModeManager.setApplicationNightMode` (API 31+). The system persists that
per-app mode and applies it when it resolves the app's resources, the starting
window included, so the launch screen opens in the app's own appearance even
when the phone is set the other way. Auto maps to the system mode and keeps
following the phone; the `onCreate` fixed launch theme still covers API 24–30
and the very first launch, before anything has been reported.

Predictive back stays off. The flag only affects the back gesture — the home and
recents transitions are the system's own and ignore it — and the app navigates in
the WebView, so there is no meaningful preview to show. Capacitor's App plugin
keeps its `OnBackPressedCallback` on the AndroidX dispatcher, so the legacy path
still delivers `backButton` to `js/native.js`.

The page answers back before the shell acts: `js/native.js` dispatches a
cancelable `sixfold:back`, and a sheet, a result card or the hidden game's reveal
dismisses itself and marks the event handled. Back on the legal page returns to
the hub through history and marks that load as a return, so the app skips its
launch layer and the cover's build: the WebView reloads the document and would
otherwise replay the splash. In a browser the same panels answer the browser's
back through one history entry per open sheet. `index.html` marks the shell on
`documentElement` in the head, before the body is parsed, so the page's own
launch composition never paints behind the OS splash.

The WebView is given the surface colour as its background in `MainActivity`.
Without it the WebView paints white until the page has a background, which read
as a second, blank splash between the launch screen and the hub. The launch
splash itself is the system one: `MainActivity` installs it from the
appearance-matched theme, dismissed on the page's first painted frame.
`launchShowDuration` in `capacitor.config.json` is `0`, which keeps Capacitor's
SplashScreen plugin out of the launch entirely — its full-screen drawable has a
`-night` copy selected by the phone's setting, and that is what used to cover
the correctly coloured system splash with the wrong one. The theme's
`windowSplashScreenAnimatedIcon` is `@drawable/splash_icon`, a 288dp drawable
generated per density (see `docs/ASSETS.md`); the 108dp adaptive icon would be
upscaled 2.67× on every screen.

The page's own launch layer is a hand-off there, not a second splash. The OS
splash already shows the mark, wordmark and rail, so `js/native.js` signals
`merge:splash-hidden` when it starts the platform's exit, and the layer drops
its composition and keeps only its surface: the colour the window and the
WebView already carry. It fades for 280 ms, about the length of that exit, and
the hub's six-piece cascade starts when the layer is removed, so none of the
build plays behind a splash. The browser and installed-PWA timings are
unchanged: there the layer is the only launch screen, and it keeps its hold so
the progress rail finishes before the lift.

Edge-to-edge needs a device or emulator check, especially around display
cutouts and gesture navigation. CI covers API 24, 26, 33, 34 and 36; a release
visual check should still include a cutout device and gesture navigation.

### Android 14 and below

The platform only enforces edge-to-edge from API 35, so on 24–34 the app's own
call is the whole opt-in. That call is
`WindowCompat.setDecorFitsSystemWindows(window, false)` in
`MainActivity.onCreate`, which androidx implements with
`LAYOUT_FULLSCREEN | LAYOUT_HIDE_NAVIGATION` below API 30 and with the window
flag from API 30. Capacitor never calls it: `SystemBars`' `insetsHandling:
"disable"` only skips that plugin's decor padding and its `--safe-area-inset-*`
injection (`initWindowInsetsListener` returns early). Edge-to-edge is therefore
on by the same statement from Android 7 through 16, not by a 35+ platform
default.

Three details differ below 35, and all three are already handled:

- `setStatusBarColor(TRANSPARENT)` and `setNavigationBarColor(TRANSPARENT)` are
  honoured; from API 35 they are deprecated no-ops because the platform makes
  both bars transparent itself.
- API 29–34 draw a translucent contrast scrim behind a transparent navigation
  bar in 3-button mode unless it is turned off;
  `setNavigationBarContrastEnforced(false)` is guarded on `Q` and does that.
  Below API 29 there is no scrim.
- `windowLayoutInDisplayCutoutMode="shortEdges"` needs API 28, and cutouts do
  not exist below it.

The one real gap is API 24–25: `SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR` arrived in
API 26, so a light page leaves the 3-button navigation icons white on the cream
surface. Those releases are already launch-only in the CI matrix because their
WebView predates the shell, and the app does not work around the platform here:
an opaque navigation bar would trade the edge-to-edge look for legible icons on
two releases that cannot run the full shell anyway. Recorded rather than
silently changed.

API 34 is in the emulator matrix and runs the full assertions, so Android 14 —
the last release before the platform enforces edge-to-edge — executes the strip
checks directly. API 33 covers the same path one release earlier.

## Checked-in Android project

- `capacitor.config.json` — app ID, name and `native/www` asset directory.
- `android/` — Capacitor Android project, Gradle wrapper and launcher art.
- `assets/icon*.png` — the rounded, maskable and adaptive icon source layers
  used by the generated launcher icon and splash screens.

Generated web assets and build output are deliberately ignored:

- `native/www/`
- `android/app/src/main/assets/public/`
- `android/app/src/main/assets/capacitor.config.json`
- `android/app/build/`
- `android/.gradle/`
- `android/local.properties`
- signing keys and `keystore.properties`

Run the native sync after any web change. A plain Gradle build will otherwise
package the previous web bundle.

## Toolchain

| Requirement | Version / notes |
| --- | --- |
| Node.js | 22 or newer |
| JDK | **21** (the Android module compiles with Java 21) |
| Android SDK Platform | **36** (`compileSdk` and `targetSdk`) |
| Android SDK Build-Tools | Matching 36.x, installed by Android Studio |
| Android minimum | API 24 |
| Gradle | 8.14.3, supplied by the checked-in wrapper |
| Android Gradle Plugin | 8.13.0 |
| `adb` | Optional; needed to install from the command line |

Android Studio is the easiest way to install the SDK, Build-Tools and a
compatible JDK. Command-line-only setups need the Android command-line tools,
`platform-tools`, Platform 36 and Build-Tools.

Set the environment before building:

```sh
export JAVA_HOME=/path/to/jdk-21
export ANDROID_HOME=/path/to/Android/Sdk
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
```

Accept the SDK licenses once:

```sh
sdkmanager --licenses
```

A typical command-line SDK install is:

```sh
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"
```

If Gradle cannot find the SDK, create `android/local.properties` (do not commit
it):

```properties
sdk.dir=/path/to/Android/Sdk
```

## Which APK is this?

One universal, WebView-based APK — not a native, Flutter or game-engine build,
and not an Android App Bundle:

| | |
|---|---|
| Package | `io.github.moh23rd.sixfold` |
| Build type | `debug`, from CI and from `npm run native:apk:debug`; the `release` build type is unsigned until a key is configured |
| ABI | a single universal APK, with no ABI splits or filters |
| SDK | min 24 (Android 7.0), target and compile 36 |
| Contents | the whole offline web shell in `assets/public`, plus small native plugins for the window surface, haptics, wallpaper colours, gallery save and launch actions |
| Signing | the local debug key, or CI's `ciTest` key from the `ANDROID_TEST_*` secrets when they are set |

That is enough to sideload and update in place while the signing key stays the
same. Play distribution would need a release signing config and an AAB.

## Build a debug APK

From the repository root:

```sh
npm ci
npm run native:apk:debug
```

`native:apk:debug` stages `native/www`, copies it into the Android project,
updates the Capacitor plugins and runs the checked-in Gradle wrapper. Use
`npm run native:android` when you only want to stage and sync before opening
Android Studio.

Output:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Install it on a connected device:

```sh
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

You can also run `npm run native:android`, open the `android/` directory in
Android Studio, let Gradle sync, and use **Run**. Always run the sync first so
Android Studio packages the current web assets.

## Smoke-check a downloaded APK

With `adb` on `PATH` and one phone or emulator connected with USB debugging
approved:

```sh
./scripts/smoke-apk.sh
```

The script uses the newest `artifacts/**/app-debug.apk`, installs and launches
it, checks the installed version and running process, and saves a screenshot in
`artifacts/smoke/`. Set `APK_PATH=...` to choose a specific APK, or
`ADB_SERIAL=...` when more than one device is connected. `npm run smoke:apk` is
an equivalent command when npm is available.

After it passes, check that the home screen is visible, the header clears the
status bar/cutout, the bottom controls clear the gesture bar, and one game can
be opened and played. CI installs and launches the APK on API 24, 26, 33, 34
and 36; API 24 and 26 prove the launch, and API 33, 34 and 36 run the full
WebView assertions. Use a physical cutout device when native layout or system-bar
behavior changes.

## CI verification

The `Test` workflow includes an **Android debug APK** job on `ubuntu-latest`.
It sets up Node 22, JDK 21 and Android SDK Platform 36 with Build-Tools 36.0.0,
runs `npm run native:apk:debug`, checks that the APK contains the bundled web
entry point and native plugin bundle, and uploads `sixfold-debug-apk` as an
artifact for 14 days. Download it from the Actions run summary; no local SDK is
required to verify a build.

The required `check` job waits for both the Playwright matrix and the Android
APK job, plus the native and emulator jobs, so an APK failure cannot be hidden
by a green test shard.

The emulator job now runs the installed APK through API **24, 26, 33, 34 and 36**,
one matrix entry per level, on `ubuntu-24.04`. The guest uses the `swangle`
renderer so `screencap` does not crash the host SwiftShader GLES thread. API 24
and 26 prove the APK installs and the activity reaches its first paint, but do
not run the WebView assertions: both images ship a Chromium 69 WebView, and the
stylesheets need newer ones (`inset`, flex gap, `min()`/`max()`/`clamp()`,
`aspect-ratio`, `dvh`, `color-mix()`), so a full run there would assert a
degraded layout. API 33, 34 and 36 run the full shell checks, including the About
sheet's first-frame paint trace, the device-side check for the delayed-blur
regression, and the return from the legal page through both its own
"Back to Sixfold" link and Android's system back button. The legal page is a
document of its own, so each return loads the app again; the check fails unless
that load lands the hub settled, with no launch layer in the DOM and no hub
entrance still running, which is the same animation set the page-level
`launch-cover` test watches. Each job downloads the signed APK from the Android
job instead of rebuilding it, so all API levels install the same artifact.

The rows do not all boot the same image. API 34 and 36 run the AOSP `default`
image, which has no Play services: the GMS fonts provider that used to die
under the app and take it off the screen does not exist there, so that flake
is gone at its source rather than only retried. API 33 stays on `google_apis`:
its AOSP image ships Chromium 101, which paints one Sudoku digit 2px past its
cell at system scale 2.0, and real API 33 phones update WebView through the
Play Store, so the older engine would assert a layout no current device has.
The API 24 and 26 launch-only rows also stay on `google_apis`. Dropping Play
services on two rows trades away the Play-certified environment — GMS
processes, Google's WebView build, the downloadable-fonts provider and the
Play Store update path — for reliability. The app declares no `INTERNET`
permission and uses no Play services, and the GMS kill records themselves stay
pinned by `scripts/lib/app-removal.test.mjs`, so the retry classifier keeps
being tested against the record that started this.

A cold-starting WebView can be torn down and recreated by the system after the
activity has started, which closes its DevTools socket before any page answers.
The smoke retries only that attach: a new attempt starts only while a 20-second
window from the first attempt is open, and only while the process it launched
is still the same live pid. An attach already in progress is left to finish, so
the whole recovery can take longer than that window. The launch itself is never
repeated. A crash, kill or ANR recorded for that pid is fatal, a changed or
missing pid is fatal, and the page still has to reach `home-ready` within the
launch's own deadline, so a slow or dead first paint cannot pass as a WebView
restart. Assertion failures after the launch proof are never retried, and the
emulator-lost path (exit 3) still reboots the guest as before.

A pixel sample is only evidence about the app while its own window is on
screen. The platform can remove a foreground app when a provider it holds a
connection to dies under it (the API 34 image did this with the GMS fonts
provider) or under memory pressure; the compositor then shows the launcher, and
its wallpaper is not the app's page colour. The assertion checks the pid and the
resumed activity before every sample and reports that case as exit 4 with the
platform's own kill record, instead of calling it a stale surface after the
30-second poll. A launch the platform cuts short is classified the same way: if
the process is gone when the launch proof fails, a recorded platform kill is
exit 4 rather than a missing devtools target. The smoke repeats the assertion
once on the same boot for exit
4 only: the repeat installs, launches and exercises every check again.
`scripts/test-emulator-retry.sh` drives that branch without waiting for a
provider to die: it hands the smoke an adb wrapper that removes the app for the
process that takes the first pixel sample, then checks that the assertion
classified the removal, that the smoke repeated it exactly once, and that the
repeat passed. It also prints what the repeat cost (install and whole check),
which is the number to weigh against resuming mid-suite instead.

The API 34 row runs that wrapper on every build, on its own boot, through
`SMOKE_RETRY_SELF_TEST=1`: the row's green result comes from the exit-4 repeat,
so the branch cannot rot between real provider kills. The wrapper lives in
`scripts/lib/emulator-retry-selftest.sh` and the same verification decides both
that row and the workstation script; a row that passes without taking the
branch fails with an annotation naming which part was missing, and a passing
row posts a notice with the detection delay and the repeat's install and check
cost. Reusing the
row's boot costs one repeated assertion (about 50 s) and no second emulator. A
crash, an ANR, an app-requested kill or an unexplained disappearance exits 1 and is
never repeated, and a genuinely stale page surface still fails its poll.

Exit 13 is the same host loss seen from the harness: Node exits with it when its
event loop drains while a top-level await is still pending, which here means the
WebView's DevTools socket went away with the renderer or emulator behind it. The
smoke maps 13 onto the lost-emulator path, so that row reboots and retries
instead of failing a run that never reached an assertion. The assertion also
closes the hole at its source: an attach whose socket closes before it opens is
rejected instead of leaving a promise pending, and any wait still outstanding
when the process runs out of work is reported and exits with the lost-emulator
status rather than the bare 13.

The launcher resources themselves remain audited in source (the static icon
snapshots, adaptive-icon guard, and no-locale-mipmap check), because a launcher
icon is rendered by the device launcher rather than by the app's WebView. A
device language change therefore cannot regenerate it from a locale catalog.

CI debug APKs are signed with a stable test key stored in repository Actions
secrets (`ANDROID_TEST_KEYSTORE_BASE64`, `ANDROID_TEST_KEYSTORE_PASSWORD`,
`ANDROID_TEST_KEY_ALIAS`, `ANDROID_TEST_KEY_PASSWORD`). The workflow decodes
the keystore into `RUNNER_TEMP`; no keystore or password belongs in the
repository. Local debug builds without those environment variables still use
the ordinary Android debug key, so they do not upgrade a CI-built APK in place.

## GitHub-only distribution

A debug APK is debug-signed and suitable for testing or a private GitHub
Release. Android will warn that it is a debug build.

For a cleaner public APK:

1. Create a release keystore outside the repository.
2. Configure a release signing config in `android/app/build.gradle`, reading
   credentials from an ignored `keystore.properties` or environment variables.
3. Build with:

```sh
npm run native:android
cd android
./gradlew assembleRelease
```

4. Attach the signed APK to a GitHub Release.

Do not commit the keystore, passwords or `keystore.properties`. Back up the
keystore: losing it prevents updates to an installed app.

Users install the APK directly and may need to allow installation from the
source they downloaded it from. The About sheet links to the Releases page and
opens it in the system browser; there is no in-app downloader, so the installed
app never needs `INTERNET`.

## Versioning and data

- `android/app/build.gradle` contains `versionCode 600` and `versionName
  "6.0.0"`. `versionCode` is `major * 100 + minor * 10 + patch` (600 for
  6.0.0), so it increases with every distributed build; `versionName` tracks
  the package and changelog build version. `tests/release-labels.spec.js`
  fails when the Android name drifts from `package.json`.
- Updates preserve app data only when the application ID and signing key match.
  A different key generally requires uninstalling the old app, which removes
  its data.
- The APK stores boards, scores, settings and streaks in WebView local storage.
  Browser/PWA data is separate. Use Sixfold's JSON backup/restore to move data
  between the browser and the APK.
- The native bundle does not include the service worker. Code updates require a
  new APK; there is no silent web update channel.

## Native icons and splash

The checked-in launcher and splash resources were generated from the five
icon source layers in `assets/` using the existing app colours. The launcher
has a reproducible web/Android pipeline and hash snapshots; see
[docs/ASSETS.md](ASSETS.md). To regenerate them after changing the mark:

```sh
npm run assets:icon
npm run native:assets
npm run assets:icons:check
```

`native:assets` currently targets Android. The iOS launch images are checked in
under `splash/` because this repository has no `ios/` project; see
[docs/ASSETS.md](ASSETS.md) for the reproducible font, splash and icon builds.

`native:assets:android` still runs `capacitor-assets` for the splash surfaces,
then rebuilds the launcher from the icon sources so its generated insets or
locale-qualified resources cannot survive. The static generator needs Python 3
with Pillow; the CI snapshot check is Node-only and always runs.

The adaptive icon uses a full-bleed plate-coloured background and a foreground
holding the plate, its merge tiles and the sparkle, fitted inside the launcher's
66dp safe zone. A full-bleed foreground would put the plate's rim under the
mask, which reads as a sliced edge in App info and on circular launchers. The
plate's black backing is dropped from every layer, so the icon has one
silhouette whichever shape a launcher applies, and the art has no border or
ring: a launcher mask meets the plate itself.
`capacitor-assets` adds `<inset>` wrappers to the XML on each generation, which
would shrink the art inside the launcher mask; `native:assets:android`
therefore ends with `scripts/guard-adaptive-icon.mjs`. Run
`npm run assets:guard` to verify without generating.

The launcher icon is static: one mark for every language. The background is
`#211d18`, sampled from the artwork's own plate, so the generated field and the
plate share one colour and only the plate's rim and tiles need a safe margin. The
default
`mipmap-anydpi-v26` adaptive XML references `@mipmap/ic_launcher_foreground`,
and there are no locale-qualified mipmap directories. The guard rejects any
such directory so the icon cannot start following the device language again.
The same adaptive XML also references `@mipmap/ic_launcher_monochrome`, a layer
rendered from the bright shapes alone (tiles, gold square, sparkle). Android 13's
themed-icon setting tints that silhouette with the wallpaper palette instead of
falling back to the coloured mark; the guard verifies the layer and its density
sizes like the other two.

## Troubleshooting

- **`SDK location not found`** — set `ANDROID_HOME` or create
  `android/local.properties`.
- **Unsupported class file / Java version** — point `JAVA_HOME` at JDK 21.
- **Stale UI in the APK** — run `npm run native:android` before Gradle.
- **`cap sync` reports missing platform** — the checked-in `android/` project
  should exist; do not run `cap add android` again unless intentionally
  regenerating it.
- **App installs but will not update** — the package ID or signing key changed.
  Back up data before uninstalling.

## Current workspace status

The Android project was generated and synced with Capacitor 8.6.3, and the
launcher/splash resources were generated. The debug APK has since been built
and run locally on an API 36 emulator, including the full shell assertions;
the local JDK and Android SDK live in `/tmp/jdk21` and `~/Android/Sdk`. GitHub
Actions remains the release verification path.
