// graffiti: a concrete wall at night and a can of paint. The words are stencilled on it: a dark coat sprayed first where
// they will go, the letters over it, overspray past their edges, paint run too thick dripping down. Every part the song gets
// is one more coat on the same wall: older coats stay as ghosts under the new. Uses the wall engine (world-wall.ts).
import type { Piece } from './world-pieces';
import { atBase, boxOf, clamp01, ease, easeIn, flood, H, hash, HandGround, HandIn, isLight, lifted, mixHex, ObjectPaint, span, TAU, W, WorldEnv } from './world-craft';
import { brickWall, concrete, drip, dripsAlong, overspray, patchBehind, rollerBand, sprayBlob } from './world-wall';

const CW = W + 240;
const CH = H + 240;
/** The wall under everything, slid with the ground. */
const wall = (e: WorldEnv) => e.ctx.drawImage(concrete(e.paper, e.slots.faint, e.seed), -120, -120);
/** Where the dark coat goes behind the words: the plate tone, the one the stencil was cut for. */
const coat = (e: WorldEnv) => patchBehind(e, e.slots.plate, 0.96);
/** Older coats: blobs of the song's spray colours left from earlier parts, dimmed into the wall. */
function oldCoats(e: WorldEnv, n: number, a: number, k = 1) {
  const c = e.ctx;
  for (let i = 0; i < n; i++) {
    const tone = [e.slots.ink2, e.slots.accent, e.slots.plateInk][(i + e.seed) % 3];
    const [x, y, r] = [hash(i, e.seed + 40) * CW - 120, hash(i, e.seed + 41) * CH - 120, (120 + 260 * hash(i, e.seed + 42)) * k];
    sprayBlob(c, x, y, r, tone, i + e.seed, a, 0.5);
    dripsAlong(c, x - r * 0.5, x + r * 0.5, y + r * 0.5, 3, i + e.seed, tone, 160, 1, a);
  }
}
/** Marker scrawl: loops, no letters, the kind of tag that is only a gesture. */
function scrawl(c: CanvasRenderingContext2D, x: number, y: number, w: number, tone: string, seed: number, a: number) {
  c.save();
  c.globalAlpha = a;
  c.strokeStyle = tone;
  c.lineWidth = 22;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(x, y);
  // a marker's loops: a few fat curves thrown along the wall, the hand never lifting
  for (let i = 1; i <= 6; i++) { const k = i / 6; const px = x + k * w; const py = y + 70 * Math.sin(k * 7 + seed) - 40 * hash(i, seed); c.quadraticCurveTo(x + (k - 0.08) * w + 60 * Math.sin(i + seed), py - 110 * (i % 2 ? 1 : -1), px, py); }
  c.stroke();
  c.restore();
}

const Gs: Record<string, HandGround> = {
  'graffiti/bare-wall': (e) => { wall(e); oldCoats(e, 1, 0.3, 0.9); coat(e); },
  'graffiti/one-patch': (e) => { wall(e); coat(e); },
  'graffiti/layered-wall': (e) => { wall(e); oldCoats(e, 3, 0.55); coat(e); },
  'graffiti/brick-wall': (e) => { e.ctx.drawImage(brickWall(e.paper, mixHex(e.paper, e.slots.faint, 0.7), e.seed), -120, -120); oldCoats(e, 2, 0.55); coat(e); },
  'graffiti/tag-wall': (e) => { wall(e); for (let i = 0; i < 4; i++) scrawl(e.ctx, hash(i, e.seed) * W * 0.6 - 100, hash(i, e.seed + 1) * H, 500 + 500 * hash(i, e.seed + 2), [e.slots.ink2, e.slots.accent][i % 2], i + e.seed, 0.26); oldCoats(e, 1, 0.5); coat(e); },
  // level 2: a band of fresh paint along the top, its drips still running
  'graffiti/drip-field': (e) => {
    wall(e);
    const c = e.ctx;
    const tone = e.slots.ink2;
    for (let i = 0; i < 7; i++) sprayBlob(c, i * 330 - 60, 40 + 60 * hash(i, e.seed), 200 + 60 * hash(i, e.seed + 1), tone, i + e.seed + 7, 0.9, 0.8);
    dripsAlong(c, -100, W + 100, 170, 22, e.seed + 3, tone, 520, clamp01(e.now * 0.08 + 0.4));
    coat(e);
  },
  // the peak: one huge fresh blob of the second colour, everything running
  'graffiti/bomb-wall': (e) => {
    wall(e);
    const c = e.ctx;
    const [x, y] = [W * (0.3 + 0.4 * hash(e.seed, 3)), H * 0.3];
    sprayBlob(c, x, y, 620, e.slots.accent, e.seed + 9, 1, 1.2);
    sprayBlob(c, x + 180, y + 120, 380, e.slots.ink2, e.seed + 10, 0.9, 1);
    dripsAlong(c, x - 500, x + 500, y + 460, 16, e.seed + 4, e.slots.accent, 440, clamp01(e.age * 0.5 + 0.3));
    coat(e);
  },
};

const INS: Record<string, HandIn> = {
  // a buff roller goes over the old coat: the plate tone ahead of it, the new wall behind
  'roller-buff': { sec: 0.36, draw: (e, q) => atBase(e, (c) => { const x = -200 + ease(q, 2) * (W + 500); rollerBand(c, x, W + 400, e.slots.plate, 0.92); rollerBand(c, x - 70, 70, mixHex(e.slots.plate, e.ink, 0.15)); }) },
};

const PIECES: Record<string, Piece> = {
  // the can comes in on one spot and keeps pressing: bursts grow out of each other, mist first, then the body, then the drips
  'spray-bomb': { sec: 2.2, clear: 0.7, draw: (e, q) => {
    const c = e.ctx;
    const b = boxOf(e, 0, 0);
    const side = hash(e.seed, 11) > 0.5 ? 1 : -1;
    const [x, y] = [W * 0.5 + side * (b.x1 - b.x0 + 300) * 0.5, H * 0.56];
    const tone = e.slots.accent;
    const k = span(q, 0.5, 0.78);
    overspray(c, x, y, 700 * ease(q * 2, 2), tone, 220, e.seed + 12, 0.5 * k);
    for (let i = 0; i < 6; i++) { const kk = clamp01((q - i * 0.07) * 3); if (kk <= 0) continue; sprayBlob(c, x + (hash(i, e.seed) - 0.5) * 320, y + (hash(i, e.seed + 1) - 0.5) * 220, 240 * ease(kk, 2) * (0.7 + 0.5 * hash(i, 3)), tone, i + e.seed + 13, k, 0.7); }
    dripsAlong(c, x - 300, x + 300, y + 150, 10, e.seed + 14, tone, 500, clamp01((q - 0.3) * 1.6), k);
    patchBehind(e, e.slots.plate, 0.96);
  } },
  // the top edge was painted too thick: it all runs down at once
  'drip-run': { sec: 2.6, clear: 0.6, draw: (e, q) => {
    const c = e.ctx;
    const tone = e.slots.ink2;
    const k = span(q, 0.2, 0.84);
    c.save();
    c.globalAlpha = k;
    c.fillStyle = tone;
    c.fillRect(-20, -20, W + 40, 90);
    c.restore();
    for (let i = 0; i < 28; i++) { const x = hash(i, e.seed + 50) * W; const len = (300 + 700 * hash(i, e.seed + 51)) * ease(clamp01((q - 0.1 * hash(i, e.seed + 52)) * 1.3), 2); drip(c, x, 60, len, 6 + 14 * hash(i, e.seed + 53), tone, k); }
    patchBehind(e, e.slots.plate, 0.96);
  } },
  // a pass of the can across the whole wall: a cloud of mist drifts over and settles
  'overspray-cloud': { sec: 1.8, clear: 0.5, draw: (e, q) => {
    const c = e.ctx;
    const k = span(q, 0.3, 0.7);
    const x = -300 + ease(q, 1.2) * (W + 600);
    for (let i = 0; i < 9; i++) overspray(c, x + (hash(i, e.seed) - 0.5) * 500, H * (0.2 + 0.6 * hash(i, e.seed + 1)), 260 + 200 * hash(i, e.seed + 2), [e.slots.accent, e.slots.ink2][i % 2], 160, i + e.seed + 60, 0.6 * k);
  } },
  // the council paints over it: a roller goes across, the wall is one flat colour for a beat, then the coats show through again
  'roll-over': { sec: 2.0, clear: 0, draw: (e, q) => {
    const c = e.ctx;
    const x = -100 + ease(Math.min(1, q * 1.6), 2) * (W + 300);
    const fade = 1 - easeIn((q - 0.64) / 0.36, 2);
    rollerBand(c, -200, Math.max(0, x + 200), e.slots.plate, 0.92 * fade);
    if (x < W + 100) rollerBand(c, x - 80, 80, mixHex(e.slots.plate, e.ink, 0.2), fade);
    c.save();
    c.globalAlpha = fade;
    patchBehind(e, e.slots.plate, 1, 1.2);
    c.restore();
  } },
};

/** A patch sprayed dark for the stencil: soft all round, a few runs off its lower edge. */
const sprayPatch: ObjectPaint = (c, w, h, s, seed) => {
  const r = Math.max(60, h * 0.5);
  const n = Math.max(2, Math.round(w / r));
  for (let i = 0; i <= n; i++) sprayBlob(c, (w * i) / n, h * 0.5, r * 1.15, s.plate, seed + i, 1, 0.6);
  dripsAlong(c, w * 0.1, w * 0.9, h * 0.86, 4, seed + 5, s.plate, 70, 1);
};
/** A throw-up: a fat rounded bubble in the plate tone with the second colour as a thick keyline and a highlight, drips below. */
const throwUp: ObjectPaint = (c, w, h, s, seed, look) => {
  const r = Math.min(w, h) * 0.3;
  const line = isLight(s.plate) ? s.plateInk : s.ink2;
  c.lineJoin = 'round';
  lifted(c, 0, 10, 12, 0.5, () => { c.fillStyle = line; c.beginPath(); c.roundRect(-10, 0, w + 20, h, r); c.fill(); });
  c.fillStyle = line;
  c.beginPath();
  c.roundRect(-18, -8, w + 36, h + 16, r + 8);
  c.fill();
  c.fillStyle = s.plate;
  c.beginPath();
  c.roundRect(0, 0, w, h, r);
  c.fill();
  overspray(c, w * 0.5, h * 0.5, Math.max(w, h) * 0.7, line, 120, seed + look, 0.4);
  c.strokeStyle = s.ink;
  c.globalAlpha = 0.5;
  c.lineWidth = 6;
  c.beginPath();
  c.moveTo(r * 0.7, 18);
  c.lineTo(w - r * 0.7, 18);
  c.stroke();
  c.globalAlpha = 1;
  dripsAlong(c, w * 0.15, w * 0.85, h, 3 + look, seed + 7, s.plate, 60, 1);
};
export const GRAFFITI = { grounds: Gs, ins: INS, pieces: PIECES, objects: { 'spray-patch': sprayPatch, 'throw-up': throwUp } as Record<string, ObjectPaint> };
void flood; void TAU;
