// Q3's scale composition as drawn (docs/research/2026-11-09-q3q5-codex.md §1–2, phase 2 2026-11-10): the line's big text
// with its ink box flush on the safe-area edge the scheduler approved, the rest of the line at its own reading size, and
// the carrier running off the frame on the same side. Pure (no DOM, no THREE): world-layout.ts builds the line's pose from
// it with the real glyph advances, and the measurement runs the same function on a second guess at them. The size is
// re-fitted with the measure given (scale-policy.ts fitOf, the plan's own geometry), from the plan's target down to the
// least scale contrast: a drawn ratio under the planned one is `unrealized`, under 1.6 the line is drawn as composed.
import { fitOf, SCALE_LEAD, SCALE_MIN, EDGE_FIT_MIN, FRAME, SCALE_TARGET, STRESS_PAD, type Measure } from '../scale-policy';
import type { ScaleCarrierRole, ScaleEdge } from '../world-shared';
import type { FracBox } from './seat-geometry';
import { emBox, pageLayout, type PageLayout, type PageLine } from './page-layout';

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
  /** A Q2 line-grow this composition folded (its change of size): drawn again if the composition is not (beatUnderScale). */
  folded?: { kind: string; at: number; sec?: number; stays?: boolean; span?: { from: number; to: number }; stepped?: boolean };
  /** A page-carried composition's page context (render/page-layout.ts), as the plan read it: the line's show and end, and every other line on screen meanwhile (their laid boxes, shows and ends). Commit time lays the page from the same. */
  page?: PageContext;
}
export interface PageContext { show: number; end: number; others: PageLine[] }

/**
 * Q2 holds that may run on a scale composition (render/world-beats.ts): the ones that act on each glyph's ink, tone,
 * or small offset (a crack's 9 px stays inside the box's stress pad). Not the copies (COPY_HOLDS), nor the ones that scale the block (line-grow, beat-punch: a ratio on a ratio, the flush edge
 * pushed off the safe area) or move a carrier or stress copies the composition does not have.
 */
export const SCALE_HOLDS = ['ink-run', 'light-sweep', 'crack', 'roll', 'ink-swap', 'line-ink-settle', 'flicker'];
/** Holds that throw glyph copies past the words (echo grows a ghost 1.5×, plate-slip offsets one 9 / 7 px): on an ink box flush with the safe edge they bleed past it (Codex Q3 §1), so a scale composition refuses them. */
export const COPY_HOLDS = ['echo', 'plate-slip'];

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
  /** Every glyph's em box together, px y down, and whether it lies inside the declared safe area (scale-policy FRAME). */
  glyphBox?: FracBox;
  inSafe?: boolean;
  why?: string;
}
/** The declared safe area, px y down (render/world-sets SAFE_X / SAFE_Y; scale-policy FRAME). */
export const SAFE_PX: FracBox = { x0: FRAME.safeX, y0: FRAME.safeY, x1: FRAME.w - FRAME.safeX, y1: FRAME.h - FRAME.safeY };

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
  const fit = fitOf(plan.rows, before, after, { readingSize: R, track, ...(clear.length ? { clear } : {}) }, { edges: [plan.edge], sizeRange: [SCALE_MIN, most], carrierRole: plan.carrierRole }, measure, plan.carrierId, plan.source === 'meaning' ? EDGE_FIT_MIN : SCALE_MIN);
  if ('why' in fit) return miss(fit.why.join('; '));
  const S = fit.size;
  const seat = fit.seat;
  // (the seat's boxes are frame fractions to three decimals: taken back to px inside the declared safe area, never past it)
  const px = (b: FracBox): FracBox => ({ x0: Math.max(SAFE_PX.x0, b.x0 * FRAME.w), y0: Math.max(SAFE_PX.y0, b.y0 * FRAME.h), x1: Math.min(SAFE_PX.x1, b.x1 * FRAME.w), y1: Math.min(SAFE_PX.y1, b.y1 * FRAME.h) });
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
  const glyphBox = glyphs.reduce((u, g) => ({ x0: Math.min(u.x0, g.x - g.size / 2), y0: Math.min(u.y0, g.y - g.size / 2), x1: Math.max(u.x1, g.x + g.size / 2), y1: Math.max(u.y1, g.y + g.size / 2) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  const r1 = (b: FracBox): FracBox => ({ x0: +b.x0.toFixed(1), y0: +b.y0.toFixed(1), x1: +b.x1.toFixed(1), y1: +b.y1.toFixed(1) });
  const inSafe = glyphBox.x0 >= SAFE_PX.x0 - 1e-6 && glyphBox.y0 >= SAFE_PX.y0 - 1e-6 && glyphBox.x1 <= SAFE_PX.x1 + 1e-6 && glyphBox.y1 <= SAFE_PX.y1 + 1e-6;
  // (a composition whose glyphs leave the declared safe area is not drawn: the line stands as composed, review 2026-11-10)
  if (!inSafe) return { ...miss(`glyphs leave the safe area (${r1(glyphBox).x0}, ${r1(glyphBox).y0}, ${r1(glyphBox).x1}, ${r1(glyphBox).y1} px)`), glyphBox: r1(glyphBox), inSafe };
  return { size: S, ratio, planned: plan.ratio, unrealized: ratio < plan.ratio - 0.01, kind, edge: seat.edge, inkBox: r1(ink), carrierBox: seat.carrierExtends.box, glyphs, glyphBox: r1(glyphBox), inSafe };
}

/**
 * Who carries a scale composition (critic 2026-11-10, rule 8): a set laid into a page of its own (`ground:` carrier, the
 * screentone pages) has its page lay its own balloon, box or panel round the words as drawn, so the one carrier is
 * re-laid whole with the composition and nothing is painted over it; any other set gets the world's sheet, run off the
 * frame on the composition's edge; a set whose words ride an object of their own (a card, a sign) keeps that object, laid
 * again round the composition. Never two: no band over a page's carrier, no carrier left without its words.
 */
export const carrierPlan = (s: Pick<LineScale, 'carrierId'>, object?: string): 'page' | 'object' | 'sheet' => (s.carrierId.startsWith('ground:') ? 'page' : object ? 'object' : 'sheet');

/** The page a `ground:` carrier names (`ground:screentone/shout` → `screentone/shout`), else undefined. */
export const carrierPage = (s: Pick<LineScale, 'carrierId'>): string | undefined => (s.carrierId.startsWith('ground:') ? s.carrierId.slice('ground:'.length).split(':')[0] : undefined);

/**
 * The whole page a page-carried composition is drawn on (render/page-layout.ts, Codex phase 4 §4): its page laid again
 * round the scaled glyphs as drawn and every other line present (`others`). Undefined for a composition not carried by
 * its page or not drawn; a refusal when no legal page exists, and then the composition is not drawn at all (the line
 * stands on its original page, whole: world-layout treats it as a miss).
 */
export function scalePage(plan: Pick<LineScale, 'carrierId' | 'edge' | 'page'>, d: ScaleDraw, lineId: string, others?: PageLine[]): PageLayout | undefined {
  const page = carrierPage(plan);
  if (!page || d.kind === 'miss') return undefined;
  const ctx = plan.page;
  const hero: PageLine = { id: lineId, boxes: d.glyphs.map(emBox), size: d.size, scaled: true, ...(ctx ? { show: ctx.show, end: ctx.end } : {}) };
  const lines = [hero, ...(others ?? ctx?.others ?? [])];
  if (!ctx) return pageLayout({ page, edge: plan.edge, lines });
  // (laid at every moment the lines on screen change, from the show to the end: one refusal refuses the whole line)
  const moments = [...new Set([ctx.show, ...lines.flatMap((l) => [l.show, l.end]).filter((t): t is number => t !== undefined && t > ctx.show && t < ctx.end)])].sort((a, b) => a - b);
  let first: PageLayout | undefined;
  for (const at of moments) {
    const r = pageLayout({ page, edge: plan.edge, lines, at });
    if (!r.ok) return { ok: false, why: r.why.map((w) => `${w} (at ${at.toFixed(2)} s)`) };
    first ??= r;
  }
  return first;
}

/**
 * The hold a scale composition draws (Codex Q3 §2: the composition is the line's change of size): none of a folded
 * line-grow while the composition is drawn; the folded line-grow back when the renderer finds the composition does not
 * reach 1.6× on the real glyphs (`miss`), so the line never ends with neither.
 */
export function beatUnderScale<B>(scale: { folded?: B } | undefined, drawn: 'edgeFit' | 'scale' | 'miss' | undefined, beat: B | undefined): B | undefined {
  if (!scale || drawn === undefined) return beat;
  return drawn === 'miss' ? beat ?? scale.folded : beat;
}

/**
 * A sheet carrier's edge strokes, px: a panel's frame line is the screentone world's own (world-b5-screentone TONES.frame,
 * 7 px); a paper sheet's second-plate edge is a hairline (3 px) printed 6 px off register, outside the words' guard (the
 * stress pad, ≥ 0.09 em, is never under 13 px at the 1.6× floor of the smallest reading size).
 */
export const CARRIER_STROKE = { panel: 7, plate: 3, plateOffset: 6 } as const;
