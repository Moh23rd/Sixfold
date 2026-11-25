#!/usr/bin/env node
// The icon pipeline uses Pillow for generation; CI can verify the checked-in
// bytes without installing Pillow. This guard makes the snapshot file the
// contract: every output must still match its recorded hash, and the source
// master must be the one that produced it.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SNAPSHOTS = path.join(ROOT, 'assets/icon-snapshots.json');
const SOURCE = path.join(ROOT, 'assets/icon.png');

function digest(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

if (!fs.existsSync(SNAPSHOTS)) {
  console.log('::error title=Icon snapshots::assets/icon-snapshots.json is missing; run npm run assets:icons');
  process.exitCode = 1;
} else {
  const snapshots = JSON.parse(fs.readFileSync(SNAPSHOTS, 'utf8'));
  const problems = [];
  if (snapshots.source !== 'assets/icon.png') {
    problems.push('the snapshot source is not assets/icon.png');
  }
  if (!fs.existsSync(SOURCE) || snapshots.sourceSha256 !== digest(SOURCE)) {
    problems.push('assets/icon.png does not match the snapshot source hash');
  }

  // Five layers feed the launcher now: the rounded icon, the maskable square,
  // the adaptive background, the adaptive foreground and the themed monochrome
  // foreground. Verify each one so a change to a layer cannot silently leave
  // the generated sizes stale.
  const sources = snapshots.sources && typeof snapshots.sources === 'object' ? snapshots.sources : {};
  const sourcePaths = Object.keys(sources);
  if (sourcePaths.length !== 5) {
    problems.push('the snapshot must record all five icon sources');
  }
  for (const relative of sourcePaths) {
    if (!relative.startsWith('assets/')) {
      problems.push(relative + ' is not an asset source');
      continue;
    }
    const file = path.join(ROOT, relative);
    if (!fs.existsSync(file)) {
      problems.push(relative + ' is missing');
    } else if (!/^[0-9a-f]{64}$/.test(sources[relative]) || digest(file) !== sources[relative]) {
      problems.push(relative + ' does not match its snapshot');
    }
  }
  if (sources['assets/icon.png'] && sources['assets/icon.png'] !== snapshots.sourceSha256) {
    problems.push('the rounded source and sourceSha256 disagree');
  }

  const files = Array.isArray(snapshots.files) ? snapshots.files : [];
  const seen = new Set();
  for (const entry of files) {
    if (!entry || typeof entry.path !== 'string' || !entry.path.startsWith('icons/') &&
        !entry.path.startsWith('android/app/src/main/res/')) {
      problems.push('the snapshot contains an invalid output path');
      continue;
    }
    if (seen.has(entry.path)) problems.push(entry.path + ' appears twice in the snapshots');
    seen.add(entry.path);
    const file = path.join(ROOT, entry.path);
    if (!fs.existsSync(file)) {
      problems.push(entry.path + ' is missing'); 
      continue;
    }
    if (!/^[0-9a-f]{64}$/.test(entry.sha256) || digest(file) !== entry.sha256) {
      problems.push(entry.path + ' does not match its snapshot');
    }
    if (fs.statSync(file).size !== entry.bytes) {
      problems.push(entry.path + ' has a stale byte size');
    }
    if (entry.path.includes('-ar') || entry.path.includes('-hi') || entry.path.includes('-kn') || entry.path.includes('-han')) {
      problems.push(entry.path + ' is a localized icon; the launcher is static');
    }
  }

  if (files.length === 0) problems.push('the snapshot contains no outputs');
  if (problems.length > 0) {
    for (const problem of problems) console.log('::error title=Icon snapshots::' + problem);
    console.log('[static icons] ' + problems.length + ' snapshot problem(s); run npm run assets:icons.');
    process.exitCode = 1;
  } else {
    console.log('[static icons] ' + files.length + ' static icon files match assets/icon.png snapshots.');
  }
}
