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

// A list this guard cannot read is an error, never an empty result: falling
// back to '' used to turn a rename or a reformat into a green run over fewer
// files than the shell serves. The bracket is passed in, so a stray one in a
// comment cannot pick the wrong literal.
function block(source, name, bracket) {
  const start = source.indexOf('const ' + name + ' =');
  const found = start === -1 ? -1 : source.slice(start).indexOf(bracket);
  if (found === -1) throw new Error('could not find the ' + name + ' list in sw.js');
  const from = start + found;
  const close = source.indexOf(bracket === '[' ? '];' : '};', from);
  if (close === -1) throw new Error('the ' + name + ' list in sw.js is not closed');
  return source.slice(from, close);
}

// One list, read as paths; a parse to nothing is the silent-coverage bug this
// guard exists to prevent.
function list(source, name, bracket, read) {
  const paths = read(block(source, name, bracket));
  if (paths.length === 0) throw new Error('the ' + name + ' list in sw.js parsed to no paths');
  return paths;
}

// The worker caches files index.html never pins, so the SHELL list is the
// contract for what the copies must contain. Every quoted literal there is a
// cached path: './' is convention and ?v= is stripped, so an entry written
// either way is still covered. The scope root ('./') is a directory, not a file.
function precachedPaths(body) {
  return [...body.matchAll(/['"]([^'"]+)['"]/g)]
    .map((match) => match[1].split('?')[0].replace(/^\.\//, ''))
    .filter(Boolean);
}

// Catalogs and word packs are built from objects, so their URLs never appear
// as literals; script faces are listed as arrays of file names, one per locale.
function objectPaths(body, dir) {
  return [...body.matchAll(/:\s*'([^']+)'/g)].map((match) => dir + match[1]);
}

function fontPaths(body) {
  return [...body.matchAll(/'([^']+\.woff2)'/g)].map((match) => 'fonts/' + match[1]);
}

// Every file the shell must serve identically to the source tree. index.html is
// excluded: the native shell injects its plugins into it. A listed path with no
// file behind it is reported, not skipped: it means the reader missed a rename
// and the copies would go unchecked.
function shellFiles(source) {
  const files = new Set();
  const missing = new Set();
  const add = (file) => {
    if (file === 'index.html') return;
    (existsSync(join(root, file)) ? files : missing).add(file);
  };
  for (const file of list(source, 'SHELL', '[', precachedPaths)) add(file);
  for (const file of list(source, 'LOCALE_CATALOG', '{', (body) => objectPaths(body, 'i18n/'))) add(file);
  for (const file of list(source, 'WORDLE_PACK', '{', (body) => objectPaths(body, 'wordle-locales/'))) add(file);
  for (const file of list(source, 'SCRIPT_FONTS', '{', fontPaths)) add(file);
  return { files: [...files], missing: [...missing] };
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

  const shell = shellFiles(workerSource);
  for (const file of shell.missing) {
    problems.push('sw.js lists ' + file + ', which the source tree does not have');
  }

  const contents = new Set([...source.keys(), ...shell.files]);

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
    for (const problem of problems) console.log('::error title=Native shell out of date::' + problem);
    console.log('[native pins] ' + problems.length + ' problem(s). Rebuild the shell before packaging it.');
    process.exitCode = 1;
    return;
  }

  console.log(
    '[native pins] ' + source.size + ' pins agree across index.html, sw.js, ' +
    (copied.length > 0 ? copied.join(' and ') : 'no copies') + '; ' + contents.size +
    ' shell files match byte for byte.'
  );
}

try {
  main();
} catch (error) {
  console.log('::error title=Native pin check::' + error.message);
  process.exitCode = 1;
}
