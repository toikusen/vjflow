// What style batch 3's boards (2026-11-04, ~/Desktop/vj/output/風格第3批設計稿_2026-11-04) share, drawn the way the
// boards draw them: printed halftone on a turned lattice, tapered speed lines, a comic burst, a four-point sparkle, a
// hard offset shadow, a small printed label. Every shape is hard-edged; nothing here is blurred. Tones arrive from a
// world's slots.
import { kept, W, H, WorldEnv } from './world-craft';

export type C = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** A seeded stream of 0..1 (the boards' own generator, so a board's scatter can be had again). */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Halftone dots on a lattice turned `ang` degrees, clipped to the box; `r(x, y)` is the dot's radius there (under 0.4: none). */
export function halftone(c: C, x0: number, y0: number, w: number, h: number, step: number, r: (x: number, y: number) => number, fill: string, ang = 45) {
  const a = (ang * Math.PI) / 180;
  const [ca, sa] = [Math.cos(a), Math.sin(a)];
  const [cx, cy, R] = [x0 + w / 2, y0 + h / 2, Math.hypot(w, h) / 2 + step];
  c.save();
  c.beginPath();
  c.rect(x0, y0, w, h);
  c.clip();
  c.fillStyle = fill;
  c.beginPath();
  for (let u = -R; u <= R; u += step)
    for (let v = -R; v <= R; v += step) {
      const x = cx + u * ca - v * sa;
      const y = cy + u * sa + v * ca;
      if (x < x0 - step || x > x0 + w + step || y < y0 - step || y > y0 + h + step) continue;
      const d = r(x, y);
      if (d <= 0.4) continue;
      c.moveTo(x + d, y);
      c.arc(x, y, d, 0, Math.PI * 2);
    }
  c.fill();
  c.restore();
}

/** Tapered speed lines toward a focus, starting past `r0` so the focus stays clear. */
export function speedLines(c: C, fx: number, fy: number, r0: number, r1: number, n: number, wmax: number, fill: string, seed = 1) {
  const R = rng(seed);
  c.fillStyle = fill;
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const t = ((i + R() * 0.6) / n) * Math.PI * 2;
    const w = (0.3 + R() * 0.7) * wmax;
    const a = r0 * (1 + R() * 0.35);
    const [ux, uy] = [Math.cos(t), Math.sin(t)];
    c.moveTo(fx + ux * a, fy + uy * a);
    c.lineTo(fx + ux * r1 - uy * w, fy + uy * r1 + ux * w);
    c.lineTo(fx + ux * r1 + uy * w, fy + uy * r1 - ux * w);
    c.closePath();
  }
  c.fill();
}

/** A comic burst's outline: `n` points round an ellipse, valleys `depth` deep. */
export function burstPath(c: C, cx: number, cy: number, rx: number, ry: number, n: number, depth: number, seed = 3) {
  const R = rng(seed);
  c.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const t = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const k = i % 2 ? 1 - depth * (0.8 + R() * 0.4) : 1 + R() * 0.12;
    const [x, y] = [cx + Math.cos(t) * rx * k, cy + Math.sin(t) * ry * k];
    if (i) c.lineTo(x, y);
    else c.moveTo(x, y);
  }
  c.closePath();
}

/** A four-point sparkle with curved sides (the boards' star). */
export function sparklePath(c: C, x: number, y: number, r: number, rot = 0) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.beginPath();
  c.moveTo(0, -r);
  c.quadraticCurveTo(0, 0, r, 0);
  c.quadraticCurveTo(0, 0, 0, r);
  c.quadraticCurveTo(0, 0, -r, 0);
  c.quadraticCurveTo(0, 0, 0, -r);
  c.closePath();
  c.restore();
}

/** A shape filled twice: first in `shadow` pushed by (dx, dy), then itself in `fill`. Hard, never blurred. */
export function hardShadow(c: C, path: () => void, fill: string, shadow: string, dx: number, dy: number) {
  c.save();
  c.translate(dx, dy);
  path();
  c.fillStyle = shadow;
  c.fill();
  c.restore();
  path();
  c.fillStyle = fill;
  c.fill();
}

/** A small printed label: real data only (the song's title, its artist), never invented copy. Returns its width. */
export function label(c: C, text: string, x: number, y: number, font: string, fill: string, track = 0, align: 'left' | 'right' | 'center' = 'left') {
  if (!text) return 0;
  c.save();
  c.font = font;
  c.fillStyle = fill;
  c.textBaseline = 'alphabetic';
  (c as CanvasRenderingContext2D).letterSpacing = `${track}px`;
  const w = c.measureText(text).width;
  const at = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
  // on a mirrored page the label still reads left to right, over the same span
  if (c.getTransform().a < 0) { c.translate(at + w, y); c.scale(-1, 1); c.fillText(text, 0, 0); }
  else c.fillText(text, at, y);
  c.restore();
  return w;
}

/** A page drawn mirrored left to right: its composition flips, its lyric box is read in the flipped page, its labels still read. */
export function mirrorGround(g: (e: WorldEnv) => void): (e: WorldEnv) => void {
  return (e) => {
    const r = e.rect;
    const flipped = r ? { x0: W - r.x1, y0: r.y0, x1: W - r.x0, y1: r.y1 } : undefined;
    const c = e.ctx;
    c.save();
    if (e.base) c.setTransform(e.base);
    c.translate(W, 0);
    c.scale(-1, 1);
    const base = c.getTransform();
    g({ ...e, rect: flipped, base });
    c.restore();
  };
}

/**
 * The song's title and artist are printed only in the opening (owner 2026-11-04): a title on every frame of every set read
 * as a permanent header. Past these seconds a page's labels carry nothing (titleOf / artistBy give '').
 */
export const TITLE_SEC = 12;
const opening = (e: { now: number }) => e.now < TITLE_SEC;
/** The title for a printed label, in the opening only. */
export const titleOf = (e: { now: number; title?: string }) => (opening(e) ? titleOnly(e.title) : '');
/** The artist for a printed label, in the opening only. */
export const artistBy = (e: { now: number; title?: string }) => (opening(e) ? artistOf(e.title) : '');
/** The song's title alone, from "artist - title". */
export const titleOnly = (t?: string) => (t ?? '').split(/\s+[-–—]\s+/).pop()!.trim();
/** The artist, from "artist - title", or nothing. */
export const artistOf = (t?: string) => { const p = (t ?? '').split(/\s+[-–—]\s+/); return p.length > 1 ? p[0].trim() : ''; };

/** A board's whole still composition, painted once per scheme, seed and lyric box and kept: the frame only draws it. */
export function still(e: WorldEnv, id: string, paint: (c: OffscreenCanvasRenderingContext2D) => void, extra = '') {
  const r = e.rect;
  const box = r ? [r.x0, r.y0, r.x1, r.y1].map((v) => Math.round(v / 24)).join(',') : '-';
  const s = e.slots;
  return kept(`b3|${id}|${s.ground}|${s.ink2}|${s.accent}|${s.faint}|${s.plate}|${e.seed % 8}|${box}|${extra}|${opening(e) ? 'title' : ''}`, W, H, paint);
}

/** Draws a kept full-frame picture in the frame's own coordinates (the boards are pages: they do not slide). */
export function onPage(e: WorldEnv, cv: OffscreenCanvas) {
  e.ctx.save();
  if (e.base) e.ctx.setTransform(e.base);
  e.ctx.drawImage(cv, 0, 0);
  e.ctx.restore();
}

/** The lyric box's centre, or a default, in frame px. */
export const focusOf = (e: WorldEnv, fx = W / 2, fy = H / 2): [number, number] => (e.rect ? [(e.rect.x0 + e.rect.x1) / 2, (e.rect.y0 + e.rect.y1) / 2] : [fx, fy]);
