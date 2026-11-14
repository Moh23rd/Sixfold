const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('the app, cache and What’s New labels use the package release', () => {
  const version = require('../package.json').version;
  const short = version.split('.').slice(0, 2).join('.');
  const html = read('index.html');
  const sw = read('sw.js');
  const changelog = read('CHANGELOG.md');

  expect(html, 'hub version').toContain('>' + 'v' + short + '<');
  expect(html, 'version aria-label').toContain('Sixfold version ' + short);
  expect(html, 'settings version').toContain('Version ' + short);
  expect(html, 'What’s New label').toContain('What’s new in ' + short);
  expect(html, 'What’s New storage version').toContain('data-version="' + short + '"');
  expect(sw, 'offline cache name').toContain("const VERSION = 'sixfold-" + version + "';");
  expect(changelog, 'changelog heading').toContain('## ' + version + ' —');
});
