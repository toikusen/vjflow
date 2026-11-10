// The song's one composition schedule (Q1, docs/research/2026-11-09-q1-codex.md §B): which lines keep their seat, which
// change it, where a page hands over, and the one switch a line may take inside itself at a word it really sings. Q2 holds
// and Q4 linked handoffs come in decided and are never moved; everything this adds is spaced round them. Pure and seeded:
// no DOM, no clock, the same input gives the same plan. Phase 2 (docs/research/2026-11-09-q1-phase2.md): free-plan.ts runs
// it once a song on the composer's plan and the renderer draws only what it approves (world-events-apply.ts).
import { EXIT_LEAD, LINK_CLEAR, LINK_PREPARE } from './render/world-handoff';
import { anchorMove, boxesMeet, centreMove, SEEN, type FracBox } from './render/seat-geometry';
import type { MaterialMove } from './world-shared';

export type CompositionFamily = 'layout-seat' | 'page-handoff' | 'carrier-swap' | 'camera-reframe' | 'ground-role' | 'prop-beat';
export type WorldEventKind = CompositionFamily | 'keep';
export type Mood = 'quiet' | 'build' | 'peak';

/** A box in frame fractions, y down (render/seat-geometry.ts FracBox: one type). */
export type FrameBox = FracBox;

/** A place a line's words can be set: its box on the frame and what carries it (a card, a panel, the page itself). */
export interface SeatCandidate {
  id: string;
  /** The words' box as laid (render/seat-geometry.ts) for `text`, else the set's nominal box. */
  box?: FrameBox;
  carrierId?: string;
  vertical?: boolean;
  /** Laid into a page of its own: changing between two such seats is a change of page, whose light is the page's own ground cut. */
  paged?: boolean;
  /** The type size the words are laid at, px at 1080p. */
  size?: number;
  /** The words the box was laid for: two seats of the same words are compared by their boxes' centres and sizes. */
  text?: string;
  /** The page graphics a seat the scheduler adds must keep its words off (a same-page seat, world-shared pageSeats). */
  protect?: FrameBox[];
  /** The page the seat is laid on (two seats on one page may differ in what carries the words: a carrier swap). */
  page?: string;
}

/** A word or phrase as it is really sung; absent on a line whose timing is not trusted per character. */
export interface SungWord { text: string; from: number; to: number }

export interface WorldEventLine {
  id: string;
  /** When the words come up (ahead of the voice), s. */
  show: number;
  start: number;
  end: number;
  words?: SungWord[];
  seats: SeatCandidate[];
  /** The composer's own seat for the line; the first candidate when unset. */
  seat?: string;
  /**
   * Why the line's seat is the composer's and no other (its hold was planned on that set, it shares its shot, it carries a
   * blown-up word, its world has no capability): its boundary is a switch exactly when that seat differs, never re-decided.
   */
  pinned?: string;
  /**
   * Where a switch inside the line may fall (a hold's own room kept, Q2) and the seats it may take; anywhere, any seat when
   * unset. `absorb`: the line's ink-only hold may merge with a declared material move into one composite event (phase 4a),
   * onto these seats only (the ones where the words keep their geometry and the hold's ink reads on every ground).
   */
  inLine?: { spans: [number, number][]; seats?: string[]; absorb?: AbsorbRoom };
  /** Changes of seat inside the line that come decided (an older world's own repose): kept as given, counted once. */
  given?: { at: number; seat: string; reason: string; /** Its time is the composer's proportional guess, not a sung word (reposeOf's fallback). */ unreliable?: boolean }[];
  /**
   * When the line's entrance has landed (its show plus the longest its entrance can take): the still reading before a
   * switch inside it is counted from here, never from its start while the words may still be coming in.
   */
  settled?: number;
  /** The line shares its shot (and its page) with another: no page move of its own at its boundary. */
  sharesShot?: boolean;
  /**
   * Phase 4c (joint arbitration, `WorldEventInput.joint`): every Q2 hold the line could take, each on the seat it was
   * measured on, with the world's rank of its kind and its reading slack. Candidates, not constraints: the scheduler
   * commits at most one primary action a line (a hold, a composition, a declared composite, or keep).
   */
  holdCands?: JointHold[];
}

/** A Q2 hold the composer found for a line on one seat (phase 4c): a candidate the joint selector may commit. */
export interface JointHold { seat: string; hold: HoldEvent; rank: number; slack: number }
/** What one line committed under the joint contract (phase 4c), and why a hold it could have taken was not. */
export type LineOutcomeKind = 'hold' | 'composition' | 'composite' | 'keep';
export type LineOutcomeReason = 'supersededByComposition' | 'noSafeCandidate' | 'designedQuiet' | 'landingFailed' | 'cameraDropped';
export interface LineOutcome {
  lineId: string;
  outcome: LineOutcomeKind;
  reason?: LineOutcomeReason;
  /** Hold candidates the line had (all seats), and whether one was legal on the seat the line would keep. */
  holdCands: number;
  legalHold: boolean;
  /** The committed action: an event id, or the hold's id. */
  primary?: string;
  /** More than one action on the line (never approved: one visible composition a line, Codex 2026-11-10 pairs B), for the record. */
  actions?: number;
  mood: Mood;
  /** The words of a contract failure or another note (landing failed: what the final check named). */
  why?: string;
  /** Hold candidates refused by the pairs C rules (no kind of the sung line before, SWAP_CAP a section), for the record. */
  holdRejects?: HoldRefusal[];
}

/** At most this many ink-swaps a music section, counted over the whole song timeline (Codex 2026-11-10 pairs C: a cap, not a quota). */
export const SWAP_CAP = 2;
/** The music section a time falls in: the last that starts by it (0 when the song has none: one cap for the whole song). */
export const sectionAt = (sections: { start: number }[], t: number) => Math.max(0, sections.reduce((k, x, i) => (x.start <= t + 1e-6 ? i : k), -1));
/** A hold candidate the selector refused (pairs C), for the record: the kind of the sung line before, or its section's swaps spent. */
export interface HoldRefusal { kind: string; reason: 'repeat-kind' | 'section-cap' }

/** Q2's contract: a held line's one event, its whole window. */
export interface HoldEvent { lineId: string; at: number; from: number; to: number; kind: string }
/** A hold's id as the plan names it everywhere (merged, absorbed, folded). */
export const holdIdOf = (h: Pick<HoldEvent, 'kind' | 'lineId'>) => `hold:${h.kind}@${h.lineId}`;
/**
 * The Q2 hold kinds that may merge with a material move on the same line (Codex 2026-11-10 §3 (b), first whitelist): only
 * those that change ink alone, keep their `at/sec/span` and their settled ink, and touch no geometry. Every other kind
 * (line-grow, carrier-settle, panel-open, plate-spread, the pulses, copies of the words) keeps pinning its line.
 */
export const ABSORBABLE_HOLDS: ReadonlySet<string> = new Set(['ink-swap', 'line-ink-settle']);
/** What a line offers for absorption: its hold (with an ink-swap's phrase), the seats that keep the words and their ground, and the ink the hold settles into on each. */
export interface AbsorbRoom { holdId: string; kind: string; seats: string[]; inks: Record<string, string>; span?: { from: number; to: number } }
/**
 * An ink-only Q2 hold merged with a material move on its line into one composite event (phase 4a): the hold's original
 * window and settled ink are kept as planned; the event occupies the union of both windows; the material is the switch.
 */
export interface AbsorbedHold { holdId: string; kind: string; hold: { at: number; from: number; to: number; span?: { from: number; to: number } }; materialId: string; ink: string; occupancy: { from: number; to: number }; reason: string }
/** Q4's contract: a linked page move into `lineId`; `seam` is when the words switch, `dur` the whole move. */
export interface HandoffCandidate { lineId: string; kind: string; dir: number; seam: number; dur: number; /** Defaults to LINK_PREPARE. */ prepare?: number; /** Defaults to true: a page change swaps a large area. */ changesLight?: boolean }
/** A prop accent the song's reading asked for (never a keyword): the only way a prop-beat is scheduled. */
export interface PropAccent { lineId: string; at: number; propId: string; reason: string }
/** The world camera's move into a part the composer laid (world-cam.ts): a reframe of the line it opens, kept as given. */
export interface CameraMove { lineId: string; at: number; sec: number; kind: string }

export type EventScope = 'section' | 'line' | 'in-line';
/**
 * Where each family may fall unless the world says otherwise: a reseat only at a line or a part, never inside a line being
 * sung (Codex 2026-11-10 pairs B: its anchor, type size, breaks and block never change while it is read), a camera only
 * into a part (no camera beats of its own, Codex cap ruling).
 */
export const DEFAULT_ALLOWED_AT: Record<CompositionFamily, EventScope[]> = { 'layout-seat': ['section', 'line'], 'page-handoff': ['section', 'line'], 'carrier-swap': ['section', 'line'], 'camera-reframe': ['section'], 'ground-role': ['section'], 'prop-beat': ['in-line'] };

/**
 * What a world allows of the six families (Codex C's `compositions` declaration, held here until phase 2 moves it into
 * world-shared.ts). A family not listed is never scheduled.
 */
export interface WorldCompositionCaps {
  worldId: string;
  kinds: CompositionFamily[];
  /** The approved seats; every candidate when empty. */
  seats: string[];
  /** What the lyric is read on: the page itself, a plate under it, an object it rides, or the bare ground. */
  carrierRole: 'page' | 'plate' | 'object' | 'ground';
  /** Regions no seat may enter (the page's own large graphics). */
  protectedRegion?: FrameBox[];
  /** The world's own name for each family (chalkboard board-region, notebook page-turn), for the reason text. */
  moves?: Partial<Record<CompositionFamily, string>>;
  /** Each family's action time, s; a reseat is a cut (0) unless the world says otherwise. */
  duration?: Partial<Record<CompositionFamily, number>>;
  /** Whether the caps are the world's declaration or derived from its sets for a dry run. */
  source?: 'declared' | 'declared-off' | 'derived';
  /** Where each family may fall (DEFAULT_ALLOWED_AT for the rest). */
  allowedAt?: Partial<Record<CompositionFamily, EventScope[]>>;
  /** Whether the scheduler may lay a page handoff of its own (a world whose renderer draws one); else only Q4's count. */
  ownPages?: boolean;
  /** The world's own material moves (world-shared.ts materials, phase 3b): laid only as approved events. */
  materials?: Record<string, MaterialMove>;
}

export interface WorldEventInput {
  lines: WorldEventLine[];
  beats: number[];
  downbeats?: number[];
  sections: { start: number; energy: number }[];
  caps: WorldCompositionCaps;
  holds?: HoldEvent[];
  handoffs?: HandoffCandidate[];
  accents?: PropAccent[];
  /** Changes of the whole frame's light the scheduler does not own (today's ground cuts): kept, and kept LIGHT_GAP from. */
  lights?: { at: number; what: string }[];
  /** The world camera's moves into parts the composer laid: kept as given. */
  cams?: CameraMove[];
  /**
   * Candidates other policies propose (Q3 scale contrast, Q5 moments), each with its own window, arbitrated after Q2/Q4
   * are protected and Q1 is laid, by the same clocks (2026-11-10 Q3/Q5 phase 2: arbitratePolicies). Absent: nothing is
   * read and the plan is exactly the plan without them.
   */
  candidates?: PolicyCandidate[];
  /**
   * Phase 4c (Codex 2026-11-10 r2 §1): Q1 seat changes and Q2 holds arbitrated together, one primary action a line. The
   * lines' `holdCands` are candidates (`holds` is empty: no hold comes in decided); only the committed holds come out in
   * the plan's `holds`, each line's outcome in `outcomes`. Unset: the hold comes in decided and pins its line, as before.
   */
  joint?: boolean;
  seed: number;
}

/**
 * A switch another policy proposes to the scheduler: where, how long, onto which seat, and why (Q3 a scale composition
 * of a line, a `layout-seat` at its show held while it is sung; Q5 a signature moment over its whole occupied window).
 * Candidates of one `group` are tried by `rank` and at most one of a group is approved; a refused one passes to the next,
 * never moved in time (Codex §6). `budget` caps what a source approves across its groups.
 */
export interface PolicyCandidate {
  source: 'Q3' | 'Q5' | (string & {});
  lineId: string;
  kind: CompositionFamily | 'signature-moment';
  at: number;
  from: number;
  to: number;
  seatAfter?: string;
  changesLight?: boolean;
  reason: string;
  /** The candidate's own id (scale:<line>, moment:<line>:<form>/<variant>): its event's id unless it shares a Q1 event. */
  id?: string;
  /** One approval a group (a sung section's scale contrast, one reading's moment in its variants), tried by rank. */
  group?: string;
  rank?: number;
  /** The seat the line takes (Q3): its box keeps off the world's protected regions. */
  seat?: SeatCandidate;
  /** Q2 hold kinds that may still run, in their own window, on the line this composition takes (glyph-level ones). */
  holdsOk?: string[];
  /** Q2 hold kinds this candidate is itself (a scale composition is the line's change of size: its line-grow folds into it, one event, no ratio multiplied). */
  folds?: string[];
  /** What the source approves at most across its groups: so many a song, so far apart, one a section. */
  budget?: { key: string; max: number; apart: number; section?: string };
  /** The frame the candidate occupies over [from, to]. */
  protectedRegion?: FrameBox;
  /** Its trace to the reading (Q5): the moment it is, the lines, the variant, its score. */
  meaningRef?: string;
  cueIds?: string[];
  variant?: string;
  score?: number;
}
/** What the scheduler made of one policy candidate: approved into an event (Q3) or a protected window (Q5), or why not. */
export interface PolicyDecision { id: string; source: string; group?: string; lineId: string; rank?: number; at: number; from: number; to: number; approved: boolean; eventId?: string; shared?: boolean; reason: string; meaningRef?: string; variant?: string }

export interface WorldEvent {
  id: string;
  lineIds: string[];
  kind: WorldEventKind;
  /** The composition's switch point. */
  at: number;
  /** The time the action occupies. */
  from: number;
  to: number;
  seatBefore: string;
  seatAfter: string;
  carrierId?: string;
  scope: EventScope;
  changesLight: boolean;
  reason: string;
  /** The world's own name for the move. */
  move?: string;
  /** Q2 holds folded into this event: one action, counted once. */
  merged?: string[];
  /** The world camera's move into the part that this switch rides (one switch, counted once). */
  camera?: string;
  /** Taken as given (a Q4 handoff): never moved by the scheduler. */
  fixed?: boolean;
  /** The world's material move that realises the switch (world-shared materials), with its curve: never a plain cut. */
  material?: string;
  curve?: string;
  /** A given switch whose time is the composer's proportional guess, not a sung word (counted, never trusted as a word break). */
  unreliableBoundary?: boolean;
  /** A move that keeps the words and their seat (the receipt's feed): a hold-level beat, never a plan cut (countCuts). */
  holdLevel?: boolean;
  /** Policy candidates this switch carries (a Q3 scale composition on the line's own switch: one event, counted once). */
  policy?: string[];
  /** The line's ink-only hold this material move merged with (phase 4a): one composite event, the hold unmoved. */
  absorbed?: AbsorbedHold;
}

export interface RejectedCandidate { candidate: { lineId: string; kind: CompositionFamily; at: number; seatAfter?: string }; reason: string }

/** A protected input (Q2 or Q4) that breaks the spacing rules on its own: kept as given, reported for the measurement. */
export interface InputWarning { inputs: string[]; reason: string }

/** A Q2 hold a scheduled world moved off a Q4 handoff it partly overlapped: to the nearest legal beat, or dropped (`to` null). */
export interface HoldMove { lineId: string; kind: string; from: number; to: number | null; reason: string }
/** A world camera move a scheduled world dropped: it collided with a switch the song keeps (a Q4 handoff, a composed seat, a hold). */
export interface CamDrop { lineId: string; kind: string; at: number; reason: string }
export interface WorldEventPlan { events: WorldEvent[]; holds: HoldEvent[]; rejected: RejectedCandidate[]; warnings: InputWarning[]; holdMoves?: HoldMove[]; camDrops?: CamDrop[]; /** Q3/Q5 candidates and what became of each (only when the input had any). */ policy?: PolicyDecision[]; /** Each line's committed action (phase 4c, joint only). */ outcomes?: LineOutcome[] }
/** What a treatment carries of the plan (treatment.ts worldEvents): the events, the holds standing on their own, the input warnings and how many candidates were refused. */
export interface WorldEventTable { events: WorldEvent[]; holds: HoldEvent[]; warnings: InputWarning[]; rejected: number; source: WorldCompositionCaps['source']; holdMoves?: HoldMove[]; camDrops?: CamDrop[]; /** Q3/Q5 candidates and what became of each (only when their wiring is on). */ policy?: PolicyDecision[]; /** Each line's committed action (phase 4c, joint only). */ outcomes?: LineOutcome[] }

/** Two changes of the whole frame's light never closer than this, anywhere in the song (no more than three flashes a second). */
export const LIGHT_GAP = 0.55;
/** Two composition switch points never closer than this. */
export const SEAM_GAP = 0.65;
/** From one main action's end to the next's start, at least this. */
export const ACTION_GAP = 0.1;
/** A line moved inside itself is read standing still this long before the move and after it. */
export const READ_STABLE = 0.35;
/** A line shorter than this keeps its seat: its words switch on time, nothing else moves. */
export const SHORT_LINE = 0.75;
/** A word break this near a beat lands on it. */
export const BEAT_SNAP = 0.12;
/** A full page handoff needs the line before up at least this long (world-handoff.ts pickWorldMoves). */
const HANDOFF_UP = LINK_PREPARE + 0.5;

/**
 * How each part of the song spends its switches (rule 11: quiet, build, peak): how often a line boundary reseats, how long
 * a line must be for a switch inside it, and where a full page may hand over. Proposal values (Codex D). Phase 3b removed
 * the hard `run` cap (1 / 2 / 3 switches in a row, then a forced keep): no design rule asked for it (Codex phase-2 review
 * §1: `keep` is normal, not every line a full exit and entrance, never "stop after n"). What stands in its place is a
 * rhythm preference, STREAK_EASE: every switch in a row past the first (the scheduler's own, a composed seat, a Q4
 * handoff, a page move: all count, as they are all seen) lowers the chance of the next optional switch the scheduler adds
 * itself, never to zero, never a quota; the composer's own change of set is not optional and stands.
 */
export const MOOD_PACE: Record<Mood, { reseat: number; inLine: number; pages: ('section' | 'carrier')[] }> = {
  quiet: { reseat: 0.3, inLine: 3.2, pages: ['section'] },
  build: { reseat: 0.55, inLine: 1.8, pages: ['section', 'carrier'] },
  peak: { reseat: 0.75, inLine: 1.3, pages: ['section', 'carrier'] },
};
/**
 * Each switch in a row eases the next optional reseat's chance by STREAK_EASE, down to STREAK_FLOOR of the part's rate.
 * Provisional preference values (phase 3b), not derived from the section's energy and not measured on video: the part's
 * energy already sets the rate (MOOD_PACE); these only keep a long run from reading as every line switching.
 */
export const STREAK_EASE = 0.2;
export const STREAK_FLOOR = 0.4;
/** The share of the part's rate left after `streak` switches in a row (the first switch eases nothing). */
export const streakEase = (streak: number) => Math.max(STREAK_FLOOR, 1 - STREAK_EASE * Math.max(0, streak - 1));
/** The part's optional reseat rate after `streak` switches in a row (a preference, not a cap). */
export const reseatRate = (mood: Mood, streak: number) => MOOD_PACE[mood].reseat * streakEase(streak);

const LIGHT_KINDS = new Set<WorldEventKind>(['page-handoff', 'carrier-swap', 'ground-role']);
// (no layout-seat: a line being sung never changes seat, Codex 2026-11-10 pairs B; a carrier swap keeps the words where they are)
const IN_LINE_ORDER: CompositionFamily[] = ['carrier-swap', 'camera-reframe', 'ground-role'];
const DEFAULT_SEC: Record<CompositionFamily, number> = { 'layout-seat': 0, 'page-handoff': LINK_PREPARE + LINK_CLEAR, 'carrier-swap': 0.3, 'camera-reframe': 0.42, 'ground-role': 0.3, 'prop-beat': 0.4 };

const unit = (s: string) => ([...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261) >>> 0) / 2 ** 32;
const r3 = (x: number) => +x.toFixed(3);

/**
 * Whether two seats are really two compositions, by where the words really stand (Q1 phase 3a): another carrier,
 * another direction, a box that moved 8 % of the frame, or type a size apart. The same words in two seats (a switch
 * inside a line) are compared by their boxes' centres and a quarter of type size; two lines by the least move over the
 * box's anchors (left, centre, right; top, middle, bottom), so a longer line in the same seat is no move, and only type
 * nearly twice the size counts (the size follows the line's length: the frame check's own threshold, SEEN.scale).
 * The move maths are the frame check's (render/seat-geometry.ts anchorMove, centreMove). Seats without boxes differ by id.
 */
export function seatsDiffer(a: SeatCandidate | undefined, b: SeatCandidate | undefined): boolean {
  if (!a || !b) return a?.id !== b?.id;
  if (a.id === b.id) return false;
  if ((a.carrierId ?? '') !== (b.carrierId ?? '') || !!a.vertical !== !!b.vertical) return true;
  if (!a.box || !b.box) return a.id !== b.id;
  const same = a.text === undefined || b.text === undefined || a.text === b.text;
  const [p, q] = [a.box, b.box];
  const move = same ? centreMove(p, q) : anchorMove(p, q);
  const area = (x: FrameBox) => Math.max(1e-3, (x.x1 - x.x0) * (x.y1 - x.y0));
  const ratio = a.size && b.size ? Math.max(a.size, b.size) / Math.min(a.size, b.size) : same ? Math.max(area(p), area(q)) / Math.min(area(p), area(q)) : 1;
  return move >= SEAT_MOVE || ratio >= (same ? 1.25 : SEEN.scale);
}
/** The least move of the words that is another seat, a share of the frame. */
export const SEAT_MOVE = 0.08;
/** One pixel of the 1920 × 1080 frame, as a share of its width and of its height: how far two boxes of the same words may differ. */
export const PX_X = 1 / 1920;
export const PX_Y = 1 / 1080;
/** Two seats that lay the words in the very same box (to a pixel of the frame) at the same type size: only what carries them may differ. */
export function sameWords(a: SeatCandidate | undefined, b: SeatCandidate | undefined): boolean {
  if (!a?.box || !b?.box || (a.size ?? 0) !== (b.size ?? 0) || !!a.vertical !== !!b.vertical) return false;
  const [p, q] = [a.box, b.box];
  return Math.abs(p.x0 - q.x0) <= PX_X && Math.abs(p.x1 - q.x1) <= PX_X && Math.abs(p.y0 - q.y0) <= PX_Y && Math.abs(p.y1 - q.y1) <= PX_Y;
}

/** Each section's mood from its energy, both as heard and as ranked within the song (a calm song still has its peak). */
export function moodsOf(sections: { start: number; energy: number }[]): Mood[] {
  const sorted = [...sections].map((s) => s.energy).sort((a, b) => a - b);
  return sections.map((s) => {
    const rank = sorted.length > 1 ? sorted.indexOf(s.energy) / (sorted.length - 1) : 0.5;
    const heard = Math.max(0, Math.min(1, (s.energy - 0.3) / 0.5));
    const score = 0.5 * rank + 0.5 * heard;
    return score < 0.35 ? 'quiet' : score >= 0.65 ? 'peak' : 'build';
  });
}

interface Action { at: number; from: number; to: number; light: boolean; composition: boolean; what: string; /** A light change only: no time of its own. */ lightOnly?: boolean; /** One line's way in: its seat, its handoff and its camera are one switch, never a clash with each other. */ owner?: string; /** The Q2 hold this action is (or carries, a composite): never a clash with its own absorption. */ hold?: string }

/** Why `c` cannot stand among `taken`, or undefined. */
function conflict(c: Action, taken: Action[]): string | undefined {
  for (const a of taken) {
    if (a.owner && a.owner === c.owner) continue;
    // (a switch on the very frame the ground changes is that one change of light, not a second)
    if (a.lightOnly) { if (c.light && Math.abs(c.at - a.at) >= 0.05 && Math.abs(c.at - a.at) < LIGHT_GAP) return `light change within ${LIGHT_GAP}s of ${a.what}`; continue; }
    if (c.from < a.to + ACTION_GAP && a.from < c.to + ACTION_GAP) return `overlaps ${a.what} (${ACTION_GAP}s between actions)`;
    if (c.composition && a.composition && Math.abs(c.at - a.at) < SEAM_GAP) return `seam within ${SEAM_GAP}s of ${a.what}`;
    if (c.light && a.light && Math.abs(c.at - a.at) < LIGHT_GAP) return `light change within ${LIGHT_GAP}s of ${a.what}`;
  }
  return undefined;
}

/**
 * The song's composition events (Codex B): per line, keep or reseat; then a full page handoff where the song's energy and
 * its carriers ask for one (only a world that draws its own, `ownPages`; otherwise Q4's are the page handoffs); then at
 * most one switch inside the line, only at a word the line really sings, with READ_STABLE of still reading either side,
 * on the carrier it is read on. Light changes keep LIGHT_GAP across the whole song, switch points SEAM_GAP and ACTION_GAP
 * between actions; a Q4 handoff occupies its prepare and clear, a Q2 hold its whole window. Q2, Q4, the composer's
 * camera moves into parts, a pinned line's own seat and an older world's given reposes are protected: a candidate that
 * collides moves to another legal window or is dropped, with the reason in `rejected`. `keep` is a normal outcome (it
 * shows the line in the seat before, which must be one of its candidates), a hold that falls inside a handoff is folded
 * into it (one event), and page handoffs come from section starts and carrier ends by energy, never from a rotation of
 * families. A world with no family (capability off) gets no switch of the scheduler's own.
 */
export function planWorldEvents(input: WorldEventInput): WorldEventPlan {
  const { caps, seed } = input;
  const lines = [...input.lines].sort((a, b) => a.start - b.start);
  const allows = new Set(caps.kinds);
  const at = (k: CompositionFamily, scope: EventScope) => allows.has(k) && (caps.allowedAt?.[k] ?? DEFAULT_ALLOWED_AT[k]).includes(scope);
  const sec = (k: CompositionFamily) => caps.duration?.[k] ?? DEFAULT_SEC[k];
  const moods = moodsOf(input.sections);
  const sections = input.sections.map((s, i) => ({ ...s, mood: moods[i] })).sort((a, b) => a.start - b.start);
  const moodAt = (t: number) => [...sections].reverse().find((s) => s.start <= t + 1e-3)?.mood ?? sections[0]?.mood ?? 'build';
  const rejected: RejectedCandidate[] = [];
  const reject = (lineId: string, kind: CompositionFamily, at: number, reason: string, seatAfter?: string) => void rejected.push({ candidate: { lineId, kind, at: r3(at), ...(seatAfter ? { seatAfter } : {}) }, reason });
  const events: WorldEvent[] = [];
  const taken: Action[] = [];
  const boundaryOf = (id: string) => `boundary:${id}`;
  // (phase 4c: holds are candidates; one primary action a line. A world with no capability has nothing to arbitrate.)
  const joint = !!input.joint && allows.size > 0;
  const notes = new Map<string, { cands: number; legal: boolean; mood: Mood; rejects?: HoldRefusal[] }>();

  const warnings: InputWarning[] = [];
  // Q4 first: given, never moved; a hold wholly inside one is the same action
  const handoffs = [...(input.handoffs ?? [])].sort((a, b) => a.seam - b.seam);
  const handoffWindow = (h: HandoffCandidate) => ({ from: h.seam - (h.prepare ?? LINK_PREPARE), to: h.seam - (h.prepare ?? LINK_PREPARE) + h.dur });
  const q4Name = (h: HandoffCandidate) => `Q4 ${h.kind} into ${h.lineId}@${h.seam}`;
  const merged = new Map<HandoffCandidate, string[]>();
  const holdMoves: HoldMove[] = [];
  const holds = (input.holds ?? []).map((h) => ({ ...h })).filter((h) => {
    const into = handoffs.find((x) => { const w = handoffWindow(x); return h.from >= w.from - 1e-6 && h.to <= w.to + 1e-6; });
    if (into) {
      merged.set(into, [...(merged.get(into) ?? []), `hold:${h.kind}@${h.lineId}`]);
      return false;
    }
    const clash = (x: { from: number; to: number }) => handoffs.find((q) => { const w = handoffWindow(q); return x.from < w.to + ACTION_GAP && w.from < x.to + ACTION_GAP; });
    const part = handoffs.find((x) => { const w = handoffWindow(x); return h.from < w.to && w.from < h.to; });
    if (!part) return true;
    // (a world with no capability: both stay protected, the clash is reported)
    if (!allows.size) {
      warnings.push({ inputs: [`Q2 ${h.kind} on ${h.lineId}@${h.from}–${h.to}`, q4Name(part)], reason: 'hold partly overlaps a handoff window' });
      return true;
    }
    // a world the scheduler takes over resolves it: the handoff is the page's own move and stays; the hold moves to the
    // nearest beat of its line where its whole window stands clear of every handoff (ACTION_GAP) and ends by the line's
    // end and ACTION_GAP before the next line shows (Codex cap ruling: 改選合法拍點或取消), else to the nearest time just
    // clear of a handoff, else into the handoff's window (one action), else it is dropped
    const k = lines.findIndex((l) => l.id === h.lineId);
    const line = lines[k];
    const sec = h.to - h.from;
    const endBy = line ? Math.min(line.end, (lines[k + 1]?.show ?? Infinity) - ACTION_GAP) : -Infinity;
    const legal = (b: number) => !!line && b >= line.start - 1e-6 && b + sec <= endBy + 1e-6 && !clash({ from: b, to: b + sec });
    const nearest = (xs: number[]) => xs.filter(legal).sort((a, b) => Math.abs(a - h.at) - Math.abs(b - h.at))[0];
    // (a beat first; else the nearest time the handoffs leave free, just past one or just before one)
    const edges = handoffs.flatMap((q) => { const w = handoffWindow(q); return [w.to + ACTION_GAP + 1e-3, w.from - ACTION_GAP - sec - 1e-3]; });
    const beat = line ? nearest([...input.beats, ...(input.downbeats ?? [])]) ?? nearest(edges) : undefined;
    // (no legal beat: the hold slides the least it must to lie wholly inside the handoff's window, where it is the same
    // action as the handoff (folded, counted once), when that still falls inside its line; else it is dropped)
    const w = handoffWindow(part);
    const inside = line && w.to - w.from >= sec ? Math.min(Math.max(h.from, w.from), w.to - sec) : undefined;
    const folds = beat === undefined && inside !== undefined && inside >= line!.start && inside + sec <= endBy;
    const at = beat ?? (folds ? inside : undefined);
    holdMoves.push({ lineId: h.lineId, kind: h.kind, from: h.at, to: at === undefined ? null : r3(at), reason: `partly overlapped ${q4Name(part)}${folds ? ': folded into it' : ''}` });
    if (at === undefined) return false;
    Object.assign(h, { at: r3(at), from: r3(at), to: r3(at + sec) });
    if (!folds) return true;
    merged.set(part, [...(merged.get(part) ?? []), `hold:${h.kind}@${h.lineId}`]);
    return false;
  });
  for (const [k, h] of handoffs.entries()) {
    const w = handoffWindow(h);
    const action: Action = { at: h.seam, ...w, light: h.changesLight ?? true, composition: true, what: q4Name(h), owner: boundaryOf(h.lineId) };
    const why = conflict(action, taken.filter((x, j) => j < k));
    if (why) warnings.push({ inputs: [q4Name(h)], reason: `Q4 inputs break spacing: ${why}` });
    taken.push(action);
  }
  for (const l of input.lights ?? []) taken.push({ at: l.at, from: l.at, to: l.at, light: true, composition: false, what: l.what, lightOnly: true });
  for (const h of holds) taken.push({ at: h.at, from: h.from, to: h.to, light: false, composition: false, what: `Q2 ${h.kind} on ${h.lineId}`, hold: holdIdOf(h) });
  // the composer's camera moves into parts, a pinned line's way in and given reposes: decided before anything optional.
  // A world the scheduler takes over sees its camera moves as inputs like the rest (phase 3b): one that collides with a
  // switch the song keeps (a Q4 handoff, a hold, a composed seat that really changes) is dropped, the camera stays still
  // into that part, and the drop is in the plan (`camDrops`); a world with no capability keeps them, reported as before
  const ownOf = (l: WorldEventLine) => l.seats.find((s) => s.id === l.seat) ?? l.seats[0];
  const pinnedSwitches: Action[] = lines.flatMap((l, i) => (i > 0 && l.pinned && seatsDiffer(ownOf(lines[i - 1]), ownOf(l)) ? [{ at: l.show, from: l.show, to: l.show, light: false, composition: true, what: `${l.id}'s composed seat`, owner: boundaryOf(l.id) }] : []));
  const camDrops: CamDrop[] = [];
  const cams = new Map((input.cams ?? []).filter((c) => {
    if (!allows.size) return true;
    const why = conflict({ at: c.at, from: c.at, to: c.at + c.sec, light: false, composition: true, what: '', owner: boundaryOf(c.lineId) }, [...taken, ...pinnedSwitches]);
    if (why) camDrops.push({ lineId: c.lineId, kind: c.kind, at: c.at, reason: why });
    return !why;
  }).map((c) => [c.lineId, c]));
  for (const c of cams.values()) taken.push({ at: c.at, from: c.at, to: c.at + c.sec, light: false, composition: true, what: `world camera ${c.kind} into ${c.lineId}`, owner: boundaryOf(c.lineId) });
  for (const [i, l] of lines.entries()) {
    if (i > 0 && l.pinned) taken.push({ at: l.show, from: l.show, to: l.show, light: false, composition: true, what: `${l.id}'s composed seat`, owner: boundaryOf(l.id) });
    for (const g of l.given ?? []) taken.push({ at: g.at, from: g.at, to: g.at, light: false, composition: true, what: `${l.id}'s given repose`, owner: `given:${l.id}@${g.at}` });
  }

  // (a seat's words keep off the world's protected regions and, for a seat the scheduler adds on a page, off that page's
  // graphics, by the box they are really laid in)
  const seatOk = (s: SeatCandidate) => (!caps.seats.length || caps.seats.includes(s.id)) && !(s.box && [...(caps.protectedRegion ?? []), ...(s.protect ?? [])].some((p) => boxesMeet(s.box!, p)));
  // (the world's material moves, by what they do to the seat; each laid only as an event of its own family)
  // (a withheld move is declared but never a candidate: world-shared MaterialMove.withheld)
  const materials = Object.entries(caps.materials ?? {}).filter(([, m]) => allows.has(m.family) && !m.withheld);
  const materialFor = (mode: MaterialMove['seat'], scope: EventScope) => materials.filter(([, m]) => m.seat === mode && m.at.includes(scope));
  const offLimits = (box: FrameBox | undefined, m: MaterialMove) => !!box && (m.protectedRegion ?? []).some((p) => boxesMeet(box, p));
  const isSectionStart = (i: number) => i > 0 && sections.some((s) => s.start > lines[i - 1].start + 1e-3 && lines[i].start >= s.start - 0.25);

  let seat: SeatCandidate | undefined;
  // (switches in a row, any of them: the rhythm preference reads it, nothing caps it)
  let run = 0;
  lines.forEach((line, i) => {
    const seats = line.seats.filter(seatOk);
    const own = line.seats.find((s) => s.id === line.seat) ?? line.seats[0];
    const mood = moodAt(line.start);
    const pace = MOOD_PACE[mood];
    const salt = (s: string) => unit(`${seed}:${line.id}:${s}`);
    const other = (from: SeatCandidate | undefined, pick: string) => {
      if (own && seatOk(own) && seatsDiffer(from, own)) return own;
      const pool = seats.filter((s) => seatsDiffer(from, s));
      return pool.length ? pool[Math.floor(salt(pick) * pool.length)] : undefined;
    };
    const push = (e: Omit<WorldEvent, 'id'>, action?: Action) => {
      // (ids unique: an event on two lines counted under its first, the line's own next one numbered past it, so no
      // two events share an id and countCuts never folds them into one)
      let n = events.filter((x) => x.lineIds[0] === line.id).length;
      while (events.some((x) => x.id === `${e.kind}:${line.id}:${n}`)) n++;
      events.push({ id: `${e.kind}:${line.id}:${n}`, ...e, at: r3(e.at), from: r3(e.from), to: r3(e.to) });
      if (action) taken.push(action);
    };
    const before = seat?.id ?? '';
    const sectionStart = isSectionStart(i);
    const scope: EventScope = sectionStart ? 'section' : 'line';
    const cam = cams.get(line.id);
    // (between two pages the light that changes is the page's own ground cut, already among `lights`: not a second one)
    const lightOf = (to: SeatCandidate) => (to.carrierId ?? '') !== (seat?.carrierId ?? '') && !(to.paged && seat?.paged);
    const atIn = events.length;
    if (joint) jointLine();
    else if (!own) {
      push({ lineIds: [line.id], kind: 'keep', at: line.show, from: line.show, to: line.show, seatBefore: before, seatAfter: before, scope: 'line', changesLight: false, reason: 'no seat for this line: it stays as composed' });
    } else if (!seat) {
      seat = own;
      push({ lineIds: [line.id], kind: 'keep', at: line.show, from: line.show, to: line.show, seatBefore: before, seatAfter: seat.id, scope: 'line', changesLight: false, reason: 'the first composition is not a cut' });
    } else {
      const q4 = handoffs.find((h) => h.lineId === line.id);
      if (q4) {
        // (a linked handoff runs between the composer's two pages: the line comes in on its own seat)
        const w = handoffWindow(q4);
        push({ lineIds: [lines[i - 1].id, line.id], kind: 'page-handoff', at: q4.seam, ...w, seatBefore: before, seatAfter: own.id, carrierId: own.carrierId, scope, changesLight: q4.changesLight ?? true, reason: `${q4.kind.startsWith('lyric-') ? 'lyric handoff' : 'Q4'} ${q4.kind} (protected)`, fixed: true, ...(merged.get(q4) ? { merged: merged.get(q4) } : {}), ...(caps.moves?.['page-handoff'] ? { move: caps.moves['page-handoff'] } : {}) });
        seat = own;
        run += 1;
      } else if (line.pinned) {
        if (seatsDiffer(seat, own)) {
          const action: Action = { at: line.show, from: line.show, to: line.show, light: lightOf(own), composition: true, what: `${line.id}'s composed seat`, owner: boundaryOf(line.id) };
          const why = conflict(action, taken);
          if (why) warnings.push({ inputs: [`${line.id} composed seat`], reason: `pinned seat breaks spacing: ${why}` });
          push({ lineIds: [line.id], kind: 'layout-seat', at: line.show, from: line.show, to: line.show, seatBefore: before, seatAfter: own.id, carrierId: own.carrierId, scope, changesLight: action.light, reason: `composed seat (${line.pinned})`, fixed: true });
          run += 1;
        } else if (!(allows.size && pageMove(own, scope, reseatRate(mood, run)))) {
          push({ lineIds: [line.id], kind: 'keep', at: line.show, from: line.show, to: line.show, seatBefore: before, seatAfter: own.id, scope, changesLight: false, reason: `composed seat is the same composition (${line.pinned})` });
          run = 0;
        }
        seat = own;
      } else boundary(line, i, sectionStart);
    }
    if (!joint) camRide();
    if (joint) { /* (decided in jointLine: one primary action) */ } else if (line.given?.length) {
      for (const g of line.given) {
        const to = line.seats.find((s) => s.id === g.seat) ?? { id: g.seat };
        if (!seatsDiffer(seat, to)) { seat = to; continue; }
        // (a world the scheduler takes over never draws a given repose: no reseat inside a line being sung, Codex
        // 2026-11-10 pairs B. Only a world with no capability, which the scheduler does not take, keeps its composer's
        // own as the record of what it draws, the opt-in itself lays none: free-plan stillLines)
        if (allows.size) { reject(line.id, 'layout-seat', g.at, 'given repose inside the line: no in-line layout-seat (pairs B)', to.id); continue; }
        push({ lineIds: [line.id], kind: 'layout-seat', at: g.at, from: g.at, to: g.at, seatBefore: seat?.id ?? '', seatAfter: to.id, carrierId: to.carrierId, scope: 'in-line', changesLight: lightOf(to), reason: g.reason, fixed: true, ...(g.unreliable ? { unreliableBoundary: true } : {}) });
        seat = to;
      }
    } else if (own && !entered()) inLine(line, mood);
    else if (own) rejectInLine(line);

    /** Whether the line came in by a visible composition (its seat, a page move, the camera into its part): its one. */
    function entered() { return events.slice(atIn).some((e) => e.kind !== 'keep'); }
    /** A switch inside a line that came in by a visible composition: refused, never a second one (pairs B). */
    function rejectInLine(l: WorldEventLine) {
      const kinds = IN_LINE_ORDER.filter((k) => at(k, 'in-line'));
      if (kinds.length && l.end - l.start >= MOOD_PACE[mood].inLine) reject(l.id, kinds[0], (l.start + l.end) / 2, 'the line came in by a visible composition: no second one inside it (pairs B)');
    }

    /** The world camera's move into the part this line opens: its own reframe, or one switch with the seat change it rides. */
    function camRide() {
      if (!cam || i === 0) return;
      const here = events.slice(atIn).find((e) => e.kind !== 'keep');
      if (here) here.camera = cam.kind;
      else push({ lineIds: [line.id], kind: 'camera-reframe', at: cam.at, from: cam.at, to: cam.at + cam.sec, seatBefore: seat?.id ?? '', seatAfter: seat?.id ?? '', scope: 'section', changesLight: false, reason: `world camera ${cam.kind} (composed)`, fixed: true, ...(caps.moves?.['camera-reframe'] ? { move: caps.moves['camera-reframe'] } : {}) });
    }

    /**
     * The joint contract (phase 4c, Codex 2026-11-10 r2 §1) for one line: its candidates first (a reseat or page move at
     * its boundary, a switch inside it, a declared composite, a hold on the seat it keeps, each by the same rules and
     * clocks as ever), then one commitment. The hard floors stand as before (a Q4 handoff, a camera into the part, a
     * pinned line's composed seat, a seat before that does not fit the line: each a composition the line already makes);
     * a hold no longer pins anything. Where the line may keep its seat and has a legal hold there, the scheduler's own
     * wish for a switch says which kind is preferred, unchanged from the plan without the contract (a section start, the
     * composer's own change of set, or a draw under the part's reseatRate): wished, the compositions are tried first
     * (boundary, then a composite, then inside the line) and the hold is the fallback; otherwise the hold. With no legal hold, the line is planned as before, but a switch inside it only when its boundary kept.
     */
    function jointLine() {
      const rate = reseatRate(mood, run);
      const camIn = !!cam && i > 0;
      notes.set(line.id, { cands: line.holdCands?.length ?? 0, legal: false, mood });
      // (pairs C, Codex 2026-11-10: never the kind the sung line before committed, whatever kind (a line before that kept
      // lifts it), and no ink-swap past SWAP_CAP in the line's music section, counted over the song; refused, never moved)
      const prevKind = i > 0 ? holds.find((h) => h.lineId === lines[i - 1].id)?.kind : undefined;
      const sectionOf = (id: string) => sectionAt(sections, lines.find((l) => l.id === id)?.start ?? -Infinity);
      const swaps = holds.filter((h) => h.kind === 'ink-swap' && sectionOf(h.lineId) === sectionAt(sections, line.start)).length;
      const barred = (h: JointHold): HoldRefusal['reason'] | undefined => (prevKind && h.hold.kind === prevKind ? 'repeat-kind' : h.hold.kind === 'ink-swap' && swaps >= SWAP_CAP ? 'section-cap' : undefined);
      const refuse = (h: JointHold) => {
        const why = barred(h);
        const note = notes.get(line.id)!;
        if (why && !(note.rejects ?? []).some((r) => r.kind === h.hold.kind && r.reason === why)) note.rejects = [...(note.rejects ?? []), { kind: h.hold.kind, reason: why }];
        return !!why;
      };
      const legalHold = (s: SeatCandidate | undefined) => {
        // (Codex r3 §3: the world's rank first, its line-ink-settle last resort; reading slack only among equal ranks)
        const order = (h: JointHold) => [Number(h.hold.kind === 'line-ink-settle'), h.rank];
        const byOrder = (a: JointHold, b: JointHold) => { const [x, y] = [order(a), order(b)]; return x[0] - y[0] || x[1] - y[1]; };
        const hs = s ? (line.holdCands ?? []).filter((h) => h.seat === s.id && !refuse(h)).sort((a, b) => byOrder(a, b) || Math.floor(b.slack / HOLD_SLACK_STEP) - Math.floor(a.slack / HOLD_SLACK_STEP) || salt(`hold:${a.hold.kind}`) - salt(`hold:${b.hold.kind}`)) : [];
        const h = hs.find((x) => !conflict(holdAction(x.hold), taken));
        if (h) notes.get(line.id)!.legal = true;
        return h;
      };
      const commitHold = (h: JointHold) => { holds.push({ ...h.hold }); taken.push(holdAction(h.hold)); };
      const mark = () => ({ e: events.length, t: taken.length, h: holds.length, seat, run });
      const undo = (m: ReturnType<typeof mark>) => { events.length = m.e; taken.length = m.t; holds.length = m.h; seat = m.seat; run = m.run; };
      const switched = (from: number) => events.slice(from).some((e) => e.kind !== 'keep');
      const keepOn = (s: SeatCandidate, reason: string) => { run = 0; push({ lineIds: [line.id], kind: 'keep', at: line.show, from: line.show, to: line.show, seatBefore: before, seatAfter: s.id, scope, changesLight: false, reason }); seat = s; };
      const holdWhy = (h: JointHold) => `keep: its ${h.hold.kind} hold is the line's one action (joint, ${mood})`;
      // (a line that came in by a visible composition takes nothing more inside it: one a line, Codex 2026-11-10 pairs B;
      // the second one art-deco once took after its entrance is withdrawn)
      const second = () => rejectInLine(line);
      if (!own) {
        push({ lineIds: [line.id], kind: 'keep', at: line.show, from: line.show, to: line.show, seatBefore: before, seatAfter: before, scope: 'line', changesLight: false, reason: 'no seat for this line: it stays as composed' });
        return camRide();
      }
      if (!seat) {
        seat = own;
        push({ lineIds: [line.id], kind: 'keep', at: line.show, from: line.show, to: line.show, seatBefore: before, seatAfter: seat.id, scope: 'line', changesLight: false, reason: 'the first composition is not a cut' });
        if (camIn) return camRide();
        const h = legalHold(own);
        if (h) commitHold(h);
        return;
      }
      const q4 = handoffs.find((h) => h.lineId === line.id);
      if (q4) {
        legalHold(own);
        const w = handoffWindow(q4);
        push({ lineIds: [lines[i - 1].id, line.id], kind: 'page-handoff', at: q4.seam, ...w, seatBefore: before, seatAfter: own.id, carrierId: own.carrierId, scope, changesLight: q4.changesLight ?? true, reason: `${q4.kind.startsWith('lyric-') ? 'lyric handoff' : 'Q4'} ${q4.kind} (protected)`, fixed: true, ...(merged.get(q4) ? { merged: merged.get(q4) } : {}), ...(caps.moves?.['page-handoff'] ? { move: caps.moves['page-handoff'] } : {}) });
        seat = own;
        run += 1;
        return camRide();
      }
      if (line.pinned) {
        const h = legalHold(own);
        if (seatsDiffer(seat, own)) {
          const action: Action = { at: line.show, from: line.show, to: line.show, light: lightOf(own), composition: true, what: `${line.id}'s composed seat`, owner: boundaryOf(line.id) };
          const why = conflict(action, taken);
          if (why) warnings.push({ inputs: [`${line.id} composed seat`], reason: `pinned seat breaks spacing: ${why}` });
          push({ lineIds: [line.id], kind: 'layout-seat', at: line.show, from: line.show, to: line.show, seatBefore: before, seatAfter: own.id, carrierId: own.carrierId, scope, changesLight: action.light, reason: `composed seat (${line.pinned})`, fixed: true });
          run += 1;
          seat = own;
          return camRide();
        }
        const prefer = sectionStart || salt('reseat') < rate;
        if (h && !camIn && !prefer) { keepOn(own, holdWhy(h)); commitHold(h); return; }
        if (pageMove(own, scope, rate)) { seat = own; return camRide(); }
        if (h && !camIn) { keepOn(own, holdWhy(h)); commitHold(h); return; }
        keepOn(own, `composed seat is the same composition (${line.pinned})`);
        return camRide();
      }
      const canKeep = seats.some((s) => s.id === seat!.id) || !seatsDiffer(seat, own);
      const kept = seats.find((s) => s.id === seat!.id) ?? own;
      if (!canKeep || camIn) {
        // (a composition the line makes anyway: the seat before does not fit it, or the world camera moves into it)
        legalHold(own);
        boundary(line, i, sectionStart);
        if (!switched(atIn) && !camIn) inLine(line, mood);
        else second();
        return camRide();
      }
      const h = legalHold(kept);
      // (the scheduler's own wish for a switch, exactly as without the contract: a section start, the composer's own
      // change of set, or the part's draw under its rate; only where none asks does the hold come first)
      const prefer = sectionStart || (seatOk(own) && seatsDiffer(seat, own)) || salt('reseat') < rate;
      if (h && !prefer) { keepOn(kept, holdWhy(h)); commitHold(h); return; }
      if (h) {
        let m = mark();
        boundary(line, i, sectionStart, true);
        if (switched(m.e)) return second();
        undo(m);
        // (a declared composite: the line's ink-only hold and the world's material move as one action, phase 4a)
        const a = line.inLine?.absorb;
        const ah = a && (line.holdCands ?? []).find((x) => x.seat === kept.id && holdIdOf(x.hold) === a.holdId && !refuse(x) && !conflict(holdAction(x.hold), taken));
        if (a && ah) {
          m = mark();
          keepOn(kept, `keep: its ${ah.hold.kind} hold goes into a composite (joint, ${mood})`);
          commitHold(ah);
          absorbInto(line, a, mood);
          if (events.slice(m.e).some((e) => e.absorbed)) return;
          undo(m);
        }
        m = mark();
        keepOn(kept, `keep (${mood})`);
        inLine(line, mood);
        if (switched(m.e)) return;
        undo(m);
        keepOn(kept, holdWhy(h));
        commitHold(h);
        return;
      }
      boundary(line, i, sectionStart);
      if (!switched(atIn)) inLine(line, mood);
      else second();
    }

    /**
     * The world's page move on the kept seat (the receipt's next segment, world-shared materials `same`), once the line
     * before is sung: the seat stays, the paper under it changes. A pinned line may take one (its seat is not touched);
     * a line sharing its shot never does (the shot's page is one page).
     */
    function pageMove(kept: SeatCandidate, scope: EventScope, rate: number) {
      const l = line;
      const prev = lines[i - 1];
      if (!prev || l.sharesShot || l.end - l.start < SHORT_LINE || !(scope === 'section' || salt('page') < rate)) return false;
      for (const [name, m] of materialFor('same', scope)) {
        if (m.minLine && l.end - l.start < m.minLine) { reject(l.id, m.family, l.show, `${name}: line ${(l.end - l.start).toFixed(2)}s < ${m.minLine}s, too short to read past it`); continue; }
        if (l.show < prev.end + m.clearOfSung - 1e-6) { reject(l.id, m.family, l.show, `${name}: the line before is still sung at ${l.show}`); continue; }
        if (offLimits(kept.box, m)) { reject(l.id, m.family, l.show, `${name}: the words stand in its protected region`); continue; }
        const light = !!m.changesLight;
        const action: Action = { at: l.show, from: l.show, to: l.show + m.sec, light, composition: true, what: `${name} into ${l.id}`, owner: boundaryOf(l.id) };
        const why = conflict(action, taken);
        if (why) { reject(l.id, m.family, l.show, `${name}: ${why}`); continue; }
        push({ lineIds: [prev.id, l.id], kind: m.family, at: l.show, from: l.show, to: l.show + m.sec, seatBefore: before, seatAfter: kept.id, carrierId: kept.carrierId, scope, changesLight: light, reason: `${name} (${mood})`, move: name, material: name, curve: m.curve, ...(m.counts === 'seen' ? { holdLevel: true } : {}) }, action);
        seat = kept;
        run += 1;
        return true;
      }
      return false;
    }

    /** The line boundary: keep, reseat, or a full page handoff where the song's shape asks for one. */
    function boundary(l: WorldEventLine, k: number, sectionStart: boolean, force = false) {
      // (keep shows the line in the seat before: only where that seat is one of the line's own; else the line takes its
      // own seat, the composer's, however the clocks stand)
      const canKeep = seats.some((s) => s.id === seat!.id) || !seatsDiffer(seat, own);
      const kept = seats.find((s) => s.id === seat!.id) ?? own;
      const keep = (reason: string) => {
        if (!canKeep) return forced();
        run = 0;
        push({ lineIds: [l.id], kind: 'keep', at: l.show, from: l.show, to: l.show, seatBefore: before, seatAfter: kept.id, scope, changesLight: false, reason });
        seat = kept;
      };
      const forced = () => {
        const action: Action = { at: l.show, from: l.show, to: l.show, light: lightOf(own), composition: true, what: `${l.id}'s own seat`, owner: boundaryOf(l.id) };
        const why = conflict(action, taken);
        if (why) warnings.push({ inputs: [`${l.id} own seat`], reason: `the seat before does not fit the line; its own seat breaks spacing: ${why}` });
        push({ lineIds: [l.id], kind: 'layout-seat', at: l.show, from: l.show, to: l.show, seatBefore: before, seatAfter: own.id, carrierId: own.carrierId, scope, changesLight: action.light, reason: 'the seat before does not fit this line: its own seat' }, action);
        seat = own;
        run += 1;
      };
      if (!allows.size) return keep('composition capability off: the composer’s seat stands');
      if (l.end - l.start < SHORT_LINE) return keep(`short line (${(l.end - l.start).toFixed(2)}s < ${SHORT_LINE}s): words switch on time`);
      const target = other(seat, 'seat');
      const carrierEnd = !!target && (target.carrierId ?? '') !== (seat!.carrierId ?? '');
      const rate = reseatRate(mood, run);
      // (the composer's own change of set stands, however many switches came before it: no run cap, Codex phase-2 §1; the
      // scheduler adds one of its own by the part's pace, eased after a run of switches: a preference, never a count)
      // (`force`: the joint selector asks for the line's compositions, its preference already drawn from the same rate)
      const wants = force || sectionStart || (!!own && seatOk(own) && seatsDiffer(seat, own)) || salt('reseat') < rate;
      const prev = lines[k - 1];
      if (!wants) return pageMove(kept, scope, rate) || keep(`keep (${mood})`);
      const tries: { kind: CompositionFamily; at: number; from: number; to: number; seat: SeatCandidate; reason: string; material?: [string, MaterialMove] }[] = [];
      const pageWhy = sectionStart ? 'section start' : carrierEnd ? 'carrier ends' : '';
      // (a full page handoff of the scheduler's own only where the part's pace asks for a switch, never because the
      // composer changed set: rule 11, not every line a full exit and entrance)
      const pageWants = sectionStart || salt('reseat') < rate;
      if (caps.ownPages && pageWants && at('page-handoff', scope) && target && pageWhy && pace.pages.includes(sectionStart ? 'section' : 'carrier')) {
        if (prev.end - prev.start >= HANDOFF_UP) tries.push({ kind: 'page-handoff', at: l.show, from: l.show - LINK_PREPARE, to: l.show - LINK_PREPARE + sec('page-handoff'), seat: target, reason: `${pageWhy} (${mood})` });
        else reject(l.id, 'page-handoff', l.show, `line before up ${(prev.end - prev.start).toFixed(2)}s < ${HANDOFF_UP}s`, target.id);
      }
      const seatKind: CompositionFamily | undefined = target && carrierEnd && at('carrier-swap', scope) ? 'carrier-swap' : at('layout-seat', scope) ? 'layout-seat' : undefined;
      // (a reseat onto a region that meets the one just read is the world's erase first, where it has one: the old words
      // wiped by its own move once sung and read still, the wipe over as the new line shows; else the plain cut)
      if (seatKind && target && seat?.box && target.box && boxesMeet(seat.box, target.box))
        for (const [name, m] of materialFor('over', scope).filter(([, x]) => x.family === seatKind)) {
          // (as soon as the old line is sung and read still: no sung-out words left standing on the board through a
          // gap; over EXIT_LEAD before the new line shows, as a line's exit always is, engine exitAt)
          // (sung until the last voice before this line stops, a backing or overlapping line included)
          const sungUntil = Math.max(...lines.slice(0, k).map((x) => x.end));
          const from = r3(sungUntil + m.clearOfSung);
          if (from + m.sec > l.show - EXIT_LEAD + 1e-6) { reject(l.id, seatKind, l.show, `${name}: ${prev.id} sung until ${sungUntil}, no ${m.sec}s for the wipe before ${l.show}`, target.id); continue; }
          // (and no other line is up while the board is wiped: only the one being erased)
          const other = lines.find((x, j) => j !== k - 1 && j !== k && x.show < from + m.sec && x.end > from);
          if (other) { reject(l.id, seatKind, l.show, `${name}: ${other.id} is up during the wipe`, target.id); continue; }
          if (offLimits(seat.box, m)) { reject(l.id, seatKind, l.show, `${name}: the old words stand in its protected region`, target.id); continue; }
          tries.push({ kind: seatKind, at: l.show, from, to: r3(from + m.sec), seat: target, reason: `${name}: the region just read is wiped, then the line is set there (${mood})`, material: [name, m] });
        }
      // (a reseat falls on the line's show, the frame its set is drawn from: no later time the renderer would not keep)
      if (seatKind && target) for (const t of [l.show]) tries.push({ kind: seatKind, at: t, from: t, to: t + sec(seatKind), seat: target, reason: `${sectionStart ? 'section start' : 'reseat'} (${mood})` });
      if (sectionStart && !target && at('ground-role', scope)) tries.push({ kind: 'ground-role', at: l.show, from: l.show, to: l.show + sec('ground-role'), seat: seat!, reason: `section start, no other seat (${mood})` });
      for (const t of tries) {
        const light = LIGHT_KINDS.has(t.kind) || lightOf(t.seat);
        const why = conflict({ at: t.at, from: t.from, to: t.to, light, composition: true, what: '', owner: boundaryOf(l.id) }, taken);
        if (why) { reject(l.id, t.kind, t.at, why, t.seat.id); continue; }
        const mat = t.material ? { move: t.material[0], material: t.material[0], curve: t.material[1].curve } : caps.moves?.[t.kind] ? { move: caps.moves[t.kind] } : {};
        push({ lineIds: t.kind === 'page-handoff' || t.material ? [prev.id, l.id] : [l.id], kind: t.kind, at: t.at, from: t.from, to: t.to, seatBefore: before, seatAfter: t.seat.id, carrierId: t.seat.carrierId, scope, changesLight: light, reason: t.reason, ...mat }, { at: t.at, from: t.from, to: t.to, light, composition: true, what: `${t.kind} into ${l.id}`, owner: boundaryOf(l.id) });
        seat = t.seat;
        run += 1;
        return;
      }
      if (canKeep && pageMove(kept, scope, rate)) return;
      keep(target || sectionStart ? 'every switch here collides: kept (see rejected)' : 'no other seat fits this line');
    }

    /** The one switch inside a line, at a word break it really sings, read still either side, on the carrier it is read on. */
    function inLine(l: WorldEventLine, m: Mood) {
      const kinds = IN_LINE_ORDER.filter((k) => at(k, 'in-line'));
      if (!kinds.length || l.end - l.start < MOOD_PACE[m].inLine) return;
      if (holdMoves.some((x) => x.lineId === l.id)) return reject(l.id, kinds[0], (l.start + l.end) / 2, 'its hold was moved off a handoff: its room is not re-read, no in-line switch');
      // (an ink-only hold may merge with the world's material move into one composite event, phase 4a; any other hold
      // leaves the room its own rules leave, often none)
      if (l.inLine?.absorb && !l.inLine.spans.length) return absorbInto(l, l.inLine.absorb, m);
      if (l.inLine && !l.inLine.spans.length) return reject(l.id, kinds[0], (l.start + l.end) / 2, 'no room inside the line beside its hold (Q2)');
      if (!l.words || l.words.length < 2) {
        reject(l.id, kinds[0], (l.start + l.end) / 2, 'no reliable word boundary: no in-line switch (none faked by time)');
        return;
      }
      // (still reading starts once the words have landed: after the line's entrance and after any switch into it)
      const settled = Math.max(l.start, l.settled ?? l.start, ...events.filter((e) => e.lineIds.includes(l.id) && e.kind !== 'keep').map((e) => e.to));
      const mid = (l.start + l.end) / 2;
      const near = (t: number) => [...input.beats, ...(input.downbeats ?? [])].some((b) => Math.abs(b - t) <= BEAT_SNAP);
      const inRoom = (t: number, to: number) => !l.inLine || l.inLine.spans.some(([a, b]) => t >= a - 1e-6 && to <= b + 1e-6);
      const breaks = l.words.slice(1).map((w) => w.from).filter((b) => b > l.start && b < l.end).sort((a, b) => Number(near(b)) - Number(near(a)) || Math.abs(a - mid) - Math.abs(b - mid) || unit(`${seed}:${l.id}:${a}`) - unit(`${seed}:${l.id}:${b}`));
      if (!breaks.length) {
        reject(l.id, kinds[0], mid, 'no sung word break inside the line');
        return;
      }
      // (the words keep what they are read on and where they stand: a carrier swap changes what carries them on the same
      // page, only by the world's own material move, the words in the very box at the very type (sameWords: no anchor,
      // size or break changes inside a line, Codex 2026-11-10 pairs B); no other family reseats a line being sung)
      const swap = materialFor('carrier', 'in-line').find(([, m]) => m.family === 'carrier-swap');
      const poolOf = (kind: CompositionFamily) => seats.filter((s) => (!l.inLine?.seats || l.inLine.seats.includes(s.id)) && seatsDiffer(seat, s) && (kind === 'carrier-swap'
        ? !!swap && !!s.page && s.page === seat?.page && (s.carrierId ?? '') !== (seat?.carrierId ?? '') && !offLimits(s.box, swap[1]) && (!seat?.box || !s.box || sameWords(seat, s))
        : (s.carrierId ?? '') === (seat?.carrierId ?? '')));
      let tried = false;
      for (const kind of kinds) {
        const pool = poolOf(kind);
        const target = pool.length ? pool[Math.floor(salt(kind === 'carrier-swap' ? 'carrier' : 'in-line') * pool.length)] : undefined;
        if (!target) continue;
        tried = true;
        const mat = kind === 'carrier-swap' && swap ? { move: swap[0], material: swap[0], curve: swap[1].curve } : caps.moves?.[kind] ? { move: caps.moves[kind] } : {};
        const dur = kind === 'carrier-swap' && swap ? swap[1].sec : sec(kind);
        let last = '';
        for (const b of breaks) {
          const to = b + dur;
          if (b - settled < READ_STABLE || l.end - to < READ_STABLE) { last = `less than ${READ_STABLE}s of still reading round ${b.toFixed(2)}`; continue; }
          if (!inRoom(b, to)) { last = `${b.toFixed(2)} is inside the room its hold keeps (Q2)`; continue; }
          const why = conflict({ at: b, from: b, to, light: false, composition: true, what: '' }, taken);
          if (why) { last = why; continue; }
          push({ lineIds: [l.id], kind, at: b, from: b, to, seatBefore: seat?.id ?? '', seatAfter: target.id, carrierId: target.carrierId, scope: 'in-line', changesLight: false, reason: `word break${near(b) ? ' on a beat' : ''} (${m})`, ...mat }, { at: b, from: b, to, light: false, composition: true, what: `in-line ${kind} on ${l.id}` });
          seat = target;
          return;
        }
        if (last) reject(l.id, kind, mid, last);
      }
      if (tried) return;
      reject(l.id, kinds[0], mid, `no family target: no other seat on the same carrier for ${kinds.join('/')}`);
    }

    /**
     * An ink-only hold and a declared material move on the same line as one composite event (phase 4a, Codex 2026-11-10
     * §3 (b)): the material keeps every rule of its own (a sung word break, READ_STABLE of still reading either side, the
     * same page, the declared seats that keep the words and their ground, its protected region, every global clock against
     * everything but its own hold); the hold keeps its `at/sec/span` and settled ink (it is never moved to meet a word); the
     * two must make one main action (their windows overlap or lie within ACTION_GAP), and the event occupies the union. If
     * they cannot, the hold stands and the material is refused, with the layer in `rejected`.
     */
    function absorbInto(l: WorldEventLine, a: AbsorbRoom, m: Mood) {
      const mid = (l.start + l.end) / 2;
      const no = (why: string) => reject(l.id, 'carrier-swap', mid, `absorb ${a.holdId}: ${why}`);
      const hold = holds.find((h) => holdIdOf(h) === a.holdId);
      if (!hold) return no('the hold is not among the plan\'s holds (folded into a handoff): nothing to merge with');
      if (!ABSORBABLE_HOLDS.has(hold.kind)) return no(`a ${hold.kind} hold keeps pinning its line (only ${[...ABSORBABLE_HOLDS].join(' / ')} merge)`);
      const mats = materialFor('carrier', 'in-line').filter(([, x]) => at(x.family, 'in-line') && (x.absorbs ?? []).includes(hold.kind));
      if (!mats.length) return no(`no material move of the world absorbs a ${hold.kind}`);
      if (!l.words || l.words.length < 2) return no('no reliable word boundary: the material needs one (none faked by time)');
      const settled = Math.max(l.start, l.settled ?? l.start, ...events.filter((e) => e.lineIds.includes(l.id) && e.kind !== 'keep').map((e) => e.to));
      const near = (t: number) => [...input.beats, ...(input.downbeats ?? [])].some((b) => Math.abs(b - t) <= BEAT_SNAP);
      const breaks = l.words.slice(1).map((w) => w.from).filter((b) => b > l.start && b < l.end).sort((x, y) => Number(near(y)) - Number(near(x)) || Math.abs(x - mid) - Math.abs(y - mid) || unit(`${seed}:${l.id}:${x}`) - unit(`${seed}:${l.id}:${y}`));
      if (!breaks.length) return no('no sung word break inside the line');
      let last = '';
      for (const [name, x] of mats) {
        // (the same page, another carrier, the very box and type of the words: only the ground under them is redrawn)
        // (every seat that keeps the words, in the seed's own order: one refused by the clocks passes to the next)
        const pool = seats.filter((s) => a.seats.includes(s.id) && !!a.inks[s.id] && !!s.page && s.page === seat?.page && (s.carrierId ?? '') !== (seat?.carrierId ?? '') && sameWords(seat, s) && !offLimits(s.box, x)).sort((p, q) => salt(`absorb:${p.id}`) - salt(`absorb:${q.id}`) || p.id.localeCompare(q.id));
        if (!pool.length) { last = `${name}: no declared seat keeps the words, their type and their ground (geometry or ink)`; continue; }
        for (const target of pool) for (const b of breaks) {
          const to = b + x.sec;
          if (b - settled < READ_STABLE || l.end - to < READ_STABLE) { last = `${name}: less than ${READ_STABLE}s of still reading round ${b.toFixed(2)}`; continue; }
          if (!(b < hold.to + ACTION_GAP && hold.from < to + ACTION_GAP)) { last = `${name} at ${b.toFixed(2)}: not one main action with its hold ${hold.from}–${hold.to} (the hold is never moved to meet it)`; continue; }
          const occ = { from: Math.min(b, hold.from), to: Math.max(to, hold.to) };
          const light = !!x.changesLight;
          const why = conflict({ at: b, from: occ.from, to: occ.to, light, composition: true, what: '' }, taken.filter((t) => t.hold !== a.holdId));
          if (why) { last = `${name} at ${b.toFixed(2)}: ${why}`; continue; }
          const reason = `${name} absorbs the ${hold.kind} hold: one main action over ${r3(occ.from)}–${r3(occ.to)}, the hold kept at ${hold.at}`;
          const absorbed: AbsorbedHold = { holdId: a.holdId, kind: hold.kind, hold: { at: hold.at, from: hold.from, to: hold.to, ...(a.span ? { span: a.span } : {}) }, materialId: name, ink: a.inks[target.id], occupancy: { from: r3(occ.from), to: r3(occ.to) }, reason: `ink-only hold, same words and ground on ${target.id} (${m})` };
          push({ lineIds: [l.id], kind: x.family, at: b, from: b, to, seatBefore: seat?.id ?? '', seatAfter: target.id, carrierId: target.carrierId, scope: 'in-line', changesLight: light, reason, move: name, material: name, curve: x.curve, absorbed }, { at: b, from: occ.from, to: occ.to, light, composition: true, what: `in-line ${name} on ${l.id} with ${a.holdId}`, hold: a.holdId });
          seat = target;
          return;
        }
      }
      no(last);
    }
  });

  if (at('prop-beat', 'in-line'))
    for (const a of input.accents ?? []) {
      const line = lines.find((l) => l.id === a.lineId);
      const to = a.at + sec('prop-beat');
      const why = !line || a.at < line.start || to > line.end ? 'accent outside its line' : conflict({ at: a.at, from: a.at, to, light: false, composition: true, what: '' }, taken);
      if (why) { reject(a.lineId, 'prop-beat', a.at, why); continue; }
      const here = events.filter((e) => e.lineIds.includes(a.lineId)).at(-1)?.seatAfter ?? '';
      events.push({ id: `prop-beat:${a.lineId}:${a.propId}`, lineIds: [a.lineId], kind: 'prop-beat', at: r3(a.at), from: r3(a.at), to: r3(to), seatBefore: here, seatAfter: here, scope: 'in-line', changesLight: false, reason: a.reason, ...(caps.moves?.['prop-beat'] ? { move: caps.moves['prop-beat'] } : {}) });
      taken.push({ at: a.at, from: a.at, to, light: false, composition: true, what: `prop-beat ${a.propId}` });
    }
  const policy = input.candidates ? arbitratePolicies(input.candidates, { lines, events, taken, holds, handoffs, holdMoves, cams, caps, lights: input.lights ?? [], joint }) : undefined;
  // (after Q3/Q5 arbitration: a Q3 scale event is in `events`, an approved Q5 moment's window is counted here too)
  const momentWindows: Action[] = (policy ?? []).filter((d) => d.approved && d.source === 'Q5').map((d) => ({ at: d.at, from: d.from, to: d.to, light: false, composition: false, what: d.id }));
  // (a camera move a switch the scheduler could not avoid collides with, a line's own seat forced on it or a given one:
  // dropped as well, the warning it raised resolved with it)
  if (allows.size)
    for (const c of [...cams.values()]) {
      const act: Action = { at: c.at, from: c.at, to: c.at + c.sec, light: false, composition: true, what: '', owner: boundaryOf(c.lineId) };
      const others: Action[] = events.filter((e) => e.kind !== 'keep' && e.kind !== 'camera-reframe' && e.lineIds.at(-1) !== c.lineId).map((e) => ({ at: e.at, from: e.from, to: e.to, light: false, composition: true, what: e.id }));
      const why = conflict(act, [...others, ...momentWindows]);
      if (!why) continue;
      cams.delete(c.lineId);
      camDrops.push({ lineId: c.lineId, kind: c.kind, at: c.at, reason: why });
      const own = events.findIndex((e) => e.kind === 'camera-reframe' && e.lineIds.at(-1) === c.lineId);
      if (own >= 0) events.splice(own, 1);
      for (const e of events) if (e.camera && e.lineIds.at(-1) === c.lineId) delete e.camera;
      const named = `world camera ${c.kind} into ${c.lineId}`;
      for (let k = warnings.length - 1; k >= 0; k--) if (warnings[k].reason.includes(named)) warnings.splice(k, 1);
    }
  events.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const dropped = new Set(camDrops.map((c) => c.lineId));
  const outcomes = joint ? lines.map((l) => outcomeOf(l, events, holds, notes.get(l.id), rejected.some((r) => r.candidate.lineId === l.id), dropped.has(l.id))) : undefined;
  return { events, holds, rejected, warnings, ...(holdMoves.length ? { holdMoves } : {}), ...(camDrops.length ? { camDrops } : {}), ...(policy ? { policy } : {}), ...(outcomes ? { outcomes } : {}) };
}

/** Two hold candidates whose reading slack falls in the same step of this many seconds are tied: the world's rank decides, then the seed. */
export const HOLD_SLACK_STEP = 0.1;
/** A Q2 hold as an action on the song's clocks: never a composition, its whole window occupied. */
const holdAction = (h: HoldEvent): Action => ({ at: h.at, from: h.from, to: h.to, light: false, composition: false, what: `Q2 ${h.kind} on ${h.lineId}`, hold: holdIdOf(h) });

/**
 * A line's committed action read off the final plan (phase 4c): a composite (an absorbed hold), a hold, a composition
 * (any switch of the line: its boundary, inside it, a Q4 handoff or camera move into it, a Q3 composition), else keep.
 * Why a line that could hold did not: a legal hold lost to a composition (`supersededByComposition`), or none was legal
 * (`noSafeCandidate`), or the camera it lost to was dropped after the selection (`cameraDropped`); a line with no hold that kept: a composition was tried and refused (`noSafeCandidate`), or none
 * was asked for (`designedQuiet`).
 */
export function outcomeOf(l: WorldEventLine, events: WorldEvent[], holds: HoldEvent[], note: { cands: number; legal: boolean; mood: Mood; rejects?: HoldRefusal[] } | undefined, refused: boolean, camDropped = false): LineOutcome {
  const evs = events.filter((e) => e.lineIds.at(-1) === l.id && e.kind !== 'keep');
  const held = holds.find((h) => h.lineId === l.id);
  const [cands, legal] = [note?.cands ?? 0, !!note?.legal];
  const outcome: LineOutcomeKind = evs.some((e) => e.absorbed) ? 'composite' : held ? 'hold' : evs.length ? 'composition' : 'keep';
  // (a keep line whose world camera was dropped after the selection: the composition its hold lost to is gone; the hold
  // is not re-added)
  const reason: LineOutcomeReason | undefined = outcome === 'composition' ? (legal ? 'supersededByComposition' : cands ? 'noSafeCandidate' : undefined) : outcome === 'keep' ? (camDropped ? 'cameraDropped' : cands || refused ? 'noSafeCandidate' : 'designedQuiet') : undefined;
  const primary = evs[0]?.id ?? (held ? holdIdOf(held) : undefined);
  return { lineId: l.id, outcome, ...(reason ? { reason } : {}), holdCands: cands, legalHold: legal, ...(primary ? { primary } : {}), ...(evs.length > 1 ? { actions: evs.length } : {}), mood: note?.mood ?? 'build', ...(note?.rejects?.length ? { holdRejects: note.rejects } : {}) };
}

interface PolicyContext { lines: WorldEventLine[]; events: WorldEvent[]; taken: Action[]; holds: HoldEvent[]; handoffs: HandoffCandidate[]; holdMoves: HoldMove[]; cams: Map<string, CameraMove>; caps: WorldCompositionCaps; lights: { at: number; what: string }[]; /** Phase 4c: a committed hold is the line's one action; no composition is stacked on it. */ joint?: boolean }

/**
 * Q3 and Q5 candidates arbitrated after Q2 and Q4 are protected and Q1 is laid (Codex §2, §6): Q3 first, a section at a
 * time, then Q5 by rank. A Q3 scale composition is the line's own switch at its show, held while the line is sung: it
 * shares the line's Q1 switch when there is one (one event id, one window, one count) or becomes the line's switch in place
 * of its keep; it is refused on a line whose words already have an event of their own while read (a Q2 hold, planned on
 * its set; a Q4 handoff that lays it on its page; a camera move into it; a switch inside it), on a seat that enters the
 * world's protected regions, or against the clocks. A Q5 moment is never a composition event: its whole occupied window
 * keeps ACTION_GAP from every hold, handoff and cut (Q1's and Q3's), a big one LIGHT_GAP from every change of light, and
 * it is approved into the protected record only (the renderer draws it from there). Within a group the next candidate
 * is tried when one is refused; the budget (Q5: two a song, 30 s apart, one a section) counts approvals only.
 */
function arbitratePolicies(cands: PolicyCandidate[], ctx: PolicyContext): PolicyDecision[] {
  const out: PolicyDecision[] = [];
  const order = (c: PolicyCandidate) => (c.source === 'Q3' ? 0 : c.source === 'Q5' ? 1 : 2);
  const sorted = [...cands].sort((a, b) => order(a) - order(b) || (a.group ?? '').localeCompare(b.group ?? '') || (a.rank ?? 0) - (b.rank ?? 0));
  // (Q5 is ranked across groups: its best candidate first, so a weaker one never takes the budget from a better one)
  const q5 = sorted.filter((c) => c.source === 'Q5').sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const queue = [...sorted.filter((c) => c.source !== 'Q5'), ...q5];
  const done = new Set<string>();
  const approvedBy = new Map<string, PolicyDecision[]>();
  const moments: Action[] = [];
  // (the approved scale compositions while their lines are up: a moment keeps off them)
  const scaled: { id: string; from: number; to: number }[] = [];
  const decide = (c: PolicyCandidate, approved: boolean, reason: string, extra: Partial<PolicyDecision> = {}) => {
    const d: PolicyDecision = { id: c.id ?? `${c.source}:${c.lineId}`, source: c.source, ...(c.group ? { group: c.group } : {}), lineId: c.lineId, ...(c.rank !== undefined ? { rank: c.rank } : {}), at: r3(c.at), from: r3(c.from), to: r3(c.to), approved, reason, ...(c.meaningRef ? { meaningRef: c.meaningRef } : {}), ...(c.variant ? { variant: c.variant } : {}), ...extra };
    out.push(d);
    if (approved && c.budget) approvedBy.set(c.budget.key, [...(approvedBy.get(c.budget.key) ?? []), d]);
    if (approved && c.group) done.add(`${c.source}:${c.group}`);
  };
  const boundaryOf = (id: string) => `boundary:${id}`;
  for (const c of queue) {
    if (c.group && done.has(`${c.source}:${c.group}`)) { decide(c, false, 'not needed: its group already has an approved candidate'); continue; }
    const line = ctx.lines.find((l) => l.id === c.lineId);
    if (!line) { decide(c, false, 'line not shown'); continue; }
    if (c.budget) {
      const got = approvedBy.get(c.budget.key) ?? [];
      const near = got.find((d) => Math.abs(d.at - c.at) < c.budget!.apart);
      const sameSection = c.budget.section !== undefined ? got.find((d) => cands.find((x) => (x.id ?? '') === d.id)?.budget?.section === c.budget!.section) : undefined;
      const why = got.length >= c.budget.max ? `budget: ${c.budget.max} already approved` : near ? `budget: within ${c.budget.apart}s of ${near.id}` : sameSection ? `budget: same section as ${sameSection.id}` : '';
      if (why) { decide(c, false, why); continue; }
    }
    if (c.source === 'Q3') {
      // (a hold whose move is glyph-level runs on the composition in its own window, unmoved; one that grows the block or
      // moves its carrier was planned on the set's geometry, and one the scheduler moved off a handoff is not re-read)
      // (joint, phase 4c: the hold the line committed is its one action; the scale composition lost to it and is not stacked)
      const hold = ctx.holds.find((h) => h.lineId === line.id && (ctx.joint || (!c.holdsOk?.includes(h.kind) && !c.folds?.includes(h.kind)))) ?? (ctx.holdMoves.some((m) => m.lineId === line.id) ? { kind: 'moved', lineId: line.id } : undefined);
      const folded = ctx.joint ? undefined : ctx.holds.find((h) => h.lineId === line.id && c.folds?.includes(h.kind));
      const lineEvents = ctx.events.filter((e) => e.lineIds.at(-1) === line.id);
      const why = hold ? `collisionQ2hold: its ${hold.kind} hold was planned on its set (Q2, fixed)`
        : ctx.handoffs.some((h) => h.lineId === line.id) ? 'collisionQ4: a linked handoff lays the line on its page (Q4, fixed)'
        // (a composition its page carries is laid on a whole page of its own, render/page-layout.ts: a linked handoff into
        // the next line slides that page out as a picture of the old set, never the page laid round the composition)
        : c.seat?.carrierId?.startsWith('ground:') && ctx.handoffs.some((h) => h.lineId === ctx.lines[ctx.lines.indexOf(line) + 1]?.id) ? 'collisionQ4exit: the next line\'s linked handoff (Q4, fixed) slides this page out as a picture of its old set, not the page laid whole round the composition'
        : ctx.cams.has(line.id) ? 'collisionCamera: the world camera moves into the line'
        : lineEvents.some((e) => e.scope === 'in-line' && e.kind !== 'keep') ? 'collisionQ1: the line switches seat inside itself'
        : lineEvents.some((e) => e.material) ? 'collisionQ1: a world material move (3b) realises the line\'s switch'
        : c.seat?.box && (ctx.caps.protectedRegion ?? []).some((p) => boxesMeet(c.seat!.box!, p)) ? 'protectedRegion: the scale seat enters the world\'s protected regions'
        : conflict({ at: line.show, from: line.show, to: line.show, light: !!c.changesLight, composition: true, what: '', owner: boundaryOf(line.id) }, ctx.taken);
      if (why) { decide(c, false, why); continue; }
      const own = lineEvents.find((e) => e.scope !== 'in-line' && e.kind !== 'camera-reframe' && e.kind !== 'prop-beat');
      const id = c.id ?? `scale:${line.id}`;
      scaled.push({ id, from: line.show, to: line.end + 0.5 });
      // (the line's grow is this change of size: folded, its hold no longer stands on its own)
      const fold = folded ? `hold:${folded.kind}@${folded.lineId}` : undefined;
      if (folded) ctx.holds.splice(ctx.holds.indexOf(folded), 1);
      if (own && own.kind !== 'keep') {
        own.policy = [...(own.policy ?? []), id];
        if (fold) own.merged = [...(own.merged ?? []), fold];
        decide(c, true, `shares ${own.id} (one event, counted once)${fold ? `; folds ${fold}` : ''}`, { eventId: own.id, shared: true });
        continue;
      }
      const ev: WorldEvent = { id, lineIds: [line.id], kind: 'layout-seat', at: r3(line.show), from: r3(line.show), to: r3(line.show), seatBefore: own?.seatBefore ?? '', seatAfter: c.seatAfter ?? c.seat?.id ?? own?.seatAfter ?? '', ...(c.seat?.carrierId ? { carrierId: c.seat.carrierId } : {}), scope: own?.scope ?? 'line', changesLight: !!c.changesLight, reason: `Q3 ${c.reason}`, policy: [id], ...(fold ? { merged: [fold] } : {}) };
      if (own) ctx.events.splice(ctx.events.indexOf(own), 1, ev);
      else ctx.events.push(ev);
      ctx.taken.push({ at: line.show, from: line.show, to: line.show, light: !!c.changesLight, composition: true, what: `Q3 ${id}`, owner: boundaryOf(line.id) });
      decide(c, true, `${own ? `replaces ${own.id}'s keep as the line's switch` : 'the line\'s switch'}${fold ? `; folds ${fold}` : ''}`, { eventId: ev.id });
      continue;
    }
    // Q5: the whole window clear of every hold, handoff and cut, and of the moments approved before it
    const w = { from: c.from, to: c.to };
    const gap = (a: { from: number; to: number }) => w.from < a.to + ACTION_GAP && a.from < w.to + ACTION_GAP;
    const hold = ctx.holds.find((h) => gap(h));
    const hand = ctx.handoffs.find((h) => { const from = h.seam - (h.prepare ?? LINK_PREPARE); return gap({ from, to: from + h.dur }); });
    const cut = ctx.events.find((e) => e.kind !== 'keep' && gap(e));
    const prior = moments.find((m) => gap(m));
    // (the composition's rest and carrier reach past its ink box: any approved one up in the window keeps the moment off)
    const big = scaled.find((q) => q.from < w.to && w.from < q.to);
    const light = c.changesLight ? [...ctx.lights.map((l) => ({ at: l.at, what: l.what })), ...ctx.events.filter((e) => e.changesLight && e.kind !== 'keep').map((e) => ({ at: e.at, what: e.id }))].find((l) => Math.abs(l.at - c.at) < LIGHT_GAP) : undefined;
    const why = hold ? `collisionQ2hold: overlaps Q2 ${hold.kind} on ${hold.lineId} (${ACTION_GAP}s between actions)`
      : hand ? `collisionOther: overlaps Q4 ${hand.kind} into ${hand.lineId}`
      : cut ? `collisionOther: overlaps ${cut.policy?.length ? 'Q3' : 'Q1'} ${cut.id}`
      : prior ? `collisionOther: overlaps ${prior.what}`
      : big ? `collisionOther: the Q3 composition ${big.id} is up in its window`
      : light ? `collisionOther: light change within ${LIGHT_GAP}s of ${light.what}` : '';
    if (why) { decide(c, false, why); continue; }
    const id = c.id ?? `moment:${line.id}`;
    moments.push({ at: c.at, from: c.from, to: c.to, light: !!c.changesLight, composition: false, what: `Q5 ${id}` });
    ctx.taken.push({ at: c.at, from: c.from, to: c.to, light: !!c.changesLight, composition: false, what: `Q5 ${id}` });
    decide(c, true, 'clear of every protected window', { eventId: id });
  }
  return out;
}

/** Events that change seat, carrier or framing; `keep` never does. */
export const isCut = (e: WorldEvent) => e.kind !== 'keep';
/** A cut that moves where the words are read. */
export const isReadingSeatChange = (e: WorldEvent) => isCut(e) && e.seatBefore !== e.seatAfter && e.kind !== 'camera-reframe' && e.kind !== 'prop-beat';

/**
 * Plan-level composition cuts in a window: seat, carrier and framing transitions, the window's first frame excluded, one
 * count per switch point (two events within 50 ms are one cut, an event listed twice is one). Per 10 s; the plan's
 * own counts, not checked on any frame.
 */
export function countCuts(events: WorldEvent[], window: [number, number]) {
  const [a, b] = window;
  // (a hold-level beat, the receipt's feed, is never a plan cut: it counts only where a frame check sees it)
  const inside = [...new Map(events.filter((e) => isCut(e) && !e.holdLevel && e.at > a + 1 / 30 && e.at < b).map((e) => [e.id, e])).values()].sort((x, y) => x.at - y.at);
  const once = inside.filter((e, i) => i === 0 || e.at - inside[i - 1].at >= 0.05);
  const per10 = (n: number) => +((n * 10) / Math.max(1e-6, b - a)).toFixed(2);
  const seats = once.filter((e) => isReadingSeatChange(e) || inside.some((x) => x !== e && Math.abs(x.at - e.at) < 0.05 && isReadingSeatChange(x)));
  const byKind = once.reduce<Record<string, number>>((m, e) => ({ ...m, [e.kind]: (m[e.kind] ?? 0) + 1 }), {});
  // (plan-level counts: a switch is only "verified" once a frame check finds it drawn, measure-world-events.mts --frames)
  return { cuts: once.length, readingSeatChanges: seats.length, planCutsPer10: per10(once.length), planSeatChangesPer10: per10(seats.length), byKind, at: once.map((e) => e.at) };
}
