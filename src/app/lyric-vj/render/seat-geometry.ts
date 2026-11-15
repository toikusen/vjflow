// Where a line really stands in a set, without a page (Q1 phase 3a, docs/research/2026-11-09-q1-phase3a.md): the set's
// own layout (world-sets blockOf) on the plan's rough measure, as drawn (its shear), in frame fractions; its type size;
// and the regions of its page the words must keep off (the set's `clear`). The scheduler compares seats by this, never
// by their names (world-events.ts seatsDiffer), and keeps a seat whose words would cross its page's graphics out.
import { typeset } from '../typeset';
import { layoutMeasure, ruleAdvance } from './layout-measure';
import { REST_FLOOR } from './reading-window';
import { leastOf, shearGain } from './type-floor';
import { DECO_PANELS } from './world-b5-sets';
import { blockOf, SET_SPECS, shearedSize, type Block, type Measure, type SetSpec } from './world-sets';

/** The plan's measure of a string at size 100: a CJK character one em, anything else a little over half. */
export const roughMeasure = (x: string) => [...x].reduce((w, ch) => w + (/[　-鿿＀-￯]/.test(ch) ? 100 : 55), 0);

/**
 * A second guess at the real advances (size 100): CJK and kana an em, as the worlds' fonts set them; spaces and narrow
 * marks a quarter em, Latin by shape. The rough measure reads spaces and Latin at 55; real fonts set a space nearer 25
 * and an m or a W wider. A same-page seat is offered only where the line fits on both (lineplan-core pageSeatsFor).
 */
export const shapedMeasure = (x: string) => [...x].reduce((w, ch) => w + ruleAdvance(ch), 0);

/** An even set's measure (world-layout measureOf): every character one em. */
export const evenMeasure = (x: string) => [...x].length * 100;

/** A box in frame fractions, y down. */
export interface FracBox { x0: number; y0: number; x1: number; y1: number }

export interface LaidSeat {
  /** The words' box as laid and drawn, frame fractions. */
  box: FracBox;
  /** The same box in frame px at 1080p, unrounded (plan against picture, seat-geometry.spec.ts). */
  boxPx: FracBox;
  /** The type size, px at 1080p (a split line's: its larger part's). */
  size: number;
  /** The least type any part of it is set at, px at 1080p (render/type-floor.ts leastOf). */
  least: number;
  rows: number;
  vertical: boolean;
  /** The page graphics the words keep off, frame fractions. */
  protect: FracBox[];
  /** Whether the line is set split, a small part apart from the main one (world-split.ts). */
  split: boolean;
  /**
   * A split line's parts as drawn at most (splitRows), frame px at 1080p, y down: the main part's and the small part's
   * boxes and their largest type size.
   */
  parts?: { main: PartBox; small: PartBox };
}

/**
 * A part of a split line, frame px, y down: the box its glyphs can take as the renderer draws them, its type size, and
 * the least glyph it rests at as drawn (`rest`: its row's size through the set's shear, a particle set smaller; the
 * engine's restSize, which sends a line under REST_FLOOR to plain stepped rows instead of its world's layout).
 */
export interface PartBox { x0: number; y0: number; x1: number; y1: number; size: number; rest?: number }

const r3 = (x: number) => +x.toFixed(3);

/**
 * A set as a line laid in a shared shot takes it (world-layout build): lines sharing a shot split the set, rows stacked
 * in its height, columns side by side in its width, one row fewer and no object. The renderer and the plan read it here.
 */
export function slotSpec(s: SetSpec, slot: { k: number; of: number } = { k: 0, of: 1 }): SetSpec {
  return slot.of > 1 ? { ...s, ...(s.vertical ? { share: s.share / slot.of } : { tall: s.tall / slot.of }), rows: [1, Math.max(1, s.rows[1] - 1)] as [number, number], object: undefined, ...(s.bands ? { slot } : {}) } : s;
}

/**
 * A line laid in a set (by its id or spec): the set as its slot takes it (slotSpec, the renderer's own step) and the
 * set's own layout (blockOf), on the plan's rough measure unless a measure is given; undefined for a set no spec names.
 * The renderer measures the real glyphs (world-layout measureOf); the gap between the two is tested
 * (seat-geometry.spec.ts) and documented (docs/research/2026-11-09-q1-phase3a.md).
 */
export function laidSeat(text: string, set: string | SetSpec, o: { slot?: { k: number; of: number }; measure?: Measure; font?: string } = {}): LaidSeat | undefined {
  const given = typeof set === 'string' ? SET_SPECS[set] : set;
  if (!given) return undefined;
  const spec = slotSpec(given, o.slot);
  // (the measure: one given (the renderer's own), else the renderer's as a table for the job's face, else the old rough one)
  // (an even set gives every character, a space or a Latin letter too, a whole cell: world-layout measureOf measures it so)
  const measure = o.measure ?? (o.font ? (spec.even ? evenMeasure : layoutMeasure(o.font)) : roughMeasure);
  const b = blockOf(text.replace(/[\s　]+/g, ' ').trim(), spec, measure);
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
    boxPx: { x0, y0, x1, y1 },
    size: Math.round(size),
    least: Math.round(leastOf(b) * shearGain(spec.shear)),
    rows: b.lines?.length ?? b.rows.length,
    vertical: !!spec.vertical,
    protect: (spec.clear ?? []).map(([a, c, d, e]) => ({ x0: a, y0: c, x1: d, y1: e })),
    split: !!b.small?.length,
    ...(b.small?.length && b.lines ? { parts: splitRows(b, spec, measure) } : {}),
  };
}

/**
 * The two parts of a split block as the renderer draws them, at most (frame px, y down; world-layout poseOf): each row
 * centred on its own box (world-split RowBox), its glyphs set as the typesetter sets display type (typeset.ts, as
 * glyphs.ts makeGlyphs takes it): a Latin letter or a leading kanji bigger, a gap where Latin meets kana. A kana or a
 * particle only ever sets smaller, so the box holds whatever the song's kana scale is. Rows across only.
 */
export function splitRows(b: Block, spec: SetSpec, measure: Measure): { main: PartBox; small: PartBox } | undefined {
  if (!b.lines || !b.small?.length) return undefined;
  const sx = Math.abs(spec.shear?.[0] ?? 1);
  // (the typesetter's sizes on the whole line, as glyphs.ts makeGlyphs sets it: a particle reads its neighbours across a row)
  const whole = [...b.rows.join('')];
  const sizes = typeset(whole.join(''), Math.max(...b.lines.map((r) => r.size)) >= 110).map((x) => x.scale);
  let at = 0;
  const rows = b.lines.map((r, i) => {
    const t = b.rows[i];
    const from = at;
    at += [...t].length;
    if (r.v) return undefined;
    const cs = [...t];
    const ts = typeset(t, true);
    // (the least glyph as the engine weighs it at rest: its size through the row's scale and the set's vertical shear (em height), a hair
    // under for the glyph size's rounding)
    const rest = Math.min(...cs.flatMap((ch, k) => (ch.trim() ? [r.size * shearGain(spec.shear) * Math.min(1, sizes[from + k] ?? 1)] : []))) - 0.5;
    // (the glyph's size is rounded to whole px: a hair more than its scale)
    const grow = ts.map((x) => (x.scale > 1 ? x.scale + 0.01 : 1));
    const w = (cs.reduce((a, ch, k) => a + (measure(ch) / 100) * grow[k] + (k ? ts[k].gapBefore : 0), 0) + Math.max(0, cs.length - 1) * r.track) * r.size;
    const up = Math.max(...grow) - 1;
    // (a bigger glyph sits on the row's baseline: it grows up by 0.92 of its growth and down by 0.08, glyphs.ts dy)
    const cx = 960 + b.cx + sx * (r.x0 + r.bw / 2);
    const cy = 540 - b.cy - r.y;
    return { x0: cx - (w * sx) / 2, x1: cx + (w * sx) / 2, y0: cy - r.size * (0.5 + 0.92 * up), y1: cy + r.size * (0.5 + 0.08 * up), size: r.size, rest, small: b.small!.includes(i) };
  });
  const part = (small: boolean): PartBox | undefined => {
    const rs = rows.filter((r): r is NonNullable<typeof r> => !!r && r.small === small);
    return rs.length ? { x0: Math.min(...rs.map((r) => r.x0)), y0: Math.min(...rs.map((r) => r.y0)), x1: Math.max(...rs.map((r) => r.x1)), y1: Math.max(...rs.map((r) => r.y1)), size: Math.max(...rs.map((r) => r.size)), rest: Math.min(...rs.map((r) => r.rest)) } : undefined;
  };
  const [main, small] = [part(false), part(true)];
  return main && small ? { main, small } : undefined;
}

/** A plaque or panel, frame px, y down. */
export interface PanelRect { x0: number; y0: number; x1: number; y1: number }

/**
 * A marquee line carried on panels (art-deco poster-panel, Q1 phase 3b/3c): the main part's plaque and the small part's
 * panel, both on the frame's axis, from the line's parts as drawn at most (laidSeat → splitRows); undefined when the
 * line does not split in two, the panel would not be the lesser (narrower than the plaque by DECO_PANELS.narrower each
 * side), the two would not stand DECO_PANELS.gap apart, or a part rests under REST_FLOOR (the engine then draws the
 * line as plain stepped rows, no plaque at all). The one function the scheduler offers the seat by
 * (lineplan-core pageSeatsFor), the renderer draws it by (world-layout → world-b5-deco panelsOf) and the contract checks
 * it by (world-events-adapter). `at` moves it with the line (a shared shot's slot offset, frame px, y down).
 */
export function panelSplit(laid: Pick<LaidSeat, 'parts'> | undefined, at: [number, number] = [0, 0]): { main: PanelRect; panel: PanelRect } | undefined {
  const p = laid?.parts;
  if (!p) return undefined;
  const P = DECO_PANELS;
  const AX = 960 + at[0];
  const halfMain = Math.max(P.mainHalf, Math.max(AX - p.main.x0 - at[0], p.main.x1 - AX + at[0]) + P.mainPad);
  const main = { x0: AX - halfMain, y0: p.main.y0 - P.mainPadY + at[1], x1: AX + halfMain, y1: p.main.y1 + P.mainPadY + at[1] };
  const halfT = Math.max(AX - p.small.x0 - at[0], p.small.x1 - AX + at[0]) + P.pad;
  const padY = Math.max(P.inset * 2, P.padY * p.small.size);
  const panel = { x0: AX - halfT, y0: p.small.y0 - padY + at[1], x1: AX + halfT, y1: p.small.y1 + padY + at[1] };
  if (panel.y0 - main.y1 < P.gap || halfT > halfMain - P.narrower) return undefined;
  // (a line resting under the type floor is drawn as plain stepped rows, not on its page's plaque: engine restSize)
  if (Math.min(p.main.rest ?? Infinity, p.small.rest ?? Infinity) < REST_FLOOR) return undefined;
  return { main, panel };
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
