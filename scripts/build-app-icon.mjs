#!/usr/bin/env node
// Render the launcher mark from one canvas description.
//
// The old mark was a 3x2 tile grid, which read as a generic app switcher and
// lost its margins on a circular launcher. The replacement is a single cream
// six on a warm ink plate with a coral hard shadow, so the silhouette survives
// a squircle, a circle and the adaptive-icon safe zone. The same mark is
// rendered at two scales: the full icon keeps the numeral bold on a home
// screen, while the adaptive foreground is fitted smaller inside Android's
// 66dp safe circle.
//
//   node scripts/build-app-icon.mjs
//
// Then rebuild the derived sizes:
//   python3 scripts/build-static-icons.py --write
//
// The source PNGs are checked in, so CI can verify every launcher size without
// running Chromium or Pillow.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const FONT = path.join(ROOT, 'fonts/google-sans-flex.woff2');
const SIZE = 1024;
const FACE = '#f7efe3';
const SHADOW = '#c2532f';
const SHADOW_INK = 'rgba(72, 18, 8, 0.32)';

const font = fs.readFileSync(FONT).toString('base64');

function canvasPage() {
  return `<!doctype html>
<meta charset="utf-8">
<style>html,body{margin:0;background:transparent}canvas{display:block}</style>
<canvas id="icon" width="${SIZE}" height="${SIZE}"></canvas>`;
}

async function loadFont(page) {
  await page.evaluate(async (data) => {
    const face = new FontFace('Sixfold', 'url(data:font/woff2;base64,' + data + ')');
    await face.load();
    document.fonts.add(face);
    await document.fonts.ready;
  }, font);
}

async function render(page, { rounded, plate, ink, shadow = true, file }) {
  const dataUrl = await page.evaluate(({ rounded, plate, ink, shadow, size, face, shadowColor, shadowInk }) => {
    const canvas = document.getElementById('icon');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);

    if (plate) {
      ctx.save();
      ctx.beginPath();
      if (rounded) ctx.roundRect(0, 0, size, size, 232);
      else ctx.rect(0, 0, size, size);
      ctx.clip();

      const base = ctx.createLinearGradient(0, 0, size, size);
      base.addColorStop(0, '#3b3730');
      base.addColorStop(0.58, '#2b2823');
      base.addColorStop(1, '#221f1b');
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, size, size);

      // A low coral glow sits behind the mark; it makes the ink plate feel warm
      // without tinting the cream numeral.
      const glow = ctx.createRadialGradient(532, 470, 0, 532, 470, 650);
      glow.addColorStop(0, 'rgba(224, 96, 60, 0.20)');
      glow.addColorStop(0.64, 'rgba(224, 96, 60, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size, size);

      const highlight = ctx.createRadialGradient(266, 102, 0, 266, 102, 620);
      highlight.addColorStop(0, 'rgba(255, 248, 238, 0.12)');
      highlight.addColorStop(0.58, 'rgba(255, 248, 238, 0)');
      ctx.fillStyle = highlight;
      ctx.fillRect(0, 0, size, size);

      const vignette = ctx.createLinearGradient(0, 650, 0, size);
      vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vignette.addColorStop(1, 'rgba(0, 0, 0, 0.28)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 650, size, size - 650);
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      if (rounded) ctx.roundRect(1, 1, size - 2, size - 2, 231);
      else ctx.rect(1, 1, size - 2, size - 2);
      ctx.strokeStyle = 'rgba(255, 248, 238, 0.08)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    if (ink) {
      // Measure the ink, not the font's line box: SVG getBBox() returns the
      // layout box for text, which made the first draft float too small. The
      // canvas actualBoundingBox values are the glyph's real edges.
      ctx.font = '700 780px Sixfold';
      const probe = ctx.measureText('6');
      const probeInk = probe.actualBoundingBoxAscent + probe.actualBoundingBoxDescent;
      const fontSize = 780 * ink / probeInk;
      ctx.font = '700 ' + fontSize + 'px Sixfold';

      const metrics = ctx.measureText('6');
      const ascent = metrics.actualBoundingBoxAscent;
      const descent = metrics.actualBoundingBoxDescent;
      const left = metrics.actualBoundingBoxLeft;
      const right = metrics.actualBoundingBoxRight;
      const x = size / 2 + (left - right) / 2;
      const y = size / 2 + (ascent - descent) / 2;
      const scale = fontSize / 780;

      ctx.save();
      if (shadow) {
        ctx.fillStyle = shadowColor;
        ctx.fillText('6', x + 16 * scale, y + 20 * scale);
      }

      ctx.fillStyle = face;
      if (shadow) {
        ctx.shadowColor = shadowInk;
        ctx.shadowBlur = 22 * scale;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 20 * scale;
      }
      ctx.fillText('6', x, y);
      ctx.restore();
    }

    return canvas.toDataURL('image/png');
  }, { rounded, plate, ink, shadow, size: SIZE, face: FACE, shadowColor: SHADOW, shadowInk: SHADOW_INK });

  fs.writeFileSync(path.join(ROOT, file), Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('[app icon] ' + file);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
  await page.setContent(canvasPage(), { waitUntil: 'load' });
  await loadFont(page);

  // The monochrome layer is the numeral alone: Android tints its alpha, so a
  // two-tone shadow would merge into one blob on a themed launcher.
  const monochromeOnly = process.argv.includes('--monochrome-only');
  if (!monochromeOnly) {
    await render(page, { rounded: true, plate: true, ink: 570, file: 'assets/icon.png' });
    await render(page, { rounded: false, plate: true, ink: 570, file: 'assets/icon-maskable.png' });
    await render(page, { rounded: false, plate: true, ink: 0, file: 'assets/icon-adaptive-background.png' });
    await render(page, { rounded: false, plate: false, ink: 470, file: 'assets/icon-adaptive-foreground.png' });
  }
  await render(page, { rounded: false, plate: false, ink: 470, shadow: false, file: 'assets/icon-adaptive-monochrome.png' });
} finally {
  await browser.close();
}
