// Q3 phase 1 (docs/research/2026-11-09-q3q5-codex.md §1–4): one scale contrast a sung section, chosen by meaning with the
// world's taste, strokes never cut. Per section the policy weighs the reading's own key phrases (meaning.keys, the whole
// phrase), falls back to a whole line set large (`sectionScale`, a layout decision that claims no key word), and else
// records the miss with its reasons. The size law is targetSize = min(2.4 × readingSize, frameCap, fitSize); the ink box
// sits on an edge the world allows, inside the safe area, and only its carrier runs off the frame. Every other line keeps
// its reading size. Pure and seeded: no DOM, no clock. Phase 1: nothing renders from this; its seat goes to
// planWorldEvents() as a layout-seat candidate (one event, one count, no separate Q2 grow) in phase 2.
import { splitCalls } from './calls';
import { balancedRows } from './phrases';
import { readingSec } from './render/reading-window';
import { SAFE_X, SAFE_Y } from './render/world-sets';
import type { ScaleCarrierRole, ScaleEdge, WorldScaleCaps } from './scale-caps-draft';
import { SHORT_LINE, type FrameBox, type SeatCandidate, type WorldEventInput } from './world-events';

/** Width of a string at size 100, px (render/world-sets.ts Measure). */
export type Measure = (s: string) => number;

/** The frame, px at 1080p, and its safe margins (render/world-sets.ts SAFE_X / SAFE_Y). */
export const FRAME = { w: 1920, h: 1080, safeX: SAFE_X, safeY: SAFE_Y };
/** The law's multiplier over reading size, and the bars a big word and an ordinary scale contrast must reach. */
export const SCALE_TARGET = 2.4;
export const EDGE_FIT_MIN = 1.8;
export const SCALE_MIN = 1.6;
/** frameCap: the ink box at most this share of the frame's height and of the safe area's width. */
export const CAP_H = 0.44;
export const CAP_W = 0.86;
/** The stress copies round a big word (render/world-layout.ts STRESS: extrude reaches 0.084 em): kept inside the safe area too. */
export const STRESS_PAD = 0.09;
/** Candidates within this much of the best score are near-equal: the world's seeded hash chooses among them. */
export const NEAR = 0.12;
/**
 * How far a scale carrier runs past the frame on its edge's side, a share of the frame: past any entrance's or exit's
 * travel (world-motion moves stay within 3 % of the frame), so its own edge is never seen inside the frame.
 */
export const CARRIER_OVER = 0.04;
/** Each size tried when a placement collides is this much smaller than the last, down to the world's least ratio. */
const SHRINK = 0.96;
const LEAD = 1.16;

/**
 * Advance at size 100 for a pure estimate: Han, kana, Hangul and full-width marks one em, Latin by letter class. The
 * renderer measures real glyphs (render/glyphs.ts advanceOf); phase 2 passes that in as `measure`.
 */
export const estimateMeasure: Measure = (s) =>
  [...s].reduce((w, c) => w + (/\s/.test(c) ? 30 : /[A-Z]/.test(c) ? 68 : /[a-z]/.test(c) ? 55 : /[0-9]/.test(c) ? 58 : /[\x21-\x7e]/.test(c) ? 32 : 100), 0);

export interface ScaleLine {
  id: string;
  text: string;
  /** When the words come up (ahead of the voice), s: the scale composition is set by then and held while sung. */
  show: number;
  start: number;
  end: number;
  /** The line's reading size in its world's ordinary seat, px at 1080p (render/world-sets.ts blockOf). */
  readingSize: number;
  /** The composer's seat: its box and carrier are kept (a fixed page never loses its carrier for a big word). */
  seat: SeatCandidate;
  /** Where the seat's page draws its large graphics, frame fractions: no ink box enters them. */
  clear?: FrameBox[];
  track?: number;
  /** Lines set in the same frame (a pair or list shot): their room is not measured here, so no candidate is legal on it. */
  sharesFrameWith?: string[];
  /** Why no scale composition can be drawn on the line at all (not a world line: the renderer has no world pose for it). */
  refuse?: string;
}

export interface ScaleSection { id: string; start: number; end: number; type?: string }

export interface ScaleInput {
  songId: string;
  worldId: string;
  seed: number;
  lines: ScaleLine[];
  /** The song's sections (song.json), each with a stable id; a line belongs to the section it starts in. */
  sections: ScaleSection[];
  /** The reading's key phrases (meaning.json keys): the only semantic source. */
  keys: { cue: string; phrase: string }[];
  caps: WorldScaleCaps;
  measure?: Measure;
}

export type ScaleKind = 'edgeFit' | 'scale' | 'miss';
export type ScaleSource = 'meaning' | 'sectionScale';

/** The seat geometry the scheduler and renderer receive: where the ink box stands, what runs off the frame. Not pixels drawn. */
export interface ScaleSeat {
  edge: ScaleEdge;
  /** The point of the ink box on its edge, frame fractions, and which side of the box sits on it (-1 start, 0 centre, 1 end). */
  anchor: { at: [number, number]; ax: -1 | 0 | 1; ay: -1 | 0 | 1 };
  /** The big text's ink box, its stress copies included, frame fractions: always inside the safe area. */
  inkBox: FrameBox;
  /** The rest of the line at its reading size, before and after the big text, frame fractions. */
  restBoxes: { role: 'before' | 'after'; text: string; box: FrameBox }[];
  /** The big text's rows: never condensed, a row break only at a phrase boundary. */
  rows: string[];
  /** The carrier under the big text, running past the frame on the edge's side (the glyphs never do). */
  carrierExtends: { side: ScaleEdge; role: ScaleCarrierRole; carrierId: string; box: FrameBox };
}

export interface ScaleFeatures { short: number; ratio: number; room: number; sustain: number; order: number }

export interface ScaleCandidate {
  lineId: string;
  source: ScaleSource;
  /** The big text: the whole key phrase, or the whole line (its calls left to their own track). */
  text: string;
  /** Code-point span of the big text in the line (the whole sung part for sectionScale). */
  span: { from: number; to: number };
  readingSize: number;
  targetSize: number;
  /** targetSize / readingSize, estimated (glyph widths by `measure`). */
  ratio: number;
  kind: ScaleKind;
  legal: boolean;
  score: number;
  features?: ScaleFeatures;
  seat?: ScaleSeat;
  /** Why it is not legal, or what it gave up (an edge that collided, a row break it needed). */
  reasons: string[];
}

export interface SectionScale {
  sectionId: string;
  start: number;
  end: number;
  lineIds: string[];
  candidates: ScaleCandidate[];
  /** Index into candidates, absent on a miss. */
  chosen?: number;
  kind: ScaleKind;
  ratio?: number;
  /** For a miss, why every candidate failed; else how the choice was made. */
  reasons: string[];
  /** How many near-equal candidates the hash chose among. */
  pool: number;
}

/**
 * The layout-seat candidate planWorldEvents() receives (Codex §2): one event id, one window, one count. The seat replaces
 * the line's composed seat (its carrier kept); no Q2 line-grow is scheduled for the same scale change, and its ratio is
 * never multiplied by one.
 */
export interface LayoutSeatCandidate {
  eventId: string;
  family: 'layout-seat';
  lineId: string;
  sectionId: string;
  /** Composed before the voice and held while sung: a cut at show, no action time. */
  at: number;
  from: number;
  to: number;
  seat: SeatCandidate;
  scale: { kind: Exclude<ScaleKind, 'miss'>; source: ScaleSource; ratio: number; targetSize: number; readingSize: number; restSize: number; span: { from: number; to: number } } & ScaleSeat;
  count: 1;
  /** The scale change is this event: a Q2 grow on the same line is not scheduled on top of it. */
  replacesGrow: true;
}

export interface ScalePlan {
  songId: string;
  worldId: string;
  seed: number;
  sections: SectionScale[];
  seats: LayoutSeatCandidate[];
  /** Per section with a legal candidate: the chosen seat, then the other legal ones in the order the scheduler tries them. */
  ranked: LayoutSeatCandidate[][];
  /** Every line's sizes: the chosen line's rest keeps its reading size, every other line keeps its own. */
  sizes: Record<string, { reading: number; rest: number; big?: number }>;
  sungSections: number;
  plannedSections: number;
  edgeFitSections: number;
}

const unit = (s: string) => ([...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261) >>> 0) / 2 ** 32;
const r3 = (x: number) => +x.toFixed(3);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const glyphCount = (s: string) => [...s.replace(/\s/g, '')].length;
const hit = (a: FrameBox, b: FrameBox) => a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.y0 < b.y1 - 1e-6 && b.y0 < a.y1 - 1e-6;
const frac = (b: FrameBox): FrameBox => ({ x0: r3(b.x0 / FRAME.w), y0: r3(b.y0 / FRAME.h), x1: r3(b.x1 / FRAME.w), y1: r3(b.y1 / FRAME.h) });

/** Each sung section and its lines: a line belongs to the section it starts in, never to two. Sections nobody sings are left out. */
export function sungSectionsOf<L extends { start: number }>(sections: ScaleSection[], lines: L[]): { section: ScaleSection; lines: L[] }[] {
  return sections.map((section) => ({ section, lines: lines.filter((l) => section.start <= l.start && l.start < section.end) })).filter((x) => x.lines.length);
}

export interface Fit { size: number; seat: ScaleSeat; dropped: string[] }

/**
 * The biggest legal setting of `big` (rows of the big text) with the rest of the line at reading size: on an edge the
 * world allows, ink box and stress copies inside the safe area and clear of the page's graphics, the words before above or
 * left of it and the words after below or right of it. Starts at min(2.4 × reading, frameCap, the world's most) and
 * steps down to the world's least; undefined when nothing fits.
 */
export function fitOf(rows: string[], before: string, after: string, line: Pick<ScaleLine, 'readingSize' | 'track' | 'clear'>, caps: Pick<WorldScaleCaps, 'edges' | 'sizeRange' | 'carrierRole'>, measure: Measure, carrierId: string): Fit | { why: string[] } {
  const R = line.readingSize;
  const track = line.track ?? 0.02;
  const emW = Math.max(...rows.map((r) => measure(r) / 100 + Math.max(0, [...r].length - 1) * track));
  const emH = rows.length + (rows.length - 1) * (LEAD - 1);
  const safe = { x0: FRAME.safeX, y0: FRAME.safeY, x1: FRAME.w - FRAME.safeX, y1: FRAME.h - FRAME.safeY };
  const safeW = safe.x1 - safe.x0;
  const frameCap = Math.min((CAP_H * FRAME.h) / emH, (CAP_W * safeW) / emW);
  const most = Math.min(SCALE_TARGET, caps.sizeRange[1]) * R;
  const least = Math.max(SCALE_MIN, caps.sizeRange[0]) * R;
  const top = Math.min(most, frameCap);
  if (top < least) return { why: [`frameCap ${(frameCap / R).toFixed(2)}× < ${(least / R).toFixed(2)}× (ink box ≤ ${CAP_H * 100}% of the frame height, ≤ ${CAP_W * 100}% of the safe width)`] };
  const clear = (line.clear ?? []).map((c) => ({ x0: c.x0 * FRAME.w, y0: c.y0 * FRAME.h, x1: c.x1 * FRAME.w, y1: c.y1 * FRAME.h }));
  // the rest at reading size, wrapped at the safe width (never condensed)
  const restOf = (text: string) => {
    if (!text.trim()) return undefined;
    const w = (measure(text) / 100) * R + Math.max(0, [...text].length - 1) * track * R;
    const n = Math.max(1, Math.ceil(w / safeW));
    return { text: text.trim(), w: Math.min(w, safeW), h: n * R * LEAD, rows: n };
  };
  const pre = restOf(before);
  const post = restOf(after);
  const gap = 0.3 * R;
  const inside = (b: FrameBox) => b.x0 >= safe.x0 - 1e-6 && b.y0 >= safe.y0 - 1e-6 && b.x1 <= safe.x1 + 1e-6 && b.y1 <= safe.y1 + 1e-6;
  const why = new Set<string>();
  const place = (edge: ScaleEdge, S: number): ScaleSeat | undefined => {
    const pad = STRESS_PAD * S;
    const [w, h] = [emW * S + 2 * pad, emH * S + 2 * pad];
    const along: (-1 | 0 | 1)[] = [-1, 0, 1];
    for (const k of along) {
      let ink: FrameBox;
      const rest: ScaleSeat['restBoxes'] = [];
      const horizontalEdge = edge === 'top' || edge === 'bottom';
      if (horizontalEdge) {
        const x0 = k === -1 ? safe.x0 : k === 1 ? safe.x1 - w : (FRAME.w - w) / 2;
        ink = edge === 'bottom' ? { x0, y0: safe.y1 - h, x1: x0 + w, y1: safe.y1 } : { x0, y0: safe.y0, x1: x0 + w, y1: safe.y0 + h };
        // reading order on a horizontal edge: the words on the frame's side of the big text cannot go past the edge, so
        // they stand beside it in its band (before to its left, after to its right), the others stack inward
        const inward = edge === 'bottom' ? pre : post;
        const beside = edge === 'bottom' ? post : pre;
        if (inward) {
          const y0 = edge === 'bottom' ? ink.y0 - gap - inward.h : ink.y1 + gap;
          const x = Math.min(Math.max(safe.x0, ink.x0), safe.x1 - inward.w);
          rest.push({ role: edge === 'bottom' ? 'before' : 'after', text: inward.text, box: { x0: x, y0, x1: x + inward.w, y1: y0 + inward.h } });
        }
        if (beside) {
          if (beside.rows > 1) { why.add(`${edge}: the words ${edge === 'bottom' ? 'after' : 'before'} the big text run past one row beside it`); continue; }
          const bx0 = edge === 'bottom' ? ink.x1 + gap : ink.x0 - gap - beside.w;
          const by0 = edge === 'bottom' ? ink.y1 - beside.h : ink.y0;
          rest.push({ role: edge === 'bottom' ? 'after' : 'before', text: beside.text, box: { x0: bx0, y0: by0, x1: bx0 + beside.w, y1: by0 + beside.h } });
        }
      } else {
        const y0 = k === -1 ? safe.y0 + (pre ? pre.h + gap : 0) : k === 1 ? safe.y1 - h - (post ? post.h + gap : 0) : (FRAME.h - h) / 2;
        const x0 = edge === 'left' ? safe.x0 : safe.x1 - w;
        ink = { x0, y0, x1: x0 + w, y1: y0 + h };
        // (on a side edge the words before stand above and the words after below, flush to the same edge)
        const flush = (r: NonNullable<typeof pre>) => (edge === 'left' ? safe.x0 : safe.x1 - r.w);
        if (pre) rest.push({ role: 'before', text: pre.text, box: { x0: flush(pre), y0: ink.y0 - gap - pre.h, x1: flush(pre) + pre.w, y1: ink.y0 - gap } });
        if (post) rest.push({ role: 'after', text: post.text, box: { x0: flush(post), y0: ink.y1 + gap, x1: flush(post) + post.w, y1: ink.y1 + gap + post.h } });
      }
      const boxes = [ink, ...rest.map((r) => r.box)];
      if (!boxes.every(inside)) { why.add(`${edge}: the line does not fit the safe area at ${(S / R).toFixed(2)}×`); continue; }
      if (boxes.some((b) => clear.some((c) => hit(b, c)))) { why.add(`${edge}: the page's own graphics (set clear boxes) are in the way`); continue; }
      const ax: -1 | 0 | 1 = edge === 'left' ? -1 : edge === 'right' ? 1 : k;
      const ay: -1 | 0 | 1 = edge === 'top' ? -1 : edge === 'bottom' ? 1 : k;
      const at: [number, number] = [r3((ax === -1 ? ink.x0 : ax === 1 ? ink.x1 : (ink.x0 + ink.x1) / 2) / FRAME.w), r3((ay === -1 ? ink.y0 : ay === 1 ? ink.y1 : (ink.y0 + ink.y1) / 2) / FRAME.h)];
      // the carrier: the band of the whole line (the big text and the rest it reads with) widened by a pad and carried past
      // the frame on the edge's side; a comic panel is a whole tier of the page, edge to edge (phase 2: the rest read on it too)
      const m = 0.25 * S;
      const over = CARRIER_OVER;
      const all = boxes.reduce((u, b) => ({ x0: Math.min(u.x0, b.x0), y0: Math.min(u.y0, b.y0), x1: Math.max(u.x1, b.x1), y1: Math.max(u.y1, b.y1) }));
      const band0 = frac({ x0: all.x0 - m, y0: all.y0 - m, x1: all.x1 + m, y1: all.y1 + m });
      const band = caps.carrierRole === 'panel' && (edge === 'top' || edge === 'bottom') ? { ...band0, x0: -over, x1: 1 + over } : band0;
      const off: FrameBox = edge === 'bottom' ? { ...band, y1: 1 + over } : edge === 'top' ? { ...band, y0: -over } : edge === 'left' ? { ...band, x0: -over } : { ...band, x1: 1 + over };
      return { edge, anchor: { at, ax, ay }, inkBox: frac(ink), restBoxes: rest.map((r) => ({ ...r, box: frac(r.box) })), rows, carrierExtends: { side: edge, role: caps.carrierRole, carrierId, box: off } };
    }
    return undefined;
  };
  // fitSize: the biggest size from the top down at which some allowed edge takes the whole line
  for (let S = top; S >= least - 1e-6; S *= SHRINK) {
    const fits = caps.edges.map((e) => place(e, S)).filter((x): x is ScaleSeat => !!x);
    if (fits.length) return { size: S, seat: fits[0], dropped: caps.edges.filter((e) => e !== fits[0].edge && !fits.some((f) => f.edge === e)).map((e) => `${e}: no room at ${(S / R).toFixed(2)}×`) };
    if (S * SHRINK < least - 1e-6 && S > least + 1e-6) S = least / SHRINK;
  }
  return { why: why.size ? [...why] : [`no allowed edge (${caps.edges.join('/')}) takes the line at ≥ ${(least / R).toFixed(2)}×`] };
}

/** The rows' line spacing, in ems (a row's step is LEAD × size). */
export const SCALE_LEAD = LEAD;

/** The world's features of a legal candidate, 0–1 each, and their weighted mean. */
function scoreOf(c: ScaleCandidate, line: ScaleLine, caps: WorldScaleCaps, measure: Measure): { features: ScaleFeatures; score: number } {
  const em = measure(c.text) / 100;
  const ink = c.seat!.inkBox;
  const area = (ink.x1 - ink.x0) * (ink.y1 - ink.y0);
  const roles = new Set(c.seat!.restBoxes.map((r) => r.role));
  const features: ScaleFeatures = {
    short: glyphCount(c.text) <= 4 ? 1 : clamp01(1 - (em - 4) / 8),
    ratio: clamp01((c.ratio - SCALE_MIN) / (SCALE_TARGET - SCALE_MIN)),
    room: clamp01(1 - area / 0.3),
    sustain: clamp01((line.end - line.show - readingSec(line.text, line.start, line.end)) / 2),
    order: roles.size === 2 ? 0.5 : 1,
  };
  const w = caps.candidateWeights;
  const total = w.short + w.ratio + w.room + w.sustain + w.order;
  const score = (w.short * features.short + w.ratio * features.ratio + w.room * features.room + w.sustain * features.sustain + w.order * features.order) / Math.max(1e-6, total);
  return { features, score: r3(score) };
}

/** Where a phrase stands in a line, as a whole phrase: code-point span, or undefined. */
function spanOf(text: string, phrase: string): { from: number; to: number } | undefined {
  const at = text.indexOf(phrase);
  if (!phrase || at < 0) return undefined;
  const from = [...text.slice(0, at)].length;
  return { from, to: from + [...phrase].length };
}

function candidate(line: ScaleLine, source: ScaleSource, text: string, span: { from: number; to: number }, before: string, after: string, caps: WorldScaleCaps, measure: Measure, reasons: string[] = []): ScaleCandidate {
  const R = line.readingSize;
  const base: ScaleCandidate = { lineId: line.id, source, text, span, readingSize: R, targetSize: 0, ratio: 0, kind: 'miss', legal: false, score: 0, reasons: [...reasons] };
  if (reasons.length) return base;
  if (line.refuse) return { ...base, reasons: [line.refuse] };
  if (line.sharesFrameWith?.length) return { ...base, reasons: [`set in one frame with ${line.sharesFrameWith.join(', ')} (pair shot): their room at reading size is not measured, so no scale seat`] };
  if (line.end - line.start < SHORT_LINE) return { ...base, reasons: [`short line (${(line.end - line.start).toFixed(2)}s < ${SHORT_LINE}s): the scheduler keeps its seat`] };
  const carrierId = line.seat.carrierId ?? `${caps.carrierRole}:${caps.worldId}`;
  // one row first; a row break only at a phrase boundary, then a second candidate (Codex §1: seat / break, then candidate)
  const breaks = [1, 2, 3].filter((n) => n === 1 || glyphCount(text) > 3).slice(0, source === 'meaning' ? 2 : 3);
  const tried: string[] = [];
  for (const n of breaks) {
    const rows = n === 1 ? [text.trim()] : balancedRows(text, n).filter(Boolean);
    if (rows.length !== n) continue;
    const fit = fitOf(rows, before, after, line, caps, measure, carrierId);
    if ('why' in fit) { tried.push(...fit.why.map((w) => `${n} row${n > 1 ? 's' : ''}: ${w}`)); continue; }
    const ratio = r3(fit.size / R);
    const kind: ScaleKind = source === 'meaning' && ratio >= EDGE_FIT_MIN - 1e-6 ? 'edgeFit' : 'scale';
    const c: ScaleCandidate = { ...base, targetSize: Math.round(fit.size), ratio, kind, legal: true, seat: fit.seat, reasons: [...tried, ...fit.dropped, ...(n > 1 ? [`set in ${n} rows at phrase boundaries`] : [])] };
    return { ...c, ...scoreOf(c, line, caps, measure) };
  }
  return { ...base, reasons: tried };
}

/** A section's candidates: the reading's key phrases first, then each line whole (sectionScale). */
function candidatesOf(lines: ScaleLine[], keys: ScaleInput['keys'], caps: WorldScaleCaps, measure: Measure): ScaleCandidate[] {
  const out: ScaleCandidate[] = [];
  for (const line of lines) {
    const { map } = splitCalls(line.text);
    const cs = [...line.text];
    for (const k of keys.filter((x) => x.cue === line.id)) {
      const span = spanOf(line.text, k.phrase);
      const inCall = span && map.slice(span.from, span.to).some((i) => i < 0);
      const reasons = !span ? [`key phrase 「${k.phrase}」 is not in the line`] : inCall ? [`key phrase 「${k.phrase}」 is inside a call (another voice's track)`] : [];
      const s = span ?? { from: 0, to: 0 };
      out.push(candidate(line, 'meaning', k.phrase, s, cs.slice(0, s.from).join('').replace(/[（(][^）)]*[）)]/g, ''), cs.slice(s.to).join('').replace(/[（(][^）)]*[）)]/g, ''), caps, measure, reasons));
    }
  }
  for (const line of lines) {
    const { main, map } = splitCalls(line.text);
    const kept = map.map((m, i) => (m >= 0 ? i : -1)).filter((i) => i >= 0);
    const span = kept.length ? { from: kept[0], to: kept.at(-1)! + 1 } : { from: 0, to: [...line.text].length };
    out.push(candidate(line, 'sectionScale', main.trim(), span, '', '', caps, measure));
  }
  return out;
}

/** A legal candidate as the layout-seat the scheduler receives: the line's composed seat enlarged on its own carrier. */
function seatOf(pick: ScaleCandidate, line: ScaleLine, sectionId: string): LayoutSeatCandidate {
  return {
    // (a key phrase and its whole line are two candidates on one line: the phrase's id names its span)
    eventId: `scale:${line.id}${pick.source === 'meaning' ? `@${pick.span.from}-${pick.span.to}` : ''}`,
    family: 'layout-seat',
    lineId: line.id,
    sectionId,
    at: line.show,
    from: line.show,
    to: line.show,
    seat: { id: `${line.seat.id}+scale:${pick.seat!.edge}`, box: pick.seat!.inkBox, carrierId: pick.seat!.carrierExtends.carrierId },
    scale: { kind: pick.kind as Exclude<ScaleKind, 'miss'>, source: pick.source, ratio: pick.ratio, targetSize: pick.targetSize, readingSize: line.readingSize, restSize: line.readingSize, span: pick.span, ...pick.seat! },
    count: 1,
    replacesGrow: true,
  };
}

/** The legal candidates of the first tier that has any: meaning edgeFit, meaning scale, then sectionScale. */
const TIERS: ((c: ScaleCandidate) => boolean)[] = [(c) => c.source === 'meaning' && c.kind === 'edgeFit', (c) => c.source === 'meaning' && c.kind === 'scale', (c) => c.source === 'sectionScale'];

/**
 * One scale contrast for every sung section (Codex §3): the semantic big word when the reading named one that fits
 * (edgeFit at ≥ 1.8×, an ordinary scale contrast at 1.6–1.8×), else a whole line at ≥ 1.6× (`sectionScale`, never counted
 * as a big word), else a miss with every candidate's reasons. Among near-equal candidates of the first tier that has any,
 * hash(songId, sectionId, worldId, seed) chooses, weighted by the world's score: never always the first, never a worse
 * line for the sake of difference. No line other than the chosen one changes size, and the chosen line's rest keeps its
 * reading size.
 */
export function pickScaleContrasts(input: ScaleInput): ScalePlan {
  const measure = input.measure ?? estimateMeasure;
  const lines = [...input.lines].sort((a, b) => a.start - b.start);
  const sizes: ScalePlan['sizes'] = Object.fromEntries(lines.map((l) => [l.id, { reading: l.readingSize, rest: l.readingSize }]));
  const seats: LayoutSeatCandidate[] = [];
  const ranked: LayoutSeatCandidate[][] = [];
  const sections = sungSectionsOf(input.sections, lines).map(({ section, lines: ls }): SectionScale => {
    const candidates = candidatesOf(ls, input.keys, input.caps, measure);
    const head = { sectionId: section.id, start: section.start, end: section.end, lineIds: ls.map((l) => l.id), candidates };
    const tier = TIERS.map((t) => candidates.filter((c) => c.legal && t(c))).find((x) => x.length);
    if (!tier) {
      const keyless = !candidates.some((c) => c.source === 'meaning');
      return { ...head, kind: 'miss', pool: 0, reasons: [...(keyless ? ['no key phrase named by the reading in this section'] : []), 'no whole line reaches 1.6× within frameCap and the safe area'] };
    }
    const best = Math.max(...tier.map((c) => c.score));
    const pool = tier.filter((c) => c.score >= best - NEAR - 1e-9);
    const u = unit(`${input.songId}|${section.id}|${input.worldId}|${input.seed}`);
    const total = pool.reduce((s, c) => s + Math.max(1e-3, c.score), 0);
    let acc = 0;
    const pick = pool.find((c) => (acc += Math.max(1e-3, c.score)) / total > u) ?? pool.at(-1)!;
    const chosen = candidates.indexOf(pick);
    const line = ls.find((l) => l.id === pick.lineId)!;
    sizes[line.id] = { reading: line.readingSize, rest: line.readingSize, big: pick.targetSize };
    seats.push(seatOf(pick, line, section.id));
    // (the scheduler's fallbacks, Codex §2: the chosen one, then every other legal candidate, tier by tier, best first)
    const rest = TIERS.flatMap((t) => candidates.filter((c) => c.legal && t(c) && c !== pick).sort((a, b) => b.score - a.score));
    ranked.push([seatOf(pick, line, section.id), ...rest.map((c) => seatOf(c, ls.find((l) => l.id === c.lineId)!, section.id))]);
    const why = pick.source === 'sectionScale' ? `${candidates.some((c) => c.source === 'meaning') ? 'no key phrase fits' : 'no key phrase named'}: whole line ${pick.lineId} set at ${pick.ratio}×` : `key phrase 「${pick.text}」 at ${pick.ratio}×`;
    return { ...head, chosen, kind: pick.kind, ratio: pick.ratio, pool: pool.length, reasons: [`${why}; hash chose 1 of ${pool.length} near-equal (score ≥ ${(best - NEAR).toFixed(3)})`] };
  });
  return {
    songId: input.songId,
    worldId: input.worldId,
    seed: input.seed,
    sections,
    seats,
    ranked,
    sizes,
    sungSections: sections.length,
    plannedSections: sections.filter((s) => s.kind !== 'miss').length,
    edgeFitSections: sections.filter((s) => s.kind === 'edgeFit').length,
  };
}

/**
 * The scheduler's input with each chosen scale seat as its line's own seat (first candidate): planWorldEvents() then lays
 * the scale composition as that line's one layout-seat event, keeps Q2/Q4 protected round it, and rejects it with its
 * reason when it collides. Phase 2 wires this; nothing calls it in phase 1 but the tests and the dry run.
 */
export function withScaleSeats(input: WorldEventInput, seats: LayoutSeatCandidate[]): WorldEventInput {
  const by = new Map(seats.map((s) => [s.lineId, s]));
  // (a world with an approved seat list takes the scale seat as one of them: it is that seat, enlarged on its own carrier)
  const caps = input.caps.seats.length ? { ...input.caps, seats: [...new Set([...input.caps.seats, ...seats.map((s) => s.seat.id)])] } : input.caps;
  return { ...input, caps, lines: input.lines.map((l) => { const s = by.get(l.id); return s ? { ...l, seats: [s.seat, ...l.seats.filter((x) => x.id !== s.seat.id)], seat: s.seat.id } : l; }) };
}
