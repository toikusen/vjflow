// brutalist: a punk poster run off on a bad photocopier and pasted on a wall. Two or three flat colours, the words as big
// as the sheet and cut by its edge, toner grain over everything, torn strips and tape bands, hard cuts and no fade.
// Nothing glows, nothing is soft; the only shadow is the one a pasted sheet throws.
import type { Piece } from './world-pieces';
import { atBase, boxOf, ease, easeIn, flood, H, hash, HandGround, HandIn, isLight, lifted, mixHex, ObjectPaint, Pt, trace, W, WorldEnv } from './world-craft';
import { sheetBehind, tileGround, tonerTile } from './world-b3-shared';

type C = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
/** Toner over the sheet: dark specks on a light sheet, pale ones on a dark one. */
const toner = (e: WorldEnv, a = 0.55) => tileGround(e.ctx, tonerTile(isLight(e.paper) ? e.ink : e.slots.plateInk), (e.seed % 7) * 37, 0, a);
/** The copier's drag: a few faint horizontal streaks across the sheet. */
function streaks(e: WorldEnv, n: number, a: number) {
  const c = e.ctx;
  c.save();
  c.fillStyle = isLight(e.paper) ? e.ink : e.slots.plateInk;
  for (let i = 0; i < n; i++) { c.globalAlpha = a * (0.3 + 0.7 * hash(i, e.seed)); c.fillRect(-W * 0.2, hash(i, e.seed + 1) * H, W * 1.4, 2 + 5 * hash(i, e.seed + 2)); }
  c.restore();
}
/** A torn edge: a polyline that wanders by `amp`. */
const torn = (x0: number, y0: number, x1: number, y1: number, seed: number, amp: number): Pt[] => Array.from({ length: 41 }, (_, i) => { const k = i / 40; const nx = -(y1 - y0); const ny = x1 - x0; const l = Math.hypot(nx, ny) || 1; const d = (hash(i, seed) - 0.5) * amp + 0.4 * amp * Math.sin(k * 11 + seed); return [x0 + (x1 - x0) * k + (nx / l) * d, y0 + (y1 - y0) * k + (ny / l) * d]; });
/** A sheet pasted over: its torn outline, its shadow, a couple of wrinkle lines. */
function pasted(c: C, pts: Pt[], tone: string, seed: number, a = 1) {
  c.save();
  c.globalAlpha = a;
  lifted(c, 18, 4, 8, 0.45, () => { trace(c, pts); c.fillStyle = tone; c.fill(); });
  c.save();
  trace(c, pts);
  c.clip();
  c.strokeStyle = 'rgba(0,0,0,0.12)';
  c.lineWidth = 3;
  for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(hash(i, seed) * W, -10); c.lineTo(hash(i, seed + 1) * W, H + 10); c.stroke(); }
  c.restore();
  c.restore();
}
const label = (e: WorldEnv) => sheetBehind(e, e.paper, 1, 44, 28, (hash(e.seed, 9) - 0.5) * 0.02);
const fullTorn = (seed: number, top: number, bottom: number, amp = 50): Pt[] => [...torn(-60, top, W + 60, top + (hash(seed, 2) - 0.5) * 200, seed, amp), ...torn(W + 60, bottom + (hash(seed, 3) - 0.5) * 200, -60, bottom, seed + 1, amp)];

const Gs: Record<string, HandGround> = {
  'brutalist/plain-sheet': (e) => { flood(e, e.paper); toner(e, 0.5); streaks(e, 2, 0.1); },
  'brutalist/thin-line': (e) => { flood(e, e.paper); toner(e, 0.4); atBase(e, (c) => { c.fillStyle = e.slots.accent; c.fillRect(-20, H * 0.7, W + 40, 5); }); },
  'brutalist/torn-sheet': (e) => { flood(e, e.paper); toner(e, 0.5); atBase(e, (c) => pasted(c, fullTorn(e.seed, H * (0.1 + 0.3 * hash(e.seed, 1)), H * (0.6 + 0.3 * hash(e.seed, 4))), e.slots.plate, e.seed)); label(e); },
  'brutalist/xerox-dark': (e) => { flood(e, e.slots.plate); tileGround(e.ctx, tonerTile(e.slots.plateInk), 0, 0, 0.7); atBase(e, (c) => pasted(c, fullTorn(e.seed + 3, H * 0.76, H * 1.2, 40), e.paper, e.seed + 3)); streaks(e, 3, 0.2); label(e); },
  'brutalist/red-slab': (e) => { flood(e, e.paper); toner(e, 0.5); atBase(e, (c) => { const side = e.seed % 2; pasted(c, side ? fullTorn(e.seed, -200, H * 0.34, 36) : [...torn(-60, -60, W * 0.36 + (hash(e.seed, 5) - 0.5) * 200, -60, e.seed, 36), ...torn(W * 0.3, H + 60, -60, H + 60, e.seed + 1, 36)], e.slots.plate, e.seed + 4); }); label(e); },
  'brutalist/bars': (e) => { flood(e, e.paper); toner(e, 0.5); atBase(e, (c) => { c.fillStyle = isLight(e.paper) ? e.ink : e.slots.plateInk; c.fillRect(-20, -20, W + 40, H * 0.14); c.fillRect(-20, H * 0.9, W + 40, H * 0.12); c.fillStyle = e.slots.accent; c.fillRect(-20, H * 0.14, W + 40, 8); }); },
  // the peak: polarity turned over, a strip of the sheet torn across it
  'brutalist/invert-flash': (e) => { flood(e, e.slots.plate); tileGround(e.ctx, tonerTile(e.slots.plateInk), 7, 0, 0.6); atBase(e, (c) => pasted(c, fullTorn(e.seed + 5, H * 0.4, H * 0.66, 60), e.paper, e.seed + 5)); label(e); },
};

const INS: Record<string, HandIn> = {
  // a black bar goes across the sheet in four steps and takes the old picture with it
  'black-bar-sweep': { sec: 0.22, draw: (e, q) => atBase(e, (c) => { const k = Math.floor(ease(q, 2) * 4) / 4; const x = k * (W + 300) - 150; c.fillStyle = e.slots.plate; c.fillRect(x, -20, W + 400, H + 40); c.fillStyle = isLight(e.slots.plate) ? e.slots.plateInk : e.slots.accent; c.fillRect(x - 60, -20, 60, H + 40); }) },
};

const PIECES: Record<string, Piece> = {
  // a new sheet slapped on over the last: it lands in two steps, with wrinkles, and is torn half off again
  'poster-paste': { sec: 1.6, clear: 0, draw: (e, q) => {
    const c = e.ctx;
    const drop = Math.floor(ease(Math.min(1, q * 3), 2) * 3) / 3;
    const off = easeIn((q - 0.7) / 0.3, 2);
    const top = -H * 1.2 + drop * H * 1.1 - off * 300;
    pasted(c, [...torn(-60, top, W + 60, top + 80, e.seed + 6, 50), ...torn(W + 60, top + H * 1.2, -60, top + H * 1.25, e.seed + 7, 40)], e.slots.plate, e.seed + 6, 1 - off);
    sheetBehind(e, e.paper, 1, 44, 28);
  } },
  // a strip torn away corner to corner shows the colour under it
  'tear-strip': { sec: 1.6, clear: 0, draw: (e, q) => {
    const c = e.ctx;
    const k = Math.floor(ease(Math.min(1, q * 1.4), 2) * 6) / 6;
    const fade = 1 - easeIn((q - 0.8) / 0.2, 2);
    c.save();
    c.globalAlpha = fade;
    const x = -300 + k * (W + 600);
    trace(c, [...torn(-60, H * 0.3, x, H * 0.42, e.seed + 8, 40), ...torn(x, H * 0.7, -60, H * 0.58, e.seed + 9, 40)]);
    c.fillStyle = e.slots.plate;
    c.fill();
    c.restore();
    sheetBehind(e, e.paper, 1, 44, 28);
  } },
  // the copier drags: the sheet's own tone in streaks that run across and stop
  'copier-drag': { sec: 1.2, clear: 0.5, draw: (e, q) => {
    const c = e.ctx;
    const b = boxOf(e, 0, 0);
    const k = Math.floor(ease(q, 2) * 8) / 8;
    c.save();
    c.fillStyle = isLight(e.paper) ? e.ink : e.slots.plateInk;
    for (let i = 0; i < 24; i++) { const y = hash(i, e.seed + 10) * H; if (y > b.y0 - 30 && y < b.y1 + 30 && e.weight > 0) continue; c.globalAlpha = 0.2 + 0.6 * hash(i, e.seed + 11); c.fillRect(-20, y, (W + 40) * (k * (0.5 + 0.5 * hash(i, e.seed + 12))), 3 + 12 * hash(i, e.seed + 13)); }
    c.restore();
  } },
  // black bars slam in top and bottom, in steps, and leave in one
  'bar-slam': { sec: 1.4, clear: 0, draw: (e, q) => {
    const c = e.ctx;
    const k = q < 0.8 ? Math.floor(ease(Math.min(1, q * 2.5), 2) * 4) / 4 : 0;
    c.fillStyle = isLight(e.paper) ? e.ink : e.slots.plateInk;
    c.fillRect(-20, -20, W + 40, 20 + H * 0.2 * k);
    c.fillRect(-20, H - H * 0.2 * k, W + 40, H * 0.2 * k + 20);
    sheetBehind(e, e.paper, 1, 44, 28);
  } },
};

/** The slogan tape: a flat band in the plate tone with ragged ends, pasted a little off level. */
const tapeSlogan: ObjectPaint = (c, w, h, s, seed) => {
  const pts: Pt[] = [...torn(-20, 0, w + 20, 0, seed, 10), ...torn(w + 20 + (hash(seed, 1) - 0.5) * 30, h, -20, h + (hash(seed, 2) - 0.5) * 20, seed + 1, 10)];
  lifted(c, 14, 3, 6, 0.4, () => { trace(c, pts); c.fillStyle = s.plate; c.fill(); });
  c.save();
  trace(c, pts);
  c.clip();
  c.fillStyle = mixHex(s.plate, s.plateInk, 0.5);
  for (let i = 0; i < 60; i++) { c.globalAlpha = 0.08 + 0.14 * hash(i, seed + 3); c.fillRect(hash(i, seed + 4) * w, hash(i, seed + 5) * h, 2 + 3 * hash(i, 6), 2); }
  c.restore();
};
export const BRUTALIST = { grounds: Gs, ins: INS, pieces: PIECES, objects: { 'tape-slogan': tapeSlogan } as Record<string, ObjectPaint> };
