#!/usr/bin/env node
/* Fails when a native plugin call can start from a page that is unloading.

   Capacitor answers a plugin call through WebView's own message listener, and
   the reply is posted back to the page that made the call. Once the document is
   being replaced, that page is going away, and on Android 13 with WebView 109
   the reply landed on a JNI peer the WebView had already released: the app took
   a SIGSEGV inside the WebView's UI thread (the CI tombstone for the legal-page
   return is `JavaScriptReplyProxy.postMessage` under its looper). The shell
   therefore has one rule — no bridge call from a `pagehide`, `unload` or
   `beforeunload` handler. The motor stops on the next screen's own first move,
   and turning haptics off still cancels it on the spot, so nothing is lost.

   The check is static on purpose: it costs a parse, needs no emulator, and tells
   the author which handler and which call would have crossed the boundary. It
   resolves a call through a local alias of the Capacitor proxy (`var plugins =
   cap.Plugins`), which is how the shell reaches the bridge today.

     node scripts/check-unload-bridge.mjs            # the shell's js/ tree
     node scripts/check-unload-bridge.mjs dir file    # explicit paths (fixtures)

   A handler that passes its callback as a value the checker cannot resolve is
   skipped rather than guessed at; keep unload handlers in the file they are
   written in. `/* unload-bridge: allow *\/` on the line opts one call out. */

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const acorn = require('acorn');

const ROOT = process.cwd();
const UNLOAD_EVENTS = new Set(['pagehide', 'unload', 'beforeunload']);
const ALLOW = /unload-bridge:\s*allow/;

function jsFiles(target) {
  const full = path.resolve(ROOT, target);
  if (!fs.existsSync(full)) {
    console.error(`::error::${target} does not exist`);
    process.exit(1);
  }
  if (fs.statSync(full).isFile()) return full.endsWith('.js') ? [full] : [];
  return fs
    .readdirSync(full, { withFileTypes: true })
    .flatMap((entry) => {
      const child = path.join(full, entry.name);
      if (entry.isDirectory()) return jsFiles(path.relative(ROOT, child));
      return entry.isFile() && entry.name.endsWith('.js') ? [child] : [];
    })
    .sort();
}

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) if (item && typeof item.type === 'string') walk(item, visit);
    } else if (value && typeof value.type === 'string') {
      walk(value, visit);
    }
  }
}

function chainOf(node, source) {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && !node.computed) {
    const object = chainOf(node.object, source);
    if (!object) return null;
    return object + '.' + node.property.name;
  }
  return null;
}

/* Every local name that holds the Capacitor proxy, or a plugin map taken off it.
   `var cap = window.Capacitor` then `var plugins = cap.Plugins || {}` puts the
   plugins behind `plugins`, which is how js/native.js reaches them. */
function bridgeAliases(ast, source) {
  const declarators = [];
  walk(ast, (node) => {
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init) {
      declarators.push({ name: node.id.name, init: node.init });
    }
  });
  const aliases = new Set();
  for (let pass = 0; pass <= declarators.length; pass += 1) {
    let changed = false;
    for (const { name, init } of declarators) {
      if (aliases.has(name)) continue;
      const text = source.slice(init.start, init.end);
      const names = text.match(/[A-Za-z_$][\w$]*/g) || [];
      const holdsProxy = /\bCapacitor\b/.test(text) || names.some((one) => aliases.has(one));
      if (holdsProxy) {
        aliases.add(name);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return aliases;
}

function handlerFunction(node, declarations) {
  if (!node) return null;
  if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') return node;
  if (node.type !== 'Identifier') return null;
  const found = declarations.get(node.name);
  return found && (found.type === 'FunctionExpression' || found.type === 'ArrowFunctionExpression' ||
    found.type === 'FunctionDeclaration')
    ? found
    : null;
}

function checkFile(file) {
  const source = fs.readFileSync(file, 'utf8');
  const relative = path.relative(ROOT, file);
  let ast;
  try {
    ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script', locations: true });
  } catch (error) {
    try {
      ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
    } catch (nested) {
      return [{ file: relative, message: 'could not be parsed: ' + error.message }];
    }
  }

  const aliases = bridgeAliases(ast, source);
  const declarations = new Map();
  walk(ast, (node) => {
    if (node.type === 'FunctionDeclaration' && node.id) declarations.set(node.id.name, node);
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init) {
      const init = node.init;
      if (init.type === 'FunctionExpression' || init.type === 'ArrowFunctionExpression') {
        declarations.set(node.id.name, init);
      }
    }
  });

  const problems = [];
  walk(ast, (node) => {
    if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression') return;
    if (node.callee.property.type !== 'Identifier' || node.callee.property.name !== 'addEventListener') return;
    const event = node.arguments[0];
    if (!event || event.type !== 'Literal' || !UNLOAD_EVENTS.has(event.value)) return;
    const handler = handlerFunction(node.arguments[1], declarations);
    if (!handler) return;

    walk(handler, (inner) => {
      if (inner.type !== 'CallExpression') return;
      const chain = chainOf(inner.callee, source);
      if (!chain) return;
      const root = chain.split('.')[0];
      const isBridge = /(^|\.)Capacitor(\.|$)/.test(chain) || aliases.has(root);
      if (!isBridge) return;
      const line = source.slice(source.lastIndexOf('\n', inner.start) + 1, source.indexOf('\n', inner.start));
      if (ALLOW.test(line)) return;
      problems.push({
        file: relative,
        line: inner.loc.start.line,
        message:
          `a ${event.value} handler calls the native bridge (${chain}()). Capacitor answers a plugin` +
          ' call through the WebView message listener, and on WebView 109 a reply that arrives after' +
          ' the document was replaced crashed the app (SIGSEGV). Do not call the bridge while the' +
          ' page unloads; cancel or settle it before the navigation instead.'
      });
    });
  });
  return problems;
}

const targets = process.argv.slice(2);
const files = (targets.length ? targets : ['js']).flatMap((target) => jsFiles(target));
if (!files.length) {
  console.error('::error::no JavaScript files to check');
  process.exit(1);
}

const problems = files.flatMap(checkFile);
for (const problem of problems) {
  console.error(
    '::error ' +
      (problem.line ? `file=${problem.file},line=${problem.line}::` : '') +
      (problem.line ? problem.file + ':' + problem.line + ': ' : problem.file + ': ') +
      problem.message
  );
}
if (problems.length) {
  console.error(
    `unload bridge guard: ${problems.length} bridge call(s) can fire while a document unloads`
  );
  process.exit(1);
}
console.log(`unload bridge guard: ${files.length} scripts keep the bridge quiet while a page unloads`);
