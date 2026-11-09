// A type-only mini moment as the line's own sung words move (Q5 phase 2 round 2, critic 2026-11-10: the typography family
// acts on the sung phrase in its own seat, never on copies painted in free space). Pure: world-layout.ts adds the offset
// to each glyph's pose. shape/wave: from the evidence word a crest runs on through the rest of the line once (what the
// word names passes over the words after it); shape/fall and shape/rise: the word itself sinks or lifts and comes back.
// Small enough that no row reaches the next (LIFT em), over the main action, settled by the end of the approved window.
import type { LineMoment } from '../mini-moments';
import { laidSeat } from './seat-geometry';
import { SET_SPECS } from './world-sets';

/** The furthest a glyph moves, in ems of its own size, where the set leaves room (liftRoom caps it by the real gap). */
export const LIFT = 0.08;
/** Under this a move is not seen at reading size (≈ 2–3 px): no form, the moment is refused (noForm). */
export const LIFT_MIN = 0.03;

/**
 * How far the line's own words may move in `set` without a stroke reaching another row (code review 2026-11-10: 20 sets
 * set rows 1.00–1.04 apart): a line in one row may move LIFT; rows stacked across leave `lead − 1` em between them; a
 * column (a vertical set) moves along its own column, toward the next glyph, which is `track` em away. Never above
 * LIFT; 0 for a set no spec names.
 */
export function liftRoom(set: string, text: string): number {
  const spec = SET_SPECS[set];
  const laid = spec ? laidSeat(text, set) : undefined;
  if (!spec || !laid) return 0;
  const gap = laid.vertical ? spec.track : laid.rows > 1 ? spec.lead - 1 : LIFT;
  return Math.max(0, Math.min(LIFT, gap));
}
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => 1 - (1 - clamp(x)) ** 3;

/**
 * The vertical offset (ems, up positive) of the glyph at code point `src` of a line `len` long at time t: 0 outside the
 * moment's window and for every glyph before the word. Fades out after the main action, 0 from `to`.
 */
export function lineMomentLift(m: Pick<LineMoment, 'form' | 'variant' | 'span' | 'at' | 'mainSec' | 'to' | 'lift'>, t: number, src: number, len: number): number {
  const top = Math.min(LIFT, m.lift ?? LIFT);
  if (t < m.at || t >= m.to || src < m.span.from) return 0;
  const q = clamp((t - m.at) / Math.max(0.05, m.mainSec));
  const end = m.at + m.mainSec;
  const left = t < end ? 1 : 1 - clamp((t - end) / Math.max(0.05, m.to - end));
  const key = `${m.form}/${m.variant}`;
  if (key === 'shape/wave') {
    const v = (src - m.span.from) / Math.max(1, len - 1 - m.span.from);
    const crest = q * 1.15;
    return top * left * Math.exp(-(((v - crest) / 0.16) ** 2));
  }
  if (src >= m.span.to) return 0;
  if (key === 'shape/fall') return -top * ease(q) * left;
  if (key === 'shape/rise') return top * ease(q) * left;
  return 0;
}
