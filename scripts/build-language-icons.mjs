#!/usr/bin/env node
// Build the alternate app icons that carry a script's own numeral.
//
// The icon faces are display choices, not the UI typeface: each Google Fonts
// request below is subset to the single numeral with `text=`, so the browser
// downloads at most a few hundred bytes and the result can be reproduced
// without checking font binaries into the repository.
//
//   node scripts/build-language-icons.mjs
//
// Outputs:
//   icons/icon-{180,192,512}-{ar,hi,kn,han}.png
//   android/app/src/main/res/mipmap-{ar,hi,kn,zh,ja}-<density>/ic_launcher_foreground.png
//
// The Android files are transparent foreground layers only. The default
// mipmap-anydpi-v26 adaptive icon references @mipmap/ic_launcher_foreground,
// so Android resolves the locale foreground while keeping the default adaptive
// mask. Locale full/round PNGs and locale adaptive XMLs must not exist: a
// locale density launcher PNG would beat the default adaptive icon on API 26+,
// and API 24–25 uses the default icon. The generator removes stale locale
// launcher files so a rerun cannot leave a masked-away icon behind.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const INK = '#f6f1e8';
const FIELD = '#1a1918';
const VERSION = '4.2.0';

const FONTS = {
  ar: { family: 'Baloo Bhaijaan 2', glyph: '٦', code: 'arabic' },
  hi: { family: 'Baloo 2', glyph: '६', code: 'devanagari' },
  kn: { family: 'Baloo Tamma 2', glyph: '೬', code: 'kannada' },
  han: { family: 'M PLUS Rounded 1c', glyph: '六', code: 'han' }
};

const DENSITIES = [
  ['mdpi', 108],
  ['hdpi', 162],
  ['xhdpi', 216],
  ['xxhdpi', 324],
  ['xxxhdpi', 432]
];

const latin = fs.readFileSync(path.join(ROOT, 'fonts/google-sans-flex.woff2')).toString('base64');

const fontLinks = Object.values(FONTS).map((font) =>
  `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(font.family).replace(/%20/g, '+')}:wght@800&text=${encodeURIComponent(font.glyph)}&display=block">`
).join('\n');

const pageHtml = `<!doctype html>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<style>
  @font-face {
    font-family: 'Sixfold';
    src: url(data:font/woff2;base64,${latin}) format('woff2');
    font-style: normal;
    font-weight: 100 1000;
    font-display: block;
  }
</style>
${fontLinks}
<body></body>`;

function writePng(file, dataUrl) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
await page.setContent(pageHtml, { waitUntil: 'networkidle', timeout: 120000 });

for (const font of Object.values(FONTS)) {
  const ok = await page.evaluate(async ({ family, glyph }) => {
    try {
      await document.fonts.load(`800 100px "${family}"`, glyph);
      return document.fonts.check(`800 100px "${family}"`, glyph);
    } catch (err) {
      return false;
    }
  }, font);
  if (!ok) throw new Error(`Could not load ${font.family} for ${font.code}`);
  console.log(`loaded ${font.family} for ${font.code}`);
}
await page.evaluate(() => document.fonts.ready);

const results = await page.evaluate(({ fonts, ink, field, densities }) => {
  function draw(size, { glyph, family, ratio, mode }) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);

    if (mode !== 'foreground') {
      ctx.fillStyle = field;
      ctx.beginPath();
      if (mode === 'full') {
        ctx.rect(0, 0, size, size);
      } else {
        ctx.roundRect(0, 0, size, size, size * 0.225);
      }
      ctx.fill();
    }

    ctx.font = `800 100px "${family}"`;
    const m = ctx.measureText(glyph);
    const inkHeight = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    const inkWidth = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
    if (!inkHeight || !inkWidth) throw new Error(`No ink for ${glyph}`);
    const scale = (size * ratio) / inkHeight;
    const fontSize = 100 * scale;
    ctx.font = `800 ${fontSize}px "${family}"`;
    ctx.fillStyle = ink;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const x = size / 2 - ((m.actualBoundingBoxRight - m.actualBoundingBoxLeft) * scale) / 2;
    const y = size / 2 + ((m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) * scale) / 2;
    ctx.fillText(glyph, x, y);
    return { url: canvas.toDataURL('image/png'), inkWidth: inkWidth * scale / size };
  }

  const out = {};
  for (const [key, font] of Object.entries(fonts)) {
    out[key] = {};
    for (const size of [180, 192, 512]) {
      out[key][`web${size}`] = draw(size, {
        ...font, ratio: size === 180 ? 0.533 : 0.542, mode: size === 180 ? 'full' : 'rounded'
      });
    }
    for (const [density, foreground] of densities) {
      out[key][`foreground-${density}`] = draw(foreground, { ...font, ratio: 0.495, mode: 'foreground' });
    }
  }
  return out;
}, { fonts: FONTS, ink: INK, field: FIELD, densities: DENSITIES });

await browser.close();

for (const [key, images] of Object.entries(results)) {
  for (const size of [180, 192, 512]) {
    writePng(path.join(ROOT, `icons/icon-${size}-${key}.png`), images[`web${size}`].url);
  }
  const qualifiers = key === 'han' ? ['zh', 'ja'] : [key];
  const res = path.join(ROOT, 'android/app/src/main/res');
  for (const qualifier of qualifiers) {
    for (const [density] of DENSITIES) {
      const dir = path.join(res, `mipmap-${qualifier}-${density}`);
      writePng(path.join(dir, 'ic_launcher_foreground.png'), images[`foreground-${density}`].url);
    }
    // Make the generator idempotent and foreground-only: remove the earlier
    // locale full/round PNGs, locale adaptive XMLs, and any other localized
    // launcher resource that is not the transparent foreground.
    fs.rmSync(path.join(res, `mipmap-${qualifier}-anydpi-v26`), { recursive: true, force: true });
    for (const entry of fs.readdirSync(res)) {
      if (!entry.startsWith(`mipmap-${qualifier}-`)) continue;
      const dir = path.join(res, entry);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const stale of fs.readdirSync(dir)) {
        if (stale === 'ic_launcher_foreground.png') continue;
        if (/^ic_launcher.*\.(png|xml)$/i.test(stale)) {
          fs.rmSync(path.join(dir, stale), { force: true });
        }
      }
    }
  }
  console.log(`${key}: ${FONTS[key].glyph}  web icons and Android localized foregrounds written`);
}

console.log(`language icon version ${VERSION}`);
