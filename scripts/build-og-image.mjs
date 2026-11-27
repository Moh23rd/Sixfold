#!/usr/bin/env node
// Render the share card, `og-image.png`, from the app's own launcher art.
//
// The card is what a link preview shows and what the README leads with, so it
// has to carry the current mark and the release's copy. 1200x630 is the size
// `index.html` declares in its `og:image:width`/`og:image:height`, and the one
// large-image link previews expect.
//
//   node scripts/build-og-image.mjs
//
// The icon tile is `icons/icon-1024.png`, so rebuild the launcher first
// (`npm run assets:icon && npm run assets:icons`) and then this card. Bump the
// `?v=` on the `og:image`/`twitter:image` URLs in `index.html` afterwards.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'og-image.png');
const ICON = path.join(ROOT, 'icons/icon-1024.png');
const FONT = path.join(ROOT, 'fonts/google-sans-flex.woff2');
const WIDTH = 1200;
const HEIGHT = 630;

if (!fs.existsSync(ICON)) {
  console.error('[og image] icons/icon-1024.png is missing; run npm run assets:icons first');
  process.exit(1);
}

const icon = fs.readFileSync(ICON).toString('base64');
const font = fs.readFileSync(FONT).toString('base64');

const html = `<!doctype html>
<meta charset="utf-8">
<style>
  @font-face {
    font-family: 'Sixfold';
    src: url(data:font/woff2;base64,${font}) format('woff2');
    font-weight: 100 1000;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; }
  body {
    background: #f6f1e8;
    font-family: 'Sixfold', system-ui, sans-serif;
    color: #3b3833;
    display: flex;
    align-items: center;
    gap: 84px;
    padding: 0 104px;
    overflow: hidden;
  }
  .tile {
    width: 300px;
    height: 300px;
    flex: none;
    /* The launcher art is a plate on transparency, so the card gives it its
       own surface: a circle of the plate colour, with the ring at its edge. */
    border-radius: 50%;
    background: #211d18 url(data:image/png;base64,${icon}) center / cover no-repeat;
    box-shadow: 0 26px 60px rgba(59, 56, 51, 0.28);
  }
  h1 { font-size: 118px; line-height: 0.94; font-weight: 700; letter-spacing: -0.03em; }
  .rule { width: 96px; height: 6px; border-radius: 3px; background: #dad6cd; margin: 30px 0 26px; }
  p.tag { font-size: 40px; font-weight: 500; color: #5c5850; letter-spacing: -0.01em; }
  p.games { margin-top: 26px; font-size: 25px; font-weight: 500; color: #8a857b; letter-spacing: 0.01em; }
</style>
<div class="tile"></div>
<div>
  <h1>Sixfold</h1>
  <div class="rule"></div>
  <p class="tag">Six games. No filler.</p>
  <p class="games">Merge · Sudoku · Tic Tac Toe · Minesweeper · Water Sort · Fruit Merge</p>
</div>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: OUT });
  console.log('[og image] og-image.png (' + WIDTH + 'x' + HEIGHT + ')');
} finally {
  await browser.close();
}
