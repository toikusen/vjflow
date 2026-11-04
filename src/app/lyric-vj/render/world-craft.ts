// What the hand-made worlds (style batch 2) share: seeded picture parts kept once, the tooth of dry media, a scratch canvas to
// cut a mark against that tooth, and the few geometry helpers. Nothing here knows a colour: every tone arrives from a world's slots.
import { mixHex, Pt } from './material';
import type { WorldEnv } from './world-grounds';
import type { Slots } from './world-objects';

export const W = 1920;
export const H = 1080;
export const TAU = Math.PI * 2;
export const fract = (x: number) => x - Math.floor(x);
export const hash = (a: number, b = 0) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const ease = (x: number, p = 3) => 1 - (1 - clamp01(x)) ** p;
export const easeIn = (x: number, p = 3) => clamp01(x) ** p;
export const inOut = (x: number) => { const k = clamp01(x); return k * k * (3 - 2 * k); };
/** Up to 1 by `a`, back to 0 from `b`: most of a set piece's life. */
export const span = (q: number, a: number, b: number) => Math.min(ease(q / a, 2), 1 - easeIn((q - b) / (1 - b), 2));
export const lightOf = (hex: string) => [1, 3, 5].reduce((s, i, k) => s + parseInt(hex.slice(i, i + 2), 16) * [0.3, 0.59, 0.11][k], 0) / 255;
export const isLight = (hex: string) => lightOf(hex) > 0.5;
export { mixHex };
export type { Pt, Slots, WorldEnv };

const store = new Map<string, OffscreenCanvas>();
/** A picture made once and kept; the oldest goes when the store is full. */
export function kept(key: string, w: number, h: number, paint: (c: OffscreenCanvasRenderingContext2D) => void) {
  const hit = store.get(key);
  if (hit) return hit;
  const cv = new OffscreenCanvas(w, h);
  paint(cv.getContext('2d')!);
  if (store.size > 90) store.delete(store.keys().next().value!);
  store.set(key, cv);
  return cv;
}
/** The frame's own coordinates, whatever the ground's slide has done to the canvas. */
export function atBase(e: WorldEnv, f: (c: CanvasRenderingContext2D) => void) {
  e.ctx.save();
  if (e.base) e.ctx.setTransform(e.base);
  f(e.ctx);
  e.ctx.restore();
}
export const flood = (e: WorldEnv, tone: string, a = 1) => { const c = e.ctx; c.save(); c.globalAlpha = a; c.fillStyle = tone; c.fillRect(-W * 0.2, -H * 0.2, W * 1.4, H * 1.4); c.restore(); };
/** Draws a kept picture of width `w` tiled across the frame, shifted by `x`. */
export function tiled(c: CanvasRenderingContext2D, cv: OffscreenCanvas, x: number, y = 0) {
  const w = cv.width;
  const off = ((x % w) + w) % w;
  for (let i = -1; off - w + i * w < W * 1.2; i++) c.drawImage(cv, off - w + i * w, y);
}
export const trace = (c: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, pts: Pt[], closed = true) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); if (closed) c.closePath(); };
/** A hand's line: the same points pushed a little off true, smoothly along the path. */
export const shaken = (pts: Pt[], amp: number, seed: number): Pt[] => pts.map(([x, y], i) => [x + (hash(i * 0.37 | 0, seed) - 0.5) * amp + Math.sin(i * 0.31 + seed) * amp * 0.5, y + (hash(i * 0.37 | 0, seed + 1) - 0.5) * amp + Math.cos(i * 0.27 + seed) * amp * 0.5]);
/** Length of a polyline. */
export const lengthOf = (pts: Pt[]) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
/** The first share `k` of a polyline. */
export function partOf(pts: Pt[], k: number): Pt[] {
  let left = lengthOf(pts) * clamp01(k);
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length && left > 0; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const f = Math.min(1, left / Math.max(0.01, d));
    out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f]);
    left -= d;
  }
  return out;
}

/** Paper grain, as holes: where a dry stick rides over the tooth of what it marks and leaves nothing. */
export const toothTile = (coarse: number) => kept(`tooth|${coarse}`, 512, 512, (g) => {
  const img = g.createImageData(512, 512);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const i = (y * 512 + x) * 4;
    const n = 0.55 * hash(Math.floor(x / coarse), Math.floor(y / coarse)) + 0.45 * hash(x + 3, y + 7);
    img.data[i + 3] = n > 0.56 ? 255 * clamp01((n - 0.56) * 7) : 0;
  }
  g.putImageData(img, 0, 0);
});
let scratchCv: OffscreenCanvas | undefined;
/** A mark laid in dry media: drawn whole on a scratch sheet, the tooth taken out of it, the rest set down. `dry` 0..1 is how much of the tooth shows. */
export function dryMark(c: CanvasRenderingContext2D, draw: (g: OffscreenCanvasRenderingContext2D) => void, coarse = 3, dry = 1, a = 1) {
  const cv = (scratchCv ??= new OffscreenCanvas(W, H));
  const g = cv.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  g.clearRect(0, 0, W, H);
  draw(g);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'destination-out';
  g.globalAlpha = dry;
  g.fillStyle = g.createPattern(toothTile(coarse), 'repeat')!;
  g.fillRect(0, 0, W, H);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  c.save();
  c.globalAlpha = a;
  c.drawImage(cv, 0, 0);
  c.restore();
}
export const strokePts = (g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, pts: Pt[], width: number, tone: string, cap: CanvasLineCap = 'round') => { g.strokeStyle = tone; g.lineWidth = width; g.lineCap = cap; g.lineJoin = 'round'; trace(g, pts, false); g.stroke(); };
/** Paper with its long fibres, kept. */
export const fibred = (key: string, tone: string, fibre: string, n = 2200, w = W, h = H) => kept(`fibred|${key}|${tone}|${fibre}`, w, h, (c) => {
  c.fillStyle = tone;
  c.fillRect(0, 0, w, h);
  c.lineCap = 'round';
  c.strokeStyle = fibre;
  for (let i = 0; i < n; i++) {
    c.globalAlpha = 0.02 + 0.06 * hash(i, 1);
    c.lineWidth = 0.5 + 0.8 * hash(i, 2);
    const [x, y, a, l] = [hash(i, 3) * w, hash(i, 4) * h, hash(i, 5) * TAU, 6 + 34 * hash(i, 6) ** 2];
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + Math.cos(a + 0.5) * l * 0.5, y + Math.sin(a + 0.5) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    c.stroke();
  }
  c.globalAlpha = 1;
});
/** A soft shadow under whatever `f` paints. */
export function lifted(c: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, blur: number, dx: number, dy: number, a: number, f: () => void) {
  c.save();
  c.shadowColor = `rgba(0,0,0,${a})`;
  c.shadowBlur = blur;
  c.shadowOffsetX = dx;
  c.shadowOffsetY = dy;
  f();
  c.restore();
}
/** The words' box grown by a margin, frame px. */
/** The room round the words, `mx`/`my` beyond them; it stops 48 px short of the frame (a room is never a band cut off by the edge). */
export const boxOf = (e: WorldEnv, mx: number, my: number) => { const r = e.rect ?? { x0: W * 0.3, y0: H * 0.4, x1: W * 0.7, y1: H * 0.6 }; const m = 48; return { x0: Math.max(m, r.x0 - mx), y0: Math.max(m, r.y0 - my), x1: Math.min(W - m, r.x1 + mx), y1: Math.min(H - m, r.y1 + my) }; };

export type ObjectPaint = (c: OffscreenCanvasRenderingContext2D, w: number, h: number, s: Slots, seed: number, look: number) => void;
export type HandGround = (e: WorldEnv) => void;
export interface HandIn { sec: number; draw: (e: WorldEnv, q: number) => void }
