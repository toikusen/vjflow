// Legibility is absolute (owner): every glyph's ink reads at 4.5:1 on the ground it actually stands on. Declared carriers
// (hold-room inkChecks, partGrounds, SetSpec on/rowOn) miss grounds no set declares: y2k's foil strips run a rainbow under
// each glyph, cel80s's split part stands on a lilac sky (2026-11-12 review, 3.12:1 and 2.53:1). This file measures instead:
// the ground under each glyph's box as drawn (the renderer, before it settles a line's inks), and the ink of each glyph on
// a frame against the same frame without the words (the probe gate, style-gate-ink.mts). Numbers only, DOM-free.
import { contrast } from './contrast';

/** Every glyph's ink reads at least this on what is under it (WCAG AA). */
export const INK_MIN = 4.5;

const LIN = Array.from({ length: 256 }, (_, v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
/** WCAG relative luminance of an sRGB pixel. */
export const lumOf = (r: number, g: number, b: number) => 0.2126 * LIN[r] + 0.7152 * LIN[g] + 0.0722 * LIN[b];
const ratio = (x: number, y: number) => (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** A box in a pixel buffer's own px (x right, y down). */
export interface PxBox { x0: number; y0: number; x1: number; y1: number }

/**
 * What a glyph stands on, read from the look under its box (RGBA rows of width `w`): the darkest and the lightest tone
 * that cover a share of it (by luminance, the `tail` share at each end let go: a keyline or a glint under one corner is
 * not what the glyph is read on). An ink reads on the box when it reads on both. Only the inner `inner` share of the box
 * is read: the em box's margin is the neighbour's, not this glyph's.
 */
export function groundTones(data: ArrayLike<number>, w: number, box: PxBox, inner = 0.7, tail = 0.1): { lo: string; hi: string } | undefined {
  const [cx, cy, hw, hh] = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, ((box.x1 - box.x0) * inner) / 2, ((box.y1 - box.y0) * inner) / 2];
  const h = Math.floor(data.length / 4 / w);
  const [x0, x1, y0, y1] = [Math.max(0, Math.floor(cx - hw)), Math.min(w, Math.ceil(cx + hw)), Math.max(0, Math.floor(cy - hh)), Math.min(h, Math.ceil(cy + hh))];
  if (x1 <= x0 || y1 <= y0) return undefined;
  const step = Math.max(1, Math.floor(Math.min(x1 - x0, y1 - y0) / 24));
  const px: [number, number, number, number][] = [];
  for (let y = y0; y < y1; y += step)
    for (let x = x0; x < x1; x += step) {
      const k = (y * w + x) * 4;
      px.push([lumOf(data[k], data[k + 1], data[k + 2]), data[k], data[k + 1], data[k + 2]]);
    }
  if (!px.length) return undefined;
  px.sort((a, b) => a[0] - b[0]);
  const at = (q: number) => px[Math.min(px.length - 1, Math.max(0, Math.round(q * (px.length - 1))))];
  const [lo, hi] = [at(tail), at(1 - tail)];
  return { lo: hex(lo[1], lo[2], lo[3]), hi: hex(hi[1], hi[2], hi[3]) };
}

/** Whether `ink` reads at `min` on every tone of every ground given (groundTones of each glyph it is drawn on). */
export const readsOn = (ink: string, grounds: ({ lo: string; hi: string } | undefined)[], min = INK_MIN) => grounds.every((g) => !g || (contrast(ink, g.lo) >= min && contrast(ink, g.hi) >= min));
/** The least an ink reads on the grounds given. */
export const leastOn = (ink: string, grounds: ({ lo: string; hi: string } | undefined)[]) => Math.min(Infinity, ...grounds.flatMap((g) => (g ? [contrast(ink, g.lo), contrast(ink, g.hi)] : [])));

/**
 * The ink a part of a line falls back to where its own does not read on what it stands on: of the world's own inks, the
 * one that reads best on every glyph of the part (its darkest or its lightest, as the ground asks); pure black or white
 * only when none of the world's reads. Undefined when the part's own ink reads.
 */
export function fallbackInk(own: string, grounds: ({ lo: string; hi: string } | undefined)[], world: string[], min = INK_MIN): string | undefined {
  if (readsOn(own, grounds, min)) return undefined;
  const ok = (c: string) => /^#[0-9a-f]{6}$/i.test(c);
  const best = [...new Set(world.filter(ok).map((c) => c.toLowerCase()))].sort((a, b) => leastOn(b, grounds) - leastOn(a, grounds))[0];
  if (best && leastOn(best, grounds) >= min) return best;
  return ['#000000', '#ffffff'].sort((a, b) => leastOn(b, grounds) - leastOn(a, grounds))[0];
}

/** One glyph read on a frame: its ink pixels, their contrast's low end (the worst fifth) and median, its ink and ground. */
export interface GlyphRead { n: number; low: number; median: number; ink: string; ground: string }
/** Text pixels: where the frame with the words differs from the frame without them by at least this (sum of channels). */
export const TEXT_DIFF = 60;
/** A glyph's ink pixels: text pixels within this distance (largest channel) of its commonest text colour. */
export const INK_NEAR = 48;
/** A glyph with fewer ink pixels than this is not read (a dot of punctuation, a glyph mostly off the frame). */
export const MIN_INK_PX = 40;
/** The share of a glyph's ink pixels taken as its low end: a glyph half on a ground it misses fails. */
export const LOW_SHARE = 0.2;

/**
 * Reads one glyph from the same frame with (`on`) and without (`off`) the words (RGBA rows of width `w`): its text pixels,
 * of them the ink ones (near the commonest text colour: an antialiased edge, a shadow or a ring of another colour is not
 * the glyph's ink), each one's WCAG contrast against the same pixel without the words. Undefined under MIN_INK_PX.
 */
export function readGlyph(on: ArrayLike<number>, off: ArrayLike<number>, w: number, box: PxBox): GlyphRead | undefined {
  const h = Math.floor(on.length / 4 / w);
  const [x0, x1, y0, y1] = [Math.max(0, Math.floor(box.x0)), Math.min(w, Math.ceil(box.x1)), Math.max(0, Math.floor(box.y0)), Math.min(h, Math.ceil(box.y1))];
  const text: number[] = [];
  const bins = new Map<number, number[]>();
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const k = (y * w + x) * 4;
      if (Math.abs(on[k] - off[k]) + Math.abs(on[k + 1] - off[k + 1]) + Math.abs(on[k + 2] - off[k + 2]) < TEXT_DIFF) continue;
      text.push(k);
      const q = ((on[k] >> 4) << 8) | ((on[k + 1] >> 4) << 4) | (on[k + 2] >> 4);
      const b = bins.get(q) ?? (bins.set(q, [0, 0, 0, 0]), bins.get(q)!);
      b[0] += on[k]; b[1] += on[k + 1]; b[2] += on[k + 2]; b[3]++;
    }
  if (text.length < MIN_INK_PX) return undefined;
  const mode = [...bins.values()].sort((a, b) => b[3] - a[3])[0];
  const m = [mode[0] / mode[3], mode[1] / mode[3], mode[2] / mode[3]];
  const ink = text.filter((k) => Math.max(Math.abs(on[k] - m[0]), Math.abs(on[k + 1] - m[1]), Math.abs(on[k + 2] - m[2])) <= INK_NEAR);
  if (ink.length < MIN_INK_PX) return undefined;
  const cs = ink.map((k) => ratio(lumOf(on[k], on[k + 1], on[k + 2]), lumOf(off[k], off[k + 1], off[k + 2]))).sort((a, b) => a - b);
  const g = [0, 0, 0];
  for (const k of ink) { g[0] += off[k]; g[1] += off[k + 1]; g[2] += off[k + 2]; }
  return { n: ink.length, low: +cs[Math.floor(cs.length * LOW_SHARE)].toFixed(2), median: +cs[cs.length >> 1].toFixed(2), ink: hex(m[0], m[1], m[2]), ground: hex(g[0] / ink.length, g[1] / ink.length, g[2] / ink.length) };
}

/**
 * Glyph-sized cells of the text pixels in a region where no glyph boxes are known (a signature moment drawn on the 2D
 * layer): rows split at empty bands of at least `gap` px, each row split at empty columns of at least `gap` px; a cell is
 * kept at `least` px across. Boxes in the buffer's px.
 */
export function textCells(on: ArrayLike<number>, off: ArrayLike<number>, w: number, region: PxBox, gap = 6, least = 16): PxBox[] {
  const h = Math.floor(on.length / 4 / w);
  const [x0, x1, y0, y1] = [Math.max(0, Math.floor(region.x0)), Math.min(w, Math.ceil(region.x1)), Math.max(0, Math.floor(region.y0)), Math.min(h, Math.ceil(region.y1))];
  const isText = (x: number, y: number) => { const k = (y * w + x) * 4; return Math.abs(on[k] - off[k]) + Math.abs(on[k + 1] - off[k + 1]) + Math.abs(on[k + 2] - off[k + 2]) >= TEXT_DIFF; };
  const runs = (n: number, has: (i: number) => boolean): [number, number][] => {
    const out: [number, number][] = [];
    let [start, last] = [-1, -1];
    for (let i = 0; i < n; i++) {
      if (!has(i)) continue;
      if (start < 0 || i - last > gap) { if (start >= 0) out.push([start, last + 1]); start = i; }
      last = i;
    }
    if (start >= 0) out.push([start, last + 1]);
    return out;
  };
  const cells: PxBox[] = [];
  for (const [ra, rb] of runs(y1 - y0, (i) => { for (let x = x0; x < x1; x++) if (isText(x, y0 + i)) return true; return false; })) {
    for (const [ca, cb] of runs(x1 - x0, (i) => { for (let y = y0 + ra; y < y0 + rb; y++) if (isText(x0 + i, y)) return true; return false; })) {
      if (cb - ca >= least || rb - ra >= least) cells.push({ x0: x0 + ca, y0: y0 + ra, x1: x0 + cb, y1: y0 + rb });
    }
  }
  return cells;
}
