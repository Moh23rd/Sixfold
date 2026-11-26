#!/usr/bin/env node
/* Fails when shell JavaScript steps past Android WebView 60.

   The API 24 and 26 emulator images do not update their System WebView; the
   smoke measures Chromium 69 on both, which is why those rows stay launch-only.
   The guard still holds JavaScript to Chromium 60 — the older floor the shell
   committed to, so a phone or an image below CI's engine still runs every
   script. A newer syntax form or helper is not a degraded feature there: the
   script that contains it never runs, and a launch-time script takes the whole
   shell with it. This guard keeps that floor in source.

   Syntax: every shell script and inline HTML block parses as ES2018.
   Chromium 60 (V8 6.0) shipped that whole syntax set except async generators
   and `for await`, which arrived in Chromium 63, so those two are rejected
   after parsing. ES2019+ syntax (optional catch binding) and ES2020+ syntax
   (`?.`, `??`, class fields, BigInt, numeric separators, import.meta) are parse
   errors.

   APIs: a curated list of globals and methods that postdate Chromium 60. An
   optional API the shell feature-checks lives in ALLOWED with the reason it is
   safe; an allowance that stops matching is itself an error, so the exemption
   list cannot rot.

   Run `npm run test:webview-floor`. */

import fs from 'node:fs';
import path from 'node:path';

import { parse } from 'acorn';

const ROOT = process.cwd();
const FLOOR = 60;

/* Globals that are absent, not merely inert, on the old engine. A bare
   identifier is a real use; `typeof X` and `window.X` are the two ways the
   shell is allowed to probe for one. */
const GLOBALS = new Map([
  ['globalThis', 71],
  ['structuredClone', 98],
  ['queueMicrotask', 71],
  ['ResizeObserver', 64],
  ['AbortController', 66],
  ['WeakRef', 84],
  ['FinalizationRegistry', 84],
  ['AggregateError', 85]
]);

/* Methods and properties newer than the floor. A dotted key is narrowed to a
   known owner (`Intl.Segmenter`); a bare key is a method whose name is
   specific enough to stand alone (`toggleAttribute`). The value is the first
   Chromium release with the API. */
const MEMBERS = new Map([
  ['Promise.allSettled', 76],
  ['Promise.any', 85],
  ['Promise.withResolvers', 119],
  ['Object.fromEntries', 73],
  ['Object.hasOwn', 93],
  ['Object.groupBy', 117],
  ['Array.fromAsync', 121],
  ['Intl.Segmenter', 87],
  ['Intl.RelativeTimeFormat', 71],
  ['Intl.ListFormat', 72],
  ['Intl.PluralRules', 63],
  ['Intl.DisplayNames', 81],
  ['Intl.Locale', 74],
  ['navigator.clipboard', 66],
  ['finally', 63],
  ['toggleAttribute', 69],
  ['replaceChildren', 86],
  ['inert', 102],
  ['flat', 69],
  ['flatMap', 69],
  ['matchAll', 73],
  ['replaceAll', 85],
  ['trimStart', 66],
  ['trimEnd', 66],
  ['at', 92],
  ['findLast', 97],
  ['findLastIndex', 97],
  ['toSorted', 110],
  ['toReversed', 110],
  ['toSpliced', 110],
  ['asyncIterator', 63],
  ['getAnimations', 84],
  ['checkVisibility', 105],
  ['showPicker', 99],
  ['randomUUID', 92],
  ['canParse', 120],
  ['startViewTransition', 111],
  ['parseHTMLUnsafe', 124],
  ['setHTMLUnsafe', 124]
]);

/* Deliberate, feature-checked uses. Each reason names the fallback that keeps
   the old engine working; an entry here that no longer matches source is
   reported so the list stays honest. */
const ALLOWED = new Map([
  [
    'js/game.js:ResizeObserver',
    'optional: the resize, pageshow, visibility and fullscreen listeners are the fallback'
  ],
  [
    'js/game.js:inert',
    "each write is guarded by `'inert' in element`, so an engine without the property ignores it"
  ],
  ['js/theme.js:inert', "guarded by `'inert' in background`; the property is a no-op where it is missing"],
  [
    'js/sudoku.js:inert',
    "only elements that pass `'inert' in el` are stored, so the release writes touch the same guarded set"
  ],
  [
    'js/wordle.js:inert',
    "only elements that pass `'inert' in el` are stored, so the release writes touch the same guarded set"
  ],
  [
    'js/wordle.js:Intl.Segmenter',
    'guarded by the `Intl.Segmenter` check; the fallback splits the word by code point'
  ],
  [
    'js/wordle.js:navigator.clipboard',
    'guarded by the `navigator.clipboard` check; the share card above is the working path'
  ]
]);

const problems = [];
const allowanceUses = new Set();

function walk(node, parent, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parent);
  for (const key of Object.keys(node)) {
    if (key === 'loc') continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) walk(child, node, visit);
    } else if (value && typeof value.type === 'string') {
      walk(value, node, visit);
    }
  }
}

function report(source, node, message) {
  problems.push({
    file: source.file,
    line: source.baseLine + node.loc.start.line - 1,
    col: node.loc.start.column + 1,
    message
  });
}

function flag(source, node, key, version) {
  const allowance = source.file + ':' + key;
  if (ALLOWED.has(allowance)) {
    allowanceUses.add(allowance);
    return;
  }
  report(
    source,
    node,
    `${key} needs Chromium ${version}; the shell's floor is Chromium ${FLOOR}. ` +
      'Guard it, or add a reasoned allowance to ALLOWED in scripts/check-webview-floor.mjs.'
  );
}

function memberProperty(node) {
  if (!node.computed && node.property.type === 'Identifier') return node.property.name;
  if (node.computed && node.property.type === 'Literal' && typeof node.property.value === 'string') {
    return node.property.value;
  }
  return null;
}

/* A bare global is a use unless it is being probed: `typeof ResizeObserver`, a
   property key, a declaration name, a parameter, or `window.ResizeObserver`. */
function probesGlobal(node, parent) {
  if (!parent) return false;
  if (parent.type === 'UnaryExpression' && parent.operator === 'typeof') return true;
  if (parent.type === 'MemberExpression' && parent.property === node && !parent.computed) return true;
  if (parent.type === 'Property' && parent.key === node && !parent.computed && !parent.shorthand) return true;
  if (parent.type === 'VariableDeclarator' && parent.id === node) return true;
  if (parent.type === 'AssignmentPattern' && parent.left === node) return true;
  return parent.type.indexOf('Function') !== -1 && parent.params.includes(node);
}

const REGEX_FEATURES = [
  { test: (regex) => regex.flags.includes('s'), label: 'the regular expression s flag', version: 62 },
  { test: (regex) => /\(\?<[=!]/.test(regex.pattern), label: 'a regex lookbehind', version: 62 },
  { test: (regex) => /\(\?<(?![=!])/.test(regex.pattern), label: 'a named regex group', version: 64 },
  { test: (regex) => /\\[pP]\{/.test(regex.pattern), label: 'a Unicode property escape', version: 64 },
  { test: (regex) => /\\k</.test(regex.pattern), label: 'a named regex backreference', version: 64 }
];

function inspect(node, parent, source) {
  if (node.type === 'MemberExpression') {
    const property = memberProperty(node);
    const object = node.object.type === 'Identifier' ? node.object.name : '';
    if (property) {
      const qualified = object && object + '.' + property;
      const key = MEMBERS.has(qualified) ? qualified : MEMBERS.has(property) ? property : '';
      if (key) flag(source, node.property, key, MEMBERS.get(key));
    }
  }

  if (node.type === 'Identifier' && GLOBALS.has(node.name) && !probesGlobal(node, parent)) {
    flag(source, node, node.name, GLOBALS.get(node.name));
  }

  if (
    (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') &&
    node.async &&
    node.generator
  ) {
    report(source, node, `async generators need Chromium 63; the shell's floor is Chromium ${FLOOR}.`);
  }

  if (node.type === 'ForOfStatement' && node.await) {
    report(source, node, `\`for await\` needs Chromium 63; the shell's floor is Chromium ${FLOOR}.`);
  }

  // A tagged template with an invalid escape is the ES2018 template revision.
  if (node.type === 'TemplateElement' && node.value.cooked === null) {
    report(source, node, `this tagged-template escape needs Chromium 62; the shell's floor is Chromium ${FLOOR}.`);
  }

  if (node.type === 'Literal' && node.regex) {
    const feature = REGEX_FEATURES.find((candidate) => candidate.test(node.regex));
    if (feature) {
      report(source, node, `${feature.label} needs Chromium ${feature.version}; the shell's floor is Chromium ${FLOOR}.`);
    }
  }
}

function scan(source) {
  let ast;
  try {
    ast = parse(source.text, { ecmaVersion: 2018, sourceType: 'script', locations: true });
  } catch (error) {
    const loc = error.loc || { line: 1, column: 0 };
    const message = String(error.message || error).replace(/\s*\(\d+:\d+\)$/, '');
    problems.push({
      file: source.file,
      line: source.baseLine + loc.line - 1,
      col: loc.column + 1,
      message:
        `the shell must parse as ES2018 for Chromium ${FLOOR}: ${message}. ` +
        'Optional chaining, nullish coalescing, optional catch binding and class fields are all newer.'
    });
    return;
  }
  walk(ast, null, (node, parent) => inspect(node, parent, source));
}

function jsFiles(directory) {
  const full = path.join(ROOT, directory);
  if (!fs.existsSync(full)) return [];
  return fs
    .readdirSync(full)
    .filter((name) => name.endsWith('.js'))
    .sort()
    .map((name) => path.posix.join(directory, name));
}

function inlineScripts(htmlFile, html) {
  const scripts = [];
  const tag = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let match;
  while ((match = tag.exec(html))) {
    const attrs = match[1];
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const type = /\btype\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const kind = type ? type[1].trim().toLowerCase() : '';
    const tagLine = html.slice(0, match.index).split('\n').length;
    if (kind === 'module') {
      problems.push({
        file: htmlFile,
        line: tagLine,
        col: 1,
        message: `a module script needs Chromium 61; the shell's floor is Chromium ${FLOOR}.`
      });
      continue;
    }
    if (kind && kind !== 'text/javascript' && kind !== 'application/javascript') continue;
    const contentStart = match.index + match[0].indexOf('>') + 1;
    scripts.push({
      file: htmlFile,
      baseLine: html.slice(0, contentStart).split('\n').length,
      text: match[2]
    });
  }
  return scripts;
}

const sources = ['sw.js', ...['js', 'i18n', 'wordle-locales'].flatMap(jsFiles)].map((file) => ({
  file,
  baseLine: 1,
  text: fs.readFileSync(path.join(ROOT, file), 'utf8')
}));

for (const htmlFile of fs.readdirSync(ROOT).filter((name) => name.endsWith('.html')).sort()) {
  sources.push(...inlineScripts(htmlFile, fs.readFileSync(path.join(ROOT, htmlFile), 'utf8')));
}

for (const source of sources) scan(source);

for (const allowance of ALLOWED.keys()) {
  if (allowanceUses.has(allowance)) continue;
  const cut = allowance.indexOf(':');
  problems.push({
    file: allowance.slice(0, cut),
    line: 1,
    col: 1,
    message: `the ${allowance.slice(cut + 1)} allowance is no longer used; remove it from ALLOWED in scripts/check-webview-floor.mjs.`
  });
}

problems.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.col - b.col);

for (const problem of problems) {
  console.log(`::error file=${problem.file},line=${problem.line},col=${problem.col}::${problem.message}`);
}

if (problems.length > 0) {
  console.log(`[webview floor] ${problems.length} problem(s); the shell must run on Chromium ${FLOOR}.`);
  process.exitCode = 1;
} else {
  console.log(`[webview floor] ${sources.length} JavaScript sources parse as ES2018 and avoid post-Chromium-${FLOOR} APIs.`);
  for (const [allowance, reason] of ALLOWED) {
    const cut = allowance.indexOf(':');
    console.log(`[webview floor] guarded exception in ${allowance.slice(0, cut)}: ${allowance.slice(cut + 1)} (${reason})`);
  }
}
