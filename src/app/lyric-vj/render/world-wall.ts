// The wall engine (style batch 3): what a can of paint does to a wall. Spray is a cloud of droplets densest at the centre,
// thinning to single specks past the edge; paint laid too thick runs down in drips that end in a bead; a stencil leaves a
// hard inside edge and soft overspray outside it; the wall itself is concrete grain, cracks, and the ghosts of older coats.
// Nothing here knows a colour: every tone arrives from a world's slots.
import { clamp01, hash, kept, lifted, mixHex, Pt, TAU, trace, W, H, WorldEnv } from './world-craft';
import { smoothNoise } from './world-ink';

type C = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** One burst of the can: a soft disc, solid for its inner half, with droplets thrown past the edge. */
export function sprayBlob(c: C, x: number, y: number, r: number, tone: string, seed: number, a = 1, mist = 1) {
  if (r <= 1) return;
  c.save();
  c.globalAlpha = a;
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, tone);
  g.addColorStop(0.55, tone);
  g.addColorStop(0.82, `${tone}66`);
  g.addColorStop(1, `${tone}00`);
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
  c.fillStyle = tone;
  const n = Math.floor(90 * mist);
  for (let i = 0; i < n; i++) {
    const ang = hash(i, seed) * TAU;
    const d = r * (0.8 + 0.55 * hash(i, seed + 1) ** 0.6);
    c.globalAlpha = a * (0.25 + 0.6 * hash(i, seed + 2));
    c.beginPath();
    c.arc(x + Math.cos(ang) * d, y + Math.sin(ang) * d, 1.2 + 2.4 * hash(i, seed + 3), 0, TAU);
    c.fill();
  }
  c.restore();
}
/** Mist alone, no body: what drifts off a pass of the can. */
export function overspray(c: C, x: number, y: number, r: number, tone: string, n: number, seed: number, a = 0.5) {
  c.save();
  c.fillStyle = tone;
  for (let i = 0; i < n; i++) {
    const ang = hash(i, seed + 20) * TAU;
    const d = r * hash(i, seed + 21) ** 0.5;
    c.globalAlpha = a * (0.2 + 0.6 * hash(i, seed + 22));
    c.beginPath();
    c.arc(x + Math.cos(ang) * d, y + Math.sin(ang) * d, 1 + 2 * hash(i, seed + 23), 0, TAU);
    c.fill();
  }
  c.restore();
}
/** A run of paint: it narrows as it goes and ends in a bead heavier than the line. */
export function drip(c: C, x: number, y: number, len: number, w: number, tone: string, a = 1) {
  if (len <= 0) return;
  c.save();
  c.globalAlpha = a;
  c.fillStyle = tone;
  c.beginPath();
  c.moveTo(x - w / 2, y);
  c.lineTo(x + w / 2, y);
  c.lineTo(x + w * 0.3, y + len);
  c.lineTo(x - w * 0.3, y + len);
  c.closePath();
  c.fill();
  c.beginPath();
  c.arc(x, y + len, w * 0.62, 0, TAU);
  c.fill();
  c.restore();
}
/** Drips off the lower edge of a patch: `k` 0..1 is how far they have run. Seeded, so a drip keeps its place. */
export function dripsAlong(c: C, x0: number, x1: number, y: number, n: number, seed: number, tone: string, maxLen: number, k: number, a = 1) {
  for (let i = 0; i < n; i++) {
    const x = x0 + (x1 - x0) * hash(i, seed + 30);
    const len = maxLen * (0.3 + 0.7 * hash(i, seed + 31)) * clamp01(k * (0.6 + 0.8 * hash(i, seed + 32)));
    drip(c, x, y - 6, len, 4 + 8 * hash(i, seed + 33), tone, a);
  }
}
/** The wall: concrete grain, pour lines, a few cracks. Kept once per tone. */
export const concrete = (tone: string, grain: string, seed: number, w = W + 240, h = H + 240) => kept(`wall|${tone}|${grain}|${seed % 3}`, w, h, (c) => {
  c.fillStyle = tone;
  c.fillRect(0, 0, w, h);
  // aggregate: specks of both lighter and darker stone
  for (let i = 0; i < 9000; i++) {
    c.fillStyle = i % 2 ? grain : tone;
    c.globalAlpha = i % 2 ? 0.05 + 0.12 * hash(i, 1) : 0.3;
    const r = 0.6 + 2.2 * hash(i, 2);
    c.beginPath();
    c.arc(hash(i, 3) * w, hash(i, 4) * h, r, 0, TAU);
    c.fill();
  }
  // a stain the water left, a pour line, two cracks
  c.globalAlpha = 0.08;
  c.fillStyle = grain;
  for (let y = 0; y < h; y += 4) { const v = smoothNoise(y / 300, seed, 3); c.fillRect(0, y, w, 4 * clamp01(v - 0.1)); }
  c.globalAlpha = 0.4;
  c.strokeStyle = grain;
  c.lineWidth = 2;
  for (let k = 0; k < 2 + (seed % 2); k++) {
    const pts: Pt[] = [];
    let [x, y] = [hash(k, seed + 5) * w, hash(k, seed + 6) * h * 0.3];
    for (let i = 0; i < 30; i++) { pts.push([x, y]); x += (hash(i, k + seed) - 0.5) * 60; y += 14 + 30 * hash(i, k + 9); }
    trace(c, pts, false);
    c.stroke();
  }
  c.globalAlpha = 0.5;
  c.lineWidth = 2;
  const py = h * (0.3 + 0.4 * hash(seed, 7));
  c.beginPath();
  c.moveTo(0, py);
  for (let x = 0; x <= w; x += 40) c.lineTo(x, py + 3 * Math.sin(x * 0.02 + seed));
  c.stroke();
  c.globalAlpha = 1;
});
/** Brick courses under the paint: kept once per tone. */
export const brickWall = (tone: string, mortar: string, seed: number, w = W + 240, h = H + 240) => kept(`bricks|${tone}|${mortar}|${seed % 3}`, w, h, (c) => {
  c.fillStyle = mortar;
  c.fillRect(0, 0, w, h);
  const [bw, bh] = [150, 56];
  for (let j = 0; j * bh < h; j++) for (let i = -1; i * bw < w; i++) {
    const x = i * bw + (j % 2 ? bw / 2 : 0);
    c.fillStyle = mixHex(tone, mortar, 0.08 + 0.2 * hash(i, j + seed));
    c.fillRect(x + 4, j * bh + 4, bw - 8, bh - 8);
    c.fillStyle = 'rgba(0,0,0,0.18)';
    c.fillRect(x + 4, j * bh + bh - 9, bw - 8, 5);
  }
  // the pitting of old brick
  for (let i = 0; i < 4000; i++) { c.fillStyle = i % 2 ? mortar : tone; c.globalAlpha = 0.08 + 0.1 * hash(i, 2); c.beginPath(); c.arc(hash(i, 3) * w, hash(i, 4) * h, 0.8 + 2 * hash(i, 5), 0, TAU); c.fill(); }
  c.globalAlpha = 1;
});
/** A dark coat sprayed where the words will stand, so a light stencil reads: the world's own clearing, spray-shaped. */
export function patchBehind(e: WorldEnv, tone: string, a = 1, grow = 1) {
  if (!e.rect || e.weight <= 0) return;
  const { x0, y0, x1, y1 } = e.rect;
  const c = e.ctx;
  c.save();
  if (e.base) c.setTransform(e.base);
  const [cx, cy, hw, hh] = [(x0 + x1) / 2, (y0 + y1) / 2, ((x1 - x0) / 2 + 90) * grow, ((y1 - y0) / 2 + 70) * grow];
  c.globalAlpha = a * e.weight;
  // a solid core the shape of the block, then passes of the can close together along its long axis so the edge is one soft edge
  const tall = hh > hw;
  const r = (tall ? hw : hh) * 1.1;
  c.fillStyle = tone;
  c.beginPath();
  c.roundRect(cx - hw, cy - hh, hw * 2, hh * 2, Math.min(hw, hh) * 0.6);
  c.fill();
  const len = tall ? hh : hw;
  const n = Math.max(3, Math.ceil((len * 2) / (r * 0.35)));
  for (let i = 0; i <= n; i++) {
    const x = tall ? cx : cx - hw + (2 * hw * i) / n;
    const y = tall ? cy - hh + (2 * hh * i) / n : cy;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, tone);
    g.addColorStop(0.6, tone);
    g.addColorStop(1, `${tone}00`);
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  c.restore();
}
/** A roller's pass: a band of fresh paint with a wet edge and the roller's own shadow. */
export function rollerBand(c: C, x: number, w: number, tone: string, a = 1) {
  c.save();
  c.globalAlpha = a;
  c.fillStyle = tone;
  c.fillRect(x, -H * 0.2, w, H * 1.4);
  lifted(c, 30, 0, 0, 0.5, () => { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x + w - 26, -H * 0.2, 26, H * 1.4); });
  c.restore();
}
