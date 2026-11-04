// y2k, rebuilt from its direction-B boards (2026-11-04, y2k設計稿_第二版/B a–d): a personal page and its player on the early
// web around 2000, on saturated ultramarine (never black). Gel buttons with a hard white top window, a caustic line and a
// hard drop; a pixel cursor; an iridescent foil seal with fine teeth (a sticker, not a comic burst); a CD-ROM; a segmented
// EQ; foil tape strips held by a candy butterfly clip; a 3 px pixel grid. Neon lime, cyan and pink are accents only: the
// pixel stars, the EQ's segments and the pink misprint under white words (world-glyph-loud `web-shift`, static). The words
// are white, or deep ink where they stand on a gel or on foil. Everything is hard-edged: no blur, no glow, no outline type,
// no window round the words. Printed words are the song's title in its opening (world-title.ts) and the page's own menu.
import type { Piece } from './world-pieces';
import { clamp01, ease, fract, H, hash, HandGround, HandIn, kept, mixHex, W, WorldEnv } from './world-craft';
import { burstPath, C, label, rng, titleOf } from './world-b3-shared';
import { B3 } from './b3-inks';

const INK = B3.x0D0A3A;
const CURSOR_INK = B3.x0B0A2E;
const WHITE = B3.xFFFFFF;
const LIME = B3.xC8FF1F;
const CYAN = B3.x3CF0FF;
const PINK = B3.xFF3FA4;
/** The board's foil: a pastel hue run, under hard white glints. */
const FOIL: [number, string][] = [[0, B3.xFFB8E8], [0.22, B3.xCDB8FF], [0.45, B3.xA2E9FF], [0.66, B3.xB9FFDC], [0.84, B3.xFFF3A6], [1, B3.xFFB8E8]];
/** Gel flavours, top to bottom: light, body, deep (board B's buttons). */
const GELS: Record<string, [string, string, string]> = {
  cyan: [B3.xD4FBFF, B3.x5FE6F6, B3.x14A9CC],
  pink: [B3.xFFE0F1, B3.xFF7CC2, B3.xE0237F],
  lime: [B3.xF2FFC7, B3.xC8FF1F, B3.x7FB800],
};
const PIXEL = (px: number, w = 700) => `${w} ${px}px Silkscreen, "LXGW Marker Gothic", "Kosugi Maru", sans-serif`;
/** The scheme's lead gel (its plate), or cyan. */
const gelOf = (e: WorldEnv) => Object.values(GELS).find((g) => g[1] === e.slots.plate) ?? GELS['cyan'];

type Box = { x0: number; y0: number; x1: number; y1: number };
const rr = (c: C, x: number, y: number, w: number, h: number, r: number) => { c.beginPath(); c.roundRect(x, y, w, h, Math.min(r, h / 2, w / 2)); };
const mirrored = (c: C) => c.getTransform().a < 0;
/** Draws in the frame's own coordinates (a mirrored page's base keeps its mirror). */
const frame = (e: WorldEnv, f: (c: CanvasRenderingContext2D) => void) => { const c = e.ctx; c.save(); if (e.base) c.setTransform(e.base); f(c); c.restore(); };
/** The song's beat grid at this moment: which beat, and seconds since it. */
const beatOf = (now: number, bpm = 120) => { const b = (now * Math.max(60, bpm)) / 60; return { idx: Math.floor(b), since: (fract(b) * 60) / Math.max(60, bpm) }; };

/** The sheet: ultramarine running darker down (a calm page runs from deep to lighter), the 3 px pixel grid. Kept. */
const sheet = (e: WorldEnv, calm: boolean) => kept(`y2k|${e.paper}|${calm}`, W, H, (c) => {
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, calm ? mixHex(e.paper, B3.x000000, 0.55) : e.paper);
  g.addColorStop(1, mixHex(e.paper, B3.x000000, calm ? 0.16 : 0.33));
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  c.globalAlpha = calm ? 0.1 : 0.14;
  c.fillStyle = WHITE;
  c.beginPath();
  for (let x = 20; x < W; x += 40) for (let y = 20; y < H; y += 40) c.rect(x - 1.5, y - 1.5, 3, 3);
  c.fill();
  c.globalAlpha = 1;
});

/** A gel button: hard drop, the body's three tones, a caustic line low inside, the deep rim, a hard white window. */
function gel(c: C, x: number, y: number, w: number, h: number, [top, mid, bot]: [string, string, string], press = 0, lit = 1) {
  const r = h / 2;
  c.save();
  c.globalAlpha = 0.45;
  rr(c, x + 10 - press, y + 12 - press, w, h, r);
  c.fillStyle = INK;
  c.fill();
  c.restore();
  y += press;
  const g = c.createLinearGradient(0, y, 0, y + h);
  const [t, m, b] = [top, mid, bot].map((v) => (lit < 1 ? mixHex(v, INK, 0.35 * (1 - lit)) : v));
  g.addColorStop(0, t);
  g.addColorStop(0.5, m);
  g.addColorStop(1, b);
  rr(c, x, y, w, h, r);
  c.fillStyle = g;
  c.fill();
  c.save();
  c.globalAlpha = 0.9;
  rr(c, x + h * 0.5, y + h * 0.78, w - h, h * 0.07, h * 0.035);
  c.fillStyle = t;
  c.fill();
  c.restore();
  rr(c, x, y, w, h, r);
  c.lineWidth = 4;
  c.strokeStyle = INK;
  c.stroke();
  c.save();
  c.globalAlpha = press ? 0.45 : 0.6;
  rr(c, x + h * 0.3, y + h * 0.09, w - h * 0.6, h * 0.36, h * 0.18);
  c.fillStyle = WHITE;
  c.fill();
  c.restore();
}
/** A linear foil gradient across a box, `x1,y1`..`x2,y2` in shares of it (the boards' objectBoundingBox). */
function foil(c: C, b: Box, x1: number, y1: number, x2: number, y2: number) {
  const [w, h] = [b.x1 - b.x0, b.y1 - b.y0];
  const g = c.createLinearGradient(b.x0 + x1 * w, b.y0 + y1 * h, b.x0 + x2 * w, b.y0 + y2 * h);
  FOIL.forEach(([o, s]) => g.addColorStop(o, s));
  return g;
}
/** The foil seal: 24 fine teeth, the foil, three hard glints, the deep keyline; a short sticker word on it, turned. */
function seal(c: C, cx: number, cy: number, r: number, word = '', glint = 0) {
  burstPath(c, cx, cy, r, r, 24, 0.09, 7);
  c.fillStyle = foil(c, { x0: cx - r * 1.12, y0: cy - r * 1.12, x1: cx + r * 1.12, y1: cy + r * 1.12 }, 0, 0, 1, 1);
  c.fill();
  c.save();
  burstPath(c, cx, cy, r, r, 24, 0.09, 7);
  c.clip();
  c.fillStyle = WHITE;
  c.globalAlpha = 0.55;
  ([[-0.7, 0.16], [-0.25, 0.07], [0.3, 0.12]] as [number, number][]).forEach(([o, w]) => {
    const x = cx + (o + glint) * r;
    c.beginPath();
    c.moveTo(x, cy - r * 1.2);
    c.lineTo(x + r * w, cy - r * 1.2);
    c.lineTo(x + r * w - r * 0.7, cy + r * 1.2);
    c.lineTo(x - r * 0.7, cy + r * 1.2);
    c.closePath();
    c.fill();
  });
  c.restore();
  burstPath(c, cx, cy, r, r, 24, 0.09, 7);
  c.lineWidth = 3.5;
  c.strokeStyle = INK;
  c.stroke();
  if (!word) return;
  c.save();
  c.translate(cx, cy);
  c.rotate(((mirrored(c) ? 12 : -12) * Math.PI) / 180);
  label(c, word, 0, r * 0.11, PIXEL(r * 0.345), INK, 0, 'center');
  c.restore();
}
/** A five-point foil star, deep keyline, one hard glint. */
function foilStar(c: C, cx: number, cy: number, r: number) {
  c.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const k = i % 2 ? r * 0.46 : r; c.lineTo(cx + Math.cos(a) * k, cy + Math.sin(a) * k); }
  c.closePath();
  c.fillStyle = foil(c, { x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r }, 1, 0, 0, 1);
  c.fill();
  c.lineWidth = 3.5;
  c.lineJoin = 'round';
  c.strokeStyle = INK;
  c.stroke();
  c.save();
  c.globalAlpha = 0.7;
  c.beginPath();
  c.moveTo(cx - r * 0.1, cy - r * 0.62);
  c.lineTo(cx + r * 0.02, cy - r * 0.62);
  c.lineTo(cx - r * 0.2, cy + r * 0.2);
  c.lineTo(cx - r * 0.32, cy + r * 0.2);
  c.closePath();
  c.fillStyle = WHITE;
  c.fill();
  c.restore();
}
/** A pixel star: a plus of `n` squares each way. */
function pxSpark(c: C, x: number, y: number, px: number, n: number, fill: string) {
  c.beginPath();
  c.rect(x - px / 2, y - px / 2, px, px);
  for (let k = 1; k <= n; k++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) c.rect(x + dx * k * px - px / 2, y + dy * k * px - px / 2, px, px);
  c.fillStyle = fill;
  c.fill();
}
type Spark = [number, number, number, number, string];
/** The board's scatter of pixel stars, those clear of the words. */
const sparks = (c: C, list: Spark[], r?: Box) => list.forEach(([x, y, p, n, f]) => { if (!r || x + p * (n + 1) < r.x0 - 24 || x - p * (n + 1) > r.x1 + 24 || y + p * (n + 1) < r.y0 - 24 || y - p * (n + 1) > r.y1 + 24) pxSpark(c, x, y, p, n, f); });

/** The arrow cursor's bitmap: 1 ink, 2 white. */
const ARROW = ['1', '11', '121', '1221', '12221', '122221', '1222221', '12222221', '122222221', '1222222221', '12222211111', '1221221', '121 1221', '11  1221', '1    1221', '     1221', '      11'];
/** The pixel cursor, its tip at (x, y). On a mirrored page it still points up and left. */
function cursor(c: C, x: number, y: number, px: number) {
  c.save();
  if (mirrored(c)) { c.translate(x, 0); c.scale(-1, 1); c.translate(-x, 0); }
  for (const [ch, tone] of [['2', WHITE], ['1', CURSOR_INK]] as const) {
    c.beginPath();
    ARROW.forEach((row, j) => [...row].forEach((v, i) => { if (v === ch) c.rect(x + i * px, y + j * px, px, px); }));
    c.fillStyle = tone;
    c.fill();
  }
  c.restore();
}
/**
 * The small pixel label: a play mark and the song's title, in the opening only (titleOf), its left end at `x`. On a
 * mirrored page it reads the right way round and ends at the mirror of `x`.
 */
function playLabel(c: C, e: WorldEnv, x: number, y: number, px: number, tone: string) {
  const t = titleOf(e).toUpperCase();
  if (!t) return;
  const m = mirrored(c);
  c.save();
  if (m) { c.translate(W, 0); c.scale(-1, 1); }
  c.font = PIXEL(px);
  (c as CanvasRenderingContext2D).letterSpacing = `${px * 0.12}px`;
  const total = px * 1.6 + c.measureText(t).width;
  const sx = m ? W - x - total : x;
  c.fillStyle = tone;
  c.beginPath();
  c.moveTo(sx, y - px * 0.85);
  c.lineTo(sx + px * 0.8, y - px * 0.42);
  c.lineTo(sx, y);
  c.fill();
  label(c, t, sx + px * 1.6, y, PIXEL(px), tone, px * 0.12);
  c.restore();
}

/** Board a's gel button, where the line's last phrase is set (world-b3-sets y2k/hook split). */
const BUTTON = { x: 140, y: 560, w: 800, h: 210 };

/** a: the title white with its pink misprint, its last phrase on a gel button the cursor presses on the beat; the foil seal and star at the right. */
const hook: HandGround = (e) => frame(e, (c) => {
  c.drawImage(sheet(e, false), 0, 0);
  const r = e.rect;
  seal(c, 1560, 360, 220, 'NEW!');
  foilStar(c, 1760, 830, 120);
  sparks(c, [[1290, 170, 8, 3, LIME], [1850, 560, 7, 2, CYAN], [1360, 760, 7, 2, WHITE], [1100, 900, 8, 3, PINK], [1810, 120, 6, 2, WHITE]], r);
  // the button only under a split line: its last phrase stands there (a whole line keeps above it, the set's height)
  if (r && r.y1 > 640) {
    const press = beatOf(e.now, e.bpm).since < 0.12 && e.age > 0.3 ? 6 : 0;
    const { x, y, w, h } = BUTTON;
    gel(c, x, y, w, h, gelOf(e), press);
    // (the tip near the button's right end as seen, clear of the words: on a mirrored page that is the drawn left end)
    cursor(c, mirrored(c) ? x + 64 : x + w - 64, y + 130 + press, 7);
  }
  if (!r || r.y0 > 200) playLabel(c, e, 150, 166, 24, LIME);
});

/** The CD-ROM, painted once: the disc's iridescent turn, its hub rings; turned as a picture. */
const disc = () => kept('y2k-disc', 760, 760, (c) => {
  const [x, y] = [380, 380];
  const g = c.createConicGradient((110 * Math.PI) / 180, x, y);
  ([[0, B3.xE6EBF3], [0.06, B3.xE6EBF3], [0.11, B3.xFFC0EA], [0.15, B3.xD6C2FF], [0.2, B3.xE6EBF3], [0.34, B3.xE6EBF3], [0.4, B3.xA8EDFF], [0.44, B3.xC4FFE0], [0.48, B3.xFFF2A8], [0.54, B3.xE6EBF3], [0.56, B3.xE6EBF3], [0.61, B3.xFFC0EA], [0.65, B3.xD6C2FF], [0.7, B3.xE6EBF3], [0.84, B3.xE6EBF3], [0.9, B3.xA8EDFF], [0.94, B3.xC4FFE0], [1, B3.xE6EBF3]] as [number, string][]).forEach(([o, s]) => g.addColorStop(o, s));
  c.beginPath();
  c.arc(x, y, 360, 0, Math.PI * 2);
  c.arc(x, y, 58, 0, Math.PI * 2, true);
  c.fillStyle = g;
  c.fill();
  const ring = (rad: number, tone: string, w: number, a = 1) => { c.globalAlpha = a; c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.lineWidth = w; c.strokeStyle = tone; c.stroke(); c.globalAlpha = 1; };
  ring(360, WHITE, 3);
  ring(350, B3.xB9C3D6, 2);
  c.globalAlpha = 0.35;
  c.beginPath();
  c.arc(x, y, 140, 0, Math.PI * 2);
  c.arc(x, y, 59, 0, Math.PI * 2, true);
  c.fillStyle = WHITE;
  c.fill();
  c.globalAlpha = 1;
  ring(140, WHITE, 2);
  ring(92, WHITE, 2, 0.8);
  ring(59, WHITE, 3);
  // the two light fans across the data side
  c.globalAlpha = 0.5;
  c.fillStyle = WHITE;
  for (const [a0, a1] of [[-62, -48], [118, 132]]) {
    const [p, q] = [(a0 * Math.PI) / 180, (a1 * Math.PI) / 180];
    c.beginPath();
    c.arc(x, y, 345, p, q);
    c.arc(x, y, 150, q, p, true);
    c.closePath();
    c.fill();
  }
  c.globalAlpha = 1;
});

/** b: a calm page; the CD-ROM at the right turns 12° as each line lands, its light fans with it; the words never move. */
const cd: HandGround = (e) => frame(e, (c) => {
  c.drawImage(sheet(e, true), 0, 0);
  const r = e.rect;
  const turn = hash(Math.round((e.now - e.age) * 10), 5) * Math.PI * 2 + (12 * Math.PI) / 180 * ease(clamp01(e.age / 0.9), 3);
  c.save();
  c.translate(1420, 540);
  c.rotate(turn);
  c.drawImage(disc(), -380, -380);
  c.restore();
  sparks(c, [[1000, 200, 7, 3, WHITE], [1850, 930, 6, 2, CYAN], [920, 880, 5, 2, WHITE], [1830, 150, 5, 2, LIME]], r);
  if (r && r.y0 > 120) playLabel(c, e, r.x0 + 8, r.y0 - 30, 22, CYAN);
});

/** Board c's EQ: 22 columns of 64 px segments 26 high, 8 apart; lime six, cyan four, pink above; white peak caps. */
const EQ = { n: 22, w: 64, gap: 16, seg: 26, sg: 8, base: 1040 };
const eqLevels = (() => { const R = rng(11); return Array.from({ length: EQ.n }, (_, i) => Math.round(6 + 7 * Math.abs(Math.sin(i * 0.55 + 1.1)) * (0.75 + R() * 0.25) - (i > 16 ? 2 : 0))); })();
/** A column's height at `t`: its own level, kicked on each beat by a share that changes beat to beat. */
const eqAt = (i: number, t: number, bpm: number | undefined, level: number, most: number) => {
  const { idx, since } = beatOf(t, bpm);
  const kick = (0.45 + 0.55 * hash(i, idx)) * Math.exp(-since * 3.2);
  return Math.max(1, Math.min(most, Math.round(eqLevels[i] * (0.6 + 0.15 * level + 0.4 * kick))));
};

/** c: the shout centred at the top, the EQ wall bouncing with the track below it; no column ever grows into the words. */
const eq: HandGround = (e) => frame(e, (c) => {
  c.drawImage(sheet(e, false), 0, 0);
  const r = e.rect;
  const { n, w, gap, seg, sg, base } = EQ;
  const x0 = (W - n * (w + gap) + gap) / 2;
  const step = seg + sg;
  // the tallest column whose peak cap still keeps 40 px under the words
  const roof = (r?.y1 ?? 520) + 40;
  const most = Math.max(2, Math.floor((base + sg - roof) / step - 1.6));
  const tones = [LIME, CYAN, PINK];
  const paths = tones.map(() => new Path2D());
  const caps = new Path2D();
  for (let i = 0; i < n; i++) {
    const k = eqAt(i, e.now, e.bpm, e.level, most);
    const x = x0 + i * (w + gap);
    for (let j = 0; j < k; j++) paths[j < 6 ? 0 : j < 10 ? 1 : 2].rect(x, base - (j + 1) * step + sg, w, seg);
    // the peak cap falls slowly from the highest the column reached in the last second
    let cap = k;
    for (let s = 1; s <= 30; s++) cap = Math.max(cap, eqAt(i, e.now - s / 30, e.bpm, e.level, most) - 4 * (s / 30));
    caps.rect(x, base - (Math.min(most, cap) + 1.6) * step + sg, w, 10);
  }
  tones.forEach((t, j) => { c.fillStyle = t; c.fill(paths[j]); });
  c.fillStyle = WHITE;
  c.fill(caps);
  c.fillStyle = foil(c, { x0, y0: base + 10, x1: x0 + n * (w + gap) - gap, y1: base + 18 }, 0, 0, 1, 0);
  c.fillRect(x0, base + 10, n * (w + gap) - gap, 8);
  sparks(c, [[250, 300, 9, 3, LIME], [1680, 260, 8, 3, CYAN], [1500, 110, 6, 2, WHITE], [380, 470, 6, 2, WHITE], [1760, 450, 6, 2, PINK]], r);
  if (!r || r.y0 > 150 || r.x0 > 760) playLabel(c, e, 150, 122, 24, LIME);
});

/** A foil tape strip, a hair turned: its hard drop, the foil, three white glints, the deep keyline. */
function strip(c: C, x: number, y0: number, y1: number, w: number, col: number) {
  const quad = (pts: [number, number][]) => { c.beginPath(); pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py))); c.closePath(); };
  const face = () => quad([[x, y0 + 18], [x + w, y0], [x + w, y1 - 18], [x, y1]]);
  c.save();
  c.globalAlpha = 0.45;
  quad([[x + 10, y0 + 30], [x + w + 10, y0 + 12], [x + w + 10, y1 - 6], [x + 10, y1 + 12]]);
  c.fillStyle = INK;
  c.fill();
  c.restore();
  face();
  c.fillStyle = foil(c, { x0: x, y0, x1: x + w, y1 }, 0, 0, col, 1);
  c.fill();
  c.save();
  face();
  c.clip();
  c.globalAlpha = 0.45;
  c.fillStyle = WHITE;
  for (const [o, h] of [[0.12, 60], [0.48, 26], [0.8, 44]]) { const y = y0 + (y1 - y0) * o; quad([[x - 10, y + 40], [x + w + 10, y - 30], [x + w + 10, y - 30 + h], [x - 10, y + 40 + h]]); c.fill(); }
  c.restore();
  face();
  c.lineWidth = 3;
  c.strokeStyle = INK;
  c.stroke();
}
/** The candy butterfly clip holding a strip's top: four translucent wings and a gel body. */
function butterfly(c: C, bx: number, by: number) {
  const wing = (cx: number, cy: number, rx: number, ry: number, deg: number, fill: string, rim: string) => {
    c.beginPath();
    c.ellipse(cx, cy, rx, ry, (deg * Math.PI) / 180, 0, Math.PI * 2);
    c.globalAlpha = 0.85;
    c.fillStyle = fill;
    c.fill();
    c.globalAlpha = 1;
    c.lineWidth = 3;
    c.strokeStyle = rim;
    c.stroke();
  };
  for (const k of [-1, 1]) {
    wing(bx + k * 44, by - 8, 46, 32, k * -28, B3.xEC3A70, B3.x97123D);
    wing(bx + k * 34, by + 30, 28, 20, k * 30, B3.x7E43CC, B3.x45188A);
    c.beginPath();
    c.ellipse(bx + k * 50, by - 20, 18, 7, (k * -28 * Math.PI) / 180, 0, Math.PI * 2);
    c.globalAlpha = 0.9;
    c.fillStyle = WHITE;
    c.fill();
    c.globalAlpha = 1;
  }
  const g = c.createLinearGradient(bx - 9, 0, bx + 9, 0);
  g.addColorStop(0, B3.xFFC2D4);
  g.addColorStop(1, B3.x97123D);
  rr(c, bx - 9, by - 34, 18, 84, 9);
  c.fillStyle = g;
  c.fill();
  c.lineWidth = 3;
  c.strokeStyle = INK;
  c.stroke();
  rr(c, bx - 4, by - 26, 5, 40, 2.5);
  c.globalAlpha = 0.9;
  c.fillStyle = WHITE;
  c.fill();
  c.globalAlpha = 1;
}
/** Board d's columns stand here (world-b3-sets y2k/strips): the first phrase at the right, the second beside it. */
export const STRIP_AT: [number, number] = [0.8047, 0.6953];
const MENU: [string, [string, string, string]][] = [['HOME', GELS['pink']], ['MUSIC', GELS['lime']], ['GUESTBOOK', GELS['cyan']]];

/** d: the early web's menu at the left lights up item by item, the cursor on it; the line's two phrases down two foil strips. */
const strips: HandGround = (e) => frame(e, (c) => {
  c.drawImage(sheet(e, false), 0, 0);
  const r = e.rect;
  // the menu lights item by item as the page opens, then the cursor steps down it a bar at a time
  const on = Math.floor(beatOf(e.now, e.bpm).idx / 4) % MENU.length;
  MENU.forEach(([t, tones], i) => {
    const y = 300 + i * 170;
    const lit = e.age < 0.15 + i * 0.15 ? 0 : 1;
    gel(c, 170, y, 520, 116, tones, i === on && lit ? 3 : 0, lit);
    label(c, t, 430, y + 74 + (i === on && lit ? 3 : 0), PIXEL(40), INK, 4, 'center');
  });
  if (e.age >= 0.15 + MENU.length * 0.15) cursor(c, 610, 290 + on * 170 + 60, 7);
  if (r) {
    const [hx, sx] = STRIP_AT.map((f) => f * W);
    // the second strip only when the line has a second phrase on it: a strip with no words would be a bare shape
    if (r.x0 < sx + 60) strip(c, sx - 75, 70, 1010, 150, -0.3);
    strip(c, hx - 75, 70, 1010, 150, 0.3);
    butterfly(c, hx, 82);
  }
  sparks(c, [[860, 220, 8, 3, LIME], [1000, 760, 7, 2, CYAN], [820, 940, 6, 2, WHITE], [1100, 420, 6, 2, PINK]], r);
});

const Gs: Record<string, HandGround> = { 'y2k/hook': hook, 'y2k/cd': cd, 'y2k/eq': eq, 'y2k/strips': strips };

/** The lyric box with a margin: a piece keeps out of it. */
const keepOut = (e: WorldEnv, m: number): Box => { const r = e.rect ?? { x0: W * 0.3, y0: H * 0.35, x1: W * 0.7, y1: H * 0.65 }; return { x0: r.x0 - m, y0: r.y0 - m, x1: r.x1 + m, y1: r.y1 + m }; };
const clear = (b: Box, x: number, y: number, rad: number) => x + rad < b.x0 || x - rad > b.x1 || y + rad < b.y0 || y - rad > b.y1;

const INS: Record<string, HandIn> = {
  // the next page loads in squares of ultramarine, a diagonal at a time in six hard steps, never over the line landing with it
  'pixel-wipe': { sec: 0.36, draw: (e, q) => frame(e, (c) => {
    const r = e.rect;
    if (r) { c.beginPath(); c.rect(0, 0, W, H); c.rect(r.x0 - 24, r.y0 - 24, r.x1 - r.x0 + 48, r.y1 - r.y0 + 48); c.clip('evenodd'); }
    const k = Math.floor(clamp01(q) * 6) + 1;
    const s = 120;
    c.fillStyle = e.paper;
    c.beginPath();
    for (let x = 0; x < W; x += s) for (let y = 0; y < H; y += s) if (((x + y) / s) % 26 < (k * 26) / 6) c.rect(x, y, s, s);
    c.fill();
  }) },
};

const PIECES: Record<string, Piece> = {
  // pixel stars pop on the beat over the free part of the page, each built square by square
  'pixel-stars': { sec: 1.6, clear: 0, draw: (e, q) => frame(e, (c) => {
    const b = keepOut(e, 40);
    const R = rng(e.seed + 31);
    const tones = [LIME, CYAN, PINK, WHITE];
    for (let i = 0; i < 16; i++) {
      const [x, y, px] = [100 + R() * (W - 200), 90 + R() * (H - 180), 6 + Math.floor(R() * 4)];
      const n = Math.min(3, Math.floor(clamp01(q * 1.4 - i * 0.04) * 4)) - (q > 0.85 ? Math.floor((q - 0.85) * 20) : 0);
      if (n < 0 || !clear(b, x, y, px * 4)) continue;
      pxSpark(c, x, y, px, n, tones[i % 4]);
    }
  }) },
  // the cursor steps in from the frame's edge to a free corner and clicks: eight pixel squares spring round its tip
  'cursor-click': { sec: 1.4, clear: 0, draw: (e, q) => frame(e, (c) => {
    const b = keepOut(e, 60);
    const spots: [number, number][] = [[W - 330, 230], [300, H - 260], [W - 330, H - 260], [300, 230]];
    const [x, y] = spots.find(([sx, sy]) => clear(b, sx, sy, 150)) ?? spots[0];
    const k = Math.ceil(clamp01(q / 0.55) * 8) / 8;
    const [cx, cy] = [W + 40 + (x - W - 40) * k, H + 40 + (y - H - 40) * k];
    if (q > 0.55 && q < 0.95) {
      const s = Math.floor((q - 0.55) * 20);
      for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; const d = 26 + s * 7; c.fillStyle = i % 2 ? LIME : WHITE; c.fillRect(cx + Math.cos(a) * d - 4, cy + Math.sin(a) * d - 4, 8, 8); }
    }
    cursor(c, cx, cy, 7);
  }) },
  // a small foil seal is stuck down in a free corner and one glint crosses it
  'foil-seal': { sec: 1.6, clear: 0, draw: (e, q) => frame(e, (c) => {
    const b = keepOut(e, 60);
    const spots: [number, number][] = [[W - 260, 250], [260, H - 250], [W - 260, H - 250], [260, 250]];
    const [x, y] = spots.find(([sx, sy]) => clear(b, sx, sy, 150)) ?? spots[0];
    const s = q < 0.12 ? 1.25 : 1;
    if (q > 0.92) return;
    seal(c, x, y, 120 * s, '', -1 + 2 * clamp01((q - 0.2) / 0.6));
  }) },
};

export const Y2K = { grounds: Gs, ins: INS, pieces: PIECES, objects: {} };
