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

export type InkStatus = 'pass' | 'fail' | 'unverified:no-core' | 'unverified:field-drift' | 'unverified:nondeterministic' | 'unverified:layer-2d';
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

/**
 * Every glyph's verdict from three equal boxes read back from one moment (RGBA rows of width `w`): the final composite
 * with the words, the same without them (controls frozen), and the warped ID mask (rgb: the ID, a: 255 for a core pixel,
 * else mixed). `shown`: IDs drawn on this moment whatever the mask holds (an ID shown with no core pixel is
 * unverified:no-core, never a pass).
 */
export function reduceGlyphs(on: ArrayLike<number>, off: ArrayLike<number>, mask: ArrayLike<number>, w: number, shown: number[] = []): GlyphVerdict[] {
  const core = new Map<number, number[]>();
  const at = new Map<number, [number, number, number, number]>();
  const edge = new Map<number, { n: number; min: number }>();
  const worstRatio = new Map<number, number>();
  for (let k = 0; k + 3 < mask.length; k += 4) {
    const id = rgbId(mask[k], mask[k + 1], mask[k + 2]);
    if (!id) continue;
    const [lo, lf] = [lumOf(on[k], on[k + 1], on[k + 2]), lumOf(off[k], off[k + 1], off[k + 2])];
    const ratio = (Math.max(lo, lf) + 0.05) / (Math.min(lo, lf) + 0.05);
    if (mask[k + 3] < 255) {
      const e = edge.get(id) ?? { n: 0, min: Infinity };
      e.n++;
      e.min = Math.min(e.min, ratio);
      edge.set(id, e);
      continue;
    }
    const xs = core.get(id) ?? (core.set(id, []), core.get(id)!);
    const worst = at.get(id);
    if (!worst || ratio < worstRatio.get(id)!) { at.set(id, [(k / 4) % w, Math.floor(k / 4 / w), lo, lf]); worstRatio.set(id, ratio); }
    xs.push(ratio);
  }
  const ids = [...new Set([...core.keys(), ...edge.keys(), ...shown])];
  return ids.map((id) => {
    const xs = (core.get(id) ?? []).sort((a, b) => a - b);
    const e = edge.get(id);
    const v: GlyphVerdict = { id, n: xs.length, min: xs[0] ?? NaN, p01: xs[Math.floor(xs.length * 0.01)] ?? NaN, median: xs[xs.length >> 1] ?? NaN, minAt: at.get(id) ?? [NaN, NaN, NaN, NaN], status: !xs.length ? 'unverified:no-core' : xs[0] >= INK_MIN ? 'pass' : 'fail' };
    if (e) v.edge = { n: e.n, min: +e.min.toFixed(3) };
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
  | { kind: 'moment'; t: number; frame: number; lines: Record<number, string>; offDrift: number; glyphs: unknown[] }
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
