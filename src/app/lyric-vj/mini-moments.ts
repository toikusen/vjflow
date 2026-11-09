// Q5 phase 2 (docs/research/2026-11-09-q3q5-codex.md §5–6, 2026-11-10): the moments the song's scheduler approved, turned
// into what the renderer draws. A big one is today's signature moment (render/signature.ts takes the line over); a mini
// keeps the normal lyric renderer and is drawn round it (render/mini-moment.ts), in its declared region, never over a
// line's words. Each traces back to the reading's candidate (meaningRef, evidenceCueId, word). Pure.
import type { MomentFamily } from './world-shared';
import type { FrameBox, PolicyDecision } from './world-events';
import { checkMoments, type MomentAsk, type SignatureMoment } from './signature-moments';
import type { MomentPlan } from './moment-policy';
import { carrierBox } from './render/hold-room';
import { OBJECT_MARGIN } from './render/world-objects';
import { SAFE_X, SAFE_Y, SET_SPECS } from './render/world-sets';
import type { SongTimeline } from './timeline';

/** A mini moment as drawn: its action at the sung word, in its region, off every line's box. */
export interface MiniMoment {
  id: string;
  meaningRef: string;
  /** The line whose word carries it, and the reading's own evidence. */
  evidenceCueId: string;
  cueIds: string[];
  form: string;
  variant: string;
  word: string;
  why: string;
  family: MomentFamily;
  /** The semantic action (the word's sung time, never moved), its preparation, its main action, its whole window. */
  at: number;
  prepareAt: number;
  mainSec: number;
  from: number;
  to: number;
  /** Its own area on the frame, fractions y down (15–30 % of the frame). */
  region: FrameBox;
  /** The words it never draws over: every line's box up in its window, padded (none for type-only: it moves the words). */
  avoid: FrameBox[];
}

/** A type-only mini as the line's own words move (render/world-layout.ts): the evidence word as code points of the drawn text. */
export interface LineMoment { id: string; form: string; variant: string; span: { from: number; to: number }; at: number; mainSec: number; to: number; /** The most its words move, ems: the set's own room (render/line-moment liftRoom). */ lift?: number }

/** Each line's boxes on the frame (every set it may stand in while up: its own, a change of set inside it) and when it is up. */
export interface ShownBox { id: string; show: number; end: number; /** Its exit: the next line's show (the engine takes it off for the next), never before its own end. */ until: number; boxes: FrameBox[] }

/** A set's carrier round words laid in `box` (a card, a sign: render/hold-room.ts carrierBox, its shadow margin added), or undefined. */
function carrierOf(set: string, box: FrameBox): FrameBox | undefined {
  const spec = SET_SPECS[set];
  if (!spec?.object) return undefined;
  const [w, h] = [(box.x1 - box.x0) * 1920, (box.y1 - box.y0) * 1080];
  const [cx, cy] = [((box.x0 + box.x1) / 2) * 1920 - 960, 540 - ((box.y0 + box.y1) / 2) * 1080];
  const c = carrierBox(spec, { cx, cy, w, h });
  if (!c) return undefined;
  const [x, y, hw, hh] = [960 + cx + c.x, 540 - (cy + c.y), c.ow / 2 + OBJECT_MARGIN, c.oh / 2 + OBJECT_MARGIN];
  return { x0: (x - hw) / 1920, y0: (y - hh) / 1080, x1: (x + hw) / 1920, y1: (y + hh) / 1080 };
}

/** The scheduler's lines as the boxes a mini keeps off: every seat's laid box and the carrier the words stand on. */
export const shownBoxes = (lines: { id: string; show: number; end: number; seats: { id: string; box?: FrameBox }[] }[]): ShownBox[] =>
  lines.map((l, i) => ({ id: l.id, show: l.show, end: l.end, until: Math.max(l.end, lines[i + 1]?.show ?? l.end + LINGER), boxes: l.seats.flatMap((x) => (x.box ? [x.box, ...(carrierOf(x.id, x.box) ? [carrierOf(x.id, x.box)!] : [])] : [])) }));

/**
 * Room kept round a line's planned box, a share of the frame (≈ 58 px across, 32 px down): the plan's box is laid on the
 * rough measure, and the real glyphs' advances and a hold's small moves (world-beats crack 9 px, light-sweep 2 %) reach
 * past it by less than this (seat-geometry roughMeasure vs shapedMeasure differ by under one reading-size glyph).
 */
export const AVOID_PAD = 0.03;
/** The last line's linger past its end when no line follows (render/show-time AFTER_LAST_SUNG and an exit's length, rounded up). */
const LINGER = 1;
/** The safe area, frame fractions (render/world-sets SAFE_X / SAFE_Y). */
const SAFE = { x0: SAFE_X / 1920, y0: SAFE_Y / 1080, x1: 1 - SAFE_X / 1920, y1: 1 - SAFE_Y / 1080 };

/** Every line's padded box up during [from, to] (its show to half a second past its end). */
export const avoidOf = (lines: ShownBox[], from: number, to: number): FrameBox[] =>
  lines.filter((l) => l.show < to && l.until > from).flatMap((l) => l.boxes).map((b) => ({ x0: b.x0 - AVOID_PAD, y0: b.y0 - AVOID_PAD, x1: b.x1 + AVOID_PAD, y1: b.y1 + AVOID_PAD }));

/**
 * A mini's own region: the largest band of the safe area beside the words up at the time (above, below, left or right of
 * all their boxes together), trimmed to `share[1]` of the frame on the side next to the words; undefined when no band
 * reaches `share[0]` (Codex §5: no mapping, no moment). Nothing in it meets a line's box.
 */
export function miniRegion(avoid: FrameBox[], share: [number, number]): FrameBox | undefined {
  if (!avoid.length) return undefined;
  const u = avoid.reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }));
  const w = SAFE.x1 - SAFE.x0;
  const h = SAFE.y1 - SAFE.y0;
  const bands = [
    { side: 'above', b: { x0: SAFE.x0, y0: SAFE.y0, x1: SAFE.x1, y1: Math.min(SAFE.y1, u.y0) } },
    { side: 'below', b: { x0: SAFE.x0, y0: Math.max(SAFE.y0, u.y1), x1: SAFE.x1, y1: SAFE.y1 } },
    { side: 'left', b: { x0: SAFE.x0, y0: SAFE.y0, x1: Math.min(SAFE.x1, u.x0), y1: SAFE.y1 } },
    { side: 'right', b: { x0: Math.max(SAFE.x0, u.x1), y0: SAFE.y0, x1: SAFE.x1, y1: SAFE.y1 } },
  ].map((x) => ({ ...x, area: Math.max(0, x.b.x1 - x.b.x0) * Math.max(0, x.b.y1 - x.b.y0) })).sort((a, b) => b.area - a.area);
  const best = bands[0];
  if (best.area < share[0] - 1e-9) return undefined;
  const b = { ...best.b };
  // (trimmed on the side away from the words: the region stays next to the line it is about)
  if (best.area > share[1]) {
    if (best.side === 'above') b.y0 = b.y1 - share[1] / w;
    else if (best.side === 'below') b.y1 = b.y0 + share[1] / w;
    else if (best.side === 'left') b.x0 = b.x1 - share[1] / h;
    else b.x1 = b.x0 + share[1] / h;
  }
  // (rounded inward: a region on a line's edge never reaches past it)
  const [up, down] = [(x: number) => Math.ceil(x * 1000 + 1e-6) / 1000, (x: number) => Math.floor(x * 1000 - 1e-6) / 1000];
  return { x0: up(b.x0), y0: up(b.y0), x1: down(b.x1), y1: down(b.y1) };
}

/**
 * The approved Q5 decisions as drawn moments: a big one through the same guards as the paid director's (checkMoments on
 * that one ask alone, so no order or cap of its own drops it), a mini as a MiniMoment. A candidate the guards refuse here is
 * returned in `refused` with its reason (never silently counted).
 */
export function approvedMoments(decisions: PolicyDecision[], plan: MomentPlan, song: SongTimeline, lines: ShownBox[], regions: Map<string, FrameBox> = new Map()): { big: SignatureMoment[]; mini: MiniMoment[]; refused: { id: string; why: string }[] } {
  const big: SignatureMoment[] = [];
  const mini: MiniMoment[] = [];
  const refused: { id: string; why: string }[] = [];
  for (const d of decisions.filter((x) => x.source === 'Q5' && x.approved)) {
    const c = plan.candidates.find((x) => x.meaningRef === d.meaningRef);
    const ask = c?.ask;
    if (!c || !ask) { refused.push({ id: d.id, why: 'no candidate behind the decision' }); continue; }
    if (d.variant === 'big') {
      const sungOf = (id: string) => { const x = song.cues.find((q) => q.id === id); return x?.charStarts?.length ? { times: x.charStarts, source: 'line' } : undefined; };
      const { kept, dropped } = checkMoments([ask as MomentAsk], song.cues, sungOf);
      // (the drawn moment carries its trace: the reading's candidate and its evidence line)
      if (kept[0]) big.push({ ...kept[0], meaningRef: c.meaningRef, evidenceCueId: ask.evidenceCueId ?? ask.cues.at(-1)! });
      else refused.push({ id: d.id, why: `the big moment's guards: ${dropped[0]?.reason ?? 'refused'}` });
      continue;
    }
    // (a type-only mini acts in its line's own seat on its own words: nothing to keep off; a page mini beside them)
    const avoid = c.family === 'type-only' ? [] : avoidOf(lines, c.window!.from, c.window!.to);
    const region = regions.get(d.id) ?? (c.family === 'type-only' ? undefined : miniRegion(avoid, [0.15, 0.3]));
    if (!region) { refused.push({ id: d.id, why: 'no free region of 15 % of the frame beside the words' }); continue; }
    mini.push({
      id: d.id, meaningRef: c.meaningRef, evidenceCueId: ask.cues.at(-1)!, cueIds: [...ask.cues], form: ask.form, variant: ask.variant, word: ask.word.trim(), why: ask.why ?? '',
      family: c.family as MomentFamily, at: c.at!, prepareAt: c.prepareAt!, mainSec: c.mainSec!, from: c.window!.from, to: c.window!.to, region, avoid,
    });
  }
  return { big, mini, refused };
}
