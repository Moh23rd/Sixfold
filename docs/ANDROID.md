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
fallback before it ships.

## Edge-to-edge and safe areas

`MainActivity` draws the WebView behind transparent status and navigation bars.
`capacitor.config.json` configures Capacitor's bundled `SystemBars` plugin with
`insetsHandling: "native"`, Capacitor's recommended mode. On Android WebViews
older than Chromium 140, Capacitor pads the native WebView and reports zero
`env(safe-area-inset-*)` values. On newer WebViews the page is edge-to-edge and
the `env()` values are correct. The stylesheets already use those `env()`
values, so no CSS-only fallback layer is needed. iOS and normal browsers use
the same `env()` values.

`js/native.js` uses `SystemBars.setStyle()` for both system bars, so their icons
follow Sixfold's light/dark setting. `StatusBar.setBackgroundColor()` is
deliberately not used: Android 15+ ignores it, and on older versions it made the
bars opaque instead of edge-to-edge.

The window surface behind the WebView is the static day/night `@color/app_surface`
from the theme. That is enough for a phone whose app appearance follows the
system, but not for a dark appearance chosen on a light-system phone: the window
edges would flash cream during a scale or fade. `WindowSurfacePlugin` therefore
repaints that one drawable whenever the page reports its colour
(`paintWindowSurface` in `js/theme.js`), and remembers the last report so the
next launch can pick the matching launch theme. Nothing is retried or polled.

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
that never paints, not a delay before the app appears.

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
cutouts and gesture navigation. Verify at least API 24, API 28, API 35 and
API 36 before releasing an APK.

## Checked-in Android project

- `capacitor.config.json` — app ID, name and `native/www` asset directory.
- `android/` — Capacitor Android project, Gradle wrapper and launcher art.
- `assets/icon.png` — source for the generated launcher icon and splash screens.

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
be opened and played. The full API 24/28/35/36 matrix is only needed when
native layout or system-bar behavior changes.

## CI verification

The `Test` workflow includes an **Android debug APK** job on `ubuntu-latest`.
It sets up Node 22, JDK 21 and Android SDK Platform 36 with Build-Tools 36.0.0,
runs `npm run native:apk:debug`, checks that the APK contains the bundled web
entry point and native plugin bundle, and uploads `sixfold-debug-apk` as an
artifact for 14 days. Download it from the Actions run summary; no local SDK is
required to verify a build.

The required `check` job waits for both the Playwright matrix and the Android
APK job, so an APK failure cannot be hidden by a green test shard.

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
source they downloaded it from.

## Versioning and data

- `android/app/build.gradle` contains `versionCode 6` and `versionName "6.0"`.
  Increase `versionCode` for every distributed build and set a user-visible
  `versionName` before release.
- Updates preserve app data only when the application ID and signing key match.
  A different key generally requires uninstalling the old app, which removes
  its data.
- The APK stores boards, scores, settings and streaks in WebView local storage.
  Browser/PWA data is separate. Use Sixfold's JSON backup/restore to move data
  between the browser and the APK.
- The native bundle does not include the service worker. Code updates require a
  new APK; there is no silent web update channel.

## Native icons and splash

The checked-in launcher and splash resources were generated from
`assets/icon.png` using the existing app colours. To regenerate them after
changing that source:

```sh
npm run native:assets
```

`native:assets` currently targets Android. The iOS launch images are checked in
under `splash/` because this repository has no `ios/` project; see
[docs/ASSETS.md](ASSETS.md) for the reproducible font, splash and icon builds.

The adaptive icon is deliberately two full-bleed layers. `capacitor-assets`
adds `<inset>` wrappers to the XML on each generation, which shrinks the mark
inside the launcher mask; `native:assets:android` therefore ends with
`scripts/guard-adaptive-icon.mjs`. Run `npm run assets:guard` to verify without
regenerating.

The launcher icon is static: one six-tile mark for every language. The default
`mipmap-anydpi-v26` adaptive XML references `@mipmap/ic_launcher_foreground`,
and there are no locale-qualified mipmap directories. The guard rejects any
such directory so the icon cannot start following the device language again.

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
launcher/splash resources were generated. This machine has no JDK or Android SDK
on PATH, so the debug APK has **not** been built here. The GitHub Actions
Android job is the verification path until the local toolchain is installed.
