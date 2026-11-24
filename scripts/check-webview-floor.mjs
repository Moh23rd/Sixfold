#!/usr/bin/env node
/* Fails when shell JavaScript steps past Android WebView 60.

   The API 24 and 26 emulator images do not update their System WebView, and the
   API 26 image is the Chromium 60-era engine the launch-only row exists for. A
   newer syntax form or helper is not a degraded feature there: the script that
   contains it never runs, and a launch-time script takes the whole shell with
   it. This guard keeps that floor in source.

   Syntax: every shell script and inline `index.html` block parses as ES2018.
   Chromium 60 (V8 6.0) shipped that whole syntax set except async generators
   and `for await`, which arrived in Chromium 63, so those two are rejected
   after parsing. ES2019+ syntax (optional catch binding) and ES2020+ syntax
   (`?.`, `??`, class fields, BigInt, numeric separators, import.meta) are parse
   errors.

   APIs: a curated list of globals and methods that postdate Chromium 60.
   Optional APIs the shell feature-checks live in ALLOWED with the reason they
   are safe; an allowance that stops matching is itself an error, so the
   exemption list cannot rot.

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

/* Methods and properties newer than the floor. `object` narrows an entry to a
   known owner (`Intl.Segmenter`); entries without one are methods whose name is
   specific enough to stand alone (`toggleAttribute`). Versions are the first
   Chromium release with the API. */
const MEMBERS = [
  { object: 'Promise', property: 'allSettled', version: 76 },
  { object: 'Promise', property: 'any', version: 85 },
  { object: 'Promise', property: 'withResolvers', version: 119 },
  { object: 'Object', property: 'fromEntries', version: 73 },
  { object: 'Object', property: 'hasOwn', version: 93 },
  { object: 'Object', property: 'groupBy', version: 117 },
  { object: 'Array', property: 'fromAsync', version: 121 },
  { object: 'Intl', property: 'Segmenter', version: 87 },
  { object: 'Intl', property: 'RelativeTimeFormat', version: 71 },
  { object: 'Intl', property: 'ListFormat', version: 72 },
  { object: 'Intl', property: 'PluralRules', version: 63 },
  { object: 'Intl', property: 'DisplayNames', version: 81 },
  { object: 'Intl', property: 'Locale', version: 74 },
  { object: 'navigator', property: 'clipboard', version: 66 },
  { property: 'finally', version: 63 },
  { property: 'toggleAttribute', version: 69 },
  { property: 'replaceChildren', version: 86 },
  { property: 'inert', version: 102 },
  { property: 'flat', version: 69 },
  { property: 'flatMap', version: 69 },
  { property: 'matchAll', version: 73 },
  { property: 'replaceAll', version: 85 },
  { property: 'trimStart', version: 66 },
  { property: 'trimEnd', version: 66 },
  { property: 'at', version: 92 },
  { property: 'findLast', version: 97 },
  { property: 'findLastIndex', version: 97 },
  { property: 'toSorted', version: 110 },
  { property: 'toReversed', version: 110 },
  { property: 'toSpliced', version: 110 },
  { property: 'asyncIterator', version: 63 },
  { property: 'getAnimations', version: 84 },
  { property: 'checkVisibility', version: 105 },
  { property: 'showPicker', version: 99 },
  { property: 'randomUUID', version: 92 },
  { property: 'canParse', version: 120 },
  { property: 'startViewTransition', version: 111 },
  { property: 'parseHTMLUnsafe', version: 124 },
  { property: 'setHTMLUnsafe', version: 124 }
];

/* Deliberate, feature-checked uses. Each reason names the fallback that keeps
   the old engine working; an entry here that no longer matches source is
   reported so the list stays honest. */
const ALLOWED = new Map([
  [
    'js/game.js',
    new Map([
      ['ResizeObserver', 'optional: the resize, pageshow, visibility and fullscreen listeners are the fallback'],
      ['inert', "each write is guarded by `'inert' in element`, so an engine without the property ignores it"]
    ])
  ],
  [
    'js/theme.js',
    new Map([
      ['inert', "guarded by `'inert' in background`; the property is a no-op where it is missing"]
    ])
  ],
  [
    'js/wordle.js',
    new Map([
      ['Intl.Segmenter', 'guarded by the `Intl.Segmenter` check; the fallback splits the word by code point'],
      ['navigator.clipboard', 'guarded by the `navigator.clipboard` check; the share card above is the working path']
    ])
  ]
]);

const QUALIFIED = new Map();
const ANY_OBJECT = new Map();
for (const entry of MEMBERS) {
  if (entry.object) QUALIFIED.set(entry.object + '.' + entry.property, entry);
  else ANY_OBJECT.set(entry.property, entry);
}

const problems = [];
const allowanceUses = new Map();

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
  const allowed = ALLOWED.get(source.file);
  if (allowed && allowed.has(key)) {
    if (!allowanceUses.has(source.file)) allowanceUses.set(source.file, new Set());
    allowanceUses.get(source.file).add(key);
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
   property key, a declaration name, or `window.ResizeObserver`. */
function probesGlobal(node, parent) {
  if (!parent) return false;
  if (parent.type === 'UnaryExpression' && parent.operator === 'typeof') return true;
  if (parent.type === 'MemberExpression' && parent.property === node && !parent.computed) return true;
  if (parent.type === 'Property' && parent.key === node && !parent.computed && !parent.shorthand) return true;
  if (parent.type === 'VariableDeclarator' && parent.id === node) return true;
  if (parent.type === 'AssignmentPattern' && parent.left === node) return true;
  if (
    (parent.type === 'FunctionDeclaration' || parent.type === 'FunctionExpression' || parent.type === 'ArrowFunctionExpression') &&
    parent.params.includes(node)
  ) {
    return true;
  }
  return false;
}

const REGEX_FEATURES = [
  { needs: (regex) => regex.flags.includes('s'), label: 'the regular expression s flag', version: 62 },
  { needs: (regex) => /\(\?<[=!]/.test(regex.pattern), label: 'a regex lookbehind', version: 62 },
  { needs: (regex) => /\(\?<(?![=!])/.test(regex.pattern), label: 'a named regex group', version: 64 },
  { needs: (regex) => /\\[pP]\{/.test(regex.pattern), label: 'a Unicode property escape', version: 64 },
  { needs: (regex) => /\\k</.test(regex.pattern), label: 'a named regex backreference', version: 64 }
];

function inspect(node, parent, source) {
  if (node.type === 'MemberExpression') {
    const property = memberProperty(node);
    if (property) {
      const objectName = node.object.type === 'Identifier' ? node.object.name : '';
      const entry = (objectName && QUALIFIED.get(objectName + '.' + property)) || ANY_OBJECT.get(property);
      if (entry) {
        const key = entry.object ? entry.object + '.' + entry.property : entry.property;
        flag(source, node.property, key, entry.version);
      }
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
    const feature = REGEX_FEATURES.find((candidate) => candidate.needs(node.regex));
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
  let index = 0;
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
    index += 1;
    const contentStart = match.index + match[0].indexOf('>') + 1;
    scripts.push({
      file: htmlFile,
      label: `${htmlFile} inline script ${index}`,
      baseLine: html.slice(0, contentStart).split('\n').length,
      text: match[2]
    });
  }
  return scripts;
}

function sources() {
  const list = [];
  for (const file of ['sw.js', ...jsFiles('js'), ...jsFiles('i18n'), ...jsFiles('wordle-locales')]) {
    list.push({ file, label: file, baseLine: 1, text: fs.readFileSync(path.join(ROOT, file), 'utf8') });
  }
  const htmlFile = 'index.html';
  if (fs.existsSync(path.join(ROOT, htmlFile))) {
    list.push(...inlineScripts(htmlFile, fs.readFileSync(path.join(ROOT, htmlFile), 'utf8')));
  }
  return list;
}

const scanned = sources();
for (const source of scanned) scan(source);

for (const [file, allowed] of ALLOWED) {
  for (const key of allowed.keys()) {
    const used = allowanceUses.get(file);
    if (!used || !used.has(key)) {
      problems.push({
        file,
        line: 1,
        col: 1,
        message: `the ${key} allowance is no longer used; remove it from ALLOWED in scripts/check-webview-floor.mjs.`
      });
    }
  }
}

problems.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.col - b.col);

for (const problem of problems) {
  console.log(`::error file=${problem.file},line=${problem.line},col=${problem.col}::${problem.message}`);
}

if (problems.length > 0) {
  console.log(`[webview floor] ${problems.length} problem(s); the shell must run on Chromium ${FLOOR}.`);
  process.exitCode = 1;
} else {
  console.log(`[webview floor] ${scanned.length} JavaScript sources parse as ES2018 and avoid post-Chromium-${FLOOR} APIs.`);
  for (const [file, allowed] of ALLOWED) {
    for (const [key, reason] of allowed) {
      console.log(`[webview floor] guarded exception in ${file}: ${key} (${reason})`);
    }
  }
}
