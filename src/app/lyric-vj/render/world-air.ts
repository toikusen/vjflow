// The air engine (style batch 3): light through a lot of atmosphere, as an airbrush lays it. A sky is a gradient with a
// grain in it so it never bands; haze lightens whatever is far; a cloud is soft discs; water throws caustic lines; a sun
// low on the horizon is cut by the stripes of the thicker air. Hard shadows belong to what stands in that light.
// Nothing here knows a colour: every tone arrives from a world's slots.
import { clamp01, hash, kept, mixHex, TAU, W, H } from './world-craft';

type C = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** The sky: three stops top to bottom, dithered so the gradient never shows steps. Kept once per pair of tones. */
export const airSky = (top: string, mid: string, bottom: string, w = W + 240, h = H + 240) => kept(`air|${top}|${mid}|${bottom}`, w, h, (c) => {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(0.55, mid);
  g.addColorStop(1, bottom);
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  const img = c.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (hash(i, 0.7) - 0.5) * 6; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  c.putImageData(img, 0, 0);
});
/** A cloud: a few soft discs along a line, flat underneath. */
export function cloud(c: C, x: number, y: number, r: number, tone: string, seed: number, a = 0.9) {
  c.save();
  c.globalAlpha = a;
  c.filter = `blur(${Math.max(2, r * 0.05)}px)`;
  c.fillStyle = tone;
  const n = 5;
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    const rr = r * (0.45 + 0.55 * Math.sin(k * Math.PI)) * (0.85 + 0.3 * hash(i, seed));
    c.beginPath();
    c.arc(x + (k - 0.5) * r * 2.2, y - rr * 0.5, rr, 0, TAU);
    c.fill();
  }
  c.fillRect(x - r * 1.2, y - r * 0.1, r * 2.4, r * 0.3);
  c.restore();
}
/** Haze on the far part of the picture: lighter toward the horizon. */
export function haze(c: C, y0: number, y1: number, tone: string, a: number) {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, `${tone}00`);
  g.addColorStop(1, tone);
  c.save();
  c.globalAlpha = a;
  c.fillStyle = g;
  c.fillRect(-W * 0.2, y0, W * 1.4, y1 - y0);
  c.restore();
}
/** Caustic lines on water: sines whose phase runs with time, thinner and closer with distance. */
export function caustics(c: C, x0: number, x1: number, y0: number, y1: number, tone: string, t: number, seed: number, a = 0.4) {
  c.save();
  c.strokeStyle = tone;
  c.lineCap = 'round';
  const rows = 11;
  for (let j = 0; j < rows; j++) {
    const k = j / (rows - 1);
    const y = y0 + (y1 - y0) * k ** 1.5;
    c.globalAlpha = a * (0.4 + 0.6 * k);
    c.lineWidth = 1.2 + 2.2 * k;
    c.beginPath();
    for (let x = x0; x <= x1; x += 18) {
      const yy = y + (4 + 10 * k) * Math.sin(x * (0.02 - 0.008 * k) + t * 1.4 + j * 1.7 + hash(j, seed) * 6) * Math.sin(x * 0.005 + t * 0.6 + j);
      x === x0 ? c.moveTo(x, yy) : c.lineTo(x, yy);
    }
    c.stroke();
  }
  c.restore();
}
/** A low sun: a disc cut by horizontal stripes that widen and spread downwards. */
export function stripedSun(c: C, x: number, y: number, r: number, tone: string, k = 1) {
  c.save();
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.clip();
  c.fillStyle = tone;
  c.fillRect(x - r, y - r, r * 2, r * 1.0);
  let yy = y;
  let gap = r * 0.03;
  let band = r * 0.1;
  while (yy < y + r) { c.fillRect(x - r, yy + gap, r * 2, band * k); yy += gap + band; gap *= 1.35; band *= 1.1; }
  c.restore();
}
/** A palm: a trunk and a crown of bowed fronds, swaying by `sway` radians. */
export function palm(c: C, x: number, y: number, h: number, tone: string, sway: number, seed: number) {
  c.save();
  c.fillStyle = tone;
  c.strokeStyle = tone;
  c.lineCap = 'round';
  c.lineWidth = h * 0.045;
  const lean = (hash(seed, 1) - 0.5) * 0.4;
  const [tx, ty] = [x + Math.sin(lean) * h, y - Math.cos(lean) * h];
  c.beginPath();
  c.moveTo(x, y);
  c.quadraticCurveTo(x + Math.sin(lean) * h * 0.3, y - h * 0.55, tx, ty);
  c.stroke();
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI + (i / (n - 1)) * Math.PI + sway + (hash(i, seed) - 0.5) * 0.3;
    const l = h * (0.34 + 0.16 * hash(i, seed + 1));
    c.lineWidth = h * 0.03;
    c.beginPath();
    c.moveTo(tx, ty);
    c.quadraticCurveTo(tx + Math.cos(a) * l * 0.6, ty + Math.sin(a) * l * 0.6 - l * 0.2, tx + Math.cos(a) * l, ty + Math.sin(a) * l + l * 0.35);
    c.stroke();
  }
  c.restore();
}
/** A white wall in hard sun: its shadow is the same shape in one cold tone, pushed by the light's direction. */
export function sunlitBlock(c: C, x: number, y: number, w: number, h: number, tone: string, shade: string, dx: number, dy: number) {
  c.fillStyle = shade;
  c.fillRect(x + dx, y + dy, w, h);
  c.fillStyle = tone;
  c.fillRect(x, y, w, h);
}
/** A band of sea: flat, with the horizon's lighter edge and a few long highlights. */
export function seaBand(c: C, y0: number, y1: number, tone: string, light: string, t: number, seed: number) {
  c.fillStyle = tone;
  c.fillRect(-W * 0.2, y0, W * 1.4, y1 - y0);
  c.save();
  c.strokeStyle = light;
  c.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    const k = hash(i, seed);
    const y = y0 + (y1 - y0) * (0.2 + 0.8 * k);
    const len = 60 + 300 * hash(i, seed + 1) * (0.3 + k);
    const x = ((hash(i, seed + 2) * W * 1.4 + t * (10 + 30 * k)) % (W * 1.4)) - W * 0.2;
    c.globalAlpha = 0.18 + 0.3 * k;
    c.lineWidth = 1 + 2.4 * k;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + len, y);
    c.stroke();
  }
  c.restore();
}
export { mixHex, clamp01 };
