// How a world's line comes in and goes out linked to the lines round it (2026-11-09, Q4 in
// docs/research/2026-11-09-rhythm-gaps-codex.md, reworked after -handoff-codex.md): which way in and out a line takes,
// chosen from the pool its world's material allows and the time the song leaves, and the page moves laid on the world's
// sections between two linked lines (motion-transition.ts link-*). The words never move: they switch on time.
import { linksOf } from '../world-shared';
import { familyOf, linkKind, SHARED_ENTER_POOL, SHARED_EXIT_POOL } from './world-motion';

interface TimedCue { start: number; end: number }

export interface MoveState { used: Map<string, number>; oldIn: Map<string, number>; oldOut: Map<string, number>; lastEnter: string; lastExit: { kind: string; end: number }; relay?: string }
export const moveState = (): MoveState => ({ used: new Map(), oldIn: new Map(), oldOut: new Map(), lastEnter: '', lastExit: { kind: '', end: -9 } });

interface WorldPick { id: string; ownMoves?: boolean; enters?: string[]; exits?: string[] }

const hash = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

/**
 * The least used of `pool` by family, a family other than `last` where there is one; between equals, by a hash of the
 * line, so the order is no fixed rotation.
 */
export function leastUsedFamily(pool: string[], used: Map<string, number>, last: string, salt: string, prefix = '') {
  const kinds = [...new Set(pool)];
  const fresh = kinds.filter((k) => familyOf(k) !== familyOf(last));
  const from = fresh.length ? fresh : kinds;
  const count = (k: string) => used.get(`${prefix}${familyOf(k)}`) ?? 0;
  const low = Math.min(...from.map(count));
  const ties = from.filter((k) => count(k) === low);
  return ties[hash(`${salt}:${ties.join(',')}`) % ties.length];
}
/** The composer's rule before linked families (lineplan-core.ts, 404d73f): the least used kind, the first of equals. */
const leastUsedKind = (pool: string[], used: Map<string, number>) => [...pool].sort((a, b) => (used.get(a) ?? 0) - (used.get(b) ?? 0))[0];

const LINKED = new Set(['edge-relay', 'layer-seat', 'frame-open']);
export const isLinked = (kind?: string) => !!kind && LINKED.has(familyOf(kind));
/** The time a page move takes before the words switch and after, s. */
export const LINK_PREPARE = 0.25;
export const LINK_CLEAR = 0.35;
/** A line's exit is over this long before the next line shows (engine exitAt); a world's erase ends as early (world-events). */
export const EXIT_LEAD = 0.02;

/**
 * A world line's way in and out (the composer's pick, lineplan-core.ts). A world whose material allows no linked family
 * keeps the composer's old rule exactly. Otherwise the pool is first narrowed to what can be drawn: a linked way in only
 * after a line that was up long enough for the next page to come on beside it, a linked way out only before another line,
 * a frame-open way in never alone (a page cannot fold open under words being read); then the least used family is taken.
 * A line after one pressed into a rule opens out of it; a line after a linked way out comes on by the same family, so the
 * last line's page hands over to the next.
 */
export function pickWorldMoves(state: MoveState, world: WorldPick, own: { enter: string; exit: string }, cues: TimedCue[], at: number, seed: number) {
  const [prev, c, next] = [cues[at - 1], cues[at], cues[at + 1]];
  const taste = linksOf(world.id);
  const linked: string[] = world.ownMoves ? [] : taste.families.map((f) => linkKind(f, taste));
  const handedRule = !world.ownMoves && state.lastExit.kind === 'squash-line' && c.start - state.lastExit.end < 0.8;
  const enterBase = [own.enter, ...(world.enters ?? []), ...(world.ownMoves ? [] : SHARED_ENTER_POOL)];
  const exitBase = [own.exit, ...(world.exits ?? []), ...(world.ownMoves ? [] : SHARED_EXIT_POOL)];
  if (!linked.length) {
    const [ins, outs] = [state.oldIn, state.oldOut];
    const enter = handedRule ? 'line-open' : leastUsedKind(enterBase, ins);
    const exit = leastUsedKind(exitBase, outs);
    ins.set(enter, (ins.get(enter) ?? 0) + 1);
    outs.set(exit, (outs.get(exit) ?? 0) + 1);
    state.lastEnter = enter;
    state.lastExit = { kind: exit, end: c.end };
    return { enter, exit };
  }
  const salt = `${seed}:${at}`;
  const upLongEnough = !!prev && prev.end - prev.start >= LINK_PREPARE + 0.5;
  // (a page folding away to its hinge is the last line's way out only: the next takes no linked way in after it)
  const folded = familyOf(state.relay ?? '') === 'frame-open';
  const handed = state.relay && !folded && linked.includes(state.relay) && upLongEnough ? state.relay : undefined;
  const enterPool = [...enterBase, ...(upLongEnough && !folded ? linked.filter((k) => familyOf(k) !== 'frame-open') : [])];
  const enter = handedRule ? 'line-open' : handed ?? leastUsedFamily(enterPool, state.used, state.lastEnter, `${salt}:in`, 'in:');
  const exitPool = [...exitBase, ...(next && c.end - c.start >= LINK_PREPARE + 0.5 ? linked : [])];
  const exit = leastUsedFamily(exitPool, state.used, state.lastExit.kind, `${salt}:out`, 'out:');
  for (const k of [`in:${familyOf(enter)}`, `out:${familyOf(exit)}`]) state.used.set(k, (state.used.get(k) ?? 0) + 1);
  state.lastEnter = enter;
  state.lastExit = { kind: exit, end: c.end };
  state.relay = isLinked(exit) ? exit : undefined;
  return { enter, exit };
}

/** A section a page change can run on, as render/graphics.ts keeps them. */
interface LinkSection { start: number; transition?: { kind: string; dur?: number; dir?: number; seam?: number }; layers?: { t0?: number }[] }
export interface GroundLine { id: string; show: number; start: number; shot: string; world?: { enter: string; exit: string }; handoff?: boolean }

/**
 * The page move between a line and the one before (motion-transition.ts link-*), and its mode: both pages move (0), only
 * the next comes on (1), only the last goes off (-1). None where the two share a shot, either carries a handoff of its
 * own, or the move would be a frame-open coming on alone (nothing to fold away before the words are read).
 */
export function groundLink(prev: GroundLine | undefined, line: GroundLine) {
  if (!prev || !line.world || line.handoff || prev.handoff || prev.shot === line.shot) return undefined;
  const leave = prev.world && isLinked(prev.world.exit) ? prev.world.exit : undefined;
  const arrive = isLinked(line.world.enter) ? line.world.enter : undefined;
  const lead = arrive ?? leave;
  if (!lead) return undefined;
  const fam = familyOf(lead);
  const both = !!arrive && !!leave && familyOf(leave) === fam;
  const dir = both ? 0 : arrive ? 1 : -1;
  if (fam === 'frame-open' && dir === 1) return undefined;
  const kind = fam === 'edge-relay' ? (lead.endsWith('.y') ? 'link-relay-y' : 'link-relay-x') : fam === 'frame-open' ? (lead.endsWith('.top') ? 'link-open-top' : 'link-open-left') : 'link-seat';
  return { kind, dir, carriesIn: dir >= 0, carriesOut: dir <= 0 };
}

/**
 * Lays the linked page moves on the world's sections (render/engine.ts, once a song): the section a line's shot opens
 * starts LINK_PREPARE before the line shows, so its page can come on beside the last line's words, and runs LINK_CLEAR
 * on; `seam` is the time in it the words switch. A boundary with no such time (the last line shown too briefly, or a
 * section too close before) keeps its plain cut. Returns the boundaries laid, by the next line's id. Given `approved`
 * (the Q1 scheduler's table, world-events.ts), it only realises the handoffs that table holds: a boundary it did not
 * approve keeps its plain cut, so no page move runs that the song's one event plan does not count.
 */
export function linkGrounds(sections: LinkSection[], lines: GroundLine[], approved?: Set<string>) {
  const laid: { id: string; kind: string; dir: number }[] = [];
  lines.forEach((line, i) => {
    const link = groundLink(lines[i - 1], line);
    if (!link || (approved && !approved.has(line.id))) return;
    const j = sections.findIndex((s, k) => k > 0 && s.start >= line.show - 0.06 && s.start <= line.start + 0.06);
    if (j < 0) return;
    const start = sections[j].start - LINK_PREPARE;
    if (sections[j - 1].start > start - 0.1 || lines[i - 1].show > start) return;
    const seam = sections[j].start;
    sections[j].start = start;
    sections[j].transition = { kind: link.kind, dur: LINK_PREPARE + LINK_CLEAR, dir: link.dir, seam: LINK_PREPARE };
    // (the new page's own arrival runs from the switch, not from the first sliver of it)
    if (sections[j].layers) sections[j].layers = sections[j].layers!.map((l) => (l.t0 === undefined ? { ...l, t0: seam } : l));
    laid.push({ id: line.id, kind: link.kind, dir: link.dir });
  });
  return laid;
}

/**
 * The time a section's own clock reads at t: a section a linked move opens early starts, for everything but the drawing
 * of its page (its colours, its light, what lines read under them), at the switch; before it, the section before holds.
 */
export function sectionClock(sections: LinkSection[], t: number) {
  let cur: LinkSection | undefined;
  for (const s of sections) if (s.start <= t) cur = s;
  const tr = cur?.transition;
  return cur && tr?.kind.startsWith('link-') && t < cur.start + (tr.seam ?? 0) ? cur.start - 1e-3 : t;
}
