#!/usr/bin/env node
// Render the iOS launch images that index.html links to with
// apple-touch-startup-image. There is no ios/ project in this repository;
// these checked-in PNGs are the iOS launch art.
//
//   node scripts/build-ios-splash.mjs
//
// The composition is intentionally CSS-only: the icon tile is the same
// icons/icon-512.png used by the app, the wordmark is the bundled Google Sans
// Flex, and the rule uses the same 0.855vw height at every screen size. The
// geometry below reproduces the checked-in images at any width.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SIZES = [
  [640, 1136], [750, 1334], [1242, 2208], [1125, 2436],
  [828, 1792], [1242, 2688], [1170, 2532], [1284, 2778],
  [1179, 2556], [1290, 2796], [1206, 2622], [1320, 2868],
  [1488, 2266], [1536, 2048], [1620, 2160], [1640, 2360],
  [1668, 2388], [2048, 2732]
];
const THEMES = {
  light: { bg: '#f6f1e8', ink: '#3b3833', rule: '#dad6cd' },
  dark: { bg: '#1a1918', ink: '#f1eae0', rule: '#42403c' }
};

const font = fs.readFileSync(path.join(ROOT, 'fonts/google-sans-flex.woff2')).toString('base64');
const icon = fs.readFileSync(path.join(ROOT, 'icons/icon-512.png')).toString('base64');

const pageHtml = (theme) => {
  const colors = THEMES[theme];
  return `<!doctype html>
<meta charset="utf-8">
<style>
  @font-face {
    font-family: 'Sixfold';
    src: url(data:font/woff2;base64,${font}) format('woff2');
    font-style: normal;
    font-weight: 100 1000;
    font-display: block;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
  body { background: ${colors.bg}; }
  .tile {
    position: absolute;
    left: 50%;
    top: calc(50% - 25.13vw);
    width: 34vw;
    height: 34vw;
    transform: translateX(-50%);
  }
  .tile img { display: block; width: 100%; height: 100%; }
  .word {
    position: absolute;
    left: 50%;
    top: calc(50% + 9.58vw);
    /* The trailing letter-space would pull the optical centre left. */
    transform: translateX(calc(-50% + 0.1em));
    color: ${colors.ink};
    font: 700 6.2vw/1 'Sixfold', sans-serif;
    letter-spacing: 0.2em;
    white-space: nowrap;
  }
  .rule {
    position: absolute;
    left: 50%;
    top: calc(50% + 24.45vw);
    width: 23.5vw;
    height: 0.855vw;
    transform: translateX(-50%);
    border-radius: 999px;
    background: ${colors.rule};
  }
</style>
<div class="tile"><img src="data:image/png;base64,${icon}" alt=""></div>
<div class="word">SIXFOLD</div>
<div class="rule"></div>`;
};

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 1170, height: 2532 } });

async function settle() {
  await page.evaluate(() => document.fonts.ready);
  // The tile is a data URL, but document.write replaces the document on each
  // theme. Wait for its decode rather than screenshotting a blank box on a
  // slower machine.
  await page.evaluate(() => Promise.all(Array.from(document.images, (image) => image.decode())));
}

await page.setContent(pageHtml('light'), { waitUntil: 'load' });
await settle();
if (!(await page.evaluate(() => document.fonts.check('700 74px "Sixfold"', 'SIXFOLD')))) {
  throw new Error('Google Sans Flex did not load');
}

for (const [width, height] of SIZES) {
  await page.setViewportSize({ width, height });
  for (const theme of Object.keys(THEMES)) {
    await page.evaluate((markup) => {
      document.open();
      document.write(markup);
      document.close();
    }, pageHtml(theme));
    await settle();
    await page.screenshot({ path: path.join(ROOT, 'splash/ios-' + width + 'x' + height + '-' + theme + '.png') });
  }
  console.log(width + 'x' + height + ' light/dark');
}

await browser.close();
console.log(SIZES.length * 2 + ' iOS launch images written');
