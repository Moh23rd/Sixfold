const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('public release labels match package metadata and the build cache uses the internal version', () => {
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
  expect(html, 'no internal build in hub label').not.toContain('>v' + build + '</p>');
  expect(html, 'no internal build in What’s New label').not.toContain('What’s new in ' + build);
  expect(html, 'What’s New label').toContain('What’s new in ' + short);
  expect(html, 'What’s New storage version').toContain('data-version="' + short + '"');
  expect(sw, 'internal build cache').toContain("const VERSION = 'sixfold-" + build + "';");

  const firstReleaseHeading = changelog.match(/^## (v.+)$/m)?.[1] || '';
  expect(firstReleaseHeading, 'latest public release entry').toContain('v' + short);
  expect(firstReleaseHeading, 'latest public release entry is not the internal build number').not.toContain(build);
  expect(changelog, 'internal build is not a release heading').not.toMatch(
    new RegExp('^## ' + build.replace(/\./g, '\\.') + '$', 'm')
  );
  expect(changelog, 'internal build label').toContain('Internal build: **' + build + '**');
  expect(changelog, 'public release note').toContain('Public release label: **v' + release + '**');
});
