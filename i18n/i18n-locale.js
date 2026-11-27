/* Locale resolution shared by the inline catalog loader and i18n.js. Keeping
   this in one place prevents the startup path and the UI from disagreeing. */
(function () {
  'use strict';

  var KEY = 'sixfold.locale.v1';
  // Distinguishes a language the reader picked from one the device supplied.
  // Only the picker writes this; a detected locale is never persisted.
  var EXPLICIT_KEY = 'sixfold.locale.explicit.v1';
  var VERSION = '6.0.6';
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

  // The language the phone is set to, ignoring any in-app choice. This is what
  // a fresh install and the "legacy auto" migration below resolve against.
  function device() {
    var languages = navigator.languages || [navigator.language || 'en'];
    for (var i = 0; i < languages.length; i += 1) {
      var match = normalize(languages[i]);
      if (match) return match;
    }
    return 'en';
  }

  function savedLocale() {
    try { return normalize(localStorage.getItem(KEY)); } catch (err) { return ''; }
  }

  function isExplicit() {
    try { return localStorage.getItem(EXPLICIT_KEY) === '1'; } catch (err) { return false; }
  }

  function detect() {
    var saved = savedLocale();
    if (saved) {
      if (isExplicit()) return saved;
      // Older builds wrote the device-detected locale on every boot, which
      // stopped the app following the phone after the first launch. If that
      // stored value still matches the phone, drop it and resume following.
      // A value that differs is left alone: it was almost certainly a real
      // choice from the picker in a build without the explicit marker.
      var current = device();
      if (saved === current) {
        try { localStorage.removeItem(KEY); } catch (err) {}
        return current;
      }
      return saved;
    }
    return device();
  }

  function assets(locale) {
    return CATALOG[locale] ? [PATTERNS, CATALOG[locale]] : [];
  }

  window.SixfoldLocale = {
    KEY: KEY,
    EXPLICIT_KEY: EXPLICIT_KEY,
    VERSION: VERSION,
    CATALOG: CATALOG,
    normalize: normalize,
    device: device,
    detect: detect,
    isExplicit: isExplicit,
    assets: assets
  };
})();
