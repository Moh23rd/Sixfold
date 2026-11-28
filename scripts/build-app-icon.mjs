#!/usr/bin/env node
// Render the launcher layers from the checked-in icon artwork.
//
// The art is `assets/icon-source.svg`: a dark plate holding the merge tiles and
// a sparkle, with a cream ring that runs to the plate's edges. One drawing feeds
// five layers, because a launcher mask sees a different part of it at every
// shape:
//
//   assets/icon.png                     the art as drawn, rounded plate included
//   assets/icon-maskable.png            plate-coloured field, art inside the
//                                       maskable safe circle
//   assets/icon-adaptive-background.png flat plate colour (`#211d18`)
//   assets/icon-adaptive-foreground.png art fitted inside the 66dp safe zone
//   assets/icon-adaptive-monochrome.png the bright shapes alone, for Android's
//                                       themed icons
//
// The ring reaches the edge of the art, so the maskable and adaptive layers
// scale the whole drawing down instead of letting a circular mask slice it. The
// plate colour is then the field behind it: the plate's own rounded corners sit
// on the same colour, so only the ring and the tiles read.
//
// The SVG draws a black square behind its plate. That square is dropped here:
// a launcher masks the icon to its own squircle or circle, and a square left
// under the mask reads as a second frame inside the plate. Only the plate's own
// corner is transparent, so iOS, Android and a browser tab all show one shape.
//
//   node scripts/build-app-icon.mjs
//   python3 scripts/build-static-icons.py --write
//
// The master PNGs are checked in, so CI verifies every launcher size without
// running Chromium or Pillow.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE = path.join(ROOT, 'assets/icon-source.svg');
const SIZE = 2048;
// Sampled from the plate itself, so the generated field and the art's own
// surface are the same colour. `values/ic_launcher_background.xml` carries it
// too, and the adaptive-icon guard checks all three agree.
const PLATE = '#211d18';
// Themed icons are tinted by the launcher, so the silhouette is one ink; the
// alpha channel is the shape.
const MONO_INK = '#f7efe3';
// The ring sits at 0.5 of the art's half-width. Android's adaptive mask shows
// the inner 72dp of 108dp (radius 0.333) and its safe zone is 66dp (0.306), so
// the art is scaled until the ring and the tiles are inside those circles. The
// maskable safe circle is 0.4, so that layer can keep the art larger.
const LAYERS = [
  { file: 'assets/icon.png', art: 1 },
  { file: 'assets/icon-maskable.png', art: 0.78, background: PLATE },
  { file: 'assets/icon-adaptive-background.png', art: 0, background: PLATE },
  { file: 'assets/icon-adaptive-foreground.png', art: 0.6 },
  { file: 'assets/icon-adaptive-monochrome.png', art: 0.6, monochrome: true }
];

const svg = fs.readFileSync(SOURCE).toString('base64');

async function render(page, { art, background, monochrome, file }) {
  const dataUrl = await page.evaluate(
    ({ svg, art, background, monochrome, size, ink }) => {
      const canvas = document.getElementById('icon');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, size, size);
      if (background) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, size, size);
      }
      if (art > 0) {
        const image = document.getElementById('art');
        const side = size * art;
        const at = (size - side) / 2;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(image, at, at, side, side);
        // Drop the source's black backing. The plate never reaches black
        // (its darkest surface is #211d18), so only the square outside the
        // plate is cut; the ramp keeps the plate's antialiased corner soft
        // instead of leaving a dark fringe.
        const plate = ctx.getImageData(0, 0, size, size);
        const bytes = plate.data;
        for (let i = 0; i < bytes.length; i += 4) {
          const peak = Math.max(bytes[i], bytes[i + 1], bytes[i + 2]);
          if (peak >= 16) continue;
          const keep = peak <= 6 ? 0 : (peak - 6) / 10;
          bytes[i + 3] = Math.round(bytes[i + 3] * keep);
        }
        ctx.putImageData(plate, 0, 0);
      }
      if (!monochrome) return canvas.toDataURL('image/png');

      // One ink, shaped by the drawing's own alpha and its brightness: the
      // plate's gradient is dark and the ring, tiles and sparkle are not, so a
      // luminance cut keeps the mark and drops the surface. The soft edge keeps
      // the ring from stepping at small sizes.
      const pixels = ctx.getImageData(0, 0, size, size);
      const data = pixels.data;
      const inkRgb = [1, 3, 5].map((at) => parseInt(ink.slice(at, at + 2), 16));
      for (let i = 0; i < data.length; i += 4) {
        const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const lit = Math.min(1, Math.max(0, (luma - 70) / 30));
        data[i] = inkRgb[0];
        data[i + 1] = inkRgb[1];
        data[i + 2] = inkRgb[2];
        data[i + 3] = Math.round(data[i + 3] * lit);
      }
      ctx.putImageData(pixels, 0, 0);
      return canvas.toDataURL('image/png');
    },
    { svg, art, background, monochrome, size: SIZE, ink: MONO_INK }
  );
  fs.writeFileSync(path.join(ROOT, file), Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('[app icon] ' + file);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
  await page.setContent(
    `<!doctype html>
<meta charset="utf-8">
<style>html,body{margin:0;background:transparent}canvas{display:block}</style>
<canvas id="icon" width="${SIZE}" height="${SIZE}"></canvas>
<img id="art" alt="" src="data:image/svg+xml;base64,${svg}">`,
    { waitUntil: 'load' }
  );
  await page.evaluate(() => {
    const image = document.getElementById('art');
    return image.complete && image.naturalWidth
      ? null
      : new Promise((resolve, reject) => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', () => reject(new Error('the icon artwork did not load')), {
            once: true
          });
        });
  });

  const monochromeOnly = process.argv.includes('--monochrome-only');
  for (const layer of LAYERS) {
    if (monochromeOnly && !layer.monochrome) continue;
    await render(page, layer);
  }
} finally {
  await browser.close();
}
