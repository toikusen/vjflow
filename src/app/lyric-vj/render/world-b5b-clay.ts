// claymation, from its board (2026-11-06, 風格第5批設計稿/claymation a–d; source out/research/boards-b5/boards/claymation.html),
// rebuilt as the review asked: the board's clay was a height field lit by one lamp (Photoshop's bevel and emboss, volume
// carried by gradients) and its letters were thickened into clay ropes until 「星」「海」 closed up. Here clay is crisp shapes:
// - every piece is one flat clay colour; its volume is two hard shapes cut from its own outline, a light rim up and left
//   and a dark rim down and right (an offset of the shape, never a gradient), and a hard contact shadow on the slab;
// - the clay's texture is what hands and tools leave: thumb-print ridges (nested open arcs) and short tool drags, hard
//   lines a shade darker, only in the thick of a piece;
// - the letters are the face's own strokes, never grown, so no two strokes meet (world-glyph-b5b `clay-type`);
// - the slab is flat with a few pressed marks; coils, balls and rolled strips are the props, each built the same way.
// Small print is pressed into the slab (a hard light edge under it). Kept apart from crayon (wax strokes on paper),
// papercut (cut paper with a cast shadow, no rims) and psychedelic (flowing type).
import type { Piece } from './world-pieces';
import { clamp01, ease, HandGround, HandIn, mixHex, WorldEnv } from './world-craft';
import { C, mirrorGround, onPage, rng, still } from './world-b3-shared';
import { B5B } from './b5b-inks';
import { B5B_MIRRORED, SET_BANDS } from './world-b5b-sets';
import { declareCarrier, toPx } from './carrier-fit';
import { dataLine, frame, H, isJa, meets, page, small, twoPhrases, W } from './world-b5b-shared';

type Pt = [number, number];
const SM = (px: number, ja: boolean) => `400 ${px}px ${ja ? '"M PLUS Rounded 1c"' : 'Huninn'}, "Noto Sans TC", sans-serif`;
const lightOf = (hex: string) => [1, 3, 5].reduce((s, i, k) => s + parseInt(hex.slice(i, i + 2), 16) * [0.3, 0.59, 0.11][k], 0) / 255;
const lit = (t: string) => mixHex(t, B5B.xFFFFFF, lightOf(t) > 0.5 ? 0.5 : 0.24);
const shade = (t: string) => mixHex(t, B5B.x000000, lightOf(t) > 0.5 ? 0.22 : 0.3);
const SHADOW = 'rgba(10,10,20,0.34)';

/**
 * A clay piece from a path: its hard contact shadow, the flat clay, the light rim up and left and the dark rim down and right
 * (the shape minus itself moved, clipped to the shape), then prints pressed into it.
 */
function piece(c: C, draw: (c: C) => void, tone: string, k: number, seed: number, prints = 2) {
  const [o, d] = [Math.max(3, k * 0.09), Math.max(6, k * 0.18)];
  c.save(); c.translate(d * 0.75, d); c.fillStyle = SHADOW; draw(c); c.fill(); c.restore();
  c.save();
  draw(c);
  c.clip();
  c.fillStyle = lit(tone); c.fillRect(-W, -H, 3 * W, 3 * H);
  // what the shape moved down and right covers is not the light rim: dark there for now
  c.save(); c.translate(o, o); c.fillStyle = shade(tone); draw(c); c.fill(); c.restore();
  // the core, covered by the shape moved either way, takes the flat clay: the dark rim is what is left down and right
  c.save(); c.translate(-o, -o); draw(c); c.restore();
  c.clip();
  c.save(); c.translate(o, o); c.fillStyle = tone; draw(c); c.fill(); c.restore();
  // prints: nested open arcs, a shade darker, hard
  const r = rng(seed);
  c.strokeStyle = mixHex(tone, B5B.x000000, 0.14);
  c.lineWidth = 2.4;
  c.lineCap = 'round';
  for (let p = 0; p < prints; p++) pressAt(c, r(), r(), r() * 6.28, k);
  c.restore();
}
/** Where `piece` presses a print: a point in its own bounds, chosen by the caller's draw (see the users below). */
let pressAt: (c: C, u: number, v: number, a: number, k: number) => void = () => undefined;
function printsIn(x0: number, y0: number, x1: number, y1: number) {
  pressAt = (c, u, v, a, k) => { const [x, y] = [x0 + (x1 - x0) * (0.2 + 0.6 * u), y0 + (y1 - y0) * (0.2 + 0.6 * v)]; for (let i = 1; i <= 3; i++) { c.beginPath(); c.ellipse(x, y, k * 0.09 * i, k * 0.07 * i, a, 0.4, 4.3); c.stroke(); } };
}
/** A rolled coil along `pts`, `w` thick. */
function coil(c: C, pts: Pt[], w: number, tone: string, seed: number) {
  const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]);
  printsIn(Math.min(...xs), Math.min(...ys) - w / 2, Math.max(...xs), Math.max(...ys) + w / 2);
  piece(c, (g) => outline(g, pts, w), tone, w, seed, 2);
}
/** A coil's outline as a closed path: the polyline offset to both sides, round ends. */
function outline(g: C, pts: Pt[], w: number) {
  const L: Pt[] = [];
  const R: Pt[] = [];
  pts.forEach(([x, y], i) => {
    const [a, b] = [pts[Math.max(0, i - 1)], pts[Math.min(pts.length - 1, i + 1)]];
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const n = Math.hypot(dx, dy) || 1;
    const [nx, ny] = [(-dy / n) * (w / 2), (dx / n) * (w / 2)];
    L.push([x + nx, y + ny]); R.push([x - nx, y - ny]);
  });
  g.beginPath();
  L.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  const [ex, ey] = pts[pts.length - 1];
  const [sx, sy] = pts[0];
  const end = Math.atan2(L[L.length - 1][1] - ey, L[L.length - 1][0] - ex);
  g.arc(ex, ey, w / 2, end, end - Math.PI, true);
  [...R].reverse().forEach(([x, y]) => g.lineTo(x, y));
  const st = Math.atan2(R[0][1] - sy, R[0][0] - sx);
  g.arc(sx, sy, w / 2, st, st - Math.PI, true);
  g.closePath();
}
/** A ball of clay. */
const ball = (c: C, x: number, y: number, r: number, tone: string, seed: number) => { printsIn(x - r, y - r, x + r, y + r); piece(c, (g) => { g.beginPath(); g.ellipse(x, y, r, r * 0.92, 0, 0, 7); }, tone, r * 1.4, seed, r > 30 ? 1 : 0); };
/** A rolled flat strip of clay, its corners round. */
const strip = (c: C, x: number, y: number, w: number, h: number, tone: string, seed: number) => { printsIn(x, y, x + w, y + h); piece(c, (g) => { g.beginPath(); g.roundRect(x, y, w, h, 60); }, tone, 120, seed, 3); };
/** The slab: flat, a few pressed tool marks and prints across it, hard. */
function slab(c: C, tone: string, seed: number) {
  c.fillStyle = tone;
  c.fillRect(0, 0, W, H);
  const r = rng(seed);
  c.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    const [x, y, a, L] = [r() * W, r() * H, r() * 6.28, 30 + r() * 70];
    c.strokeStyle = i % 2 ? mixHex(tone, B5B.x000000, 0.08) : mixHex(tone, B5B.xFFFFFF, 0.08);
    c.lineWidth = 2 + r() * 2;
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a) * L * 0.5 + 10, y + Math.sin(a) * L * 0.5 - 10, x + Math.cos(a) * L, y + Math.sin(a) * L); c.stroke();
  }
  c.strokeStyle = mixHex(tone, B5B.x000000, 0.07);
  c.lineWidth = 2;
  for (let p = 0; p < 6; p++) { const [x, y, a] = [r() * W, r() * H, r() * 6.28]; for (let i = 1; i <= 4; i++) { c.beginPath(); c.ellipse(x, y, 9 * i, 7 * i, a, 0.3, 4.4); c.stroke(); } }
}
/** Small print pressed into the slab: the letters a shade darker, a hard light edge under them. */
function pressedLabel(c: C, e: WorldEnv, x: number, y: number, tone: string, align: 'left' | 'right' = 'left') {
  const t = dataLine(e);
  const font = SM(32, isJa(e));
  small(c, t, x + 2, y + 2, font, 32, mixHex(tone, B5B.xFFFFFF, 0.3), 1, align);
  small(c, t, x, y, font, 32, mixHex(tone, B5B.x000000, 0.55), 1, align);
}
const keyOf = (e: WorldEnv) => `${e.item?.part}|${e.item?.at}`;
const zig = (y: number, amp: number, n: number, x0 = 120, x1 = 1820): Pt[] => Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y + (i % 2 ? -amp : amp)]);

/** a: the line in clay on the slab; a coil rolled in a zigzag along the bottom. */
const slabPage: HandGround = (e) => { page(e, 'clay-slab', (c) => {
  const s = e.slots;
  slab(c, s.ground, 3);
  coil(c, zig(940, 36, 5), 46, s.plate, 5);
  pressedLabel(c, e, 140, 110, s.ground);
}, keyOf(e)); };

/** b: night: the line in pale clay; three flat coils for the sea, small balls for stars, clear of the words. */
const nightPage: HandGround = (e) => { page(e, 'clay-night', (c) => {
  const s = e.slots;
  slab(c, s.ground, 4);
  [0, 1, 2].forEach((k) => coil(c, Array.from({ length: 25 }, (_, i) => [80 + i * 72, 790 + k * 80 + Math.sin(i * 0.7 + k) * 22] as Pt), 30 - k * 4, [B5B.x7FB3E0, B5B.x5B92C9, B5B.x3E74B0][k], 10 + k));
  for (const [x, y, r] of [[1500, 170, 18], [1640, 260, 12], [1380, 300, 9], [260, 160, 14], [430, 220, 8], [1720, 130, 9], [1180, 150, 11]]) if (!meets({ x0: x - r - 12, y0: y - r - 12, x1: x + r + 12, y1: y + r + 12 }, e.rect, 6)) ball(c, x, y, r, B5B.xF4D46A, x);
  pressedLabel(c, e, 140, 1030, s.ground);
}, keyOf(e)); };

/** c: a short shout, a character a clay colour on a light slab; cream balls in the corners. */
const lettersPage: HandGround = (e) => { page(e, 'clay-letters', (c) => {
  const s = e.slots;
  slab(c, s.plate, 5);
  for (const [x, y, r] of [[200, 170, 40], [1760, 960, 52], [1700, 140, 30], [260, 950, 26]]) if (!meets({ x0: x - r, y0: y - r, x1: x + r, y1: y + r }, e.rect, 10)) ball(c, x, y, r, B5B.xFFF1D6, x + y);
  pressedLabel(c, e, 960, 1010, s.plate);
}, keyOf(e)); };

/** d: two rolled strips, a phrase each, on the slab. A line with one phrase gets one strip. */
const stripsPage: HandGround = (e) => { page(e, 'clay-strips', (c) => {
  const s = e.slots;
  slab(c, s.ground, 6);
  strip(c, 150, 170, 1300, 300, s.plate, 20);
  if (twoPhrases(e)) strip(c, 470, 580, 1310, 300, s.faint, 21);
  pressedLabel(c, e, 150, 1000, s.ground);
}, keyOf(e)); declareCarrier(e, SET_BANDS['claymation/strips'].filter((b) => b.part !== 'small' || twoPhrases(e)).map((b) => toPx(b.box)), []); };

const Gs: Record<string, HandGround> = { 'claymation/slab': slabPage, 'claymation/night': nightPage, 'claymation/letters': lettersPage, 'claymation/strips': stripsPage };
for (const [id, page] of Object.entries(B5B_MIRRORED)) if (Gs[page]) Gs[id] = mirrorGround(Gs[page]);

const stepsOf = (q: number, n: number) => Math.floor(clamp01(q) * n) / n;
const INS: Record<string, HandIn> = {
  // a change of part: a new slab is slid in over the old from the left, on twos (12 frames a second), its hard shadow leading
  'slab-slide': { sec: 0.42, draw: (e, q) => frame(e, (c) => {
    const k = stepsOf(ease(q, 2), 5);
    if (k >= 1) return;
    const x = W * k;
    c.fillStyle = SHADOW; c.fillRect(x, 0, 18, H);
    c.fillStyle = shade(e.slots.ground); c.fillRect(x, 0, W - x, H);
    c.fillStyle = lit(e.slots.ground); c.fillRect(x, 0, 8, H);
  }) },
};

const freeSpot = (e: WorldEnv, spots: Pt[], r: number) => spots.find(([x, y]) => !meets({ x0: x - r, y0: y - r, x1: x + r, y1: y + r }, e.rect, 24));
const PIECES: Record<string, Piece> = {
  // a clay ball bounces across a free strip of the slab, squashing on each landing, on twos
  'ball-bounce': { sec: 2, clear: 0, draw: (e, q) => frame(e, (c) => {
    const low = !e.rect || e.rect.y1 < 760;
    const y0 = low ? 960 : 120;
    const k = stepsOf(q, 24);
    const x = 160 + (W - 320) * k;
    const hop = Math.abs(Math.sin(k * Math.PI * 4));
    const y = y0 - (low ? 1 : -1) * hop * 90;
    const sq = hop < 0.15;
    printsIn(x - 40, y - 40, x + 40, y + 40);
    piece(c, (g) => { g.beginPath(); g.ellipse(x, y + (sq ? 8 : 0), sq ? 42 : 34, sq ? 26 : 31, 0, 0, 7); }, e.slots.accent, 48, 7, 0);
  }) },
  // clay stars pressed onto the slab one at a time in free spots, each landing squashed and settling
  'clay-stars': { sec: 2.4, clear: 0, draw: (e, q) => frame(e, (c) => {
    const spots: Pt[] = [[240, 200], [1680, 180], [1720, 880], [220, 880], [960, 110]];
    let n = 0;
    for (const [x, y] of spots) {
      if (n >= 4 || meets({ x0: x - 60, y0: y - 60, x1: x + 60, y1: y + 60 }, e.rect, 20)) continue;
      const k = clamp01(q * 5 - n);
      n++;
      if (k <= 0) continue;
      printsIn(x - 50, y - 50, x + 50, y + 50);
      const s = k < 0.3 ? 1.2 : 1;
      piece(c, (g) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5 - Math.PI / 2; const r = (i % 2 ? 22 : 52) * s; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * (k < 0.3 ? 0.8 : 1)); } g.closePath(); }, B5B.xF4D46A, 60, x, 0);
    }
  }) },
  // a flower pressed from five balls and a centre in a free corner
  'clay-flower': { sec: 2.2, clear: 0, draw: (e, q) => frame(e, (c) => {
    const at = freeSpot(e, [[1640, 820], [280, 820], [1640, 250], [280, 250]], 130);
    if (!at) return;
    const n = Math.floor(clamp01(q * 1.6) * 6);
    for (let i = 0; i < Math.min(5, n); i++) { const a = (i / 5) * 6.28 - 1.57; ball(c, at[0] + Math.cos(a) * 58, at[1] + Math.sin(a) * 58, 40, B5B.xF59AB0, i + 3); }
    if (n >= 6) ball(c, at[0], at[1], 32, B5B.xF4D46A, 9);
  }) },
};

export const CLAY = { grounds: Gs, ins: INS, pieces: PIECES, objects: {} };
