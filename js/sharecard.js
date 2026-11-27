/* The share card, in the 2.x pocket-arcade language: cream paper, the app
   icon's six, one huge number and the six-colour strip. Drawn locally so every
   game can share the same object without shipping image files. */
(function () {
  'use strict';

  const FONT = '"Google Sans Flex", ui-rounded, "SF Pro Rounded", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
  const SCRIPT_FONTS = {
    'zh-Hans': '"Sixfold SC"',
    'zh-Hant': '"Sixfold TC"',
    ja: '"Sixfold JP"',
    ko: '"Sixfold KR"',
    hi: '"Sixfold Devanagari", "Sixfold Devanagari Digits"',
    kn: '"Sixfold Kannada"',
    ar: '"Sixfold Arabic", "Sixfold Arabic Digits"'
  };
  const LABELS = {
    POINTS: 'Score',
    TIME: 'Time',
    MOVES: 'Moves',
    LASTED: 'Time',
    SORTING: 'Sorting',
    LOGIC: 'Logic',
    NUMBERS: 'Numbers',
    CLASSIC: 'Classic',
    MERGING: 'Merging'
  };
  const CREAM = '#f6f1e8';
  const INK = '#211d18';
  const MUTED = '#6f665a';
  const LINE = 'rgba(94, 76, 45, 0.16)';
  const TILES = ['#e85f3b', '#efb07a', '#e3b94a', '#8bbd54', '#39a9a1', '#5b8fd5'];
  // Warm's yellow, the third cover tile, is the cards' small brand accent.
  const BRAND_ACCENT = 2;

  // The six-piece mark and strip use the same cover-order tokens as the hub.
  // Follow --six-n's one-level alias (--six-1 -> --g1) before painting.
  function gameColours() {
    const styles = getComputedStyle(document.documentElement);
    return TILES.map(function (fallback, index) {
      let value = styles.getPropertyValue('--six-' + (index + 1)).trim();
      const alias = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value);
      if (alias) value = styles.getPropertyValue(alias[1]).trim();
      return value || fallback;
    });
  }

  function font(weight, px) {
    const locale = window.SixfoldI18n ? window.SixfoldI18n.locale() : 'en';
    const script = SCRIPT_FONTS[locale];
    return weight + ' ' + px + 'px ' + (script ? script + ', ' + FONT : FONT);
  }

  function number(value) {
    return window.SixfoldI18n && window.SixfoldI18n.number
      ? window.SixfoldI18n.number(String(value))
      : String(value);
  }

  function t(value) {
    return window.SixfoldI18n ? window.SixfoldI18n.t(String(value == null ? '' : value)) : String(value == null ? '' : value);
  }

  function titleCase(value) {
    const text = String(value == null ? '' : value);
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  }

  function cardCopy(value) {
    const source = String(value == null ? '' : value);
    const direct = t(source);
    if (direct !== source) return direct;
    const punctuated = source + '.';
    const translated = t(punctuated);
    return translated !== punctuated ? translated.replace(/[.!。！]+$/, '') : source;
  }

  function cardKind(value) {
    const source = String(value == null ? '' : value);
    return t(LABELS[source] || titleCase(source));
  }

  function cardLabel(value) {
    const source = String(value == null ? '' : value);
    if (source === 'WINS – LOSSES') return t('Wins') + ' – ' + t('Losses');
    return t(LABELS[source] || source);
  }


  function fitFont(ctx, text, weight, start, maxWidth, min) {
    let px = start;
    const floor = min || 14;
    while (px > floor) {
      ctx.font = font(weight, px);
      if (!maxWidth || ctx.measureText(text).width <= maxWidth) break;
      px -= 2;
    }
    ctx.font = font(weight, px);
    return px;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function tracked(ctx, text, x, baseline, spacing) {
    // Letter-by-letter drawing breaks Arabic joining and Indic shaping. Draw
    // those scripts as one run and keep the tracked treatment for Latin text.
    if (/[\u0590-\u08ff\u0900-\u0dff\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(text)) {
      ctx.fillText(text, x, baseline);
      return;
    }
    let cursor = x;
    for (let i = 0; i < text.length; i += 1) {
      ctx.fillText(text[i], cursor, baseline);
      cursor += ctx.measureText(text[i]).width + spacing;
    }
  }

  // The launcher mark at card scale: the plate of merge tiles under its cream
  // ring, drawn here so a saved image ships no bitmap and the card keeps
  // working offline. The geometry follows assets/icon-source.svg.
  function brandMark(ctx, x, centerY, size) {
    const y = centerY - size / 2;
    const cx = x + size / 2;
    const cy = y + size / 2;

    ctx.save();
    roundRect(ctx, x, y, size, size, size * 0.48);
    const plate = ctx.createLinearGradient(x, y, x + size, y + size);
    plate.addColorStop(0, '#35302a');
    plate.addColorStop(1, '#1d1a16');
    ctx.fillStyle = plate;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.468, 0, Math.PI * 2);
    ctx.strokeStyle = '#f5f1e7';
    ctx.lineWidth = Math.max(1, size * 0.014);
    ctx.stroke();

    const tile = size * 0.145;
    const gap = size * 0.019;
    const left = x + size * 0.26;
    const top = y + size * 0.342;
    const radius = tile * 0.28;
    function square(atX, atY, width, colour) {
      roundRect(ctx, atX, atY, width, tile, radius);
      ctx.fillStyle = colour;
      ctx.fill();
    }
    square(left, top, tile, '#f5f1e7');
    square(left + tile + gap, top, tile, '#e85f3b');
    const second = top + tile + gap;
    square(left, second, tile, '#efb07a');
    square(left + tile + gap, second, tile, '#e8704a');
    square(left + 2 * (tile + gap), second, tile * 1.2, '#e85f3b');

    // The gold tile is the one already moving to its next square, so it sits
    // tilted above the block, with the sparkle at its corner.
    ctx.save();
    ctx.translate(x + size * 0.758, y + size * 0.31);
    ctx.rotate(-14 * (Math.PI / 180));
    roundRect(ctx, -tile * 0.58, -tile * 0.58, tile * 1.16, tile * 1.16, radius);
    ctx.fillStyle = '#e6c364';
    ctx.fill();
    ctx.restore();

    const sparkle = size * 0.028;
    const at = { x: x + size * 0.655, y: y + size * 0.43 };
    ctx.beginPath();
    ctx.moveTo(at.x, at.y - sparkle);
    ctx.quadraticCurveTo(at.x, at.y, at.x + sparkle, at.y);
    ctx.quadraticCurveTo(at.x, at.y, at.x, at.y + sparkle);
    ctx.quadraticCurveTo(at.x, at.y, at.x - sparkle, at.y);
    ctx.quadraticCurveTo(at.x, at.y, at.x, at.y - sparkle);
    ctx.closePath();
    ctx.fillStyle = '#f5f1e7';
    ctx.fill();
    ctx.restore();
  }

  function drawDaily(data) {
    const W = 1080;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = W;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    const tiles = gameColours();

    const accent = data.color || tiles[BRAND_ACCENT];
    ctx.direction = 'ltr';
    ctx.fillStyle = CREAM;
    ctx.fillRect(0, 0, W, W);

    ctx.fillStyle = 'rgba(94, 76, 45, 0.10)';
    for (let y = 26; y < W; y += 34) {
      for (let x = 28; x < W; x += 34) {
        ctx.beginPath();
        ctx.arc(x, y, 1.15, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.textBaseline = 'alphabetic';

    const markX = 80;
    const markY = 72;
    brandMark(ctx, markX, 93, 64);
    const brandX = markX + 64 + 14;
    ctx.fillStyle = INK;
    ctx.font = font(800, 40);
    ctx.fillText('SIXFOLD', brandX, markY + 25);
    ctx.fillStyle = MUTED;
    ctx.font = font(700, 10);
    tracked(ctx, t('Daily'), brandX + 1, markY + 43, 2.1);

    ctx.textAlign = 'right';
    ctx.fillStyle = MUTED;
    ctx.font = font(700, 11);
    ctx.fillText(t('Daily Sixfold'), W - 80, markY + 22);
    ctx.fillStyle = INK;
    fitFont(ctx, number(data.label || data.date || ''), 600, 19, 420);
    ctx.fillText(number(data.label || data.date || ''), W - 80, markY + 48);
    ctx.textAlign = 'left';

    ctx.fillStyle = LINE;
    ctx.fillRect(80, 166, W - 160, 1.5);

    ctx.fillStyle = accent;
    ctx.fillRect(80, 208, 34, 3);
    ctx.fillStyle = MUTED;
    ctx.font = font(700, 13);
    tracked(ctx, t('Today’s challenge'), 128, 214, 2.9);

    ctx.fillStyle = INK;
    const game = t(data.game || 'Daily');
    fitFont(ctx, game, 800, 100, 920, 44);
    ctx.fillText(game, 80, 350);

    ctx.fillStyle = MUTED;
    ctx.font = font(700, 14);
    tracked(ctx, cardKind(data.kind || ''), 83, 410, 3.1);

    ctx.fillStyle = INK;
    const goal = t(data.goal || '');
    fitFont(ctx, goal, 600, 26, 920, 18);
    ctx.fillText(goal, 80, 470);

    const dateWidth = Math.min(600, Math.max(270, (data.label || '').length * 15 + 70));
    roundRect(ctx, 80, 515, dateWidth, 56, 28);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.font = font(700, 19);
    ctx.textAlign = 'center';
    ctx.fillText(number(data.date || ''), 80 + dateWidth / 2, 550);
    ctx.textAlign = 'left';

    const stripY = 635;
    const strip = 76;
    for (let i = 0; i < 6; i += 1) {
      const x = 80 + i * (strip + 10);
      roundRect(ctx, x, stripY, strip, strip, 16);
      ctx.fillStyle = tiles[i];
      ctx.fill();
      if (Number(data.index) === i) {
        ctx.strokeStyle = INK;
        ctx.lineWidth = 4;
        ctx.stroke();
      }
    }
    ctx.fillStyle = MUTED;
    ctx.font = font(700, 12);
    tracked(ctx, t('One game a day'), 82, stripY + strip + 30, 2.4);

    ctx.fillStyle = INK;
    ctx.fillRect(0, 900, W, 180);
    ctx.fillStyle = CREAM;
    ctx.font = font(800, 24);
    ctx.fillText('MOH23RD.GITHUB.IO/SIXFOLD', 80, 1000);
    ctx.fillStyle = accent;
    ctx.font = font(700, 14);
    ctx.textAlign = 'right';
    ctx.fillText(t('Can you finish it?'), W - 80, 1000);
    ctx.textAlign = 'left';
    return canvas;
  }

  function drawApp(data) {
    const W = 1080;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = W;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    const tiles = gameColours();

    ctx.direction = 'ltr';
    ctx.fillStyle = CREAM;
    ctx.fillRect(0, 0, W, W);

    ctx.fillStyle = 'rgba(94, 76, 45, 0.10)';
    for (let y = 26; y < W; y += 34) {
      for (let x = 28; x < W; x += 34) {
        ctx.beginPath();
        ctx.arc(x, y, 1.15, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.textBaseline = 'alphabetic';

    const markX = 80;
    const markY = 72;
    brandMark(ctx, markX, 93, 64);
    const brandX = markX + 64 + 14;
    ctx.fillStyle = INK;
    ctx.font = font(800, 40);
    ctx.fillText('SIXFOLD', brandX, markY + 25);
    ctx.fillStyle = MUTED;
    ctx.font = font(700, 10);
    tracked(ctx, t('Puzzle collection'), brandX + 1, markY + 43, 2.1);

    ctx.textAlign = 'right';
    ctx.fillStyle = MUTED;
    ctx.font = font(700, 11);
    ctx.fillText(t('The pocket arcade'), W - 80, markY + 22);
    ctx.textAlign = 'left';

    ctx.fillStyle = LINE;
    ctx.fillRect(80, 166, W - 160, 1.5);

    ctx.fillStyle = tiles[BRAND_ACCENT];
    ctx.fillRect(80, 208, 34, 3);
    ctx.fillStyle = MUTED;
    ctx.font = font(700, 13);
    tracked(ctx, t('Six games. No filler.'), 128, 214, 2.9);

    ctx.fillStyle = INK;
    fitFont(ctx, t('Six games.'), 800, 92, 900, 44);
    ctx.fillText(t('Six games.'), 80, 338);
    fitFont(ctx, t('No filler.'), 800, 92, 900, 44);
    ctx.fillText(t('No filler.'), 80, 432);

    ctx.fillStyle = MUTED;
    const body = t('An offline pocket arcade.') + ' ' + t('No ads') + ' · ' + t('No accounts') + '.';
    fitFont(ctx, body, 600, 24, 520, 15);
    ctx.fillText(body, 80, 492);

    const stripY = 548;
    const strip = 78;
    for (let i = 0; i < 6; i += 1) {
      roundRect(ctx, 80 + i * (strip + 10), stripY, strip, strip, 16);
      ctx.fillStyle = tiles[i];
      ctx.fill();
    }
    ctx.fillStyle = MUTED;
    ctx.font = font(700, 12);
    tracked(ctx, t('Play offline'), 82, stripY + strip + 30, 2.4);

    if (data.badge && Number(data.badge.days) > 0) {
      const color = data.badge.color || tiles[BRAND_ACCENT];
      const x = 636;
      const y = 520;
      const w = 364;
      const h = 332;
      roundRect(ctx, x, y, w, h, 24);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.52)';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = MUTED;
      ctx.font = font(700, 11);
      tracked(ctx, t('Your badge'), x + 28, y + 36, 2.6);

      const cx = x + w / 2;
      const cy = y + 150;
      ctx.beginPath();
      ctx.arc(cx, cy, 72, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(33, 29, 24, 0.2)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 60, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.textAlign = 'center';
      ctx.font = font(800, 66);
      ctx.fillText(number(data.badge.days), cx, cy + 21);
      ctx.textAlign = 'left';

      ctx.fillStyle = INK;
      ctx.textAlign = 'center';
      const unit = t(data.badge.unit || 'DAY STREAK');
      fitFont(ctx, unit, 800, 15, w - 56, 10);
      ctx.fillText(unit, cx, y + 268);
      ctx.textAlign = 'left';
    } else {
      // No badge means no badge art at all, not a locked placeholder.
      ctx.fillStyle = MUTED;
      ctx.font = font(700, 12);
      tracked(ctx, t('The pocket arcade'), 636, 620, 2.6);
      ctx.fillStyle = INK;
      fitFont(ctx, t('No ads') + '.', 600, 22, 364, 14);
      ctx.fillText(t('No ads') + '.', 636, 658);
      fitFont(ctx, t('No accounts') + '.', 600, 22, 364, 14);
      ctx.fillText(t('No accounts') + '.', 636, 688);
      fitFont(ctx, t('Works offline') + '.', 600, 22, 364, 14);
      ctx.fillText(t('Works offline') + '.', 636, 718);
    }

    ctx.fillStyle = INK;
    ctx.fillRect(0, 900, W, 180);
    ctx.fillStyle = CREAM;
    ctx.font = font(800, 24);
    ctx.fillText('MOH23RD.GITHUB.IO/SIXFOLD', 80, 1000);
    ctx.fillStyle = tiles[BRAND_ACCENT];
    ctx.font = font(700, 14);
    ctx.textAlign = 'right';
    ctx.fillText(t('Six games. No filler.'), W - 80, 1000);
    ctx.textAlign = 'left';

    return canvas;
  }

  function draw(data) {
    if (data && data.daily) return drawDaily(data);
    if (data && data.app) return drawApp(data);
    const W = 1080;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = W;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    const tiles = gameColours();

    ctx.direction = 'ltr';
    ctx.fillStyle = CREAM;
    ctx.fillRect(0, 0, W, W);

    // The quiet dotted paper from the hub and the social card.
    ctx.fillStyle = 'rgba(94, 76, 45, 0.10)';
    for (let y = 26; y < W; y += 34) {
      for (let x = 28; x < W; x += 34) {
        ctx.beginPath();
        ctx.arc(x, y, 1.15, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.textBaseline = 'alphabetic';

    // Mark + wordmark.
    const markX = 80;
    const markY = 72;
    brandMark(ctx, markX, 93, 64);
    const brandX = markX + 64 + 14;
    ctx.fillStyle = INK;
    ctx.font = font(800, 40);
    ctx.fillText('SIXFOLD', brandX, markY + 25);
    ctx.fillStyle = MUTED;
    ctx.font = font(700, 10);
    tracked(ctx, t('Puzzle collection'), brandX + 1, markY + 43, 2.1);

    // Which cartridge this result belongs to.
    ctx.textAlign = 'right';
    ctx.fillStyle = INK;
    fitFont(ctx, t(data.game || 'Sixfold'), 800, 17, 430);
    ctx.fillText(t(data.game || 'Sixfold'), W - 80, markY + 19);
    ctx.fillStyle = MUTED;
    ctx.font = font(700, 10);
    ctx.fillText([data.number, cardKind(data.kind)].filter(Boolean).map(number).join('  ·  '), W - 80, markY + 39);
    ctx.textAlign = 'left';

    ctx.fillStyle = LINE;
    ctx.fillRect(80, 166, W - 160, 1.5);

    // Kicker.
    ctx.fillStyle = data.accent || '#e85f3b';
    ctx.fillRect(80, 208, 34, 3);
    ctx.fillStyle = MUTED;
    ctx.font = font(700, 13);
    tracked(ctx, t('The pocket arcade'), 128, 214, 2.9);

    // Title and the number that matters.
    ctx.fillStyle = INK;
    const title = cardCopy(data.title || 'Result');
    fitFont(ctx, title, 800, 64, 920, 34);
    ctx.fillText(title, 80, 306);

    const score = number(data.score == null ? '0' : data.score);
    const size = score.length <= 2 ? 224 : score.length === 3 ? 200 : score.length === 4 ? 168 : 138;
    ctx.font = font(800, size);
    ctx.fillText(score, 72, 512);

    ctx.fillStyle = tiles[BRAND_ACCENT];
    ctx.fillRect(82, 534, 118, 9);

    ctx.fillStyle = MUTED;
    ctx.font = font(700, 15);
    tracked(ctx, cardLabel(data.label || 'POINTS'), 84, 582, 2.8);

    if (data.meta && data.meta.length) {
      ctx.fillStyle = INK;
      const meta = data.meta.map(cardCopy).map(number).join('   ·   ');
      fitFont(ctx, meta, 600, 26, 920, 15);
      ctx.fillText(meta, 80, 648);
    }

    // Six-piece footer strip in the six game colours.
    const stripY = 716;
    const strip = 64;
    for (let i = 0; i < 6; i += 1) {
      roundRect(ctx, 80 + i * (strip + 10), stripY, strip, strip, 15);
      ctx.fillStyle = tiles[i];
      ctx.fill();
    }
    ctx.fillStyle = MUTED;
    ctx.font = font(700, 12);
    ctx.textAlign = 'right';
    ctx.fillText(t('Six games'), W - 80, stripY + 30);
    ctx.font = font(600, 11);
    ctx.fillStyle = 'rgba(111, 102, 90, 0.8)';
    ctx.fillText(t('No ads. No accounts. Offline.'), W - 80, stripY + 50);
    ctx.textAlign = 'left';

    // Ink footer with the address.
    ctx.fillStyle = INK;
    ctx.fillRect(0, 900, W, 180);
    ctx.fillStyle = CREAM;
    ctx.font = font(800, 24);
    ctx.fillText('MOH23RD.GITHUB.IO/SIXFOLD', 80, 1000);
    ctx.fillStyle = tiles[BRAND_ACCENT];
    ctx.font = font(700, 14);
    ctx.textAlign = 'right';
    ctx.fillText(t('Six games. No filler.'), W - 80, 1000);
    ctx.textAlign = 'left';

    return canvas;
  }

  function fileName(data) {
    if (data.file) return String(data.file).replace(/[^a-z0-9-]+/gi, '-') + '.png';
    return 'sixfold-' + String(data.game || 'result').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.png';
  }

  function asFile(blob, data) {
    const name = fileName(data);
    if (typeof File === 'function') return new File([blob], name, { type: 'image/png' });
    blob.name = name;
    return blob;
  }

  async function file(data) {
    try {
      if (document.fonts && document.fonts.load) {
        await document.fonts.load(font(800, 64));
      }
    } catch (err) {
      /* draw with the fallback face */
    }
    const canvas = draw(data);
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) {
          reject(new Error('image unavailable'));
          return;
        }
        resolve(asFile(blob, data));
      }, 'image/png');
    });
  }

  function fileSync(data) {
    const canvas = draw(data);
    const dataUrl = canvas.toDataURL('image/png');
    const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return asFile(new Blob([bytes], { type: 'image/png' }), data);
  }

  function base64(blob) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        const result = String(reader.result || '');
        resolve(result.slice(result.indexOf(',') + 1));
      };
      reader.onerror = function () { reject(new Error('image unreadable')); };
      reader.readAsDataURL(blob);
    });
  }

  // Browsers cannot write to the photo gallery, so the same PNG is downloaded.
  function download(file) {
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name || 'sixfold-result.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function galleryPlugin() {
    const cap = window.Capacitor;
    if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return null;
    const plugin = cap.Plugins && cap.Plugins.GallerySave;
    // The chunked trio is the preferred path; a shell that only has the single
    // call still counts as a gallery plugin.
    return plugin && (plugin.begin || plugin.save) ? plugin : null;
  }

  // Save the card into the phone's photo gallery. Inside the Android shell the
  // GallerySave plugin writes it through MediaStore; everywhere else the file
  // is downloaded. Neither path opens a share sheet.
  //
  // The two paths are exclusive. Inside the shell a failed plugin call cannot be
  // rescued by an <a download>, which the WebView ignores, so falling back used
  // to report success for a picture that was never written.
  // 48 KiB of base64 per message: a card is split into a few pieces, no single
  // bridge message is large, and 48 KiB is a multiple of 4 so every piece
  // decodes on its own boundary.
  const CHUNK = 48 * 1024;

  // One save at a time. Two overlapping writes of the same card used to be
  // possible from a double tap, which is exactly the kind of duplicate the
  // gallery then collapses.
  let saving = null;

  function save(file) {
    if (saving) return saving;
    saving = saveOnce(file).then(function (value) {
      saving = null;
      return value;
    }, function () {
      saving = null;
      return false;
    });
    return saving;
  }

  async function saveOnce(file) {
    if (!file) return false;
    if (!window.Capacitor || !window.Capacitor.isNativePlatform || !window.Capacitor.isNativePlatform()) {
      try {
        download(file);
        return true;
      } catch (err) {
        return false;
      }
    }
    const plugin = galleryPlugin();
    if (!plugin) return false;
    const name = file.name || 'sixfold-result.png';
    try {
      const data = await base64(file);
      if (plugin.begin && plugin.write && plugin.end) {
        const started = await plugin.begin({ name: name });
        const id = started && started.id;
        if (!id) throw new Error('no image session');
        try {
          for (let at = 0; at < data.length; at += CHUNK) {
            await plugin.write({ id: id, data: data.slice(at, at + CHUNK) });
          }
          await plugin.end({ id: id });
        } catch (err) {
          if (plugin.abort) { try { await plugin.abort({ id: id }); } catch (ignored) {} }
          throw err;
        }
        return true;
      }
      await plugin.save({ data: data, name: name });
      return true;
    } catch (err) {
      return false;
    }
  }

  window.MergeShareCard = { draw: draw, file: file, fileSync: fileSync, save: save };
})();
