#!/usr/bin/env node
import { createHash } from 'node:crypto';
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

// A pin only proves the URL matches; it cannot see content built from a
// different tree at the same version. Hash the files the shell will serve.
function digest(file) {
  return createHash('sha256').update(readFileSync(join(root, file))).digest('hex').slice(0, 16);
}

function compareContent(label, copyRoot, files) {
  const problems = [];
  for (const file of files) {
    const copy = copyRoot + '/' + file;
    if (!existsSync(join(root, copy))) {
      problems.push(label + ' is missing ' + file);
      continue;
    }
    if (digest(copy) !== digest(file)) {
      problems.push(label + ' serves different ' + file + ' content at the same pin');
    }
  }
  return problems;
}

// The worker caches files index.html never pins (the wordle bundle, the icons),
// and the shell has to serve those from the same tree. Read the SHELL list out
// of sw.js as the contract for what the two copies must contain.
function precachedPaths(source) {
  const start = source.indexOf('const SHELL = [');
  const end = source.indexOf('];', start);
  if (start === -1 || end === -1) return [];
  const paths = [];
  for (const match of source.slice(start, end).matchAll(/['"]\.\/([^'"?]+)/g)) {
    if (paths.indexOf(match[1]) === -1) paths.push(match[1]);
  }
  return paths;
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

  const workerSource = read('sw.js');
  const worker = serviceWorkerPins(workerSource);
  const problems = compare('sw.js', source, worker.pins);
  for (const name of new Set(worker.unknown)) {
    problems.push('sw.js precaches with an undefined constant ' + name);
  }

  // index.html's shell, plus everything else the worker caches. index.html
  // itself is excluded: the native shell injects its plugins into it.
  const contents = [...source.keys()];
  for (const file of precachedPaths(workerSource)) {
    if (file === 'index.html' || contents.indexOf(file) !== -1) continue;
    if (!existsSync(join(root, file))) continue;
    contents.push(file);
  }

  const copied = [];
  for (const file of COPIES) {
    if (!existsSync(join(root, file))) {
      if (file === 'native/www/index.html') throw new Error(file + ' is missing; run npm run native:build');
      console.log('[native pins] ' + file + ' is not built yet; skipped');
      continue;
    }
    problems.push(...compare(file, source, shellPins(read(file))));
    problems.push(...compareContent(file, file.replace(/index\.html$/, ''), contents));
    copied.push(file);
  }

  if (problems.length > 0) {
    for (const problem of problems) console.log('::error title=Stale native pin::' + problem);
    console.log('[native pins] ' + problems.length + ' stale pin(s). Rebuild the shell before packaging it.');
    process.exitCode = 1;
    return;
  }

  console.log(
    '[native pins] ' + source.size + ' pins agree across index.html, sw.js, ' +
    (copied.length > 0 ? copied.join(' and ') : 'no copies') + '; ' + contents.length +
    ' precached files match byte for byte.'
  );
}

try {
  main();
} catch (error) {
  console.log('::error title=Native pin check::' + error.message);
  process.exitCode = 1;
}
