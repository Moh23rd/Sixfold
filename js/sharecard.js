/* The share card, in the 2.x pocket-arcade language: cream paper, the
   six-piece mark, one huge number and the six-colour strip. Drawn locally so
   every game can share the same object without shipping image files. */
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
  const YELLOW = '#e3b94a';
  const TILES = ['#e85f3b', '#efb07a', '#e3b94a', '#8bbd54', '#39a9a1', '#5b8fd5'];

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

  function cardTitle(value) {
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

  function cardMeta(value) {
    const source = String(value == null ? '' : value);
    const direct = t(source);
    if (direct !== source) return direct;
    const punctuated = source + '.';
    const translated = t(punctuated);
    return translated !== punctuated ? translated.replace(/[.!。！]+$/, '') : source;
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

  function drawDaily(data) {
    const W = 1080;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = W;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    const accent = data.color || YELLOW;
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
    const tile = 19;
    const gap = 4;
    for (let i = 0; i < 6; i += 1) {
      roundRect(ctx, markX + (i % 3) * (tile + gap), markY + Math.floor(i / 3) * (tile + gap), tile, tile, 5);
      ctx.fillStyle = TILES[i];
      ctx.fill();
    }
    const brandX = markX + 3 * (tile + gap) + 14;
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
      ctx.fillStyle = TILES[i];
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
    const tile = 19;
    const gap = 4;
    for (let i = 0; i < 6; i += 1) {
      roundRect(ctx, markX + (i % 3) * (tile + gap), markY + Math.floor(i / 3) * (tile + gap), tile, tile, 5);
      ctx.fillStyle = TILES[i];
      ctx.fill();
    }
    const brandX = markX + 3 * (tile + gap) + 14;
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

    ctx.fillStyle = YELLOW;
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
      ctx.fillStyle = TILES[i];
      ctx.fill();
    }
    ctx.fillStyle = MUTED;
    ctx.font = font(700, 12);
    tracked(ctx, t('Play offline'), 82, stripY + strip + 30, 2.4);

    if (data.badge && Number(data.badge.days) > 0) {
      const color = data.badge.color || YELLOW;
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
    ctx.fillStyle = YELLOW;
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
    const tile = 19;
    const gap = 4;
    for (let i = 0; i < 6; i += 1) {
      roundRect(ctx, markX + (i % 3) * (tile + gap), markY + Math.floor(i / 3) * (tile + gap), tile, tile, 5);
      ctx.fillStyle = TILES[i];
      ctx.fill();
    }
    const brandX = markX + 3 * (tile + gap) + 14;
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
    const title = cardTitle(data.title || 'Result');
    fitFont(ctx, title, 800, 64, 920, 34);
    ctx.fillText(title, 80, 306);

    const score = number(data.score == null ? '0' : data.score);
    const size = score.length <= 2 ? 224 : score.length === 3 ? 200 : score.length === 4 ? 168 : 138;
    ctx.font = font(800, size);
    ctx.fillText(score, 72, 512);

    ctx.fillStyle = YELLOW;
    ctx.fillRect(82, 534, 118, 9);

    ctx.fillStyle = MUTED;
    ctx.font = font(700, 15);
    tracked(ctx, cardLabel(data.label || 'POINTS'), 84, 582, 2.8);

    if (data.meta && data.meta.length) {
      ctx.fillStyle = INK;
      const meta = data.meta.map(cardMeta).map(number).join('   ·   ');
      fitFont(ctx, meta, 600, 26, 920, 15);
      ctx.fillText(meta, 80, 648);
    }

    // Six-piece footer strip, anchored by the same tiles as the app mark.
    const stripY = 716;
    const strip = 64;
    for (let i = 0; i < 6; i += 1) {
      roundRect(ctx, 80 + i * (strip + 10), stripY, strip, strip, 15);
      ctx.fillStyle = TILES[i];
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
    ctx.fillStyle = YELLOW;
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

  async function share(data, title, text) {
    try {
      if (document.fonts && document.fonts.load) {
        await document.fonts.load(font(800, 64));
      }
      const image = await file(data);
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [image] })) {
        await navigator.share({ files: [image], title: title, text: text, url: 'https://moh23rd.github.io/Sixfold/' });
        return true;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return true;
    }
    return false;
  }

  window.MergeShareCard = { draw: draw, file: file, fileSync: fileSync, share: share };
})();
