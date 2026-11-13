// The final-composite ink gate's numbers (gate v2, docs/research/2026-11-13-ink-table-gate-design.md §1): glyph IDs as
// colours, every ink pixel's WCAG contrast against the same pixel of the same final composite without the words, and
// each glyph's verdict. No averages decide: a glyph passes only when its worst core pixel reads at INK_MIN. DOM-free.
import { INK_MIN, lumOf } from './measured-ink';

/** A glyph's ID: the line's slot on this moment (1..255) and its index in the line, 24 bits, 0 for no glyph. */
export const idOf = (lineSlot: number, glyph: number) => ((lineSlot & 255) << 16) | ((glyph + 1) & 0xffff);
export const lineOfId = (id: number) => (id >> 16) & 255;
export const glyphOfId = (id: number) => (id & 0xffff) - 1;
/** The ID as an sRGB triple 0..255 (drawn with no colour management: what is written is what is read back). */
export const idRgb = (id: number): [number, number, number] => [(id >> 16) & 255, (id >> 8) & 255, id & 255];
export const rgbId = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;

export type InkStatus = 'pass' | 'fail' | 'unverified:no-core' | 'unverified:all-mixed' | 'unverified:field-drift' | 'unverified:nondeterministic' | 'unverified:layer-2d';
/** Where a glyph is in its life on this moment: only to sort the fixes, never to skip it. */
export type InkPhase = 'enter' | 'exit' | 'rest' | 'hold' | 'fade' | 'unsung';

export interface GlyphVerdict {
  id: number;
  /** Core pixels: every sample point the final pass read the glyph's place from was this glyph. */
  n: number;
  min: number;
  p01: number;
  median: number;
  /** The worst core pixel: x, y (in the read box), its luminance with and without the words. */
  minAt: [number, number, number, number];
  /** Mixed pixels (some sample points another glyph or none): diagnosis only, listed when under INK_MIN. */
  edge?: { n: number; min: number };
  status: InkStatus;
}

/** How far round an opaque face its visible surroundings are read, px (the face against what borders it on screen). */
export const RIM = 3;
/** At or over this drawn opacity a glyph's face hides what is under it: it is read against its visible surroundings. */
export const OPAQUE = 0.99;

/**
 * Every glyph's verdict from three equal boxes read back from one moment (RGBA rows of width `w`): the final composite with
 * the words (`on`), the same without them on the same controls (`off`), and the warped ID mask (rgb: the ID, a: 255 for a
 * core pixel, else mixed). No pixel is averaged (review 2026-11-13):
 * - a glyph whose drawn opacity is under OPAQUE shows the ground through its ink: each core pixel against the same pixel
 *   of `off`;
 * - an opaque face hides the ground under it: each core pixel against every pixel within RIM px of it that is not this
 *   glyph's (core or mixed) in `on`: the visible surroundings, its own copies, extrudes and ghosts, other glyphs and the
 *   ground beside it all count; a pixel with none in reach decides nothing.
 * `shown`: IDs drawn on this moment whatever the mask holds (shown with no pixel: unverified:no-core; only mixed pixels:
 * unverified:all-mixed; never a pass). `opacity`: each ID's drawn opacity (missing: opaque).
 */
export function reduceGlyphs(on: ArrayLike<number>, off: ArrayLike<number>, mask: ArrayLike<number>, w: number, shown: number[] = [], opacity: Record<number, number> = {}): GlyphVerdict[] {
  const h = Math.floor(mask.length / 4 / w);
  const owner = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) owner[i] = rgbId(mask[i * 4], mask[i * 4 + 1], mask[i * 4 + 2]);
  const L = (a: ArrayLike<number>, k: number) => lumOf(a[k], a[k + 1], a[k + 2]);
  const ratio = (x: number, y: number) => (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  const ring: [number, number][] = [];
  for (let dy = -RIM; dy <= RIM; dy++) for (let dx = -RIM; dx <= RIM; dx++) if ((dx || dy) && dx * dx + dy * dy <= RIM * RIM) ring.push([dx, dy]);
  type Acc = { xs: number[]; worst: number; at: [number, number, number, number]; edge?: { n: number; min: number }; any: boolean };
  const acc = new Map<number, Acc>();
  const get = (id: number) => acc.get(id) ?? (acc.set(id, { xs: [], worst: Infinity, at: [NaN, NaN, NaN, NaN], any: false }), acc.get(id)!);
  for (let i = 0; i < w * h; i++) {
    const id = owner[i];
    if (!id) continue;
    const k = i * 4;
    const a = get(id);
    a.any = true;
    if (mask[k + 3] < 255) {
      const r = ratio(L(on, k), L(off, k));
      a.edge = { n: (a.edge?.n ?? 0) + 1, min: Math.min(a.edge?.min ?? Infinity, r) };
      continue;
    }
    const [x, y] = [i % w, Math.floor(i / w)];
    const lp = L(on, k);
    if ((opacity[id] ?? 1) < OPAQUE) {
      const lq = L(off, k);
      const r = ratio(lp, lq);
      a.xs.push(r);
      if (r < a.worst) [a.worst, a.at] = [r, [x, y, lp, lq]];
      continue;
    }
    let best = Infinity;
    let lb = NaN;
    for (const [dx, dy] of ring) {
      const [qx, qy] = [x + dx, y + dy];
      if (qx < 0 || qy < 0 || qx >= w || qy >= h || owner[qy * w + qx] === id) continue;
      const lq = L(on, (qy * w + qx) * 4);
      const r = ratio(lp, lq);
      if (r < best) [best, lb] = [r, lq];
    }
    if (best === Infinity) continue;
    a.xs.push(best);
    if (best < a.worst) [a.worst, a.at] = [best, [x, y, lp, lb]];
  }
  const ids = [...new Set([...acc.keys(), ...shown])];
  return ids.map((id) => {
    const a = acc.get(id);
    const xs = (a?.xs ?? []).sort((p, q) => p - q);
    const status: InkStatus = !a || !a.any ? 'unverified:no-core' : !xs.length ? 'unverified:all-mixed' : xs[0] >= INK_MIN ? 'pass' : 'fail';
    const v: GlyphVerdict = { id, n: xs.length, min: xs[0] ?? NaN, p01: xs[Math.floor(xs.length * 0.01)] ?? NaN, median: xs[xs.length >> 1] ?? NaN, minAt: a?.at ?? [NaN, NaN, NaN, NaN], status };
    if (a?.edge) v.edge = { n: a.edge.n, min: +a.edge.min.toFixed(3) };
    return v;
  });
}

/**
 * The largest channel difference between the two composites outside every glyph's mask grown by `r` px (rows of width
 * `w`, height `h`): turning the words off must not change the rest of the frame (a glow, a trail): over 2/255, the
 * moment's glyphs are unverified:field-drift.
 */
export function offDrift(on: ArrayLike<number>, off: ArrayLike<number>, mask: ArrayLike<number>, w: number, h: number, r: number, where?: number[]): number {
  // (the mask grown by r: a pixel is near a glyph when any glyph pixel lies within r of it, by rows then columns)
  const glyph = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) glyph[i] = mask[i * 4] | mask[i * 4 + 1] | mask[i * 4 + 2] ? 1 : 0;
  const rows = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let last = -Infinity;
    for (let x = 0; x < w; x++) { if (glyph[y * w + x]) last = x; if (x - last <= r) rows[y * w + x] = 1; }
    last = Infinity;
    for (let x = w - 1; x >= 0; x--) { if (glyph[y * w + x]) last = x; if (last - x <= r) rows[y * w + x] = 1; }
  }
  const near = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    let last = -Infinity;
    for (let y = 0; y < h; y++) { if (rows[y * w + x]) last = y; if (y - last <= r) near[y * w + x] = 1; }
    last = Infinity;
    for (let y = h - 1; y >= 0; y--) { if (rows[y * w + x]) last = y; if (last - y <= r) near[y * w + x] = 1; }
  }
  let most = 0;
  for (let i = 0; i < w * h; i++) {
    if (near[i]) continue;
    const k = i * 4;
    const d = Math.max(Math.abs(on[k] - off[k]), Math.abs(on[k + 1] - off[k + 1]), Math.abs(on[k + 2] - off[k + 2]));
    if (d > most && where) where.splice(0, 4, i % w, Math.floor(i / w), on[k], off[k]);
    most = Math.max(most, d);
  }
  return most;
}
/** Over this (of 255) outside the grown masks, turning the words off changed the field. */
export const DRIFT_MAX = 2;

/** One JSONL row of a gate v2 job. */
export type GateRow =
  | { kind: 'meta'; commit: string; dirty: boolean; fxVersion: string; font: string; size: [number, number]; fps: number; seed: number; mode: 'live' | 'export'; scheduled: boolean; frames: string; world: string; song: string }
  | { kind: 'moment'; t: number; frame: number; lines: Record<number, string>; offDrift: number; driftAt?: number[]; nondeterministic?: boolean; glyphs: unknown[] }
  | { kind: 'done'; moments: number; glyphs: number; fails: number; unverified: Record<string, number>; worst: number; wallSec: number };

/** Where a job's JSONL leaves off: done (skip it), or the last frame written (resume after it), or nothing yet. */
export function resumePoint(lines: string[]): { done: true } | { done: false; after: number } {
  let after = -1;
  for (const l of lines) {
    if (!l.trim()) continue;
    let row: GateRow;
    try { row = JSON.parse(l) as GateRow; } catch { continue; }
    if (row.kind === 'done') return { done: true };
    if (row.kind === 'moment') after = Math.max(after, row.frame);
  }
  return { done: false, after };
}
