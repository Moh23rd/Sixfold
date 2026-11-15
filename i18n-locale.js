/* Locale resolution shared by the inline catalog loader and i18n.js. Keeping
   this in one place prevents the startup path and the UI from disagreeing. */
(function () {
  'use strict';

  var KEY = 'sixfold.locale.v1';
  var VERSION = '5.4.5';
  var PATTERNS = 'i18n-patterns.js';
  var CATALOG = {
    fr: 'i18n-fr.js', de: 'i18n-de.js',
    'zh-Hans': 'i18n-zh-hans.js', 'zh-Hant': 'i18n-zh-hant.js',
    ja: 'i18n-ja.js', ko: 'i18n-ko.js', 'pt-BR': 'i18n-pt-br.js',
    hi: 'i18n-hi.js', kn: 'i18n-kn.js', ar: 'i18n-ar.js'
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
