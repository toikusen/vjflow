// What the loud worlds (style batch 3) share: flat pattern tiles a studio or a press would use, a hard offset shadow, a
// star, and two ways of keeping the ground quiet where the words stand. Nothing here knows a colour: tones arrive from a
// world's slots.
import { hash, kept, TAU, W, H, WorldEnv } from './world-craft';

type C = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** A two-tone checker. */
export const checkerTile = (a: string, b: string, cell: number) => kept(`chk|${a}|${b}|${cell}`, cell * 2, cell * 2, (c) => { c.fillStyle = a; c.fillRect(0, 0, cell * 2, cell * 2); c.fillStyle = b; c.fillRect(0, 0, cell, cell); c.fillRect(cell, cell, cell, cell); });
/** Diagonal stripes at 45°, equal widths. */
export const stripeTile = (a: string, b: string, w: number) => kept(`stp|${a}|${b}|${w}`, w * 2, w * 2, (c) => {
  const n = w * 2;
  const img = c.createImageData(n, n);
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [ca, cb] = [rgb(a), rgb(b)];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const t = (x + y) % n < w ? cb : ca; img.data.set([t[0], t[1], t[2], 255], (y * n + x) * 4); }
  c.putImageData(img, 0, 0);
});
/** Dots on a half-offset grid: `k` is the dot's share of the cell. */
export const dotTile = (a: string, b: string, cell: number, k: number) => kept(`dot|${a}|${b}|${cell}|${k}`, cell * 2, cell * 2, (c) => { c.fillStyle = a; c.fillRect(0, 0, cell * 2, cell * 2); c.fillStyle = b; for (const [x, y] of [[0, 0], [cell, cell], [cell * 2, 0], [0, cell * 2], [cell * 2, cell * 2]]) { c.beginPath(); c.arc(x, y, cell * k * 0.5, 0, TAU); c.fill(); } });
/** Fills the whole ground with a tile, shifted by (x, y) so it can scroll. */
export function tileGround(c: C, tile: OffscreenCanvas, x: number, y: number, a = 1) {
  c.save();
  c.globalAlpha = a;
  const p = c.createPattern(tile, 'repeat')!;
  p.setTransform(new DOMMatrix().translate(x, y));
  c.fillStyle = p;
  c.fillRect(-W * 0.2, -H * 0.2, W * 1.4, H * 1.4);
  c.restore();
}
/** A five-point star, `r` outer, `ri` inner. */
export function starPath(c: C, x: number, y: number, r: number, ri: number, rot = -Math.PI / 2, n = 5) {
  c.beginPath();
  for (let i = 0; i < n * 2; i++) { const a = rot + (i * Math.PI) / n; const rr = i % 2 ? ri : r; i ? c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  c.closePath();
}
/** A comic burst: many points of uneven length. */
export function burstPath(c: C, x: number, y: number, r: number, seed: number, n = 16, ratio = 0.62) {
  c.beginPath();
  for (let i = 0; i < n * 2; i++) { const a = (i * Math.PI) / n + seed; const rr = i % 2 ? r * ratio : r * (0.86 + 0.28 * hash(i, seed)); i ? c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  c.closePath();
}
/** Draws `f` twice: first as a hard shadow in `tone` pushed by (dx, dy), then itself. */
export function hardShadow(c: C, tone: string, dx: number, dy: number, f: () => void) {
  c.save();
  c.translate(dx, dy);
  c.fillStyle = tone;
  c.strokeStyle = tone;
  f();
  c.restore();
  f();
}
/** Toner grain: a tile of specks for the copier's never-even black. */
export const tonerTile = (tone: string) => kept(`toner|${tone}`, 256, 256, (c) => { c.fillStyle = tone; for (let i = 0; i < 1800; i++) { c.globalAlpha = 0.05 + 0.3 * hash(i, 3) ** 3; c.fillRect(hash(i, 1) * 256, hash(i, 2) * 256, 1 + hash(i, 4) * 1.6, 1 + hash(i, 5) * 1.6); } c.globalAlpha = 1; });
/** The ground's own tone laid back round the words, soft: a loud world keeping the singer's spot dark or light. */
export function roomBehind(e: WorldEnv, tone: string, a = 1, mx = 120, my = 90) {
  if (!e.rect || e.weight <= 0) return;
  const { x0, y0, x1, y1 } = e.rect;
  const c = e.ctx;
  c.save();
  if (e.base) c.setTransform(e.base);
  c.translate((x0 + x1) / 2, (y0 + y1) / 2);
  c.scale((x1 - x0) / 2 + mx, (y1 - y0) / 2 + my);
  const g = c.createRadialGradient(0, 0, 0.6, 0, 0, 1.3);
  g.addColorStop(0, tone);
  g.addColorStop(1, `${tone}00`);
  c.globalAlpha = a * e.weight;
  c.fillStyle = g;
  c.fillRect(-1.4, -1.4, 2.8, 2.8);
  c.restore();
}
/** A hard-edged sheet of `tone` behind the words, a hair off square: a label pasted where the words go. */
export function sheetBehind(e: WorldEnv, tone: string, a = 1, mx = 40, my = 26, tilt = 0) {
  if (!e.rect || e.weight <= 0) return;
  const { x0, y0, x1, y1 } = e.rect;
  const c = e.ctx;
  c.save();
  if (e.base) c.setTransform(e.base);
  c.translate((x0 + x1) / 2, (y0 + y1) / 2);
  c.rotate(tilt);
  c.globalAlpha = a * e.weight;
  c.fillStyle = tone;
  c.fillRect(-(x1 - x0) / 2 - mx, -(y1 - y0) / 2 - my, x1 - x0 + mx * 2, y1 - y0 + my * 2);
  c.restore();
}
