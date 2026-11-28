/* Optional device settings: accessibility, daily visibility, Sudoku input and
   local backup. Everything is stored in localStorage and never leaves the device. */
(function () {
  'use strict';

  const KEY = 'sixfold.settings.v1';
  const DEFAULTS = {
    highContrast: false,
    colorblind: false,
    largeDigits: false,
    largeMines: false,
    fruitNumbers: false,
    leftHanded: false,
    hideTimer: false,
    checkMistakes: false,
    inputMode: 'cell',
    dailyPuzzle: true,
    motion: 'full'
  };
  const $ = function (id) { return document.getElementById(id); };
  let values = load();

  // The page's one motion answer. "system" follows the device setting the
  // stylesheet used to read directly; "full" and "reduced" are an explicit
  // override. Full is the default: the app used to hide every transition
  // behind the device's reduced-motion query, so a machine with that setting
  // opened with no motion at all and no way to get it back. The attribute is
  // also set by the head boot script before the first paint, so the entrance
  // animations resolve on their first frame.
  function systemReduced() {
    return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function resolvedMotion() {
    if (values.motion === 'full') return 'full';
    if (values.motion === 'reduced') return 'reduced';
    return systemReduced() ? 'reduced' : 'full';
  }

  window.SixfoldMotion = {
    reduced: function () { return resolvedMotion() === 'reduced'; },
    choice: function () { return values.motion; }
  };

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      const next = Object.assign({}, DEFAULTS);
      if (raw && typeof raw === 'object') {
        Object.keys(DEFAULTS).forEach(function (key) {
          if (typeof raw[key] === typeof DEFAULTS[key]) next[key] = raw[key];
        });
        if (next.inputMode !== 'cell' && next.inputMode !== 'digit') next.inputMode = 'cell';
        if (next.motion !== 'system' && next.motion !== 'full' && next.motion !== 'reduced') next.motion = 'full';
      }
      return next;
    } catch (err) {
      return Object.assign({}, DEFAULTS);
    }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(values)); } catch (err) {}
  }

  function apply() {
    const root = document.documentElement;
    const attrs = {
      contrast: values.highContrast ? 'high' : '',
      colorblind: values.colorblind ? 'on' : '',
      'large-digits': values.largeDigits ? 'on' : '',
      'large-mines': values.largeMines ? 'on' : '',
      'fruit-numbers': values.fruitNumbers ? 'on' : '',
      'left-handed': values.leftHanded ? 'on' : '',
      'hide-timer': values.hideTimer ? 'on' : '',
      'check-mistakes': values.checkMistakes ? 'on' : '',
      'input-mode': values.inputMode,
      daily: values.dailyPuzzle ? 'on' : 'off'
    };
    Object.keys(attrs).forEach(function (name) {
      if (attrs[name]) root.setAttribute('data-' + name, attrs[name]);
      else root.removeAttribute('data-' + name);
    });
    const motion = resolvedMotion();
    root.setAttribute('data-motion', motion);
    // A launch that began in Reduced never armed the cover build. Dropping the
    // launch-only class on a switch to Reduced also stops a later Full switch
    // from replaying a build the player already saw.
    if (motion === 'reduced') root.classList.remove('home-build');
    document.querySelectorAll('[data-motion-opt]').forEach(function (button) {
      button.setAttribute('aria-pressed', button.dataset.motionOpt === values.motion ? 'true' : 'false');
    });
    document.querySelectorAll('[data-setting]').forEach(function (button) {
      const key = button.dataset.setting;
      const on = Boolean(values[key]);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
      const state = button.querySelector('.setting-state');
      if (state) state.textContent = on ? 'On' : 'Off';
    });
    document.querySelectorAll('[data-setting-input]').forEach(function (button) {
      button.setAttribute('aria-pressed', button.dataset.settingInput === values.inputMode ? 'true' : 'false');
    });
    try {
      window.dispatchEvent(new CustomEvent('sixfold:settings', { detail: getAll() }));
    } catch (err) {}
  }

  function set(key, value) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) return;
    if (key === 'inputMode') values.inputMode = value === 'digit' ? 'digit' : 'cell';
    else if (key === 'motion') values.motion = value === 'full' || value === 'reduced' ? value : 'system';
    else values[key] = Boolean(value);
    save();
    apply();
  }

  function toggle(key) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) return;
    set(key, !values[key]);
  }

  function get(key) {
    return values[key];
  }

  function getAll() {
    return Object.assign({}, values);
  }

  function status(message) {
    const el = $('backup-status');
    if (el) el.textContent = message;
  }

  function isNative() {
    return Boolean(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  // The WebView that runs the installed app has no download manager, so an
  // <a download> writes nothing at all. The app writes a real file into its
  // cache and hands it to the system share sheet instead, so a backup can go
  // to Files, Drive or a chat.
  function textToBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }

  async function saveBackupNatively(text, name) {
    const plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
    const filesystem = plugins.Filesystem;
    if (!filesystem || !filesystem.writeFile) return false;
    let written = null;
    try {
      written = await filesystem.writeFile({
        path: name,
        data: textToBase64(text),
        directory: 'CACHE',
        encoding: 'base64'
      });
    } catch (err) {
      status('The app could not write the backup file.');
      return true;
    }
    const share = plugins.Share;
    if (!share || !share.share || !written || !written.uri) {
      status('Backup saved. Nothing on this device can open the share sheet.');
      return true;
    }
    try {
      await share.share({
        title: 'Sixfold backup',
        dialogTitle: 'Save your Sixfold backup',
        url: written.uri
      });
      status('Backup ready. Keep the file somewhere safe.');
    } catch (err) {
      status('Backup written, but the share sheet did not open.');
    }
    return true;
  }

  async function exportBackup() {
    const data = {};
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key || !/^(merge2048|merge-games|sixfold)/.test(key)) continue;
        data[key] = localStorage.getItem(key);
      }
    } catch (err) {
      status('Storage is not available in this browser.');
      return;
    }
    const payload = {
      app: 'Sixfold',
      version: 5,
      exportedAt: new Date().toISOString(),
      data: data
    };
    const text = JSON.stringify(payload, null, 2);
    const name = 'sixfold-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    status('Preparing your backup…');
    if (isNative() && (await saveBackupNatively(text, name))) return;
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    status('Backup downloaded. Keep it somewhere safe.');
  }

  function importBackup(file) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      status('That backup is too large to be a Sixfold backup.');
      return;
    }
    const reader = new FileReader();
    reader.onload = function () {
      let payload;
      try { payload = JSON.parse(String(reader.result)); } catch (err) {
        status('That file is not a valid JSON backup.');
        return;
      }
      if (!payload || payload.app !== 'Sixfold' || !payload.data || typeof payload.data !== 'object') {
        status('That file is not a Sixfold backup.');
        return;
      }
      const entries = Object.keys(payload.data);
      if (entries.length > 300) {
        status('That backup contains too many entries.');
        return;
      }
      for (let i = 0; i < entries.length; i += 1) {
        const key = entries[i];
        const value = payload.data[key];
        if (!/^(merge2048|merge-games|sixfold)/.test(key) || typeof value !== 'string' || value.length > 1500000) {
          status('That backup contains an unsupported entry.');
          return;
        }
      }
      const ok = window.confirm('Restore this Sixfold backup? It will replace every board, score and setting on this device.');
      if (!ok) return;
      // The page that is about to reload still holds a Merge board and a Sudoku
      // grid in memory, and both rewrite their storage on pagehide. Writing the
      // restored keys here let that save win, so the payload waits in the
      // session and the page's first inline script applies it after the reload,
      // before any game has read storage.
      const pairs = entries.map(function (key) { return [key, payload.data[key]]; });
      status('Backup restored. Reloading…');
      try {
        sessionStorage.setItem('sixfold.restore.pending', JSON.stringify(pairs));
      } catch (err) {
        entries.forEach(function (key) {
          try { localStorage.setItem(key, payload.data[key]); } catch (err2) {}
        });
      }
      window.setTimeout(function () { location.reload(); }, 150);
    };
    reader.onerror = function () { status('Could not read that file.'); };
    reader.readAsText(file);
  }

  function init() {
    apply();
    document.querySelectorAll('[data-setting]').forEach(function (button) {
      button.addEventListener('click', function () {
        toggle(button.dataset.setting);
      });
    });

    document.querySelectorAll('[data-setting-input]').forEach(function (button) {
      button.addEventListener('click', function () { set('inputMode', button.dataset.settingInput); });
    });
    document.querySelectorAll('[data-motion-opt]').forEach(function (button) {
      button.addEventListener('click', function () { set('motion', button.dataset.motionOpt); });
    });
    // On "system" the page follows the device live; a phone switching its
    // accessibility setting should not need a reload. The other two choices
    // ignore the device and keep what the player picked.
    const motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    if (motionQuery) {
      const onSystemMotion = function () {
        if (values.motion === 'system') apply();
      };
      if (motionQuery.addEventListener) motionQuery.addEventListener('change', onSystemMotion);
      else if (motionQuery.addListener) motionQuery.addListener(onSystemMotion);
    }
    const exportBtn = $('backup-export');
    if (exportBtn) exportBtn.addEventListener('click', exportBackup);
    const openImport = $('backup-import-open');
    const input = $('backup-import');
    if (openImport && input) {
      openImport.addEventListener('click', function () { input.click(); });
      input.addEventListener('change', function () {
        importBackup(input.files && input.files[0]);
        input.value = '';
      });
    }
    window.addEventListener('storage', function (event) {
      if (event.key !== KEY) return;
      values = load();
      apply();
    });
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(function () {});
    }
  }

  window.SixfoldSettings = {
    get: get,
    all: getAll,
    set: set,
    toggle: toggle
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
