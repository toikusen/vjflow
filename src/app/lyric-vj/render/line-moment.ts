// A type-only mini moment as the line's own sung words move (Q5 phase 2 round 2, critic 2026-11-10: the typography family
// acts on the sung phrase in its own seat, never on copies painted in free space). Pure: world-layout.ts adds the offset
// to each glyph's pose. shape/wave: from the evidence word a crest runs on through the rest of the line once (what the
// word names passes over the words after it); shape/fall and shape/rise: the word itself sinks or lifts and comes back.
// Small enough that no row reaches the next (LIFT em), over the main action, settled by the end of the approved window.
import type { LineMoment } from '../mini-moments';

/** The furthest a glyph moves, in ems of its own size: under the gap between two rows of any world set (lead ≥ 1.05). */
export const LIFT = 0.08;
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => 1 - (1 - clamp(x)) ** 3;

/**
 * The vertical offset (ems, up positive) of the glyph at code point `src` of a line `len` long at time t: 0 outside the
 * moment's window and for every glyph before the word. Fades out after the main action, 0 from `to`.
 */
export function lineMomentLift(m: Pick<LineMoment, 'form' | 'variant' | 'span' | 'at' | 'mainSec' | 'to'>, t: number, src: number, len: number): number {
  if (t < m.at || t >= m.to || src < m.span.from) return 0;
  const q = clamp((t - m.at) / Math.max(0.05, m.mainSec));
  const end = m.at + m.mainSec;
  const left = t < end ? 1 : 1 - clamp((t - end) / Math.max(0.05, m.to - end));
  const key = `${m.form}/${m.variant}`;
  if (key === 'shape/wave') {
    const v = (src - m.span.from) / Math.max(1, len - 1 - m.span.from);
    const crest = q * 1.15;
    return LIFT * left * Math.exp(-(((v - crest) / 0.16) ** 2));
  }
  if (src >= m.span.to) return 0;
  if (key === 'shape/fall') return -LIFT * ease(q) * left;
  if (key === 'shape/rise') return LIFT * ease(q) * left;
  return 0;
}
