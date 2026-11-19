#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The native shells are copies of the web build, so their script and stylesheet
// pins can drift from index.html and sw.js without any visible symptom: the
// APK keeps running the bundle it was built with. Compare the pins instead of
// trusting the copy. Run after `cap sync`, which is what writes the android
// asset copy.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const ASSET = /["'](?:\.\/)?((?:css|js|i18n|fonts)\/[^"'?]+)\?v=([^"']+)["']/g;
const SHELL_LINE = /['"]\.\/((?:css|js|i18n|fonts)\/[^'?]+)\?v=([^'"]*)['"]\s*(?:\+\s*([A-Z0-9_]+))?/;
const CONSTANT = /(?:^|\n)const ([A-Z0-9_]+) = '([^']*)';/g;

const COPIES = [
  'native/www/index.html',
  'android/app/src/main/assets/public/index.html'
];

function read(file) {
  const path = join(root, file);
  if (!existsSync(path)) {
    throw new Error('could not read ' + file + '; run npm run native:build first');
  }
  return readFileSync(path, 'utf8');
}

// index.html carries the version on the URL itself.
function shellPins(source) {
  const pins = new Map();
  for (const match of source.matchAll(ASSET)) pins.set(match[1], match[2]);
  return pins;
}

// sw.js keeps the versions in constants (sometimes literal) and appends them to
// the cached URL, so resolve each precached path back to its version.
function serviceWorkerPins(source) {
  const constants = new Map();
  for (const match of source.matchAll(CONSTANT)) constants.set(match[1], match[2]);

  const pins = new Map();
  const unknown = [];
  for (const line of source.split('\n')) {
    const match = line.match(SHELL_LINE);
    if (!match) continue;
    if (match[3]) {
      if (!constants.has(match[3])) unknown.push(match[3]);
      else pins.set(match[1], constants.get(match[3]));
      continue;
    }
    pins.set(match[1], match[2]);
  }
  return { pins, unknown };
}

function compare(label, expected, actual) {
  const problems = [];
  for (const [file, version] of expected) {
    const pinned = actual.get(file);
    if (pinned === undefined) problems.push(label + ' does not pin ' + file);
    else if (pinned !== version) {
      problems.push(label + ' pins ' + file + ' at ' + pinned + ' but index.html pins ' + version);
    }
  }
  return problems;
}

function main() {
  const source = shellPins(read('index.html'));
  if (source.size === 0) throw new Error('no versioned assets found in index.html');

  const worker = serviceWorkerPins(read('sw.js'));
  const problems = compare('sw.js', source, worker.pins);
  for (const name of new Set(worker.unknown)) {
    problems.push('sw.js precaches with an undefined constant ' + name);
  }

  const copied = [];
  for (const file of COPIES) {
    if (!existsSync(join(root, file))) {
      if (file === 'native/www/index.html') throw new Error(file + ' is missing; run npm run native:build');
      console.log('[native pins] ' + file + ' is not built yet; skipped');
      continue;
    }
    problems.push(...compare(file, source, shellPins(read(file))));
    copied.push(file);
  }

  if (problems.length > 0) {
    for (const problem of problems) console.log('::error title=Stale native pin::' + problem);
    console.log('[native pins] ' + problems.length + ' stale pin(s). Rebuild the shell before packaging it.');
    process.exitCode = 1;
    return;
  }

  console.log(
    '[native pins] ' + source.size + ' assets agree across index.html, sw.js, ' +
    (copied.length > 0 ? copied.join(' and ') : 'no copies') + '.'
  );
}

try {
  main();
} catch (error) {
  console.log('::error title=Native pin check::' + error.message);
  process.exitCode = 1;
}
