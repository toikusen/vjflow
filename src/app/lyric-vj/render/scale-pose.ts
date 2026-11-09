// Q3's scale composition as drawn (docs/research/2026-11-09-q3q5-codex.md §1–2, phase 2 2026-11-10): the line's big text
// with its ink box flush on the safe-area edge the scheduler approved, the rest of the line at its own reading size, and
// the carrier running off the frame on the same side. Pure (no DOM, no THREE): world-layout.ts builds the line's pose from
// it with the real glyph advances, and the measurement runs the same function on a second guess at them. The size is
// re-fitted with the measure given (scale-policy.ts fitOf, the plan's own geometry), from the plan's target down to the
// least scale contrast: a drawn ratio under the planned one is `unrealized`, under 1.6 the line is drawn as composed.
import { fitOf, SCALE_LEAD, SCALE_MIN, EDGE_FIT_MIN, FRAME, SCALE_TARGET, STRESS_PAD, type Measure } from '../scale-policy';
import type { ScaleCarrierRole, ScaleEdge } from '../world-shared';
import type { FracBox } from './seat-geometry';

/** What the plan writes on an approved line (world-events-apply.ts): enough for the renderer to lay it again. */
export interface LineScale {
  /** The approved event it is (scheduler), and the sung section it is for. */
  eventId: string;
  sectionId: string;
  kind: 'edgeFit' | 'scale';
  source: 'meaning' | 'sectionScale';
  /** The plan's estimate: targetSize / readingSize. */
  ratio: number;
  targetSize: number;
  readingSize: number;
  /** The big text, as code-point indices of the line as drawn (its calls taken off to their own track). */
  span: { from: number; to: number };
  edge: ScaleEdge;
  rows: string[];
  carrierRole: ScaleCarrierRole;
  carrierId: string;
}

/**
 * Q2 holds that may run on a scale composition (render/world-beats.ts): the ones that act on each glyph's ink, tone,
 * ghost or small offset. Not the ones that scale the block (line-grow, beat-punch: a ratio on a ratio, the flush edge
 * pushed off the safe area) or move a carrier or stress copies the composition does not have.
 */
export const SCALE_HOLDS = ['ink-run', 'light-sweep', 'echo', 'plate-slip', 'crack', 'roll', 'ink-swap', 'line-ink-settle', 'flicker'];

export interface ScaleGlyph { /** Code point of the drawn text. */ i: number; x: number; y: number; size: number; role: 'big' | 'before' | 'after' }

export interface ScaleDraw {
  size: number;
  /** size / the line's reading size as drawn. */
  ratio: number;
  planned: number;
  /** Drawn smaller than planned. */
  unrealized: boolean;
  kind: 'edgeFit' | 'scale' | 'miss';
  edge?: ScaleEdge;
  /** px, y down. */
  inkBox?: FracBox;
  /** Frame fractions, past 0–1 on the edge's side. */
  carrierBox?: FracBox;
  glyphs: ScaleGlyph[];
  why?: string;
}

const isSpace = (c: string) => /\s/.test(c);

/**
 * The scale composition of `text` (the line as drawn) at `readingSize` (its reading size as drawn in its set), on the
 * plan's edge: undefined geometry (`kind: 'miss'`) when nothing reaches 1.6× with the measure given. Every glyph of the
 * line gets a place: the big text in its rows, the words before and after at reading size, wrapped in their boxes.
 */
export function scaleLayout(text: string, plan: LineScale, readingSize: number, set: { track?: number; clear?: [number, number, number, number][] }, measure: Measure): ScaleDraw {
  const cs = [...text];
  const before = cs.slice(0, plan.span.from).join('');
  const after = cs.slice(plan.span.to).join('');
  const R = readingSize;
  const most = Math.min(SCALE_TARGET, plan.targetSize / Math.max(1, R));
  const miss = (why: string): ScaleDraw => ({ size: R, ratio: 1, planned: plan.ratio, unrealized: true, kind: 'miss', glyphs: [], why });
  if (most < SCALE_MIN) return miss(`the plan's ${plan.targetSize}px is under ${SCALE_MIN}× the drawn reading size ${R.toFixed(0)}px`);
  const track = set.track ?? 0.02;
  const clear = (set.clear ?? []).map(([x0, y0, x1, y1]) => ({ x0, y0, x1, y1 }));
  const fit = fitOf(plan.rows, before, after, { readingSize: R, track, ...(clear.length ? { clear } : {}) }, { edges: [plan.edge], sizeRange: [SCALE_MIN, most], carrierRole: plan.carrierRole }, measure, plan.carrierId);
  if ('why' in fit) return miss(fit.why.join('; '));
  const S = fit.size;
  const seat = fit.seat;
  const px = (b: FracBox): FracBox => ({ x0: b.x0 * FRAME.w, y0: b.y0 * FRAME.h, x1: b.x1 * FRAME.w, y1: b.y1 * FRAME.h });
  const ink = px(seat.inkBox);
  const pad = STRESS_PAD * S;
  const inner = { x0: ink.x0 + pad, y0: ink.y0 + pad, x1: ink.x1 - pad, y1: ink.y1 - pad };
  const adv = (c: string, size: number) => (measure(c) / 100) * size;
  const glyphs: ScaleGlyph[] = [];
  // the big text, row by row, flush to the side its anchor names
  let k = plan.span.from;
  seat.rows.forEach((row, r) => {
    const chars = [...row];
    const w = chars.reduce((a, c) => a + adv(c, S), 0) + Math.max(0, chars.length - 1) * track * S;
    let x = seat.anchor.ax === -1 ? inner.x0 : seat.anchor.ax === 1 ? inner.x1 - w : (inner.x0 + inner.x1 - w) / 2;
    const y = inner.y0 + r * S * SCALE_LEAD + S / 2;
    for (const c of chars) {
      // (a row break swallowed the spaces between rows: the drawn text's own characters are matched in order)
      while (k < plan.span.to && cs[k] !== c) k++;
      if (k >= plan.span.to) break;
      if (!isSpace(c)) glyphs.push({ i: k, x: x + adv(c, S) / 2, y, size: S, role: 'big' });
      x += adv(c, S) + track * S;
      k++;
    }
  });
  // the rest at reading size, wrapped in its box (never condensed)
  for (const rest of seat.restBoxes) {
    const b = px(rest.box);
    const from = rest.role === 'before' ? 0 : plan.span.to;
    const to = rest.role === 'before' ? plan.span.from : cs.length;
    let [x, row] = [b.x0, 0];
    let started = false;
    for (let i = from; i < to; i++) {
      const c = cs[i];
      if (!started && isSpace(c)) continue;
      started = true;
      const a = adv(c, R);
      if (x + a > b.x1 + 1 && x > b.x0) { x = b.x0; row += 1; if (isSpace(c)) continue; }
      if (!isSpace(c)) glyphs.push({ i, x: x + a / 2, y: b.y0 + row * R * SCALE_LEAD + R / 2, size: R, role: rest.role });
      x += a + track * R;
    }
  }
  const ratio = +(S / R).toFixed(3);
  const kind = plan.source === 'meaning' && ratio >= EDGE_FIT_MIN - 1e-6 ? 'edgeFit' : 'scale';
  return { size: S, ratio, planned: plan.ratio, unrealized: ratio < plan.ratio - 0.01, kind, edge: seat.edge, inkBox: ink, carrierBox: seat.carrierExtends.box, glyphs };
}
