// brutalist, redrawn from its board (2026-11-04, 風格第3批設計稿/brutalist a–d): the headline of a photocopied poster. A 96 px
// margin all round that nothing crosses, a 4 px rule along the top with small Space Mono heads, rules dividing the page,
// one signal-red band, toner specks multiplied over the sheet and the copier's darker edge. Everything cuts: no fades.
// Real data only on the heads (the song's title and artist). The dark sheet (board c) is the same page reversed.
import type { Piece } from './world-pieces';
import { clamp01, fract, H, HandGround, HandIn, isLight, kept, W, WorldEnv } from './world-craft';
import { artistOf, C, label, rng, titleOnly } from './world-b3-shared';
import { B3 } from './b3-inks';

const RED = B3.xBC180E;
const M = 96;
const MONO = (px: number, w = 400) => `${w} ${px}px "Space Mono", "Chiron Hei HK", monospace`;
const HEAD = (px: number) => `900 ${px}px "Chiron Hei HK", "Noto Sans TC", sans-serif`;

const dark = (e: WorldEnv) => !isLight(e.paper);
/** The copier's own jolt: the whole sheet moves 1 px every other frame (board motion). */
const feed = (e: WorldEnv) => (Math.floor(e.now * 15) % 2 ? 1 : 0);
const page = (e: WorldEnv, f: (c: CanvasRenderingContext2D) => void) => { const c = e.ctx; c.save(); if (e.base) c.setTransform(e.base); c.translate(0, feed(e)); f(c); c.restore(); };

/** Toner specks, made once: a few thousand dots and dashes the copier dropped (generated, as the board's were). */
const toner = (tone: string) => kept(`brut-toner|${tone}`, W, H, (c) => {
  const R = rng(41);
  c.fillStyle = tone;
  for (let i = 0; i < 2600; i++) {
    c.globalAlpha = 0.18 + 0.5 * R() ** 2;
    const [x, y, s] = [R() * W, R() * H, 0.6 + R() * 1.8];
    c.fillRect(x, y, s * (R() < 0.15 ? 4 : 1), s);
  }
  c.globalAlpha = 1;
});
/** The finish over the page: toner multiplied (screened on the dark sheet) and the copier's darker edge. */
function finish(c: CanvasRenderingContext2D, e: WorldEnv) {
  c.save();
  c.globalCompositeOperation = dark(e) ? 'screen' : 'multiply';
  c.globalAlpha = dark(e) ? 0.35 : 0.9;
  c.drawImage(toner(dark(e) ? B3.x6A6A66 : B3.x121212), 0, 0);
  c.restore();
  // the board's inset edge: a 10 px band at 6 % and a 90 px falloff at 22 %
  c.fillStyle = 'rgba(0,0,0,0.06)';
  c.fillRect(0, 0, W, 10); c.fillRect(0, H - 10, W, 10); c.fillRect(0, 0, 10, H); c.fillRect(W - 10, 0, 10, H);
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [[0, 0, 0, 90, 0, 0, W, 90], [0, H, 0, H - 90, 0, H - 90, W, 90], [0, 0, 90, 0, 0, 0, 90, H], [W, 0, W - 90, 0, W - 90, 0, 90, H]]) {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(0,0,0,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(rx, ry, rw, rh);
  }
}
/** The sheet and its top rule with three heads (artist, title, nothing invented). */
function sheet(c: C, e: WorldEnv, heads = true) {
  c.fillStyle = e.paper;
  c.fillRect(0, -2, W, H + 4);
  c.fillStyle = e.ink;
  c.fillRect(M, M, W - 2 * M, 4);
  if (!heads) return;
  const t = titleOnly(e.title);
  label(c, artistOf(e.title), M, M + 34, MONO(19), e.ink, 1.1);
  label(c, t, W / 2 - 100, M + 34, MONO(19), e.ink, 1.1);
}

/** a: the headline as big as the page allows, a rule and a mono column at its right, the red band below with the title. */
const headline: HandGround = (e) => page(e, (c) => {
  sheet(c, e);
  const r = e.rect ?? { x0: M, y0: 180, x1: 1100, y1: 800 };
  const rx = Math.min(W - 520, Math.max(r.x1 + 60, 1100));
  c.fillStyle = e.ink;
  c.fillRect(rx, r.y0, 4, Math.min(620, r.y1 - r.y0));
  const lines = [titleOnly(e.title), artistOf(e.title)].filter(Boolean);
  lines.forEach((t, i) => label(c, t, rx + 32, r.y0 + 26 + i * 30, MONO(17), e.ink, 1));
  // the band is pulled out from the left margin at the cut
  const top = Math.min(H - M - 150, r.y1 + 36);
  const k = clamp01(e.age / 0.25);
  const w = Math.round(((W - 2 * M) * Math.ceil(k * 4)) / 4);
  c.fillStyle = RED;
  c.fillRect(M, top, w, 150);
  // the band carries the title, or the line's last phrase when the line is split into it (world-split.ts)
  if (k >= 1 && r.y1 <= top + 20) label(c, titleOnly(e.title), M + 34, top + 112, HEAD(110), B3.xFFFFFF, 34);
  finish(c, e);
});

/** b: a quiet sheet: a red rule over the line low on the left, a thin rule and the small heads at the right. */
const footer: HandGround = (e) => page(e, (c) => {
  sheet(c, e, false);
  label(c, titleOnly(e.title), M, M + 34, MONO(19), e.ink, 1.1);
  label(c, artistOf(e.title), W - M, M + 34, MONO(19), e.ink, 1.1, 'right');
  const r = e.rect ?? { x0: M, y0: 700, x1: 1000, y1: 980 };
  const k = clamp01(e.age / 0.25);
  c.fillStyle = RED;
  c.fillRect(M, r.y0 - 60, Math.round((1150 * Math.ceil(k * 4)) / 4), 22);
  const rx = Math.max(r.x1 + 120, 1380);
  c.fillStyle = e.ink;
  c.fillRect(rx, r.y0 - 60, 2, H - M - (r.y0 - 60));
  label(c, titleOnly(e.title), rx + 30, r.y0 - 24, MONO(17), e.ink, 1);
  label(c, artistOf(e.title), rx + 30, r.y0 + 6, MONO(17), e.ink, 1);
  finish(c, e);
});

/** c: the reversed sheet: four red-ruled cells across the page, numbered, the shout across all of them; they invert in turn. */
const cells: HandGround = (e) => page(e, (c) => {
  // (the board's reversed sheet on a dark scheme; on a light one the same cells on the copy paper)
  c.fillStyle = e.paper;
  c.fillRect(0, -2, W, H + 4);
  const step = (W - 2 * M) / 4;
  const on = Math.floor(e.now * 2) % 6;
  for (let i = 0; i < 4; i++) {
    const x = M + i * step;
    if (i === on) { c.fillStyle = dark(e) ? B3.x2A1210 : 'rgba(188,24,14,0.10)'; c.fillRect(x, 170, step, 814); }
    c.strokeStyle = RED;
    c.lineWidth = 2;
    c.strokeRect(x + 1, 171, step - 2, 812);
    label(c, `0${i + 1}`, x + 16, 210, MONO(19), RED, 1.1);
  }
  label(c, titleOnly(e.title), W - M, M + 20, MONO(19), e.ink, 1.1, 'right');
  label(c, artistOf(e.title), M, M + 20, MONO(19), e.ink, 1.1);
  finish(c, e);
});

/** d: two columns at the right behind a rule, the title set big with red strokes between its characters on the left. */
const columns: HandGround = (e) => page(e, (c) => {
  sheet(c, e, false);
  label(c, titleOnly(e.title), M, M + 34, MONO(19), e.ink, 1.1);
  const r = e.rect ?? { x0: 1420, y0: 128, x1: 1700, y1: 984 };
  c.fillStyle = e.ink;
  c.fillRect(r.x0 - 60, 128, 4, H - M - 128);
  const t = [...titleOnly(e.title)].slice(0, 5);
  // (on the mirrored page x runs right to left on screen: the characters are laid in reverse so they still read in order)
  const flipped = c.getTransform().a < 0;
  const toks = t.flatMap((ch, i) => (i ? ['／', ch] : [ch]));
  if (flipped) toks.reverse();
  c.font = HEAD(150);
  let x = M - 6;
  for (const tk of toks) {
    label(c, tk, x, 790, HEAD(150), tk === '／' ? RED : e.ink);
    x += c.measureText(tk).width;
  }
  c.fillStyle = e.ink;
  c.fillRect(M, 820, Math.min(1200, r.x0 - 160 - M), 4);
  label(c, artistOf(e.title), M, 866, MONO(17), e.ink, 1);
  finish(c, e);
});

const Gs: Record<string, HandGround> = { 'brutalist/headline': headline, 'brutalist/footer': footer, 'brutalist/cells': cells, 'brutalist/columns': columns };

const INS: Record<string, HandIn> = {
  // a black bar is pulled across the sheet in four hard steps: the next copy lands under it
  // (a quarter of the sheet a step, never over the line that lands with it: a full black sheet hid a short line, tenmon c035)
  'black-bar-sweep': { sec: 0.24, draw: (e, q) => {
    const c = e.ctx;
    c.save();
    if (e.base) c.setTransform(e.base);
    const k = Math.min(3, Math.floor(q * 4));
    const r = e.rect;
    if (r) { c.beginPath(); c.rect(0, 0, W, H); c.rect(r.x0 - 24, r.y0 - 24, r.x1 - r.x0 + 48, r.y1 - r.y0 + 48); c.clip('evenodd'); }
    c.fillStyle = B3.x121212;
    c.fillRect((W * k) / 4, 0, W / 4, H);
    c.restore();
  } },
};

/** The lyric box with a margin: a piece keeps out of it. */
const keepOut = (e: WorldEnv, m: number) => { const r = e.rect ?? { x0: W * 0.3, y0: H * 0.35, x1: W * 0.7, y1: H * 0.65 }; return { x0: r.x0 - m, y0: r.y0 - m, x1: r.x1 + m, y1: r.y1 + m }; };

const PIECES: Record<string, Piece> = {
  // a red band is pulled out of the left margin, in four hard steps, in the free strip above or below the words
  'band-pull': { sec: 1.2, clear: 0, draw: (e, q) => { const c = e.ctx; c.save(); if (e.base) c.setTransform(e.base);
    const b = keepOut(e, 24);
    const y = b.y0 - 60 > M + 40 ? b.y0 - 60 : b.y1 + 12 < H - M - 48 ? b.y1 + 12 : -1;
    if (y >= 0) { c.fillStyle = RED; c.fillRect(M, y, ((W - 2 * M) * Math.ceil(clamp01(q * 1.5) * 4)) / 4, 44); }
    c.restore(); } },
  // the copier drags: dark streaks run across the margins, never across the words
  'toner-drag': { sec: 0.8, clear: 0, draw: (e, q) => { const c = e.ctx; c.save(); if (e.base) c.setTransform(e.base);
    const b = keepOut(e, 30);
    c.fillStyle = isLight(e.paper) ? 'rgba(18,18,18,0.5)' : 'rgba(242,240,234,0.4)';
    for (let i = 0; i < 9; i++) { const y = M + fract(Math.sin(i * 77.1 + Math.floor(q * 6)) * 999) * (H - 2 * M); if (y > b.y0 && y < b.y1) continue; c.fillRect(0, y, W, 2 + (i % 3)); }
    c.restore(); } },
  // the headline's size jumps a grid step and back: rules flash at the margins in time
  'rule-slam': { sec: 0.9, clear: 0, draw: (e, q) => { const c = e.ctx; c.save(); if (e.base) c.setTransform(e.base);
    const n = Math.min(4, Math.floor(q * 8));
    c.fillStyle = isLight(e.paper) ? B3.x121212 : B3.xF2F0EA;
    const b = keepOut(e, 20);
    for (let i = 0; i < n; i++) { const y = H - M - 4 - i * 16; if (y + 4 > b.y0 && y < b.y1) continue; c.fillRect(M, y, W - 2 * M, 4); }
    c.restore(); } },
};

export const BRUTALIST = { grounds: Gs, ins: INS, pieces: PIECES, objects: {} };
