// phone, from its boards (2026-11-05, 風格第4批設計稿/phone a–d, source out/research/boards-b4/boards/phone.html): the frame
// is a phone's display, its 72 px corners rounded off in black, a status bar and a home indicator. The line is the text you
// are looking at on it: the lock screen's clock (a), a line being typed above the keyboard (b), the caller's name on an
// incoming call (c), a search and its first suggestion (d). Flat paint, hard edges, keys with a 3 px hard drop; no grain,
// no texture, no chat bubbles and no window frames round the words (JIZURA's own bubbles and windows; style standard §7).
// Printed words are interface labels (keys, buttons), the song's position in time, and the song's title and artist in the
// opening only (titleNow). The keyboard is the song's own script's: kana for a Japanese title, zhuyin for a Chinese one.
import type { Piece } from './world-pieces';
import { clamp01, ease, H, HandGround, HandIn, kept, mixHex, W, WorldEnv } from './world-craft';
import { artistBy, C, label, titleOf } from './world-b3-shared';
import { scriptOf } from '../fonts';
import { B4 } from './b4-inks';

const INK = B4.x16141C;
const PAPER = B4.xF4F3F7;
const CREAM = B4.xF1E9D8;
const GREY = B4.x5D5870;
const DECLINE = B4.xC7321C;
const ACCEPT = B4.x1F7A52;
const BLACK = B4.x050507;
const UI = (px: number, w = 500) => `${w} ${px}px "Noto Sans TC", "Noto Sans JP", sans-serif`;
const UIJ = (px: number, w = 500) => `${w} ${px}px "Noto Sans JP", "Noto Sans TC", sans-serif`;

const rr = (c: C, x: number, y: number, w: number, h: number, r: number) => { c.beginPath(); c.roundRect(x, y, w, h, Math.min(r, h / 2, w / 2)); };
const frame = (e: WorldEnv, f: (c: CanvasRenderingContext2D) => void) => { const c = e.ctx; c.save(); if (e.base) c.setTransform(e.base); f(c); c.restore(); };
const beatOf = (now: number, bpm = 120) => { const b = (now * Math.max(60, bpm)) / 60; return { idx: Math.floor(b), since: ((b - Math.floor(b)) * 60) / Math.max(60, bpm) }; };
/** The script the phone's interface speaks: the song title's (kana Japanese, Han Chinese, else Latin). */
const scriptFor = (e: WorldEnv) => scriptOf(e.title ?? '');
const pick = <T,>(e: WorldEnv, ja: T, zh: T, latin: T) => ({ ja, zh, latin })[scriptFor(e)];
/** The song's position, as a phone shows a time: m:ss. */
const clock = (t: number) => `${Math.floor(Math.max(0, t) / 60)}:${String(Math.floor(Math.max(0, t) % 60)).padStart(2, '0')}`;

/** The status bar: the time at the left (the song's own position), signal, wi-fi and battery at the right. */
function statusBar(c: C, e: WorldEnv, tone: string, battery = 1) {
  label(c, clock(e.now - e.age), 96, 64, UI(30, 700), tone, 0);
  c.save();
  c.fillStyle = tone;
  const [x, y] = [1634, 34];
  [[0, 22, 12], [14, 15, 19], [28, 8, 26], [42, 1, 33]].forEach(([dx, dy, h], i) => { c.globalAlpha = i === 3 ? 0.35 : 1; rr(c, x + dx, y + dy, 9, h, 2); c.fill(); });
  c.globalAlpha = 1;
  c.beginPath();
  c.moveTo(x + 76, y + 30); c.lineTo(x + 70, y + 24); c.arc(x + 76, y + 30, 8.5, (-135 * Math.PI) / 180, (-45 * Math.PI) / 180); c.closePath();
  c.fill();
  c.lineWidth = 5;
  c.strokeStyle = tone;
  c.beginPath(); c.arc(x + 76, y + 30, 18, (-135 * Math.PI) / 180, (-45 * Math.PI) / 180); c.stroke();
  rr(c, x + 114, y + 5, 62, 26, 7);
  c.lineWidth = 3;
  c.stroke();
  rr(c, x + 119, y + 10, 40 * battery, 16, 3);
  c.fill();
  rr(c, x + 179, y + 13, 5, 10, 2);
  c.fill();
  c.restore();
}
/** The display's rounded corners, black outside them, and the home indicator. */
function glass(c: C, home: string) {
  c.save();
  c.beginPath();
  c.rect(-20, -20, W + 40, H + 40);
  c.roundRect(0, 0, W, H, 72);
  c.fillStyle = BLACK;
  c.fill('evenodd');
  rr(c, 810, 1046, 300, 12, 6);
  c.fillStyle = home;
  c.fill();
  c.restore();
}

/** A key: its 3 px hard drop, its face, its label. */
function key(c: C, x: number, y: number, w: number, h: number, face: string, text: string, tone: string, px: number, font = UI) {
  rr(c, x, y + 3, w, h, 16);
  c.fillStyle = 'rgba(0,0,0,0.28)';
  c.fill();
  rr(c, x, y, w, h, 16);
  c.fillStyle = face;
  c.fill();
  if (text) label(c, text, x + w / 2, y + h / 2 + px * 0.36, font(px, 400), tone, 0, 'center');
}
const KANA = [['→', 'あ', 'か', 'さ', '⌫'], ['↺', 'た', 'な', 'は', '空白'], ['ABC', 'ま', 'や', 'ら', ''], ['☺', '゛゜小', 'わ', '、。?!', '改行']];
const ZHUYIN = ['ㄅㄉˇˋㄓˊ˙ㄚㄞㄢㄦ', 'ㄆㄊㄍㄐㄔㄗㄧㄛㄟㄣ', 'ㄇㄋㄎㄑㄕㄘㄨㄜㄠㄤ', 'ㄈㄌㄏㄒㄖㄙㄩㄝㄡㄥ'];
const QWERTY = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
/** The 12-key flick keyboard of board b, its top at `y`, in the night's keys. */
function kana12(c: C, y: number, face: string, dark: string, lit: string, tone: string) {
  const cols = [180, 360, 360, 360, 180];
  KANA.forEach((row, r) => {
    let x = 330;
    row.forEach((k, i) => {
      const w = cols[i] - 14;
      const top = y + 14 + r * 80;
      if (r === 2 && i === 4) key(c, x, top, w, 148, lit, '改行', INK, 30, UIJ);
      else if (!(r === 3 && i === 4)) key(c, x, top, w, 68, i === 0 || i === 4 ? dark : face, k, tone, [...k].length === 1 && i && i < 4 ? 44 : 30, UIJ);
      x += cols[i];
    });
  });
}
/** Board d's zhuyin keyboard, its top at `y`; its last row: numbers, space and the action key. */
function zhuyin(c: C, y: number, face: string, tone: string, action: string, actionTone: string, actionText: string, space: string, step = 80, kh = 68) {
  ZHUYIN.forEach((row, r) => {
    const ks = [...row];
    const tot = ks.length * 152 + (ks.length - 1) * 12;
    let x = (W - tot) / 2 + (r === 3 ? 40 : 0);
    ks.forEach((k) => { key(c, x, y + 12 + r * step, 152, kh, face, k, tone, kh * 0.58); x += 164; });
  });
  key(c, 200, y + 12 + 4 * step, 220, kh, mixHex(face, INK, 0.25), '123', tone, 30);
  key(c, 436, y + 12 + 4 * step, 1040, kh, face, space, GREY, 30);
  key(c, 1492, y + 12 + 4 * step, 228, kh, action, actionText, actionTone, 30);
}
/** A plain qwerty for a song in Latin script. */
function qwerty(c: C, y: number, face: string, tone: string, action: string, actionTone: string, actionText: string) {
  QWERTY.forEach((row, r) => {
    const ks = [...row];
    let x = (W - (ks.length * 152 + (ks.length - 1) * 12)) / 2;
    ks.forEach((k) => { key(c, x, y + 12 + r * 80, 152, 68, face, k, tone, 38); x += 164; });
  });
  key(c, 200, y + 252, 220, 68, mixHex(face, INK, 0.25), '123', tone, 30);
  key(c, 436, y + 252, 1040, 68, face, 'space', GREY, 30);
  key(c, 1492, y + 252, 228, 68, action, actionText, actionTone, 30);
}

/** a: the lock screen on the scheme's wallpaper; two hard arcs low in the corners, the now-playing card, two quick buttons. */
const lock: HandGround = (e) => frame(e, (c) => {
  const s = e.slots;
  c.fillStyle = e.paper;
  c.fillRect(0, 0, W, H);
  const disc = (x: number, y: number, r: number, tone: string) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = tone; c.fill(); };
  disc(1640, 1180, 560, s.accent);
  disc(1640, 1180, 400, e.paper);
  disc(1640, 1180, 300, s.ink2);
  disc(230, 1210, 430, s.faint);
  disc(230, 1210, 300, s.accent);
  statusBar(c, e, s.ink);
  const r = e.rect;
  // the opening's line above the clock: the artist, then the title
  const by = [artistBy(e), titleOf(e)].filter(Boolean).join('　·　');
  if (by && (!r || r.y0 > 170)) label(c, by, W / 2, 154, UI(36, 500), mixHex(s.ink, e.paper, 0.1), 2, 'center');
  // the now-playing card only below a line that leaves it room
  if (!r || r.y1 < 650) {
    rr(c, 560, 668, 800, 214, 40);
    c.fillStyle = s.plate;
    c.fill();
    rr(c, 598, 706, 138, 138, 22);
    c.fillStyle = s.accent;
    c.fill();
    c.save();
    c.translate(667, 775);
    c.rotate(e.now * 1.2);
    c.strokeStyle = s.plate;
    c.lineWidth = 10;
    c.beginPath(); c.arc(0, 0, 44, 0, Math.PI * 2); c.stroke();
    c.fillStyle = s.plate;
    c.beginPath(); c.arc(0, 0, 12, 0, Math.PI * 2); c.fill();
    c.fillRect(20, -6, 14, 12);
    c.restore();
    const t = titleOf(e);
    label(c, t || clock(e.now), 768, 752, UI(40, 700), s.plateInk, 0);
    const a = artistBy(e);
    if (a) label(c, a, 768, 798, UI(28, 400), GREY, 0);
    // the bar keeps the phrase: eight beats across
    const k = ((beatOf(e.now, e.bpm).idx % 8) + 1) / 8;
    rr(c, 768, 822, 440, 8, 4);
    c.fillStyle = mixHex(s.plate, INK, 0.12);
    c.fill();
    rr(c, 768, 822, 440 * k, 8, 4);
    c.fillStyle = s.plateInk;
    c.fill();
    c.beginPath(); c.moveTo(1252, 744); c.lineTo(1294, 772); c.lineTo(1252, 800); c.closePath();
    c.fill();
    rr(c, 1300, 744, 10, 56, 3);
    c.fill();
  }
  for (const x of [150, 1634]) { c.beginPath(); c.arc(x + 68, 910, 68, 0, Math.PI * 2); c.fillStyle = mixHex(e.paper, PAPER, 0.12); c.fill(); }
  c.save();
  c.strokeStyle = PAPER;
  c.lineWidth = 7;
  c.lineJoin = 'round';
  c.beginPath(); c.moveTo(202, 878); c.lineTo(234, 878); c.lineTo(228, 904); c.lineTo(228, 944); c.lineTo(208, 944); c.lineTo(208, 904); c.closePath(); c.stroke();
  c.beginPath(); c.moveTo(212, 906); c.lineTo(224, 906); c.stroke();
  rr(c, 1667, 887, 70, 50, 10); c.stroke();
  c.beginPath(); c.arc(1702, 912, 14, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.moveTo(1688, 887); c.lineTo(1694, 877); c.lineTo(1710, 877); c.lineTo(1716, 887); c.stroke();
  c.restore();
  glass(c, PAPER);
});

/** The night the compose screen is lit in: the scheme's wallpaper pressed toward black. */
const night = (e: WorldEnv) => mixHex(e.paper, B4.x070912, 0.72);
/**
 * b: a compose field at night (or by day, the same screen in its light theme); the line typed in, its last row underlined
 * and the caret after it; the candidate bar and the keyboard below.
 */
const composeOf = (day: boolean): HandGround => (e) => frame(e, (c) => {
  const s = e.slots;
  const bg = day ? s.plate : night(e);
  const text = day ? INK : s.ink;
  const mark = day ? s.accent : s.ink2;
  const panel = day ? mixHex(bg, B4.x6E6890, 0.16) : mixHex(bg, PAPER, 0.06);
  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);
  statusBar(c, e, mixHex(text, bg, 0.05));
  c.fillStyle = mixHex(bg, day ? INK : PAPER, 0.08);
  c.fillRect(0, 92, W, 2);
  c.save();
  c.strokeStyle = mark;
  c.lineWidth = 7;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath(); c.moveTo(118, 118); c.lineTo(92, 144); c.lineTo(118, 170); c.stroke();
  c.restore();
  const t = titleOf(e);
  if (t) label(c, t, W / 2, 152, UI(32, 700), text, 0, 'center');
  const r = e.rect;
  if (r) {
    // the conversion still open: the last row underlined, the caret after it, blinking
    const rowH = Math.min(150, r.y1 - r.y0);
    c.fillStyle = mark;
    c.fillRect(r.x0, r.y1 + 12, Math.max(80, r.x1 - r.x0), 6);
    if ((e.now * 1.6) % 1 < 0.6) c.fillRect(r.x1 + 18, r.y1 - rowH * 0.92, 8, rowH * 0.92);
  }
  c.fillStyle = panel;
  c.fillRect(0, 612, W, H - 612);
  const chips = pick(e, ['変換', '確定', 'かな', '英数'], ['選字', '確定', '注音', '英文'], ['Convert', 'Done', 'abc', '123']);
  rr(c, 96, 628, 362, 64, 14);
  c.fillStyle = day ? B4.xFFFFFF : mixHex(panel, s.ink2, 0.2);
  c.fill();
  chips.forEach((w, i) => label(c, w, i ? 520 + (i - 1) * 330 : 130, 676, UI(42, i ? 400 : 500), i ? mixHex(text, panel, 0.38) : text, 0));
  const face = day ? B4.xFFFFFF : mixHex(panel, PAPER, 0.14);
  const tone = day ? INK : mixHex(s.ink, panel, 0.06);
  const sc = scriptFor(e);
  if (sc === 'ja') kana12(c, 708, face, day ? mixHex(panel, INK, 0.12) : mixHex(panel, PAPER, 0.08), mark, tone);
  else if (sc === 'zh') zhuyin(c, 704, face, tone, mark, day ? B4.xFFFFFF : INK, '換行', '空白', 66, 56);
  else qwerty(c, 720, face, tone, mark, day ? B4.xFFFFFF : INK, 'return');
  glass(c, mixHex(text, bg, 0.05));
});

/**
 * c: an incoming call; the caller's name fills the cream upper screen (or the night's, in the dark theme, over a cream
 * panel), decline and accept breathe on the beat below.
 */
const callOf = (dark: boolean): HandGround => (e) => frame(e, (c) => {
  const s = e.slots;
  const top = dark ? night(e) : CREAM;
  const text = dark ? s.ink : INK;
  c.fillStyle = top;
  c.fillRect(0, 0, W, H);
  statusBar(c, e, text);
  const r = e.rect;
  const who = [artistBy(e), pick(e, '携帯', '行動電話', 'mobile')].filter(Boolean).join('　·　');
  if (!r || r.y0 > 190) label(c, who, W / 2, 158, UI(40, 500), mixHex(text, top, 0.15), 3, 'center');
  c.fillStyle = dark ? CREAM : e.paper;
  c.fillRect(0, 760, W, H - 760);
  const { since } = beatOf(e.now, e.bpm);
  const k = 1 + 0.04 * Math.exp(-since * 5);
  const [no, yes] = pick(e, ['拒否', '応答'], ['拒絕', '接聽'], ['Decline', 'Accept']);
  ([[605, DECLINE, no, 135], [1315, ACCEPT, yes, 0]] as [number, string, string, number][]).forEach(([x, tone, word, turn]) => {
    c.save();
    c.translate(x, 897);
    c.scale(k, k);
    c.beginPath(); c.arc(0, 0, 85, 0, Math.PI * 2); c.fillStyle = tone; c.fill();
    c.rotate((turn * Math.PI) / 180);
    c.scale(1.25, 1.25);
    c.fillStyle = PAPER;
    c.fill(new Path2D('M-34 -10c0-14 8-20 18-22l10 20-12 8c4 10 12 18 22 22l8-12 20 10c-2 10-8 18-22 18-30 0-44-14-44-44z'));
    c.restore();
    label(c, word, x, 1030, UI(30, 500), dark ? INK : CREAM, 0, 'center');
  });
  glass(c, dark ? INK : CREAM);
});

/** d: a search; the line's first phrase typed into the field, the second its first suggestion; the keyboard below. */
const search: HandGround = (e) => frame(e, (c) => {
  const s = e.slots;
  c.fillStyle = s.plate;
  c.fillRect(0, 0, W, H);
  statusBar(c, e, INK);
  const r = e.rect;
  // (a line split onto the suggestion reaches down past 330 px; one in the field alone, two rows included, never does)
  const split = !!r && r.y1 > 330;
  // the field grows round a line it had to take in two rows
  const fieldH = r && !split ? Math.max(136, r.y1 + 26 - 104) : 136;
  const [fx0, fx1] = [Math.min(96, (r?.x0 ?? 96) - 40), Math.max(1824, (r?.x1 ?? 0) + 70)];
  rr(c, fx0, 104, fx1 - fx0, fieldH, 68);
  c.fillStyle = mixHex(s.plate, B4.x6E6890, 0.15);
  c.fill();
  const lens = (x: number, y: number, rad: number, w: number, tone: string) => { c.save(); c.strokeStyle = tone; c.lineWidth = w; c.lineCap = 'round'; c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.moveTo(x + rad * 0.72, y + rad * 0.72); c.lineTo(x + rad * 1.65, y + rad * 1.65); c.stroke(); c.restore(); };
  if (!r || r.x0 > 236) lens(186, 166, 28, 9, INK);
  // the caret after a line typed whole into the field
  if (r && !split && (e.now * 1.6) % 1 < 0.6) { c.fillStyle = s.accent; c.fillRect(Math.min(1780, r.x1 + 22), 122, 8, 100); }
  if (split) {
    // the suggestion grows in under the field
    const k = ease(clamp01(e.age / 0.25), 3);
    rr(c, 96, 270, 1728, 176 * k, 32);
    c.fillStyle = B4.xFFFFFF;
    c.fill();
    if (k > 0.9) {
      lens(176, 350, 22, 7, B4.x7A748A);
      c.save(); c.strokeStyle = INK; c.lineWidth = 7; c.lineCap = 'round'; c.beginPath(); c.moveTo(1760, 374); c.lineTo(1720, 334); c.moveTo(1720, 374); c.lineTo(1720, 334); c.lineTo(1760, 334); c.stroke(); c.restore();
    }
  }
  // the opening's two further suggestions: the song and its singer
  const more = [titleOf(e) && `${titleOf(e)} ${pick(e, '歌詞', '歌詞', 'lyrics')}`, artistBy(e)].filter(Boolean) as string[];
  more.forEach((t, i) => { lens(176, 502 + i * 76, 18, 7, B4.x7A748A); label(c, t, 250, 516 + i * 76, UI(38, 400), B4.x3A3446, 0); });
  if (more.length) { c.fillStyle = mixHex(s.plate, INK, 0.1); c.fillRect(96, 532, 1728, 2); }
  c.fillStyle = mixHex(s.plate, B4.x6E6890, 0.22);
  c.fillRect(0, 640, W, H - 640);
  const sc = scriptFor(e);
  const go = pick(e, '検索', '搜尋', 'search');
  if (sc === 'ja') kana12(c, 640, B4.xFFFFFF, mixHex(s.plate, B4.x6E6890, 0.3), s.accent, INK);
  else if (sc === 'zh') zhuyin(c, 640, B4.xFFFFFF, INK, s.accent, B4.xFFFFFF, go, '空白');
  else qwerty(c, 640, B4.xFFFFFF, INK, s.accent, B4.xFFFFFF, go);
  glass(c, INK);
});

const Gs: Record<string, HandGround> = { 'phone/lock': lock, 'phone/compose': composeOf(false), 'phone/compose-day': composeOf(true), 'phone/call': callOf(false), 'phone/call-night': callOf(true), 'phone/search': search };

const INS: Record<string, HandIn> = {
  // the swipe to the next screen: one band of the screen's colour passes right to left, the home indicator riding on it;
  // it never passes over the line landing with it
  'screen-swipe': { sec: 0.32, draw: (e, q) => frame(e, (c) => {
    const r = e.rect;
    if (q >= 1) return;
    const x = W - (W + 320) * ease(q, 3);
    c.save();
    c.beginPath();
    if (r) { c.rect(0, 0, W, H); c.rect(r.x0 - 24, r.y0 - 24, r.x1 - r.x0 + 48, r.y1 - r.y0 + 48); c.clip('evenodd'); c.beginPath(); }
    c.rect(x, 0, 320, H);
    c.clip();
    c.fillStyle = mixHex(e.paper, PAPER, 0.1);
    c.fillRect(x, 0, 320, H);
    rr(c, x + 10, 1046, 300, 12, 6);
    c.fillStyle = PAPER;
    c.fill();
    c.restore();
  }) },
};

/** The status bar's band: no line of the phone's pages ever comes up above 100 px, so its pieces live there. */
const BAND = 100;
/** The system's own dark toast a status piece stands on, whatever screen is up. */
const toast = (c: C, x: number, y: number, w: number, h: number) => { rr(c, x, y, w, h, h / 2); c.fillStyle = INK; c.fill(); };
/** In for the first share `a` of a piece, out over its last `b`, held between. */
const inOut = (q: number, a = 0.15, b = 0.15) => (q < a ? ease(q / a, 3) : q > 1 - b ? 1 - ease((q - 1 + b) / b, 2) : 1);

const PIECES: Record<string, Piece> = {
  // a notification drops into the top of the screen, stays, and goes back up (left off when a line is up there)
  'notify-drop': { sec: 2, clear: 0, draw: (e, q) => frame(e, (c) => {
    if (e.rect && e.rect.y0 < BAND + 40) return;
    const [w, h, x] = [900, 104, (W - 900) / 2];
    const y = 14 - (1 - inOut(q)) * (h + 30);
    rr(c, x, y + 4, w, h, 30);
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.fill();
    rr(c, x, y, w, h, 30);
    c.fillStyle = PAPER;
    c.fill();
    rr(c, x + 22, y + 18, 68, 68, 18);
    c.fillStyle = e.slots.accent;
    c.fill();
    c.save();
    c.strokeStyle = PAPER; c.lineWidth = 5; c.lineJoin = 'round';
    rr(c, x + 37, y + 38, 38, 28, 5); c.stroke();
    c.beginPath(); c.moveTo(x + 37, y + 40); c.lineTo(x + 56, y + 54); c.lineTo(x + 75, y + 40); c.stroke();
    c.restore();
    label(c, pick(e, '新着メッセージ', '新訊息', 'New message'), x + 112, y + 50, UI(34, 700), INK, 0);
    label(c, pick(e, 'たった今', '現在', 'now'), x + w - 30, y + 50, UI(26, 400), GREY, 0, 'right');
    label(c, clock(e.now), x + 112, y + 88, UI(26, 400), GREY, 0);
  }) },
  // the battery grows out of the status bar in a toast, drains a cell at a time, and its last cell blinks red
  'battery-drain': { sec: 1.6, clear: 0, draw: (e, q) => frame(e, (c) => {
    const k = inOut(q, 0.12, 0.12);
    const [x, y] = [1490, 14 - (1 - k) * 100];
    const cells = Math.max(1, 5 - Math.floor(q * 5.5));
    toast(c, x, y, 340, 76);
    c.save();
    c.strokeStyle = PAPER; c.lineWidth = 5;
    rr(c, x + 34, y + 16, 200, 44, 12); c.stroke();
    c.fillStyle = PAPER;
    rr(c, x + 238, y + 30, 10, 16, 4); c.fill();
    for (let i = 0; i < cells; i++) {
      if (cells === 1 && Math.floor(q * 12) % 2) continue;
      rr(c, x + 44 + i * 37, y + 25, 30, 26, 5);
      c.fillStyle = cells === 1 ? DECLINE : PAPER;
      c.fill();
    }
    c.restore();
  }) },
  // the signal bars, grown out of the status bar in a toast, go out one by one and the phone says it has no service
  'signal-lost': { sec: 1.6, clear: 0, draw: (e, q) => frame(e, (c) => {
    const k = inOut(q, 0.12, 0.12);
    const [x, y] = [80, 14 - (1 - k) * 100];
    const on = 4 - Math.min(4, Math.floor(q * 5));
    toast(c, x, y, 420, 76);
    c.save();
    [0, 1, 2, 3].forEach((i) => { rr(c, x + 34 + i * 26, y + 58 - (i + 1) * 10, 18, (i + 1) * 10, 4); c.fillStyle = PAPER; c.globalAlpha = i < on ? 1 : 0.25; c.fill(); });
    c.restore();
    label(c, on === 0 ? pick(e, '圏外', '無服務', 'No service') : pick(e, '検索中…', '搜尋訊號…', 'Searching…'), x + 160, y + 50, UI(32, 700), PAPER, 0);
  }) },
};

export const PHONE = { grounds: Gs, ins: INS, pieces: PIECES, objects: {} };
