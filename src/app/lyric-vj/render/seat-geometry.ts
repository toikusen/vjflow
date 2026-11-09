// Where a line really stands in a set, without a page (Q1 phase 3a, docs/research/2026-11-09-q1-phase3a.md): the set's
// own layout (world-sets blockOf) on the plan's rough measure, as drawn (its shear), in frame fractions; its type size;
// and the regions of its page the words must keep off (the set's `clear`). The scheduler compares seats by this, never
// by their names (world-events.ts seatsDiffer), and keeps a seat whose words would cross its page's graphics out.
import { blockOf, SET_SPECS, shearedSize, type Measure, type SetSpec } from './world-sets';

/** The plan's measure of a string at size 100: a CJK character one em, anything else a little over half. */
export const roughMeasure = (x: string) => [...x].reduce((w, ch) => w + (/[　-鿿＀-￯]/.test(ch) ? 100 : 55), 0);

/**
 * A second guess at the real advances (size 100): CJK and kana an em, as the worlds' fonts set them; spaces and narrow
 * marks a quarter em, Latin by shape. The rough measure reads spaces and Latin at 55; real fonts set a space nearer 25
 * and an m or a W wider. A same-page seat is offered only where the line fits on both (lineplan-core pageSeatsFor).
 */
export const shapedMeasure = (x: string) => [...x].reduce((w, ch) => w + (/[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 100 : /\s/.test(ch) ? 28 : /[ilIj.,:;'!|]/.test(ch) ? 26 : /[mwMW]/.test(ch) ? 84 : /[A-Z]/.test(ch) ? 66 : 54), 0);

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
  /** Whether the line is set split, a small part apart from the main one (world-split.ts). */
  split: boolean;
}

const r3 = (x: number) => +x.toFixed(3);

/**
 * A set as a line laid in a shared shot takes it (world-layout build): lines sharing a shot split the set, rows stacked
 * in its height, columns side by side in its width, one row fewer and no object. The renderer and the plan read it here.
 */
export function slotSpec(s: SetSpec, slot: { k: number; of: number } = { k: 0, of: 1 }): SetSpec {
  return slot.of > 1 ? { ...s, ...(s.vertical ? { share: s.share / slot.of } : { tall: s.tall / slot.of }), rows: [1, Math.max(1, s.rows[1] - 1)] as [number, number], object: undefined } : s;
}

/**
 * A line laid in a set (by its id or spec): the set as its slot takes it (slotSpec, the renderer's own step) and the
 * set's own layout (blockOf), on the plan's rough measure unless a measure is given; undefined for a set no spec names.
 * The renderer measures the real glyphs (world-layout measureOf); the gap between the two is tested
 * (seat-geometry.spec.ts) and documented (docs/research/2026-11-09-q1-phase3a.md).
 */
export function laidSeat(text: string, set: string | SetSpec, o: { slot?: { k: number; of: number }; measure?: Measure } = {}): LaidSeat | undefined {
  const given = typeof set === 'string' ? SET_SPECS[set] : set;
  if (!given) return undefined;
  const spec = slotSpec(given, o.slot);
  const b = blockOf(text.replace(/[\s　]+/g, ' ').trim(), spec, o.measure ?? roughMeasure);
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
    split: !!b.small?.length,
  };
}

/** Whether two boxes overlap. */
export const boxesMeet = (a: FracBox, b: FracBox) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
/** A box's centre. */
export const boxCentre = (b: FracBox): [number, number] => [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
/** How far a box's centre moved. */
export const centreMove = (p: FracBox, q: FracBox) => { const [[ax, ay], [bx, by]] = [boxCentre(p), boxCentre(q)]; return Math.hypot(ax - bx, ay - by); };
/**
 * How far a block moved on whichever anchor moved least (left, centre or right across; top, middle or bottom down): a
 * longer line set in the same seat is no move. Shared by the scheduler (world-events seatsDiffer) and the frame check
 * (scripts/lyric-vj/frame-change.mts).
 */
export function anchorMove(p: FracBox, q: FracBox): number {
  const least = (xs: number[]) => Math.min(...xs.map(Math.abs));
  const [[ax, ay], [bx, by]] = [boxCentre(p), boxCentre(q)];
  return Math.hypot(least([q.x0 - p.x0, bx - ax, q.x1 - p.x1]), least([q.y0 - p.y0, by - ay, q.y1 - p.y1]));
}

/**
 * What the frame check counts as seen (scripts/lyric-vj/frame-change.mts; calibrated on 28 events labelled by Claude,
 * not by the owner: provisional until checked on held-out or owner-labelled samples): the words moved this share of the
 * frame, their type changed size by this ratio (across lines; the size follows the line's length), the spread of sizes
 * inside them changed this much, the edges of what they stand on changed over this share of the frame, or the words moved
 * this far on their carrier. The scheduler reads `scale` too (world-events seatsDiffer): two lines' type must differ
 * this much to be two seats.
 */
export const SEEN = { shift: 0.06, scale: 1.9, relation: 1.6, page: 0.08, onCarrier: 0.5, outline: 0.08 };
