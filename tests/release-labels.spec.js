const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('public release labels are 5.0 and the build cache stays 5.2.0', () => {
  const pkg = require('../package.json');
  const build = pkg.version;
  const release = pkg.release;
  const short = release;
  const html = read('index.html');
  const sw = read('sw.js');
  const changelog = read('CHANGELOG.md');

  expect(html, 'hub version').toContain('>' + 'v' + short + '<');
  expect(html, 'version aria-label').toContain('Sixfold version ' + short);
  expect(html, 'settings version').toContain('Version ' + short);
  expect(html, 'no old public hub label').not.toContain('>v5.2</p>');
  expect(html, 'no old public What’s New label').not.toContain('What’s new in 5.2');
  expect(html, 'What’s New label').toContain('What’s new in ' + short);
  expect(html, 'What’s New storage version').toContain('data-version="' + short + '"');
  expect(sw, 'internal build cache').toContain("const VERSION = 'sixfold-" + build + "';");
  expect(changelog, 'internal build changelog heading').toContain('## ' + build + ' —');
  expect(changelog, 'public release note').toContain('Public release label: **v' + release + '**');
});
