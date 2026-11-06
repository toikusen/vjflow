// What style batch 5's pages share (embroidery, screentone, art-deco, notebook; boards 2026-11-06): the line's glyph
// cells as it was really set (world-sets FaceLayout, handed with its box), the boxes and rows they make, and the small
// print. Small print is real data only, the song's title and artist in its opening (world-title.ts) and the time the
// cut began, and it is tallied so the focus measure can tell it from the line (scripts/lyric-vj/world-focus.mts reads
// `globalThis.vjSmallPrint`; `globalThis.vjSmallBare` lays it out unprinted).
import type { FaceLayout } from './world-sets';
import { H, W, WorldEnv } from './world-craft';
import { artistBy, C, label, titleOf } from './world-b3-shared';

export interface Cell { x: number; y: number; s: number }
export interface Box { x0: number; y0: number; x1: number; y1: number }

/** Draws in the frame's own coordinates. */
export const frame = (e: WorldEnv, f: (c: CanvasRenderingContext2D) => void) => { const c = e.ctx; c.save(); if (e.base) c.setTransform(e.base); f(c); c.restore(); };

/** Every shown character of the lines up, its centre in frame px (y down) and its size, from the layouts handed with the box. */
export function cellsOf(e: WorldEnv): Cell[] {
  const r = e.rect as (WorldEnv['rect'] & { face?: FaceLayout; faces?: FaceLayout[] }) | undefined;
  if (!r) return [];
  const fs = r.faces ?? (r.face ? [r.face] : []);
  return fs.flatMap((f) => { const [a, b, c, d] = f.shear; return f.cells.map(([u, v, s]) => ({ x: f.cx + a * u + c * v, y: f.cy + b * u + d * v, s: s * Math.max(Math.abs(a), Math.abs(d)) })); });
}
/** The box round some cells, each taken as its size square (a narrowed face's cells as narrowed). */
export function boxOf(cs: Cell[], sx = 1): Box | undefined {
  if (!cs.length) return undefined;
  return { x0: Math.min(...cs.map((c) => c.x - (c.s * sx) / 2)), y0: Math.min(...cs.map((c) => c.y - c.s / 2)), x1: Math.max(...cs.map((c) => c.x + (c.s * sx) / 2)), y1: Math.max(...cs.map((c) => c.y + c.s / 2)) };
}
/** The line's box: its cells' when it has them, else the box it was handed, else the frame's middle. */
export const wordsBox = (e: WorldEnv, sx = 1): Box => boxOf(cellsOf(e), sx) ?? (e.rect ? { x0: e.rect.x0 + 14, y0: e.rect.y0 + 14, x1: e.rect.x1 - 14, y1: e.rect.y1 - 14 } : { x0: W * 0.3, y0: H * 0.4, x1: W * 0.7, y1: H * 0.6 });
/** Cells in rows (across) or columns (down): grouped where a neighbour sits within half a size, ordered top to bottom or right to left. */
export function linesOf(cs: Cell[], vertical: boolean): Cell[][] {
  const key = (c: Cell) => (vertical ? c.x : c.y);
  const sorted = [...cs].sort((p, q) => key(p) - key(q));
  const out: Cell[][] = [];
  for (const c of sorted) { const last = out.at(-1); if (last && Math.abs(key(c) - key(last[last.length - 1])) < c.s * 0.5) last.push(c); else out.push([c]); }
  return vertical ? out.reverse() : out;
}
/** Whether the line's cells stand in columns (a column's neighbours are one above the other). */
export const isColumn = (cs: Cell[]) => cs.length > 1 && linesOf(cs, true).some((l) => l.length > 1) && linesOf(cs, false).every((l) => l.length <= 2);
/**
 * What the box handed with the line holds beyond the line's own cells: a call set beside it (engine placeCall) is in the
 * box but has no cells. The bands of the box past the cells on each side, those deeper than `least` px.
 */
export function beyondCells(e: WorldEnv, least = 40): Box[] {
  const r = e.rect;
  const w = boxOf(cellsOf(e));
  if (!r || !w) return [];
  const bands: Box[] = [
    { x0: r.x0, y0: r.y0, x1: r.x1, y1: w.y0 - 12 },
    { x0: r.x0, y0: w.y1 + 12, x1: r.x1, y1: r.y1 },
    { x0: r.x0, y0: w.y0, x1: w.x0 - 12, y1: w.y1 },
    { x0: w.x1 + 12, y0: w.y0, x1: r.x1, y1: w.y1 },
  ];
  return bands.filter((b) => b.x1 - b.x0 > least && b.y1 - b.y0 > least);
}
/** A box grown by a margin. */
export const grow = (b: Box, mx: number, my = mx): Box => ({ x0: b.x0 - mx, y0: b.y0 - my, x1: b.x1 + mx, y1: b.y1 + my });
/** Whether two boxes overlap. */
export const meets = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
/** Paints everything but a box (the words' room). */
export const outside = (c: C, b: Box) => { c.beginPath(); c.rect(-W, -H, W * 3, H * 3); c.rect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); c.clip('evenodd'); };

const tally = { largest: 0 };
const bare = () => (globalThis as { vjSmallBare?: boolean }).vjSmallBare === true;
/** A frame's small print starts from nothing. */
export const smallStart = () => { tally.largest = 0; };
/** What the frame's small print came to, for the focus measure. */
export const smallEnd = () => { (globalThis as { vjSmallPrint?: typeof tally }).vjSmallPrint = { ...tally }; };
/** Small print (world-b3-shared label), tallied by its size; left unprinted while the focus measure asks for the frame bare. */
export function small(c: C, text: string, x: number, y: number, px: number, font: (px: number) => string, fill: string, track = 0, align: 'left' | 'right' | 'center' = 'left') {
  if (!text) return 0;
  tally.largest = Math.max(tally.largest, px);
  if (bare()) { c.save(); c.font = font(px); (c as CanvasRenderingContext2D).letterSpacing = `${track}px`; const w = c.measureText(text).width; c.restore(); return w; }
  return label(c, text, x, y, font(px), fill, track, align);
}
/** The time the cut began in the song, m:ss (real data of the moment). */
export const cutTime = (e: WorldEnv) => { const t = Math.max(0, Math.round(e.now - Math.max(0, e.age))); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
/** The opening's title and artist, joined (nothing after the opening). */
export const openingData = (e: WorldEnv, sep: string) => [titleOf(e), artistBy(e)].filter(Boolean).join(sep);
