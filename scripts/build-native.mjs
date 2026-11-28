import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const out = join(root, 'native/www');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const files = [
  'index.html',
  'licenses.html',
  'LICENSE',
  'manifest.webmanifest',
  'manifest-dark.webmanifest'
];

const directories = ['css', 'i18n', 'js', 'fonts', 'icons', 'splash', 'wordle-locales'];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const file of files) cpSync(join(root, file), join(out, file));
for (const directory of directories) {
  cpSync(join(root, directory), join(out, directory), { recursive: true });
}

// Capacitor injects the bridge, but classic script pages also need the
// plugin proxies registered. Concatenate the official UMD builds into a
// native-only file so the web/PWA build never pays for Capacitor core.
const pluginSources = [
  'node_modules/@capacitor/core/dist/capacitor.js',
  'node_modules/@capacitor/app/dist/plugin.js',
  'node_modules/@capacitor/splash-screen/dist/plugin.js',
  'node_modules/@capacitor/status-bar/dist/plugin.js'
];
const pluginBundle = pluginSources.map(function (file) {
  return '/* ' + file + ' */\n' + readFileSync(join(root, file), 'utf8');
}).join('\n');
writeFileSync(join(out, 'native-plugins.js'), pluginBundle);

let shell = readFileSync(join(out, 'index.html'), 'utf8');
const nativeScript = /([ \t]*)<script src="js\/native\.js\?v=[^"]+"><\/script>/;
if (!nativeScript.test(shell)) {
  throw new Error('native shell: could not find the js/native.js script tag');
}
shell = shell.replace(nativeScript, function (tag, indent) {
  return indent + '<script src="native-plugins.js"></script>\n' + tag;
});
writeFileSync(join(out, 'index.html'), shell);

// Capacitor serves the staged shell from its local origin. Keep a marker so
// support and store diagnostics can see which bundle is in the binary.
writeFileSync(join(out, 'native-build.txt'), 'Sixfold ' + pkg.version + ' native web bundle\n');
console.log('native web bundle ready:', out);
