#!/usr/bin/env node
// capacitor-assets wraps the adaptive-icon layers in a 16.7% <inset> on every
// run, which shrinks the art inside the launcher mask. This guard runs after
// the generator: it rewrites the default adaptive XML back to the canonical
// full-bleed layers and verifies the default PNGs at the expected sizes.
//
// The launcher icon is static. A locale-qualified mipmap directory would let
// Android replace the icon from the device language, so the guard rejects any
// mipmap directory other than the default density buckets and anydpi-v26.
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
const DEFAULT_QUALIFIERS = new Set([
  'anydpi-v26',
  'ldpi',
  'mdpi',
  'hdpi',
  'xhdpi',
  'xxhdpi',
  'xxxhdpi'
]);
const XML = [
  'mipmap-anydpi-v26/ic_launcher.xml',
  'mipmap-anydpi-v26/ic_launcher_round.xml'
];
const CANONICAL = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />
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
  for (const layer of ['background', 'foreground', 'monochrome']) {
    if (!new RegExp('<' + layer + '\\b[^>]*@mipmap/ic_launcher_' + layer + '\\b').test(current)) {
      fail(relative + ' does not reference @mipmap/ic_launcher_' + layer);
    }
  }
}

// The plate is the adaptive background now, and the cream six is the
// foreground inside the safe zone. The light page cream here made the dark
// rounded plate float in a ring; the mark's own ink is the surface the numeral
// is designed against.
const colors = path.join(RES, 'values/ic_launcher_background.xml');
if (!fs.existsSync(colors) || !/#3b3833/i.test(fs.readFileSync(colors, 'utf8'))) {
  fail('values/ic_launcher_background.xml must be #3b3833');
}

for (const [density, legacy, foreground] of DENSITIES) {
  const dir = path.join(RES, 'mipmap-' + density);
  for (const [name, size] of [
    ['ic_launcher_background.png', foreground],
    ['ic_launcher_foreground.png', foreground],
    ['ic_launcher_monochrome.png', foreground],
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

for (const entry of fs.readdirSync(RES)) {
  if (!entry.startsWith('mipmap-')) continue;
  const qualifier = entry.slice('mipmap-'.length);
  if (!DEFAULT_QUALIFIERS.has(qualifier)) {
    fail(entry + ' is locale-qualified; the launcher icon is static');
  }
}

// The launch theme must use the 288dp splash icon, not the 108dp adaptive
// layers. Android draws windowSplashScreenAnimatedIcon at 288dp and masks the
// inner 192dp, so the adaptive layer would be upscaled 2.67x on every screen.
// The icon files themselves are covered by the static-icon snapshots.
const styles = path.join(RES, 'values/styles.xml');
const launchIcon = fs.existsSync(styles)
  ? fs.readFileSync(styles, 'utf8').match(/windowSplashScreenAnimatedIcon">([^<]+)</)
  : null;
if (!launchIcon || launchIcon[1].trim() !== '@drawable/splash_icon') {
  fail('values/styles.xml must point windowSplashScreenAnimatedIcon at @drawable/splash_icon');
}

if (failed) process.exit(1);
console.log('adaptive icon guard: default adaptive XML is inset-free; default layers (including monochrome) are present; no locale-qualified launcher resources');
