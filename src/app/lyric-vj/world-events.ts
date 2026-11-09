// The song's one composition schedule (Q1, docs/research/2026-11-09-q1-codex.md §B): which lines keep their seat, which
// change it, where a page hands over, and the one switch a line may take inside itself at a word it really sings. Q2 holds
// and Q4 linked handoffs come in decided and are never moved; everything this adds is spaced round them. Pure and seeded:
// no DOM, no clock, the same input gives the same plan. Phase 2 (docs/research/2026-11-09-q1-phase2.md): free-plan.ts runs
// it once a song on the composer's plan and the renderer draws only what it approves (world-events-apply.ts).
import { LINK_CLEAR, LINK_PREPARE } from './render/world-handoff';
import { anchorMove, boxesMeet, centreMove, SEEN, type FracBox } from './render/seat-geometry';

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
  /** Where a switch inside the line may fall (a hold's own room kept, Q2) and the seats it may take; anywhere, any seat when unset. */
  inLine?: { spans: [number, number][]; seats?: string[] };
  /** Changes of seat inside the line that come decided (an older world's own repose): kept as given, counted once. */
  given?: { at: number; seat: string; reason: string }[];
  /**
   * When the line's entrance has landed (its show plus the longest its entrance can take): the still reading before a
   * switch inside it is counted from here, never from its start while the words may still be coming in.
   */
  settled?: number;
}

/** Q2's contract: a held line's one event, its whole window. */
export interface HoldEvent { lineId: string; at: number; from: number; to: number; kind: string }
/** Q4's contract: a linked page move into `lineId`; `seam` is when the words switch, `dur` the whole move. */
export interface HandoffCandidate { lineId: string; kind: string; dir: number; seam: number; dur: number; /** Defaults to LINK_PREPARE. */ prepare?: number; /** Defaults to true: a page change swaps a large area. */ changesLight?: boolean }
/** A prop accent the song's reading asked for (never a keyword): the only way a prop-beat is scheduled. */
export interface PropAccent { lineId: string; at: number; propId: string; reason: string }
/** The world camera's move into a part the composer laid (world-cam.ts): a reframe of the line it opens, kept as given. */
export interface CameraMove { lineId: string; at: number; sec: number; kind: string }

export type EventScope = 'section' | 'line' | 'in-line';
/** Where each family may fall unless the world says otherwise: inside a line only a reseat on the same carrier (no carrier is taken from under words being read), a camera only into a part (no camera beats of its own, Codex cap ruling). */
export const DEFAULT_ALLOWED_AT: Record<CompositionFamily, EventScope[]> = { 'layout-seat': ['section', 'line', 'in-line'], 'page-handoff': ['section', 'line'], 'carrier-swap': ['section', 'line'], 'camera-reframe': ['section'], 'ground-role': ['section'], 'prop-beat': ['in-line'] };

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
   * Candidates other policies propose (Q3 scale contrast, Q5 moments), each with its own window, to be arbitrated with
   * everything above by the same clocks. A slot only for now: the scheduler does not read it yet (2026-11-09 phase 2).
   */
  candidates?: PolicyCandidate[];
  seed: number;
}

/** A switch another policy proposes to the scheduler: where, how long, onto which seat, and why. */
export interface PolicyCandidate { source: 'Q3' | 'Q5' | (string & {}); lineId: string; kind: CompositionFamily; at: number; from: number; to: number; seatAfter?: string; changesLight?: boolean; reason: string }

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
}

export interface RejectedCandidate { candidate: { lineId: string; kind: CompositionFamily; at: number; seatAfter?: string }; reason: string }

/** A protected input (Q2 or Q4) that breaks the spacing rules on its own: kept as given, reported for the measurement. */
export interface InputWarning { inputs: string[]; reason: string }

/** A Q2 hold a scheduled world moved off a Q4 handoff it partly overlapped: to the nearest legal beat, or dropped (`to` null). */
export interface HoldMove { lineId: string; kind: string; from: number; to: number | null; reason: string }
export interface WorldEventPlan { events: WorldEvent[]; holds: HoldEvent[]; rejected: RejectedCandidate[]; warnings: InputWarning[]; holdMoves?: HoldMove[] }
/** What a treatment carries of the plan (treatment.ts worldEvents): the events, the holds standing on their own, the input warnings and how many candidates were refused. */
export interface WorldEventTable { events: WorldEvent[]; holds: HoldEvent[]; warnings: InputWarning[]; rejected: number; source: WorldCompositionCaps['source']; holdMoves?: HoldMove[] }

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
const BEAT_SNAP = 0.12;
/** A full page handoff needs the line before up at least this long (world-handoff.ts pickWorldMoves). */
const HANDOFF_UP = LINK_PREPARE + 0.5;

/**
 * How each part of the song spends its switches: how often a line boundary reseats, how many in a row before one keeps,
 * how long a line must be for a switch inside it, and where a full page may hand over. Proposal values (Codex D), not yet
 * measured on video.
 */
export const MOOD_PACE: Record<Mood, { reseat: number; run: number; inLine: number; pages: ('section' | 'carrier')[] }> = {
  quiet: { reseat: 0.3, run: 1, inLine: 3.2, pages: ['section'] },
  build: { reseat: 0.55, run: 2, inLine: 1.8, pages: ['section', 'carrier'] },
  peak: { reseat: 0.75, run: 3, inLine: 1.3, pages: ['section', 'carrier'] },
};

const LIGHT_KINDS = new Set<WorldEventKind>(['page-handoff', 'carrier-swap', 'ground-role']);
const IN_LINE_ORDER: CompositionFamily[] = ['layout-seat', 'carrier-swap', 'camera-reframe', 'ground-role'];
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

interface Action { at: number; from: number; to: number; light: boolean; composition: boolean; what: string; /** A light change only: no time of its own. */ lightOnly?: boolean; /** One line's way in: its seat, its handoff and its camera are one switch, never a clash with each other. */ owner?: string }

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
    // end and ACTION_GAP before the next line shows, or is dropped (Codex cap ruling: 改選合法拍點或取消)
    const k = lines.findIndex((l) => l.id === h.lineId);
    const line = lines[k];
    const sec = h.to - h.from;
    const endBy = line ? Math.min(line.end, (lines[k + 1]?.show ?? Infinity) - ACTION_GAP) : -Infinity;
    const at = line ? [...input.beats, ...(input.downbeats ?? [])].filter((b) => b >= line.start && b + sec <= endBy && !clash({ from: b, to: b + sec })).sort((a, b) => Math.abs(a - h.at) - Math.abs(b - h.at))[0] : undefined;
    holdMoves.push({ lineId: h.lineId, kind: h.kind, from: h.at, to: at === undefined ? null : r3(at), reason: `partly overlapped ${q4Name(part)}` });
    if (at === undefined) return false;
    Object.assign(h, { at: r3(at), from: r3(at), to: r3(at + sec) });
    return true;
  });
  for (const [k, h] of handoffs.entries()) {
    const w = handoffWindow(h);
    const action: Action = { at: h.seam, ...w, light: h.changesLight ?? true, composition: true, what: q4Name(h), owner: boundaryOf(h.lineId) };
    const why = conflict(action, taken.filter((x, j) => j < k));
    if (why) warnings.push({ inputs: [q4Name(h)], reason: `Q4 inputs break spacing: ${why}` });
    taken.push(action);
  }
  for (const l of input.lights ?? []) taken.push({ at: l.at, from: l.at, to: l.at, light: true, composition: false, what: l.what, lightOnly: true });
  for (const h of holds) taken.push({ at: h.at, from: h.from, to: h.to, light: false, composition: false, what: `Q2 ${h.kind} on ${h.lineId}` });
  // the composer's camera moves into parts, a pinned line's way in and given reposes: decided before anything optional
  const cams = new Map((input.cams ?? []).map((c) => [c.lineId, c]));
  for (const c of cams.values()) taken.push({ at: c.at, from: c.at, to: c.at + c.sec, light: false, composition: true, what: `world camera ${c.kind} into ${c.lineId}`, owner: boundaryOf(c.lineId) });
  for (const [i, l] of lines.entries()) {
    if (i > 0 && l.pinned) taken.push({ at: l.show, from: l.show, to: l.show, light: false, composition: true, what: `${l.id}'s composed seat`, owner: boundaryOf(l.id) });
    for (const g of l.given ?? []) taken.push({ at: g.at, from: g.at, to: g.at, light: false, composition: true, what: `${l.id}'s given repose`, owner: `given:${l.id}@${g.at}` });
  }

  // (a seat's words keep off the world's protected regions and, for a seat the scheduler adds on a page, off that page's
  // graphics, by the box they are really laid in)
  const seatOk = (s: SeatCandidate) => (!caps.seats.length || caps.seats.includes(s.id)) && !(s.box && [...(caps.protectedRegion ?? []), ...(s.protect ?? [])].some((p) => boxesMeet(s.box!, p)));
  const isSectionStart = (i: number) => i > 0 && sections.some((s) => s.start > lines[i - 1].start + 1e-3 && lines[i].start >= s.start - 0.25);

  let seat: SeatCandidate | undefined;
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
      events.push({ id: `${e.kind}:${line.id}:${events.filter((x) => x.lineIds[0] === line.id).length}`, ...e, at: r3(e.at), from: r3(e.from), to: r3(e.to) });
      if (action) taken.push(action);
    };
    const before = seat?.id ?? '';
    const sectionStart = isSectionStart(i);
    const scope: EventScope = sectionStart ? 'section' : 'line';
    const cam = cams.get(line.id);
    // (between two pages the light that changes is the page's own ground cut, already among `lights`: not a second one)
    const lightOf = (to: SeatCandidate) => (to.carrierId ?? '') !== (seat?.carrierId ?? '') && !(to.paged && seat?.paged);
    const atIn = events.length;
    if (!own) {
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
        } else {
          push({ lineIds: [line.id], kind: 'keep', at: line.show, from: line.show, to: line.show, seatBefore: before, seatAfter: own.id, scope, changesLight: false, reason: `composed seat is the same composition (${line.pinned})` });
          run = 0;
        }
        seat = own;
      } else boundary(line, i, sectionStart);
    }
    // the world camera's move into the part this line opens: its own reframe, or one switch with the seat change it rides
    if (cam && i > 0) {
      const here = events.slice(atIn).find((e) => e.kind !== 'keep');
      if (here) here.camera = cam.kind;
      else push({ lineIds: [line.id], kind: 'camera-reframe', at: cam.at, from: cam.at, to: cam.at + cam.sec, seatBefore: seat?.id ?? '', seatAfter: seat?.id ?? '', scope: 'section', changesLight: false, reason: `world camera ${cam.kind} (composed)`, fixed: true, ...(caps.moves?.['camera-reframe'] ? { move: caps.moves['camera-reframe'] } : {}) });
    }
    if (line.given?.length) {
      for (const g of line.given) {
        const to = line.seats.find((s) => s.id === g.seat) ?? { id: g.seat };
        if (!seatsDiffer(seat, to)) { seat = to; continue; }
        push({ lineIds: [line.id], kind: 'layout-seat', at: g.at, from: g.at, to: g.at, seatBefore: seat?.id ?? '', seatAfter: to.id, carrierId: to.carrierId, scope: 'in-line', changesLight: lightOf(to), reason: g.reason, fixed: true });
        seat = to;
      }
    } else if (own) inLine(line, mood);

    /** The line boundary: keep, reseat, or a full page handoff where the song's shape asks for one. */
    function boundary(l: WorldEventLine, k: number, sectionStart: boolean) {
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
      // (the composer's own change of set stands while the part's run allows; the scheduler adds one by the part's pace)
      const wants = sectionStart || (run < pace.run && ((!!own && seatOk(own) && seatsDiffer(seat, own)) || salt('reseat') < pace.reseat));
      if (!wants) return keep(run >= pace.run ? `${run} switch(es) in a row: this line keeps (${mood})` : `keep (${mood})`);
      const prev = lines[k - 1];
      const tries: { kind: CompositionFamily; at: number; from: number; to: number; seat: SeatCandidate; reason: string }[] = [];
      const pageWhy = sectionStart ? 'section start' : carrierEnd ? 'carrier ends' : '';
      // (a full page handoff of the scheduler's own only where the part's pace asks for a switch, never because the
      // composer changed set: rule 11, not every line a full exit and entrance)
      const pageWants = sectionStart || salt('reseat') < pace.reseat;
      if (caps.ownPages && pageWants && at('page-handoff', scope) && target && pageWhy && pace.pages.includes(sectionStart ? 'section' : 'carrier')) {
        if (prev.end - prev.start >= HANDOFF_UP) tries.push({ kind: 'page-handoff', at: l.show, from: l.show - LINK_PREPARE, to: l.show - LINK_PREPARE + sec('page-handoff'), seat: target, reason: `${pageWhy} (${mood})` });
        else reject(l.id, 'page-handoff', l.show, `line before up ${(prev.end - prev.start).toFixed(2)}s < ${HANDOFF_UP}s`, target.id);
      }
      const seatKind: CompositionFamily | undefined = target && carrierEnd && at('carrier-swap', scope) ? 'carrier-swap' : at('layout-seat', scope) ? 'layout-seat' : undefined;
      // (a reseat falls on the line's show, the frame its set is drawn from: no later time the renderer would not keep)
      if (seatKind && target) for (const t of [l.show]) tries.push({ kind: seatKind, at: t, from: t, to: t + sec(seatKind), seat: target, reason: `${sectionStart ? 'section start' : 'reseat'} (${mood})` });
      if (sectionStart && !target && at('ground-role', scope)) tries.push({ kind: 'ground-role', at: l.show, from: l.show, to: l.show + sec('ground-role'), seat: seat!, reason: `section start, no other seat (${mood})` });
      for (const t of tries) {
        const light = LIGHT_KINDS.has(t.kind) || lightOf(t.seat);
        const why = conflict({ at: t.at, from: t.from, to: t.to, light, composition: true, what: '', owner: boundaryOf(l.id) }, taken);
        if (why) { reject(l.id, t.kind, t.at, why, t.seat.id); continue; }
        push({ lineIds: t.kind === 'page-handoff' ? [prev.id, l.id] : [l.id], kind: t.kind, at: t.at, from: t.from, to: t.to, seatBefore: before, seatAfter: t.seat.id, carrierId: t.seat.carrierId, scope, changesLight: light, reason: t.reason, ...(caps.moves?.[t.kind] ? { move: caps.moves[t.kind] } : {}) }, { at: t.at, from: t.from, to: t.to, light, composition: true, what: `${t.kind} into ${l.id}`, owner: boundaryOf(l.id) });
        seat = t.seat;
        run += 1;
        return;
      }
      keep(target || sectionStart ? 'every switch here collides: kept (see rejected)' : 'no other seat fits this line');
    }

    /** The one switch inside a line, at a word break it really sings, read still either side, on the carrier it is read on. */
    function inLine(l: WorldEventLine, m: Mood) {
      const kinds = IN_LINE_ORDER.filter((k) => at(k, 'in-line'));
      if (!kinds.length || l.end - l.start < MOOD_PACE[m].inLine) return;
      if (holdMoves.some((x) => x.lineId === l.id)) return reject(l.id, kinds[0], (l.start + l.end) / 2, 'its hold was moved off a handoff: its room is not re-read, no in-line switch');
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
      // (the words keep what they are read on: a reseat inside a line stays on its carrier, Codex A carrier-swap)
      const pool = seats.filter((s) => (s.carrierId ?? '') === (seat?.carrierId ?? '') && (!l.inLine?.seats || l.inLine.seats.includes(s.id)) && seatsDiffer(seat, s));
      for (const kind of kinds) {
        const target = pool.length ? pool[Math.floor(salt('in-line') * pool.length)] : undefined;
        if (!target) continue;
        let last = '';
        for (const b of breaks) {
          const to = b + sec(kind);
          if (b - settled < READ_STABLE || l.end - to < READ_STABLE) { last = `less than ${READ_STABLE}s of still reading round ${b.toFixed(2)}`; continue; }
          if (!inRoom(b, to)) { last = `${b.toFixed(2)} is inside the room its hold keeps (Q2)`; continue; }
          const why = conflict({ at: b, from: b, to, light: false, composition: true, what: '' }, taken);
          if (why) { last = why; continue; }
          push({ lineIds: [l.id], kind, at: b, from: b, to, seatBefore: seat?.id ?? '', seatAfter: target.id, carrierId: target.carrierId, scope: 'in-line', changesLight: false, reason: `word break${near(b) ? ' on a beat' : ''} (${m})`, ...(caps.moves?.[kind] ? { move: caps.moves[kind] } : {}) }, { at: b, from: b, to, light: false, composition: true, what: `in-line ${kind} on ${l.id}` });
          seat = target;
          return;
        }
        if (last) reject(l.id, kind, mid, last);
        return;
      }
      reject(l.id, kinds[0], mid, `no family target: no other seat on the same carrier for ${kinds.join('/')}`);
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
  events.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  return { events, holds, rejected, warnings, ...(holdMoves.length ? { holdMoves } : {}) };
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
  const inside = [...new Map(events.filter((e) => isCut(e) && e.at > a + 1 / 30 && e.at < b).map((e) => [e.id, e])).values()].sort((x, y) => x.at - y.at);
  const once = inside.filter((e, i) => i === 0 || e.at - inside[i - 1].at >= 0.05);
  const per10 = (n: number) => +((n * 10) / Math.max(1e-6, b - a)).toFixed(2);
  const seats = once.filter((e) => isReadingSeatChange(e) || inside.some((x) => x !== e && Math.abs(x.at - e.at) < 0.05 && isReadingSeatChange(x)));
  const byKind = once.reduce<Record<string, number>>((m, e) => ({ ...m, [e.kind]: (m[e.kind] ?? 0) + 1 }), {});
  // (plan-level counts: a switch is only "verified" once a frame check finds it drawn, measure-world-events.mts --frames)
  return { cuts: once.length, readingSeatChanges: seats.length, planCutsPer10: per10(once.length), planSeatChangesPer10: per10(seats.length), byKind, at: once.map((e) => e.at) };
}
