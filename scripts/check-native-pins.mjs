#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The native shells are copies of the web build, so they can drift from
// index.html and sw.js without any visible symptom: the APK keeps running the
// bundle it was built with. Compare the pins, then the bytes of every file the
// shell serves. Run after `cap sync`, which is what writes the android copy.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// One path pattern for both pin readers, so a new pinned directory only has to
// be named here. Icons and word packs carry no ?v= pin: they are checked for
// content instead.
const ASSET_PATH = '((?:css|js|i18n|fonts)/[^"\'?]+)';
const INDEX_PIN = new RegExp('["\'](?:\\./)?' + ASSET_PATH + '\\?v=([^"\']+)["\']', 'g');
const SHELL_PIN = new RegExp(
  '["\']\\./' + ASSET_PATH + '\\?v=([^"\']*)["\'](?:\\s*\\+\\s*([A-Z0-9_]+))?'
);
const CONSTANT = /(?:^|\n)const ([A-Z0-9_]+) = '([^']*)';/g;

const COPIES = [
  { file: 'native/www/index.html', dir: 'native/www/' },
  {
    file: 'android/app/src/main/assets/public/index.html',
    dir: 'android/app/src/main/assets/public/'
  }
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

function compareContent(label, copyDir, files) {
  const problems = [];
  for (const file of files) {
    const copy = copyDir + file;
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

// index.html carries the version on the URL itself.
function shellPins(source) {
  const pins = new Map();
  for (const match of source.matchAll(INDEX_PIN)) pins.set(match[1], match[2]);
  return pins;
}

// sw.js keeps the versions in constants (sometimes a literal) and appends them
// to the cached URL. An entry whose constant is missing is reported once, by
// path, rather than also as a pin that is absent.
function serviceWorkerPins(source) {
  const constants = new Map();
  for (const match of source.matchAll(CONSTANT)) constants.set(match[1], match[2]);

  const pins = new Map();
  const unresolved = new Map();
  for (const line of source.split('\n')) {
    const match = line.match(SHELL_PIN);
    if (!match) continue;
    if (!match[3]) {
      pins.set(match[1], match[2]);
      continue;
    }
    if (constants.has(match[3])) pins.set(match[1], constants.get(match[3]));
    else unresolved.set(match[1], match[3]);
  }
  return { pins, unresolved };
}

function block(source, name) {
  const start = source.indexOf('const ' + name + ' =');
  if (start === -1) return '';
  const open = source.slice(start).match(/[[{]/);
  if (!open) return '';
  const from = start + open.index;
  const close = source.indexOf(source[from] === '[' ? '];' : '};', from);
  return close === -1 ? '' : source.slice(from, close);
}

// The worker caches files index.html never pins, so the SHELL list is the
// contract for what the copies must contain.
function precachedPaths(source) {
  return [...block(source, 'SHELL').matchAll(/['"]\.\/([^'"?]+)/g)].map((match) => match[1]);
}

// Catalogs and word packs are built from objects, so their URLs never appear
// as literals.
function objectPaths(source, name, dir) {
  return [...block(source, name).matchAll(/:\s*'([^']+)'/g)].map((match) => dir + match[1]);
}

// Every file the shell must serve identically to the source tree. index.html is
// excluded: the native shell injects its plugins into it.
function shellFiles(source) {
  const files = [];
  const add = (file) => {
    if (file === 'index.html') return;
    if (files.indexOf(file) !== -1 || !existsSync(join(root, file))) return;
    files.push(file);
  };
  for (const file of precachedPaths(source)) add(file);
  for (const file of objectPaths(source, 'LOCALE_CATALOG', 'i18n/')) add(file);
  for (const file of objectPaths(source, 'WORDLE_PACK', 'wordle-locales/')) add(file);
  return files;
}

function compare(label, expected, actual, unresolved = new Map()) {
  const problems = [];
  for (const [file, version] of expected) {
    if (unresolved.has(file)) continue;
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
  const problems = compare('sw.js', source, worker.pins, worker.unresolved);
  for (const [file, name] of worker.unresolved) {
    problems.push('sw.js precaches ' + file + ' with an undefined constant ' + name);
  }

  const contents = [...source.keys()];
  for (const file of shellFiles(workerSource)) {
    if (contents.indexOf(file) === -1) contents.push(file);
  }

  const copied = [];
  for (const copy of COPIES) {
    if (!existsSync(join(root, copy.file))) {
      if (copy === COPIES[0]) throw new Error(copy.file + ' is missing; run npm run native:build');
      console.log('[native pins] ' + copy.file + ' is not built yet; skipped');
      continue;
    }
    problems.push(...compare(copy.file, source, shellPins(read(copy.file))));
    problems.push(...compareContent(copy.file, copy.dir, contents));
    copied.push(copy.file);
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
    ' shell files match byte for byte.'
  );
}

try {
  main();
} catch (error) {
  console.log('::error title=Native pin check::' + error.message);
  process.exitCode = 1;
}
