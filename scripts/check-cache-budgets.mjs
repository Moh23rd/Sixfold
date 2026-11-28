#!/usr/bin/env node
// The per-locale footprint check catches total growth. This guard also names
// the class of asset that grew, so a large icon or font cannot consume room a
// script bundle needs while the locale total still looks healthy.
//
// It reads the raw SHELL list from sw.js, measures the files in the source
// tree, and reports the largest files in each class. The budgets are deliberately
// tight enough to notice an icon-sized regression and loose enough to allow
// ordinary copy and code changes.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const KIB = 1024;
const TOTAL_BUDGET = 1600 * KIB;
const CLASS_BUDGETS = {
  documents: 208 * KIB,
  css: 360 * KIB,
  js: 640 * KIB,
  i18n: 100 * KIB,
  // 88 KiB: the launcher mark is gradient artwork (a lit plate with six tiles
  // and a ring), not the flat two-colour numeral it replaced, so the PNG and
  // WebP sizes roughly doubled. The class is the favicon, the touch icon and
  // the boot mark; the large install art stays out of the shell.
  icons: 88 * KIB,
  fonts: 160 * KIB
};

const ORDER = ['documents', 'css', 'js', 'i18n', 'icons', 'fonts'];

function usage() {
  console.error('Usage: node scripts/check-cache-budgets.mjs [--json]');
  process.exit(2);
}

const args = new Set(process.argv.slice(2));
for (const arg of args) {
  if (arg !== '--json') usage();
}

function fail(message) {
  console.error('cache budgets: ' + message);
  process.exitCode = 1;
}

function shellPaths() {
  const source = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const match = source.match(/const SHELL = \[([\s\S]*?)\n\];/);
  if (!match) {
    fail('could not find the SHELL list in sw.js');
    return [];
  }

  const paths = [];
  for (const line of match[1].split('\n')) {
    const literal = line.match(/^\s*['"]([^'"]+)['"]\s*,?/);
    if (!literal) continue;
    const value = literal[1].split('?')[0].replace(/^\.\//, '');
    if (value && value !== '.') paths.push(value);
  }
  if (paths.length === 0) fail('the SHELL list parsed to no files');
  return paths;
}

function classify(file) {
  if (file.startsWith('icons/')) return 'icons';
  if (file.startsWith('fonts/')) return 'fonts';
  if (file.startsWith('css/')) return 'css';
  if (file.startsWith('js/')) return 'js';
  if (file.startsWith('i18n/')) return 'i18n';
  return 'documents';
}

function kib(bytes) {
  return (bytes / KIB).toFixed(1);
}

const seen = new Set();
const rows = new Map(ORDER.map((name) => [name, { name, files: [], bytes: 0 }]));
let total = 0;

for (const file of shellPaths()) {
  if (seen.has(file)) {
    fail(file + ' appears in SHELL more than once');
    continue;
  }
  seen.add(file);

  const full = path.join(ROOT, file);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
    fail(file + ' is listed in SHELL but is missing from the source tree');
    continue;
  }

  const bytes = fs.statSync(full).size;
  const row = rows.get(classify(file));
  row.files.push({ path: file, bytes });
  row.bytes += bytes;
  total += bytes;
}

for (const row of rows.values()) {
  row.files.sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path));
  row.budget = CLASS_BUDGETS[row.name];
  row.failed = row.bytes > row.budget;
}

const overTotal = total > TOTAL_BUDGET;
const failures = [...rows.values()].filter((row) => row.failed);
if (overTotal) failures.push({ name: 'TOTAL', bytes: total, budget: TOTAL_BUDGET });

const report = {
  total: { bytes: total, budget: TOTAL_BUDGET, failed: overTotal },
  classes: ORDER.map((name) => {
    const row = rows.get(name);
    return {
      name: row.name,
      bytes: row.bytes,
      budget: row.budget,
      entries: row.files.length,
      failed: row.failed,
      largest: row.files.slice(0, 5)
    };
  })
};

if (args.has('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('[cache budgets] raw shell: ' + kib(total) + ' KiB / ' + kib(TOTAL_BUDGET) + ' KiB');
  console.log('Class       Entries       Used     Budget   Headroom   Result');
  for (const row of report.classes) {
    const headroom = row.budget - row.bytes;
    console.log(
      row.name.padEnd(11) +
        String(row.entries).padStart(7) +
        (kib(row.bytes) + ' KiB').padStart(12) +
        (kib(row.budget) + ' KiB').padStart(11) +
        ((headroom >= 0 ? '' : '-') + kib(Math.abs(headroom)) + ' KiB').padStart(11) +
        '   ' + (row.failed ? 'FAIL' : 'ok')
    );
  }
  console.log('');
  for (const row of report.classes) {
    if (row.largest.length === 0) continue;
    console.log('Largest ' + row.name + ' files:');
    for (const file of row.largest) {
      console.log('  ' + kib(file.bytes).padStart(7) + ' KiB  ' + file.path);
    }
  }

  if (failures.length > 0) {
    console.log('');
    for (const row of failures) {
      const what = row.name === 'TOTAL' ? 'the shell' : row.name;
      console.log(
        '::error title=Cache asset budget (' + row.name + ')::' +
          what + ' uses ' + kib(row.bytes) + ' KiB, above the ' + kib(row.budget) + ' KiB budget.'
      );
    }
  } else {
    console.log('');
    console.log('[cache budgets] every asset class is within its budget.');
  }

  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    const lines = [
      '## Shell asset budgets',
      '',
      'Raw bytes from the worker shell: **' + kib(total) + ' KiB** / **' + kib(TOTAL_BUDGET) + ' KiB**.',
      '',
      '| Class | Entries | Used | Budget | Result |',
      '| --- | ---: | ---: | ---: | --- |'
    ];
    for (const row of report.classes) {
      lines.push(
        '| ' + row.name + ' | ' + row.entries + ' | ' + kib(row.bytes) + ' KiB | ' +
          kib(row.budget) + ' KiB | ' + (row.failed ? '**FAIL**' : 'OK') + ' |'
      );
    }
    fs.appendFileSync(summary, lines.join('\n') + '\n');
  }
}

if (failures.length > 0) process.exitCode = 1;
