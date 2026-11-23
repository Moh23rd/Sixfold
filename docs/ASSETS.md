# Asset builds

The app ships three kinds of generated art: the rounded UI font, the iOS launch
images, and the script-numeral icon variants. The Android adaptive icon has a
guard because its generator changes the XML in a way that silently shrinks the
art.

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
`assets/icon.png` remains the Android generator source; it is the numeral 6,
not the iOS splash tile.

## Language icon variants

The browser favicon and Apple touch icon change with the active language, and
the Android launcher has locale-qualified resources:

| Locale | Numeral | Rounded face |
| --- | --- | --- |
| Arabic | ٦ | Baloo Bhaijaan 2 800 |
| Hindi | ६ | Baloo 2 800 |
| Kannada | ೬ | Baloo Tamma 2 800 |
| Chinese (both) / Japanese | 六 | M PLUS Rounded 1c 800 |
| Korean, English, others | 6 | Google Sans Flex 800 |

The script faces are display choices, not the UI face. The resource bundles
keep the existing script faces for body copy.

Rebuild:

```sh
node scripts/build-language-icons.mjs
```

The script requests a one-glyph `text=` subset from Google Fonts for each
display face, draws the numeral on the same tile and ratios as the default
icon, and writes:

- `icons/icon-{180,192,512}-{ar,hi,kn,han}.png` for the web.
- `android/app/src/main/res/mipmap-{ar,hi,kn,zh,ja}-<density>/ic_launcher_foreground.png`
  as transparent localized foregrounds. `zh` and `ja` share the Han art.

The default Latin art stays in `icons/icon-*.png` and `mipmap-*`. The browser
mapping lives in `i18n/i18n-locale.js` (`applyIcon`), with the icon URLs at
`?v=4.2.0`. Android resolves the localized foreground against the **device**
locale, so the in-app language picker does not repaint a launcher icon that is
already installed. A launcher may also cache the icon until it is restarted.
There is no native iOS project here, so only the web `apple-touch-icon` can
change; a native iOS alternate icon would need an Xcode asset catalog and
`setAlternateIconName`.

Localized launcher art is foreground-only. The default `mipmap-anydpi-v26`
adaptive icon references `@mipmap/ic_launcher_foreground`, so Android resolves
the localized transparent foreground while keeping the default mask. There are
no locale full/round PNGs and no locale adaptive XMLs; API 24–25 uses the
default icon. Do not add either back: a locale-qualified density PNG can beat
the default adaptive icon on API 26+ because Android matches the locale before
the version.

The generated localized foregrounds are checked in. The generator fetches the
font subsets at build time rather than vendoring the display fonts, so no extra
font binaries enter the app bundle.

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
cannot keep the insets. It also verifies the opaque `#1a1918` background
resource, the default layer sizes, and the five locale foreground sets. It
rejects any locale launcher PNG/XML other than `ic_launcher_foreground.png`,
including a locale adaptive directory, so a full icon cannot return and
override the default adaptive icon on API 26+.

```sh
npm run native:assets      # regenerate, repair, verify
npm run assets:guard       # verify only; exits non-zero on an inset
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
