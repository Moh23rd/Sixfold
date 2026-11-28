const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('public language copy matches the twelve supported locales', () => {
  const i18n = read('i18n/i18n.js');
  const supported = i18n.match(/var SUPPORTED = \{([\s\S]*?)\n  \};/);
  expect(supported, 'SUPPORTED locale table').not.toBeNull();

  const locales = [...supported[1].matchAll(/(?:'([^']+)'|([a-z]+)):\s*'/g)]
    .map((match) => match[1] || match[2]);
  expect(new Set(locales).size, 'supported locale count').toBe(12);
  expect(locales, 'supported locales').toContain('kn');

  const catalogs = [
    'i18n/i18n.js',
    ...locales
      .filter((locale) => locale !== 'en' && locale !== 'es')
      .map((locale) => 'i18n/i18n-' + locale.toLowerCase() + '.js')
  ];
  expect(catalogs, 'non-English catalog files').toHaveLength(11);
  for (const catalog of catalogs) {
    expect(read(catalog), catalog + ' current release note').toContain('What’s new in 6.0');
  }

  // The picker is the public language list; every supported locale needs one
  // option, so a count change cannot hide behind the catalogs alone.
  const html = read('index.html');
  const picker = [...html.matchAll(/data-locale="([^"]+)"/g)].map((match) => match[1]);
  expect(new Set(picker).size, 'language picker options').toBe(12);
  expect(picker, 'language picker includes Kannada').toContain('kn');
  expect(html, 'What’s New is the current release').toContain('What’s new in 6.0');

  const changelog = read('CHANGELOG.md');
  expect(changelog, 'changelog language count').toMatch(/all twelve interface\s+languages/);
  expect(changelog, 'changelog dictionary count').toContain('all twelve locale dictionaries');
  expect(changelog, 'changelog language picker').toContain('twelve languages in a responsive grid');
  expect(changelog, 'Kannada in changelog').toContain('Hindi, Kannada and Arabic');
  expect(changelog, 'stale eleven-language copy').not.toMatch(/\beleven languages\b/);
  expect(changelog, 'removed interface sounds').not.toContain('Interface sounds');

  expect(read('README.md'), 'README language count').toContain('twelve languages');
});
