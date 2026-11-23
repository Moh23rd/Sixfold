# Asset builds

The app ships three kinds of generated art: the rounded UI font, the iOS launch
images, and the Android launcher art. The Android adaptive icon has a guard
because its generator changes the XML in a way that silently shrinks the art.

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
uses `icons/icon-512.png` for the tile, the bundled Google Sans Flex for the
wordmark, and the same geometry at every size:

| Element | Geometry |
| --- | --- |
| Tile | 34vw square at `50% - 25.13vw`, using the app icon |
| Wordmark | 700 6.2vw, 0.2em tracking, at `50% + 9.58vw`; the `+0.1em` transform offset removes the trailing tracking |
| Rule | 23.5vw × 0.855vw at `50% + 24.45vw`, fully rounded |
| Light | background `#f6f1e8`, ink `#3b3833`, rule `#dad6cd` |
| Dark | background `#1a1918`, ink `#f1eae0`, rule `#42403c` |

The startup links use `?v=4.0.1`. Bump that suffix if the images change.
`assets/icon.png` remains the Android generator source; it is the six-tile
mark, not the iOS splash tile.

## Launcher icon

The browser favicon, Apple touch icon and Android launcher all use one static
six-tile mark. There is no per-language icon and no `applyIcon` browser path.
The web links use `?v=4.2.1`; change that suffix when the art changes.

`assets/icon.png` remains the Android generator source. The default
`mipmap-<density>` and `mipmap-anydpi-v26` resources are generated from it.
Keep the icon static: do not add locale-qualified `mipmap-*` directories or
locale-suffixed web icon files.

## Adaptive icon guard

`capacitor-assets` wraps the adaptive foreground and background in `<inset>`
elements on every run. That shrinks the art inside the launcher mask. The guard
canonicalises the default adaptive XML back to the full-bleed layers:

```xml
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
```

`npm run native:assets:android` now ends with the guard, so a generated icon
cannot keep the insets. It also verifies the `#f6f1e8` background
resource and the default layer sizes, and rejects any locale-qualified
`mipmap-*` directory so the launcher icon cannot start following the device
language again.

```sh
npm run native:assets      # regenerate, repair, verify
npm run assets:guard       # verify only; exits non-zero on an inset or locale directory
```

The checked-in background and foreground PNGs are separate layers; do not
flatten the foreground into the background. The adaptive foreground must stay
transparent outside the glyph.

## Checks

```sh
npm run assets:guard
npm run test:i18n
npm run native:check
```

Focused Playwright coverage lives in `tests/adaptive-icon.spec.js` and
`tests/language-follow.spec.js`.
