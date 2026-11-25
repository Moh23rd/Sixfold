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
Store, but the API 26 CI image ships a Chromium 60-era WebView, so the shell has
a compatibility floor that is audited in source. The emulator matrix runs API
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
launch-only row carries the evidence for its own exception; if such a row
reports an engine newer than 60, the run emits a CI warning to turn the full
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

## Edge-to-edge and safe areas

`MainActivity` draws the WebView behind transparent status and navigation bars.
`capacitor.config.json` sets Capacitor's bundled `SystemBars` plugin to
`insetsHandling: "disable"`; the app pads the activity content itself in
`MainActivity.installStableInsets()`. Capacitor's native handler pads the
DecorView, and Android 16's edge-to-edge window clears that padding between
inset passes: the page height flipped between padded (592px on the smoke AVD)
and unpadded (640px) every few frames. That was the whole-page jump, and an IME
keeps dispatching insets, which turned the jump into the flash seen while typing
in a non-Latin Wordle. The activity content keeps the padding it is given, and
the listener consumes the insets so nothing below it adds a second copy. The IME
inset pads the bottom only while the keyboard is visible, so the focused field
stays above the keyboard. Inside the shell `env(safe-area-inset-*)` is zero
because the content is already padded; iOS and normal browsers use the `env()`
values as before.

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
the strip behind the system bars; `android.R.id.content`, which is the strip its
system-bar padding exposes; and the WebView, which is everything the page leaves
transparent. `PhoneWindow` installs the window drawable as the decor's
background, so setting the decor colour as well painted the same rows twice.
The activity content has no background of its own, and once it is padded for the
bars those rows fall back to the platform default — which is where a black
border comes from.

`scripts/assert-android-shell.mjs` samples the top and bottom strips from a real
`screencap` and fails unless both carry the page colour, in the light and the
dark appearance separately. That is the guard for the surface fix: a strip left
on the launch resource matches one appearance and fails the other, and a black
strip fails both. It also samples a second of animation frames at the hub and
fails if the page height moves without a size change, which is the guard against
an inset handler drifting back into the padded/unpadded loop.

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

Android 12 and later paint their own starting window from the manifest theme
before any app code runs, so that first frame keeps the day/night colour. Every
frame the app draws does not.

Predictive back stays off. The flag only affects the back gesture — the home and
recents transitions are the system's own and ignore it — and the app navigates in
the WebView, so there is no meaningful preview to show. Capacitor's App plugin
keeps its `OnBackPressedCallback` on the AndroidX dispatcher, so the legacy path
still delivers `backButton` to `js/native.js`.

The WebView is given the surface colour as its background in `MainActivity`.
Without it the WebView paints white until the page has a background, which read
as a second, blank splash between the launch screen and the hub. The launch
splash itself is the system one, dismissed on the page's first painted frame;
`launchShowDuration` in `capacitor.config.json` is only a safety net for a page
that never paints, not a delay before the app appears. Its
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
proves the APK installs
and the activity reaches its first paint; its WebView predates async/await, so
it does not run the WebView assertions. API 26 does the same because its stock
WebView predates the stylesheets' structural features (`inset`, flex gap,
`min()`/`max()`/`clamp()`, `aspect-ratio`), so a full run there would assert a
degraded layout. API 33, 34 and 36 run the full shell checks, including the About
sheet's first-frame paint trace, the device-side check for the delayed-blur
regression. Each job downloads the signed APK from the Android job instead of
rebuilding it, so all API levels install the same artifact.

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

The adaptive icon uses a full-bleed ink background and a foreground holding
only the cream six and its coral shadow, fitted inside the launcher's 66dp safe
zone. A full-bleed foreground put the old outer tiles under the mask, which
read as a zoomed, cropped icon in App info and on circular launchers.
`capacitor-assets` adds `<inset>` wrappers to the XML on each generation, which
would shrink the art inside the launcher mask; `native:assets:android`
therefore ends with `scripts/guard-adaptive-icon.mjs`. Run
`npm run assets:guard` to verify without generating.

The launcher icon is static: one six mark for every language. The ink
background is `#3b3833`, so the dark plate and the mask share one colour and
only the numeral needs a safe margin. The default
`mipmap-anydpi-v26` adaptive XML references `@mipmap/ic_launcher_foreground`,
and there are no locale-qualified mipmap directories. The guard rejects any
such directory so the icon cannot start following the device language again.
The same adaptive XML also references `@mipmap/ic_launcher_monochrome`, a layer
rendered from the numeral alone. Android 13's themed-icon setting tints that
silhouette with the wallpaper palette instead of falling back to the coloured
mark; the guard verifies the layer and its density sizes like the other two.

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

The Android project was generated and synced with Capacitor 8.6.2, and the
launcher/splash resources were generated. The debug APK has since been built
and run locally on an API 36 emulator, including the full shell assertions;
the local JDK and Android SDK live in `/tmp/jdk21` and `~/Android/Sdk`. GitHub
Actions remains the release verification path.
