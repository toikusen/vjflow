// The song's one composition schedule (Q1, docs/research/2026-11-09-q1-codex.md §B): which lines keep their seat, which
// change it, where a page hands over, and the one switch a line may take inside itself at a word it really sings. Q2 holds
// and Q4 linked handoffs come in decided and are never moved; everything this adds is spaced round them. Pure and seeded:
// no DOM, no clock, the same input gives the same plan. Phase 1: nothing reads this yet (docs/research/2026-11-09-q1-phase1.md).
import { LINK_CLEAR, LINK_PREPARE } from './render/world-handoff';

export type CompositionFamily = 'layout-seat' | 'page-handoff' | 'carrier-swap' | 'camera-reframe' | 'ground-role' | 'prop-beat';
export type WorldEventKind = CompositionFamily | 'keep';
export type Mood = 'quiet' | 'build' | 'peak';

/** A box in frame fractions, y down. */
export interface FrameBox { x0: number; y0: number; x1: number; y1: number }

/** A place a line's words can be set: its box on the frame and what carries it (a card, a panel, the page itself). */
export interface SeatCandidate { id: string; box?: FrameBox; carrierId?: string; vertical?: boolean }

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
}

/** Q2's contract: a held line's one event, its whole window. */
export interface HoldEvent { lineId: string; at: number; from: number; to: number; kind: string }
/** Q4's contract: a linked page move into `lineId`; `seam` is when the words switch, `dur` the whole move. */
export interface HandoffCandidate { lineId: string; kind: string; dir: number; seam: number; dur: number; /** Defaults to LINK_PREPARE. */ prepare?: number; /** Defaults to true: a page change swaps a large area. */ changesLight?: boolean }
/** A prop accent the song's reading asked for (never a keyword): the only way a prop-beat is scheduled. */
export interface PropAccent { lineId: string; at: number; propId: string; reason: string }

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
  source?: 'declared' | 'derived';
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
  seed: number;
}

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
  scope: 'section' | 'line' | 'in-line';
  changesLight: boolean;
  reason: string;
  /** The world's own name for the move. */
  move?: string;
  /** Q2 holds folded into this event: one action, counted once. */
  merged?: string[];
  /** Taken as given (a Q4 handoff): never moved by the scheduler. */
  fixed?: boolean;
}

export interface RejectedCandidate { candidate: { lineId: string; kind: CompositionFamily; at: number; seatAfter?: string }; reason: string }

/** A protected input (Q2 or Q4) that breaks the spacing rules on its own: kept as given, reported for the measurement. */
export interface InputWarning { inputs: string[]; reason: string }

export interface WorldEventPlan { events: WorldEvent[]; holds: HoldEvent[]; rejected: RejectedCandidate[]; warnings: InputWarning[] }

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
const IN_LINE_ORDER: CompositionFamily[] = ['layout-seat', 'carrier-swap', 'camera-reframe'];
const DEFAULT_SEC: Record<CompositionFamily, number> = { 'layout-seat': 0, 'page-handoff': LINK_PREPARE + LINK_CLEAR, 'carrier-swap': 0.3, 'camera-reframe': 0.42, 'ground-role': 0.3, 'prop-beat': 0.4 };

const unit = (s: string) => ([...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261) >>> 0) / 2 ** 32;
const r3 = (x: number) => +x.toFixed(3);
const centre = (b: FrameBox) => [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
const overlaps = (a: FrameBox, b: FrameBox) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * Whether two seats are really two compositions: another carrier, another direction, or a box that moved or changed size
 * enough to be seen (8 % of the frame, a quarter of its size). Seats without boxes differ by id.
 */
export function seatsDiffer(a: SeatCandidate | undefined, b: SeatCandidate | undefined): boolean {
  if (!a || !b) return a?.id !== b?.id;
  if (a.id === b.id) return false;
  if ((a.carrierId ?? '') !== (b.carrierId ?? '') || !!a.vertical !== !!b.vertical) return true;
  if (!a.box || !b.box) return true;
  const [[ax, ay], [bx, by]] = [centre(a.box), centre(b.box)];
  const size = (x: FrameBox) => Math.max(1e-3, (x.x1 - x.x0) * (x.y1 - x.y0));
  const ratio = size(a.box) / size(b.box);
  return Math.hypot(ax - bx, ay - by) >= 0.08 || ratio >= 1.25 || ratio <= 0.8;
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

interface Action { at: number; from: number; to: number; light: boolean; composition: boolean; what: string; /** A light change only: no time of its own. */ lightOnly?: boolean }

/** Why `c` cannot stand among `taken`, or undefined. */
function conflict(c: Action, taken: Action[]): string | undefined {
  for (const a of taken) {
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
 * its carriers ask for one; then at most one switch inside the line, only at a word the line really sings, with
 * READ_STABLE of still reading either side. Light changes keep LIGHT_GAP across the whole song, switch points SEAM_GAP and
 * ACTION_GAP between actions; a Q4 handoff occupies its prepare and clear, a Q2 hold its whole window. Q2 and Q4 are
 * protected: a candidate that collides moves to another legal window or is dropped, with the reason in `rejected`. `keep`
 * is a normal outcome, a hold that falls inside a handoff is folded into it (one event), and page handoffs come from
 * section starts and carrier ends by energy, never from a rotation of families.
 */
export function planWorldEvents(input: WorldEventInput): WorldEventPlan {
  const { caps, seed } = input;
  const lines = [...input.lines].sort((a, b) => a.start - b.start);
  const allows = new Set(caps.kinds);
  const sec = (k: CompositionFamily) => caps.duration?.[k] ?? DEFAULT_SEC[k];
  const moods = moodsOf(input.sections);
  const sections = input.sections.map((s, i) => ({ ...s, mood: moods[i] })).sort((a, b) => a.start - b.start);
  const moodAt = (t: number) => [...sections].reverse().find((s) => s.start <= t + 1e-3)?.mood ?? sections[0]?.mood ?? 'build';
  const rejected: RejectedCandidate[] = [];
  const reject = (lineId: string, kind: CompositionFamily, at: number, reason: string, seatAfter?: string) => void rejected.push({ candidate: { lineId, kind, at: r3(at), ...(seatAfter ? { seatAfter } : {}) }, reason });
  const events: WorldEvent[] = [];
  const taken: Action[] = [];

  const warnings: InputWarning[] = [];
  // Q4 first: given, never moved; a hold wholly inside one is the same action
  const handoffs = [...(input.handoffs ?? [])].sort((a, b) => a.seam - b.seam);
  const handoffWindow = (h: HandoffCandidate) => ({ from: h.seam - (h.prepare ?? LINK_PREPARE), to: h.seam - (h.prepare ?? LINK_PREPARE) + h.dur });
  const q4Name = (h: HandoffCandidate) => `Q4 ${h.kind} into ${h.lineId}@${h.seam}`;
  const merged = new Map<HandoffCandidate, string[]>();
  const holds = (input.holds ?? []).filter((h) => {
    const into = handoffs.find((x) => { const w = handoffWindow(x); return h.from >= w.from - 1e-6 && h.to <= w.to + 1e-6; });
    if (into) {
      merged.set(into, [...(merged.get(into) ?? []), `hold:${h.kind}@${h.lineId}`]);
      return false;
    }
    // (a hold that only partly overlaps a handoff keeps its whole window: both stay protected, the clash is reported)
    const part = handoffs.find((x) => { const w = handoffWindow(x); return h.from < w.to && w.from < h.to; });
    if (part) warnings.push({ inputs: [`Q2 ${h.kind} on ${h.lineId}@${h.from}–${h.to}`, q4Name(part)], reason: 'hold partly overlaps a handoff window' });
    return true;
  });
  for (const [k, h] of handoffs.entries()) {
    const w = handoffWindow(h);
    const action: Action = { at: h.seam, ...w, light: h.changesLight ?? true, composition: true, what: q4Name(h) };
    const why = conflict(action, taken.filter((x, j) => j < k));
    if (why) warnings.push({ inputs: [q4Name(h)], reason: `Q4 inputs break spacing: ${why}` });
    taken.push(action);
  }
  for (const l of input.lights ?? []) taken.push({ at: l.at, from: l.at, to: l.at, light: true, composition: false, what: l.what, lightOnly: true });
  for (const h of holds) taken.push({ at: h.at, from: h.from, to: h.to, light: false, composition: false, what: `Q2 ${h.kind} on ${h.lineId}` });

  const seatOk = (s: SeatCandidate) => (!caps.seats.length || caps.seats.includes(s.id)) && !(s.box && caps.protectedRegion?.some((p) => overlaps(s.box!, p)));
  const isSectionStart = (i: number) => i > 0 && sections.some((s) => s.start > lines[i - 1].start + 1e-3 && lines[i].start >= s.start - 0.25);

  let seat: SeatCandidate | undefined;
  let run = 0;
  lines.forEach((line, i) => {
    const seats = line.seats.filter(seatOk);
    const own = seats.find((s) => s.id === line.seat) ?? seats[0];
    const mood = moodAt(line.start);
    const pace = MOOD_PACE[mood];
    const salt = (s: string) => unit(`${seed}:${line.id}:${s}`);
    const other = (from: SeatCandidate | undefined, pick: string) => {
      if (own && seatsDiffer(from, own)) return own;
      const pool = seats.filter((s) => seatsDiffer(from, s));
      return pool.length ? pool[Math.floor(salt(pick) * pool.length)] : undefined;
    };
    const push = (e: Omit<WorldEvent, 'id'>, action?: Action) => {
      events.push({ id: `${e.kind}:${line.id}:${events.filter((x) => x.lineIds[0] === line.id).length}`, ...e, at: r3(e.at), from: r3(e.from), to: r3(e.to) });
      if (action) taken.push(action);
    };
    const before = seat?.id ?? '';
    if (!own) {
      push({ lineIds: [line.id], kind: 'keep', at: line.show, from: line.show, to: line.show, seatBefore: before, seatAfter: before, scope: 'line', changesLight: false, reason: 'no approved seat for this line: it stays as composed' });
      return;
    }
    if (!seat) {
      seat = own;
      push({ lineIds: [line.id], kind: 'keep', at: line.show, from: line.show, to: line.show, seatBefore: before, seatAfter: seat.id, scope: 'line', changesLight: false, reason: 'the first composition is not a cut' });
    } else {
      const q4 = handoffs.find((h) => h.lineId === line.id);
      const sectionStart = isSectionStart(i);
      if (q4) {
        const next = other(seat, 'q4') ?? seat;
        const w = handoffWindow(q4);
        push({ lineIds: [lines[i - 1].id, line.id], kind: 'page-handoff', at: q4.seam, ...w, seatBefore: before, seatAfter: next.id, carrierId: next.carrierId, scope: sectionStart ? 'section' : 'line', changesLight: q4.changesLight ?? true, reason: `Q4 ${q4.kind} (protected)`, fixed: true, ...(merged.get(q4) ? { merged: merged.get(q4) } : {}) });
        seat = next;
        run += 1;
      } else boundary(line, i, sectionStart);
    }
    inLine(line, mood);

    /** The line boundary: keep, reseat, or a full page handoff where the song's shape asks for one. */
    function boundary(l: WorldEventLine, k: number, sectionStart: boolean) {
      const keep = (reason: string) => { run = 0; push({ lineIds: [l.id], kind: 'keep', at: l.show, from: l.show, to: l.show, seatBefore: before, seatAfter: before, scope: sectionStart ? 'section' : 'line', changesLight: false, reason }); };
      if (l.end - l.start < SHORT_LINE) return keep(`short line (${(l.end - l.start).toFixed(2)}s < ${SHORT_LINE}s): words switch on time`);
      const target = other(seat, 'seat');
      const carrierEnd = !!target && (target.carrierId ?? '') !== (seat!.carrierId ?? '');
      const wants = sectionStart || (run < pace.run && salt('reseat') < pace.reseat);
      if (!wants) return keep(run >= pace.run ? `${run} switch(es) in a row: this line keeps (${mood})` : `keep (${mood})`);
      const prev = lines[k - 1];
      const tries: { kind: CompositionFamily; at: number; from: number; to: number; seat: SeatCandidate; reason: string }[] = [];
      const pageWhy = sectionStart ? 'section start' : carrierEnd ? 'carrier ends' : '';
      if (allows.has('page-handoff') && target && pageWhy && pace.pages.includes(sectionStart ? 'section' : 'carrier')) {
        if (prev.end - prev.start >= HANDOFF_UP) tries.push({ kind: 'page-handoff', at: l.show, from: l.show - LINK_PREPARE, to: l.show - LINK_PREPARE + sec('page-handoff'), seat: target, reason: `${pageWhy} (${mood})` });
        else reject(l.id, 'page-handoff', l.show, `line before up ${(prev.end - prev.start).toFixed(2)}s < ${HANDOFF_UP}s`, target.id);
      }
      if (allows.has('layout-seat') && target) for (const at of [...new Set([l.show, l.start])]) tries.push({ kind: 'layout-seat', at, from: at, to: at + sec('layout-seat'), seat: target, reason: `${sectionStart ? 'section start' : 'reseat'} (${mood})` });
      if (sectionStart && !target) {
        for (const kind of ['camera-reframe', 'ground-role'] as const) if (allows.has(kind)) tries.push({ kind, at: l.show, from: l.show, to: l.show + sec(kind), seat: seat!, reason: `section start, no other seat (${mood})` });
      }
      for (const t of tries) {
        const light = LIGHT_KINDS.has(t.kind) || (t.kind === 'layout-seat' && (t.seat.carrierId ?? '') !== (seat!.carrierId ?? ''));
        const why = conflict({ at: t.at, from: t.from, to: t.to, light, composition: true, what: '' }, taken);
        if (why) { reject(l.id, t.kind, t.at, why, t.seat.id); continue; }
        push({ lineIds: t.kind === 'page-handoff' ? [prev.id, l.id] : [l.id], kind: t.kind, at: t.at, from: t.from, to: t.to, seatBefore: before, seatAfter: t.seat.id, carrierId: t.seat.carrierId, scope: sectionStart ? 'section' : 'line', changesLight: light, reason: t.reason, ...(caps.moves?.[t.kind] ? { move: caps.moves[t.kind] } : {}) }, { at: t.at, from: t.from, to: t.to, light, composition: true, what: `${t.kind} into ${l.id}` });
        seat = t.seat;
        run += 1;
        return;
      }
      keep(target || sectionStart ? 'every switch here collides: kept (see rejected)' : 'no other seat fits this line');
    }

    /** The one switch inside a line, at a word break it really sings, read still either side. */
    function inLine(l: WorldEventLine, m: Mood) {
      const kinds = IN_LINE_ORDER.filter((k) => allows.has(k));
      if (!kinds.length || l.end - l.start < MOOD_PACE[m].inLine) return;
      if (!l.words || l.words.length < 2) {
        reject(l.id, kinds[0], (l.start + l.end) / 2, 'no reliable word boundary: no in-line switch (none faked by time)');
        return;
      }
      const settled = Math.max(l.start, ...events.filter((e) => e.lineIds.includes(l.id) && e.kind !== 'keep').map((e) => e.to));
      const mid = (l.start + l.end) / 2;
      const near = (t: number) => [...input.beats, ...(input.downbeats ?? [])].some((b) => Math.abs(b - t) <= BEAT_SNAP);
      const breaks = l.words.slice(1).map((w) => w.from).filter((b) => b > l.start && b < l.end).sort((a, b) => Number(near(b)) - Number(near(a)) || Math.abs(a - mid) - Math.abs(b - mid) || unit(`${seed}:${l.id}:${a}`) - unit(`${seed}:${l.id}:${b}`));
      if (!breaks.length) {
        reject(l.id, kinds[0], mid, 'no sung word break inside the line');
        return;
      }
      for (const kind of kinds) {
        const target = kind === 'camera-reframe' ? seat : kind === 'carrier-swap' ? l.seats.filter(seatOk).find((s) => (s.carrierId ?? '') !== (seat?.carrierId ?? '')) : other(seat, 'in-line');
        if (!target) continue;
        const light = LIGHT_KINDS.has(kind) || (kind === 'layout-seat' && (target.carrierId ?? '') !== (seat?.carrierId ?? ''));
        let last = '';
        for (const b of breaks) {
          const to = b + sec(kind);
          if (b - settled < READ_STABLE || l.end - to < READ_STABLE) { last = `less than ${READ_STABLE}s of still reading round ${b.toFixed(2)}`; continue; }
          const why = conflict({ at: b, from: b, to, light, composition: true, what: '' }, taken);
          if (why) { last = why; continue; }
          push({ lineIds: [l.id], kind, at: b, from: b, to, seatBefore: seat?.id ?? '', seatAfter: target.id, carrierId: target.carrierId, scope: 'in-line', changesLight: light, reason: `word break${near(b) ? ' on a beat' : ''} (${m})`, ...(caps.moves?.[kind] ? { move: caps.moves[kind] } : {}) }, { at: b, from: b, to, light, composition: true, what: `in-line ${kind} on ${l.id}` });
          seat = target;
          return;
        }
        if (last) reject(l.id, kind, mid, last);
        return;
      }
      reject(l.id, kinds[0], mid, `no family target: no other seat, carrier or framing for ${kinds.join('/')}`);
    }
  });

  if (allows.has('prop-beat'))
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
  return { events, holds, rejected, warnings };
}

/** Events that change seat, carrier or framing; `keep` never does. */
export const isCut = (e: WorldEvent) => e.kind !== 'keep';
/** A cut that moves where the words are read. */
export const isReadingSeatChange = (e: WorldEvent) => isCut(e) && e.seatBefore !== e.seatAfter && e.kind !== 'camera-reframe' && e.kind !== 'prop-beat';

/**
 * Plan-level composition cuts in a window: seat, carrier and framing transitions, the window's first frame excluded, one
 * count per switch point (two events within 50 ms are one cut, an event listed twice is one). Per 10 s.
 */
export function countCuts(events: WorldEvent[], window: [number, number]) {
  const [a, b] = window;
  const inside = [...new Map(events.filter((e) => isCut(e) && e.at > a + 1 / 30 && e.at < b).map((e) => [e.id, e])).values()].sort((x, y) => x.at - y.at);
  const once = inside.filter((e, i) => i === 0 || e.at - inside[i - 1].at >= 0.05);
  const per10 = (n: number) => +((n * 10) / Math.max(1e-6, b - a)).toFixed(2);
  const seats = once.filter((e) => isReadingSeatChange(e) || inside.some((x) => x !== e && Math.abs(x.at - e.at) < 0.05 && isReadingSeatChange(x)));
  const byKind = once.reduce<Record<string, number>>((m, e) => ({ ...m, [e.kind]: (m[e.kind] ?? 0) + 1 }), {});
  return { cuts: once.length, readingSeatChanges: seats.length, verifiedCompositionCutsPer10: per10(once.length), readingSeatChangesPer10: per10(seats.length), byKind };
}
