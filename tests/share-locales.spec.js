const { test, expect } = require('@playwright/test');
const { LANGUAGE_NAMES, LOCALES } = require('./helpers');

const CARD = {
  game: 'Water Sort',
  number: '05',
  kind: 'SORTING',
  title: 'Water Sort',
  score: 4,
  label: 'MOVES',
  meta: ['Level 1 of 8'],
  accent: '#39a9a1'
};

const CHROME_KEYS = [
  'Puzzle collection',
  'The pocket arcade',
  'Six games',
  'Six games. No filler.',
  'No ads. No accounts. Offline.'
];

async function setLocale(page, locale) {
  await page.evaluate((next) => localStorage.setItem('sixfold.locale.v1', next), locale);
  await page.reload();
  await page.waitForFunction((next) => {
    return document.documentElement.lang === next &&
      window.SixfoldI18n &&
      window.MergeShareCard;
  }, locale);
}

test('share-card chrome and data follow every interface language', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/');
  await page.waitForFunction(() => window.SixfoldI18n && window.MergeShareCard);

  for (const locale of LOCALES) {
    await setLocale(page, locale);

    const result = await page.evaluate((card) => {
      const calls = [];
      const fonts = [];
      const proto = CanvasRenderingContext2D.prototype;
      const original = proto.fillText;
      proto.fillText = function (text, x, y, maxWidth) {
        calls.push(String(text));
        fonts.push(this.font);
        return original.call(this, text, x, y, maxWidth);
      };
      let error = null;
      try {
        window.MergeShareCard.draw(card);
      } catch (err) {
        error = String(err);
      } finally {
        proto.fillText = original;
      }
      return { text: calls.join(''), fonts, error };
    }, CARD);

    expect(result.error, locale + ' draw error').toBeNull();
    expect(result.text, locale + ' rendered copy').not.toBe('');

    const expected = await page.evaluate((keys) => {
      const i18n = window.SixfoldI18n;
      return {
        chrome: keys.map((key) => i18n.t(key)),
        title: i18n.t('Water Sort'),
        kind: i18n.t('Sorting'),
        label: i18n.t('Moves'),
        meta: i18n.number(i18n.t('Level 1 of 8')),
        score: i18n.number('4')
      };
    }, CHROME_KEYS);

    expected.chrome.forEach((text, index) => {
      expect(result.text, LANGUAGE_NAMES[locale] + ' card is missing ' + CHROME_KEYS[index]).toContain(text);
      if (locale !== 'en') {
        expect(result.text, LANGUAGE_NAMES[locale] + ' card kept English ' + CHROME_KEYS[index]).not.toContain(CHROME_KEYS[index]);
      }
    });
    expect(result.text, LANGUAGE_NAMES[locale] + ' game title').toContain(expected.title);
    expect(result.text, LANGUAGE_NAMES[locale] + ' game kind').toContain(expected.kind);
    expect(result.text, LANGUAGE_NAMES[locale] + ' score label').toContain(expected.label);
    expect(result.text, LANGUAGE_NAMES[locale] + ' meta').toContain(expected.meta);
    expect(result.text, LANGUAGE_NAMES[locale] + ' score').toContain(expected.score);

    const scriptFamily = {
      ja: 'Sixfold JP',
      ko: 'Sixfold KR',
      'zh-Hans': 'Sixfold SC',
      'zh-Hant': 'Sixfold TC',
      hi: 'Sixfold Devanagari',
      kn: 'Sixfold Kannada',
      ar: 'Sixfold Arabic'
    }[locale];
    if (scriptFamily) {
      expect(result.fonts.some((font) => font.includes(scriptFamily)), LANGUAGE_NAMES[locale] + ' card font').toBe(true);
    }
    if (locale === 'ar' || locale === 'hi') {
      const digitFamily = locale === 'ar' ? 'Sixfold Arabic Digits' : 'Sixfold Devanagari Digits';
      expect(result.fonts.some((font) => font.includes(digitFamily)), LANGUAGE_NAMES[locale] + ' digit font').toBe(true);
    }
  }
});

for (const locale of ['ar', 'hi', 'ja']) {
  test('save feedback follows ' + LANGUAGE_NAMES[locale], async ({ page }) => {
    await page.addInitScript((next) => {
      localStorage.setItem('sixfold.locale.v1', next);
    }, locale);
    await page.goto('/');
    await page.waitForFunction(() => window.MergeShare && window.MergeShare.result && window.MergeShareCard);

    const copy = await page.evaluate(() => window.SixfoldI18n.t('Image downloaded.'));
    const downloadPromise = page.waitForEvent('download');
    await page.evaluate((card) => {
      window.MergeShare.result(card.title, card.text, card.data);
    }, { title: CARD.title, text: 'I sorted Water Sort in 4 moves.', data: CARD });
    await downloadPromise;

    await expect(page.locator('#toast')).toHaveText(copy);
  });
}

test('Sudoku shares its localized hint count', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sixfold.locale.v1', 'de');
  });
  await page.goto('/#sudoku');
  await page.waitForSelector('#sudoku-board .sudoku-cell');
  const solved = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('sixfold.sudoku.state.v1'));
    state.grid = state.solution.slice();
    state.solved = true;
    state.hints = 2;
    state.elapsed = 252;
    return state;
  });
  await page.addInitScript((state) => {
    localStorage.setItem('sixfold.sudoku.state.v1', JSON.stringify(state));
  }, solved);
  await page.reload();
  await page.waitForSelector('#sudoku-board .sudoku-cell');
  await page.waitForFunction(() => !document.getElementById('sudoku-result').hidden);

  const data = await page.evaluate(() => {
    window.__sudokuShare = null;
    window.MergeShare.result = (title, text, payload) => {
      window.__sudokuShare = payload;
    };
    document.getElementById('sudoku-result-share').click();
    return window.__sudokuShare;
  });

  expect(data, 'Sudoku share data').not.toBeNull();
  const copy = await page.evaluate(() => {
    return window.SixfoldI18n.number('2') + ' ' + window.SixfoldI18n.t('Hints');
  });
  expect(data.meta).toContain(copy);
  expect(data.meta.join(' · ')).not.toContain('2 hints');
});

for (const spec of [
  { locale: 'ar', family: 'Sixfold Arabic Digits', file: 'fonts/sixfold-arabic-digits.woff2', sample: '١٢٣', pattern: /^[٠-٩]+$/ },
  { locale: 'hi', family: 'Sixfold Devanagari Digits', file: 'fonts/sixfold-devanagari-digits.woff2', sample: '१२३', pattern: /^[०-९]+$/ }
]) {
  test('bundled ' + spec.family + ' has usable glyphs', async ({ page }) => {
    await page.addInitScript((next) => {
      localStorage.setItem('sixfold.locale.v1', next);
    }, spec.locale);
    await page.goto('/');
    await page.waitForFunction(() => window.SixfoldI18n);

    const result = await page.evaluate(async (fontSpec) => {
      const response = await fetch(fontSpec.file, { cache: 'no-store' });
      const buffer = await response.arrayBuffer();
      const face = new FontFace('Test ' + fontSpec.family, buffer);
      await face.load();
      document.fonts.add(face);

      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 120;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#000';
      ctx.font = '800 64px "Test ' + fontSpec.family + '"';
      const width = ctx.measureText(fontSpec.sample).width;
      ctx.fillText(fontSpec.sample, 12, 84);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let dark = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] < 250 || pixels[i + 1] < 250 || pixels[i + 2] < 250) dark += 1;
      }
      return {
        loaded: document.fonts.check('16px "Test ' + fontSpec.family + '"', fontSpec.sample),
        width,
        dark,
        number: window.SixfoldI18n.number('123')
      };
    }, spec);

    expect(result.loaded, spec.family + ' loaded').toBe(true);
    expect(result.width, spec.family + ' measured width').toBeGreaterThan(20);
    expect(result.dark, spec.family + ' ink pixels').toBeGreaterThan(100);
    expect(result.number, spec.locale + ' localized number').toMatch(spec.pattern);
  });
}
