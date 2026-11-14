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
  const firstChangelogHeading = changelog.match(/^## (.+)$/m)?.[1] || '';
  expect(firstChangelogHeading, 'latest changelog entry').toContain('v' + short);
  expect(firstChangelogHeading, 'latest changelog entry is not the internal build number').not.toContain(build);
  expect(changelog, 'internal build is not a release heading').not.toMatch(/^## 5\.2\.0/m);
  expect(changelog, 'internal build label').toContain('Internal build: **' + build + '**');
  expect(changelog, 'public release note').toContain('Public release label: **v' + release + '**');
});
