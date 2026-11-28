#!/usr/bin/env node
// Render the share card, `og-image.png`, from the app's own collection grid.
//
// The card is what a link preview shows and what the README leads with. It is a
// landscape crop of the hub's visual language, not a second brand: cream paper,
// ink type, the yellow "No filler" mark and the six numbered collection pieces.
//
//   node scripts/build-og-image.mjs
//
// The icon is `icons/icon-192.png`, so rebuild the launcher first
// (`npm run assets:icon && npm run assets:icons`) and then this card. Bump the
// `?v=` on the `og:image`/`twitter:image` URLs in `index.html` afterwards.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'og-image.png');
const ICON = path.join(ROOT, 'icons/icon-192.png');
const FONT = path.join(ROOT, 'fonts/google-sans-flex.woff2');
const WIDTH = 1200;
const HEIGHT = 630;

if (!fs.existsSync(ICON)) {
  console.error('[og image] icons/icon-192.png is missing; run npm run assets:icons first');
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
    flex-direction: column;
    padding: 30px 72px 26px;
    overflow: hidden;
  }

  /* The masthead is the hub's own small wordmark, with the collection mark
     carried over from the launcher. */
  .mast { display: flex; align-items: center; justify-content: space-between; gap: 24px; flex: none; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand img { width: 34px; height: 34px; display: block; border-radius: 9px; }
  .brand b { font-size: 13px; font-weight: 800; letter-spacing: 0.22em; line-height: 1; }
  .meta { display: flex; align-items: center; gap: 18px; color: #6f665a; font-size: 10px; font-weight: 800; letter-spacing: 0.16em; line-height: 1; text-transform: uppercase; }
  .meta i { width: 6px; height: 6px; display: block; border-radius: 2px; background: #e85f3b; }

  main {
    flex: 1;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 276px;
    align-items: center;
    gap: 60px;
    min-height: 0;
  }

  .copy { min-width: 0; align-self: center; }
  .kicker {
    display: flex;
    align-items: center;
    gap: 9px;
    color: #6f665a;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.15em;
    line-height: 1;
    text-transform: uppercase;
  }
  .kicker i { width: 8px; height: 8px; flex: none; border-radius: 2px; background: #e85f3b; }
  h1 {
    margin-top: 20px;
    color: #3b3833;
    font-size: 106px;
    font-weight: 700;
    letter-spacing: -0.068em;
    line-height: 0.9;
  }
  h1 span { display: block; }
  h1 .mark {
    display: table;
    margin-top: 0.08em;
    padding: 0.015em 0.12em 0.07em;
    border-radius: 0.08em;
    background: #e3b94a;
    color: #211d18;
    letter-spacing: -0.075em;
    transform: rotate(-1.4deg);
    transform-origin: left center;
  }
  .sub {
    max-width: 610px;
    margin-top: 24px;
    color: #5b5348;
    font-size: 23px;
    font-weight: 500;
    line-height: 1.42;
    letter-spacing: -0.01em;
  }
  .promises { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 14px; margin-top: 20px; color: #6f665a; font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
  .promises span { display: inline-flex; align-items: center; gap: 10px; }
  .promises span + span::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: #e85f3b; }

  /* The six pieces are the hub's collection grid: a 3-column, 5-row folded
     stack. Keeping the app's own colour order and numbers is the identity. */
  figure.collection { width: 276px; margin: 0; align-self: center; }
  .six {
    display: grid;
    width: 100%;
    aspect-ratio: 3 / 5;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-rows: repeat(5, minmax(0, 1fr));
    gap: 8px;
    transform: rotate(-3deg);
    transform-origin: center;
  }
  .piece {
    display: flex;
    align-items: flex-end;
    justify-content: flex-end;
    min-width: 0;
    min-height: 0;
    padding: 0 10px 9px;
    border: 1.5px solid #3b3833;
    border-radius: 10px;
    box-shadow: inset 0 -5px 0 rgba(33, 29, 24, 0.12);
    color: #211d18;
    font-size: 14px;
    font-weight: 800;
    letter-spacing: 0.01em;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .p1 { grid-area: 1 / 1 / 2 / 4; background: #e85f3b; }
  .p2 { grid-area: 2 / 1 / 3 / 2; background: #efb07a; }
  .p3 { grid-area: 3 / 1 / 4 / 4; background: #e3b94a; }
  .p4 { grid-area: 4 / 1 / 5 / 2; background: #8bbd54; }
  .p5 { grid-area: 4 / 3 / 5 / 4; background: #39a9a1; }
  .p6 { grid-area: 5 / 1 / 6 / 4; background: #5b8fd5; }
  .collection figcaption { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin: 13px 2px 0; color: #6f665a; font-size: 9px; font-weight: 800; letter-spacing: 0.1em; line-height: 1.2; text-transform: uppercase; }

  .ticker {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    flex: none;
    height: 44px;
    padding: 0 18px;
    border-radius: 8px;
    background: #3b3833;
    color: #f6f1e8;
    overflow: hidden;
  }
  .names { display: flex; align-items: center; gap: 15px; min-width: 0; font-size: 11.5px; font-weight: 800; letter-spacing: 0.1em; line-height: 1; text-transform: uppercase; white-space: nowrap; }
  .names span { display: inline-flex; align-items: center; gap: 15px; }
  .names span + span::before { content: ''; width: 5px; height: 5px; flex: none; border-radius: 1px; background: #e85f3b; transform: rotate(45deg); }
  .names span:nth-child(2)::before { background: #efb07a; }
  .names span:nth-child(3)::before { background: #e3b94a; }
  .names span:nth-child(4)::before { background: #8bbd54; }
  .names span:nth-child(5)::before { background: #39a9a1; }
  .names span:nth-child(6)::before { background: #5b8fd5; }
  .ticker .offline { flex: none; color: #cfc5b4; font-size: 9px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
</style>
<header class="mast">
  <div class="brand">
    <img src="data:image/png;base64,${icon}" alt="">
    <b>SIXFOLD</b>
  </div>
  <div class="meta"><span>The pocket arcade</span><i></i><span>2026</span></div>
</header>
<main>
  <div class="copy">
    <p class="kicker"><i></i>Six offline puzzles</p>
    <h1><span>Six games.</span><span class="mark">No filler.</span></h1>
    <p class="sub">A small arcade for the in-between. No accounts, no ads — and every game works offline.</p>
    <p class="promises"><span>No accounts</span><span>No ads</span><span>Works offline</span></p>
  </div>
  <figure class="collection">
    <div class="six" aria-hidden="true">
      <span class="piece p1">01</span>
      <span class="piece p2">02</span>
      <span class="piece p3">03</span>
      <span class="piece p4">04</span>
      <span class="piece p5">05</span>
      <span class="piece p6">06</span>
    </div>
    <figcaption><span>Play offline</span><span>01—06</span></figcaption>
  </figure>
</main>
<footer class="ticker">
  <div class="names"><span>Merge</span><span>Sudoku</span><span>Tic Tac Toe</span><span>Minesweeper</span><span>Water Sort</span><span>Fruit Merge</span></div>
  <div class="offline">No ads · Offline</div>
</footer>`;

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
