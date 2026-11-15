/* Locale resolution shared by the inline catalog loader and i18n.js. Keeping
   this in one place prevents the startup path and the UI from disagreeing. */
(function () {
  'use strict';

  var KEY = 'sixfold.locale.v1';
  var VERSION = '5.4.5';
  var BASE = 'i18n/';
  var PATTERNS = BASE + 'i18n-patterns.js';
  var CATALOG = {
    fr: BASE + 'i18n-fr.js', de: BASE + 'i18n-de.js',
    'zh-Hans': BASE + 'i18n-zh-hans.js', 'zh-Hant': BASE + 'i18n-zh-hant.js',
    ja: BASE + 'i18n-ja.js', ko: BASE + 'i18n-ko.js', 'pt-BR': BASE + 'i18n-pt-br.js',
    hi: BASE + 'i18n-hi.js', kn: BASE + 'i18n-kn.js', ar: BASE + 'i18n-ar.js'
  };

  function normalize(tag) {
    var value = String(tag || '').toLowerCase().replace(/_/g, '-');
    if (!value) return '';
    if (value.indexOf('zh') === 0) {
      return /(^|-)hant($|-)|-(tw|hk|mo)($|-)/.test(value) ? 'zh-Hant' : 'zh-Hans';
    }
    if (value === 'pt' || value.indexOf('pt-') === 0) return 'pt-BR';
    var code = value.split('-')[0];
    return CATALOG[code] || code === 'en' || code === 'es' ? code : '';
  }

  function detect() {
    try {
      var saved = normalize(localStorage.getItem(KEY));
      if (saved) return saved;
    } catch (err) {}
    var languages = navigator.languages || [navigator.language || 'en'];
    for (var i = 0; i < languages.length; i += 1) {
      var match = normalize(languages[i]);
      if (match) return match;
    }
    return 'en';
  }

  function assets(locale) {
    return CATALOG[locale] ? [PATTERNS, CATALOG[locale]] : [];
  }

  window.SixfoldLocale = {
    KEY: KEY,
    VERSION: VERSION,
    CATALOG: CATALOG,
    normalize: normalize,
    detect: detect,
    assets: assets
  };
})();
