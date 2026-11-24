const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('release labels, cache epochs and the Android version agree', () => {
  const pkg = require('../package.json');
  const lock = require('../package-lock.json');
  const build = pkg.version;
  const release = pkg.release;
  const html = read('index.html');
  const sw = read('sw.js');
  const changelog = read('CHANGELOG.md');

  expect(lock.version, 'lockfile version').toBe(build);
  expect(lock.packages[''].version, 'lockfile package version').toBe(build);

  expect(html, 'hub version').toContain('>v' + release + '<');
  expect(html, 'version aria-label').toContain('Sixfold version ' + release);
  expect(html, 'settings version').toContain('Version ' + release);
  expect(html, 'no internal build in hub label').not.toContain('>v' + build + '</p>');
  expect(html, 'no internal build in What’s New label').not.toContain('What’s new in ' + build);
  expect(html, 'What’s New label').toContain('What’s new in ' + release);
  expect(html, 'What’s New storage version').toContain('data-version="' + release + '"');
  expect(html, 'manifest epoch').toContain("manifest.webmanifest') + '?v=" + build);
  expect(sw, 'internal build cache').toContain("const VERSION = 'sixfold-" + build + "';");

  // The worker rejects a catalog whose version is not I18N_CODE, so the page,
  // the locale loader and the worker have to move together.
  const locale = read('i18n/i18n-locale.js').match(/var VERSION = '([^']+)'/)[1];
  expect(sw, 'catalog cache epoch').toContain("const I18N_CODE = '" + locale + "';");
  expect(html, 'locale loader epoch').toContain('i18n/i18n-locale.js?v=' + locale);
  expect(html, 'catalog loader epoch').toContain('i18n/i18n.js?v=' + locale);

  const gradle = read('android/app/build.gradle');
  expect(gradle, 'Android versionName').toContain('versionName "' + build + '"');
  expect(gradle, 'Android versionCode').toMatch(/versionCode [1-9]\d*/);

  const firstReleaseHeading = changelog.match(/^## (v.+)$/m)?.[1] || '';
  expect(firstReleaseHeading, 'latest public release entry').toContain('v' + release);
  expect(firstReleaseHeading, 'latest public release entry is not the internal build number').not.toContain(build);
  expect(changelog, 'internal build is not a release heading').not.toMatch(
    new RegExp('^## ' + build.replace(/\./g, '\\.') + '$', 'm')
  );
  expect(changelog, 'internal build label').toContain('Internal build: **' + build + '**');
  expect(changelog, 'public release note').toContain('Public release label: **v' + release + '**');
});
