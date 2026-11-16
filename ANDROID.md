# Android APK

Sixfold's Android target is a **direct-install APK for GitHub distribution**, not
a Play Store release. There is no AAB requirement and no store listing.

## What the APK is

- A native Android app shell with package ID `io.github.moh23rd.sixfold`.
- It launches directly into Sixfold. There is no address bar, tab strip, browser
  menu or web-server requirement.
- The HTML, CSS, JavaScript, fonts, icons and game data are bundled inside the
  APK, so the game works offline.
- Android's native splash screen, status bar and back gesture are wired through
  Capacitor and `js/native.js`.

Capacitor renders the bundled interface in Android's **WebView**. This is an
installable app, not a browser shortcut or PWA install, but it is not a
Kotlin/Java rewrite. If "no web stuff" means no WebView at all, that would be a
separate fully native port.

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
npm run native:android
npm run native:apk:debug
```

`npm run native:android` stages `native/www`, copies it into the Android project
and updates the Capacitor plugins. `native:apk:debug` then runs the checked-in
Gradle wrapper.

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

Because this is not a Play Store build, no AAB is required. Users install the
APK directly and may need to allow installation from the source they downloaded
it from.

## Versioning and data

- `android/app/build.gradle` contains `versionCode 1` and `versionName "1.0"`.
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

`native:assets` currently targets Android. `native:assets:ios` is available when
an iOS project is added on macOS.

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
on PATH, so the debug APK has **not** been built here yet.
