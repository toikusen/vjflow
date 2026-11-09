// Where a line really stands in a set, without a page (Q1 phase 3a, docs/research/2026-11-09-q1-phase3a.md): the set's
// own layout (world-sets blockOf) on the plan's rough measure, as drawn (its shear), in frame fractions; its type size;
// and the regions of its page the words must keep off (the set's `clear`). The scheduler compares seats by this, never
// by their names (world-events.ts seatsDiffer), and keeps a seat whose words would cross its page's graphics out.
import { blockOf, SET_SPECS, shearedSize, type SetSpec } from './world-sets';

/** The plan's measure of a string at size 100: a CJK character one em, anything else a little over half. */
export const roughMeasure = (x: string) => [...x].reduce((w, ch) => w + (/[　-鿿＀-￯]/.test(ch) ? 100 : 55), 0);

/** A box in frame fractions, y down. */
export interface FracBox { x0: number; y0: number; x1: number; y1: number }

export interface LaidSeat {
  /** The words' box as laid and drawn, frame fractions. */
  box: FracBox;
  /** The type size, px at 1080p (a split line's: its larger part's). */
  size: number;
  rows: number;
  vertical: boolean;
  /** The page graphics the words keep off, frame fractions. */
  protect: FracBox[];
}

const r3 = (x: number) => +x.toFixed(3);

/** A line laid in a set (by its id or spec), on the rough measure; undefined for a set no spec names. */
export function laidSeat(text: string, set: string | SetSpec): LaidSeat | undefined {
  const spec = typeof set === 'string' ? SET_SPECS[set] : set;
  if (!spec) return undefined;
  const b = blockOf(text.replace(/[\s　]+/g, ' ').trim(), spec, roughMeasure);
  const [w, h] = shearedSize(b.w, b.h, spec.shear);
  // (the block's centre is frame px from the middle, y up; a split line's rows across are each placed from it, and its
  // box covers them all)
  const rows = (b.lines ?? []).filter((r) => !r.v).map((r) => ({ cx: b.cx + r.x0 + r.bw / 2, cy: b.cy + r.y, w: r.bw, h: r.size }));
  const parts = [{ cx: b.cx, cy: b.cy, w, h }, ...rows];
  const x0 = Math.min(...parts.map((p) => 960 + p.cx - p.w / 2));
  const x1 = Math.max(...parts.map((p) => 960 + p.cx + p.w / 2));
  const y0 = Math.min(...parts.map((p) => 540 - p.cy - p.h / 2));
  const y1 = Math.max(...parts.map((p) => 540 - p.cy + p.h / 2));
  const size = b.lines?.length ? Math.max(...b.lines.map((r) => r.size)) : b.size;
  return {
    box: { x0: r3(x0 / 1920), y0: r3(y0 / 1080), x1: r3(x1 / 1920), y1: r3(y1 / 1080) },
    size: Math.round(size),
    rows: b.lines?.length ?? b.rows.length,
    vertical: !!spec.vertical,
    protect: (spec.clear ?? []).map(([a, c, d, e]) => ({ x0: a, y0: c, x1: d, y1: e })),
  };
}

/** Whether two boxes overlap. */
export const boxesMeet = (a: FracBox, b: FracBox) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
