# Asset builds

The app ships three kinds of generated art: the rounded UI font, the iOS launch
images, and the launcher mark. The launcher is rendered from one canvas
description into four source layers, then every web size and Android density;
its checked-in snapshots make a stale output visible. The Android adaptive icon
has an additional guard because the legacy generator changes the XML in a way
that silently shrinks the art.

Run all commands from the repository root. The generators need Node 22 and the
Playwright browser already used by the tests; the font build needs Python 3.

## Rounded UI font

`fonts/google-sans-flex.woff2` is a **six-axis Google Sans Flex** demo font with
ROND pinned at 100. The Google Fonts release only exposes four axes, which is
why the source is the repository demo file rather than the normal download.

Pinned source:

```text
https://github.com/googlefonts/googlesans-flex/blob/9c3785b85ddc03f7f4449031399c99f850da3612/documentation/demo-fonts/GoogleSansFlex%5BGRAD%2CROND%2Copsz%2Cslnt%2Cwdth%2Cwght%5D-144B3.ttf
```

Rebuild:

```sh
python3 -m pip install fonttools brotli
python3 scripts/build-font.py
```

The script:

1. Downloads the source at the pinned commit, unless `--source FILE` is given.
2. Reads the 321-codepoint coverage from the font being replaced, so the new
   file cannot add or lose a character by accident.
3. Subsets first, keeping the same four layout features (`calt`, `liga`,
   `locl`, `kern`).
4. Pins `ROND=100`, `GRAD=0`, `slnt=0` and `wdth=100`, while keeping the
   `opsz` 6–144 and `wght` 1–1000 axes variable.
5. Writes a WOFF2 of about 138 KB.

Subsetting the already-instanced font trips a GDEF VarStore reference to a
dropped glyph in current fontTools, so the script intentionally subsets before
instancing. The result has the same 399 glyphs, 321 codepoints and features as
the checked-in file; WOFF2 table ordering can change the final size by a few
hundred bytes.

If the bytes change, bump the font version in `css/styles.css`, `index.html`,
`licenses.html`, `js/game.js` and `FONT_ASSET` in `sw.js`. The current shipped
URL is `fonts/google-sans-flex.woff2?v=5.0.0`. The font is SIL OFL 1.1; keep
`fonts/OFL.txt` with it.

## iOS launch images

There is no `ios/` project in this repository. The 36 checked-in
`splash/ios-<width>x<height>-<light|dark>.png` files are the iOS launch art, and
`index.html` links them with `apple-touch-startup-image`.

Rebuild:

```sh
node scripts/build-ios-splash.mjs
```

The script renders all 18 portrait sizes in light and dark with Playwright. It
uses `icons/icon-1024.png` for the tile, the bundled Google Sans Flex for the
wordmark, and the same geometry at every size:

| Element | Geometry |
| --- | --- |
| Tile | 34vw square at `50% - 25.13vw`, using the app icon |
| Wordmark | 700 6.2vw, 0.2em tracking, at `50% + 9.58vw`; the `+0.1em` transform offset removes the trailing tracking |
| Rule | 23.5vw × 0.855vw at `50% + 24.45vw`, fully rounded |
| Light | background `#f6f1e8`, ink `#3b3833`, rule `#dad6cd` |
| Dark | background `#1a1918`, ink `#f1eae0`, rule `#42403c` |

The startup links use `?v=6.0.2`. Bump that suffix if the images change.
`icons/icon-1024.png` is the rounded launcher mark, rendered from
`assets/icon.png`; the iOS launch images have no separate artwork.

Each launch image is 1:1 device pixels and the tile is 34vw of its width, so a
size needs `ceil(width × 0.34)` source pixels. The 1024 icon covers the largest
tile (697px on `2048x2732`); the old 512 icon was upscaled up to 1.36× on the
1536–2048px iPads. The generator refuses a size whose tile would need more than
the icon, so a new iPad size cannot silently bring the soft tile back.

## Launcher icon

The browser favicon, Apple touch icon and Android launcher all use one static
mark: a cream six on a warm ink plate with a coral hard shadow. There is no
per-language icon and no `applyIcon` browser path. The web and splash links use
`?v=6.0.1`; change that suffix when the art changes.

The mark is rendered by `scripts/build-app-icon.mjs` into five checked-in
sources: `assets/icon.png` (rounded plate), `assets/icon-maskable.png`
(full-bleed square), `assets/icon-adaptive-background.png` (the plate without
the numeral), `assets/icon-adaptive-foreground.png` (the numeral and its
shadow, sized for Android's safe circle) and
`assets/icon-adaptive-monochrome.png` (the numeral alone, for Android 13+
themed icons). Rebuild the layers and every derived size:

```sh
python3 -m pip install pillow
npm run assets:icon
npm run assets:icons
npm run assets:icons:check
```

`assets:icon` needs the Playwright Chromium already used by the tests. It
measures the glyph's ink, not the font's line box, so the numeral is centred by
what the eye sees. `assets:icons` writes `icons/icon-{180,192,512,1024}.png`,
the two maskable sizes, `icons/mark-456.webp` for the web boot splash, the Android legacy/round/foreground/background/monochrome layers for all six
densities, the
288dp `drawable-<density>/splash_icon.webp` launch icon, and
`assets/icon-snapshots.json`. The Apple touch icon
uses the square layer because iOS applies its own squircle; the regular browser
sizes keep the rounded plate. The snapshot records every source hash, byte size
and SHA-256 of every output. `assets:icons:check` is the dependency-light guard
CI runs; if a source changes without regenerating the outputs, it fails instead
of letting two kinds of launcher art drift apart.

Keep the icon static: do not add locale-qualified `mipmap-*` directories or
locale-suffixed web icon files. `npm run native:assets:android` still uses
`capacitor-assets` for the splash surfaces, then runs the static generator so
the launcher cannot be replaced by a language-following or inset version.

## Boot splash mark

The web boot splash draws the mark at up to 152 CSS px, so it loads
`icons/mark-456.webp` (456 px, 3× the largest display size) from the same
`assets/icon.png` master instead of upscaling the 32 px header icon.
`assets:icons` resizes it to 456 px and encodes WebP at quality 80: about
8 KiB, where a PNG of the same size would add 120 KiB to the offline shell.
`icons/icon-192.png` stays for the header, favicon and the rest of the shell.

## Adaptive icon guard

`capacitor-assets` wraps the adaptive foreground and background in `<inset>`
elements on every run. That double-insets art the static builder has already
fitted to the launcher safe zone. The guard canonicalises the default adaptive
XML back to the full-bleed layers:

```xml
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
```

`npm run native:assets:android` now ends with the guard, so a generated icon
cannot keep the insets. It also verifies the `#3b3833` background resource and
the default layer sizes, and rejects any locale-qualified `mipmap-*` directory
so the launcher icon cannot start following the device language again.

The adaptive foreground is the cream six and its coral shadow, scaled so the
numeral's ink fits inside the 66dp safe circle; the ink plate and its glow are
the background layer. A full-bleed foreground put the old outer tiles under
circular launcher masks, which looked like a zoomed icon.

```sh
npm run native:assets      # regenerate, repair, verify
npm run assets:guard       # verify only; exits non-zero on an inset or locale directory
```

The checked-in background and foreground PNGs are separate layers; do not
flatten the foreground into the background. The adaptive foreground must stay
transparent outside the glyph.

The launch theme does not use the adaptive icon. Android draws
`windowSplashScreenAnimatedIcon` at 288dp and masks the inner 192dp circle, so
the 108dp adaptive layers would be upscaled 2.67× on every screen. The theme
points at `@drawable/splash_icon` instead: a 288dp WebP per density with the
rounded plate in the inner two-thirds, resized from the same 1024 master. The
six files total about 60 KiB; lossless PNG would add about 800 KiB to the APK.
`build-static-icons.py` refuses a density whose art would exceed the master,
and `guard-adaptive-icon.mjs` fails if the theme points back at the adaptive
icon.

## Checks

```sh
npm run assets:icons:check
npm run assets:guard
npm run assets:manifest:check
npm run test:cache-budget
npm run test:i18n
npm run native:check
```

Focused Playwright coverage lives in `tests/static-icons.spec.js`,
`tests/adaptive-icon.spec.js` and `tests/language-follow.spec.js`.

## Shell content manifest

`asset-manifest.json` records the SHA-256 and byte size of every file in the
service-worker shell. The `?v=` suffixes in `index.html` and `sw.js` remain
cache epochs; the manifest is the byte-level contract and catches a file that
changed without a version bump.

```sh
npm run assets:manifest        # regenerate after an intentional shell change
npm run assets:manifest:check  # verify every recorded byte
npm run test:shell-pins        # verify every ?v= pin postdates its file
npm run test:shell-pins:fixture # prove the guard fails on drift, passes on a bump
```

The manifest proves the bytes; the pins prove the cache epoch. A `?v=` pin is
the URL the worker caches, so a file edited without a bump ships new bytes under
an old key and an installed app keeps the old copy. `test:shell-pins` compares
each shell file's last commit with the commit that last set its pin, which needs
full history (`fetch-depth: 0` in CI).

## Cache budgets

`npm run test:cache-budget` classifies the raw shell by document, stylesheet,
script, locale catalog, icon and font bytes and fails when a class or the whole
shell crosses its budget. It prints the largest files in each class so the
cause of a regression is visible without opening the report.

## Cache footprint baselines

The Playwright core shard records the installed Cache Storage footprint for
all twelve locales. A normal run compares it with the latest successful
artifact and fails when a locale grows by more than the larger of 24 KiB or
1.5% of its previous footprint.

An intentional growth needs a new baseline, not a quiet limit change. Record
the current report with the reason and approver, then upload that file as the
`locale-cache-footprints-*` artifact (or attach it to the approved review):

```sh
node scripts/rebaseline-cache-footprint.mjs \
  --current test-results/<run>/locale-cache-footprints.json \
  --output locale-cache-footprints-rebaselined.json \
  --reason "Arabic catalog grew for the accessibility copy" \
  --approved-by "release-review"
```

In GitHub Actions, dispatch **Test** with `rebaseline_reason` (and optionally
`rebaseline_approved_by`) filled in. The core shard records the current report
with that metadata and uploads it as the next baseline; the drift comparison is
skipped for that approved run, then resumes against the new artifact.
