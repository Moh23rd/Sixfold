#!/usr/bin/env node
// capacitor-assets wraps the adaptive-icon layers in a 16.7% <inset> on every
// run, which shrinks the art inside the launcher mask. This guard runs after
// the generator: it rewrites the default adaptive XML back to the canonical
// full-bleed layers and verifies the default PNGs and five locale foreground
// sets at the expected sizes.
//
// Localized launcher art is foreground-only. The default mipmap-anydpi-v26
// adaptive icon references @mipmap/ic_launcher_foreground, which Android
// resolves per locale, so the mask is always the default adaptive mask. Any
// locale full/round ic_launcher*.png or locale XML would reintroduce an icon
// that can beat or duplicate the adaptive resource; the guard rejects both.
// API 24–25 uses the default icon because no locale full/round resources exist.
//
//   node scripts/guard-adaptive-icon.mjs          # repair, then verify
//   node scripts/guard-adaptive-icon.mjs --check  # verify only, fail on inset
//
// Keep it dependency-free so it can run in the native-assets npm script.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const RES = path.join(ROOT, 'android/app/src/main/res');
const CHECK = process.argv.includes('--check');
const DENSITIES = [
  ['ldpi', 36, 81],
  ['mdpi', 48, 108],
  ['hdpi', 72, 162],
  ['xhdpi', 96, 216],
  ['xxhdpi', 144, 324],
  ['xxxhdpi', 192, 432]
];
const LOCALE_QUALIFIERS = ['ar', 'hi', 'kn', 'zh', 'ja'];
const XML = [
  'mipmap-anydpi-v26/ic_launcher.xml',
  'mipmap-anydpi-v26/ic_launcher_round.xml'
];
const CANONICAL = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`;

let failed = false;
function fail(message) {
  failed = true;
  console.error('adaptive icon: ' + message);
}

function pngSize(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.length < 24 || bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a' || bytes.toString('ascii', 12, 16) !== 'IHDR') {
    return null;
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

for (const relative of XML) {
  const file = path.join(RES, relative);
  if (!fs.existsSync(file)) {
    fail(relative + ' is missing');
    continue;
  }
  const xml = fs.readFileSync(file, 'utf8');
  let current = xml;
  if (/<inset\b/.test(xml)) {
    if (CHECK) {
      fail(relative + ' has an <inset> wrapper; run npm run native:assets to repair');
    } else {
      fs.writeFileSync(file, CANONICAL);
      console.warn('adaptive icon: removed the <inset> wrapper from ' + relative);
      current = CANONICAL;
    }
  }
  for (const layer of ['background', 'foreground']) {
    if (!new RegExp('<' + layer + '\\b[^>]*@mipmap/ic_launcher_' + layer + '\\b').test(current)) {
      fail(relative + ' does not reference @mipmap/ic_launcher_' + layer);
    }
  }
}

const colors = path.join(RES, 'values/ic_launcher_background.xml');
if (!fs.existsSync(colors) || !/#1a1918/i.test(fs.readFileSync(colors, 'utf8'))) {
  fail('values/ic_launcher_background.xml must be #1a1918');
}

for (const [density, legacy, foreground] of DENSITIES) {
  const dir = path.join(RES, 'mipmap-' + density);
  for (const [name, size] of [
    ['ic_launcher_background.png', foreground],
    ['ic_launcher_foreground.png', foreground],
    ['ic_launcher.png', legacy],
    ['ic_launcher_round.png', legacy]
  ]) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) {
      fail('mipmap-' + density + '/' + name + ' is missing');
      continue;
    }
    const actual = pngSize(file);
    if (!actual || actual.width !== size || actual.height !== size) {
      fail('mipmap-' + density + '/' + name + ' should be ' + size + 'px square');
    }
  }
}

for (const qualifier of LOCALE_QUALIFIERS) {
  // Only transparent foregrounds may be locale-qualified. Reject a locale
  // full/round PNG, a locale adaptive XML, or any other launcher resource in
  // these directories before it can override the default adaptive icon.
  for (const entry of fs.readdirSync(RES)) {
    if (!entry.startsWith('mipmap-' + qualifier + '-')) continue;
    const dir = path.join(RES, entry);
    if (!fs.statSync(dir).isDirectory()) continue;
    if (entry.endsWith('-anydpi-v26')) {
      fail(entry + ' must not exist; localized launcher art is foreground-only');
      continue;
    }
    for (const name of fs.readdirSync(dir)) {
      if (name === 'ic_launcher_foreground.png') continue;
      if (/^ic_launcher.*\.(png|xml)$/i.test(name)) {
        fail(entry + '/' + name + ' must not exist; only the locale foreground may be localized');
      }
    }
  }

  for (const [density, , foreground] of DENSITIES.filter(([name]) => name !== 'ldpi')) {
    const dir = path.join(RES, 'mipmap-' + qualifier + '-' + density);
    const file = path.join(dir, 'ic_launcher_foreground.png');
    if (!fs.existsSync(file)) {
      fail('mipmap-' + qualifier + '-' + density + '/ic_launcher_foreground.png is missing');
      continue;
    }
    const actual = pngSize(file);
    if (!actual || actual.width !== foreground || actual.height !== foreground) {
      fail('mipmap-' + qualifier + '-' + density + '/ic_launcher_foreground.png should be ' + foreground + 'px square');
    }
  }
}

if (failed) process.exit(1);
console.log('adaptive icon guard: default adaptive XML is inset-free; default layers and 5 locale foreground sets are present; only locale foreground PNGs are localized');
