// From today's free plan to the scheduler's input (world-events.ts), and the composition events today's plan already makes,
// in the scheduler's own terms, so the two can be counted the same way. Plan-level only: a line's show time is the
// engine's rule without its picture pulls (render/engine.ts showAt), and seats are their sets' nominal boxes.
import type { freeJob } from './free-plan';
import type { StyleWorld } from './style-world';
import type { SongTimeline } from './timeline';
import { wordBreaks } from './phrases';
import { SET_SPECS } from './render/world-sets';
import { WORLD_BEATS } from './render/world-beats';
import { WORLD_CAM_SEC } from './render/world-cam';
import { linkGrounds, LINK_CLEAR, LINK_PREPARE } from './render/world-handoff';
import { linksOf, sharedOf, type BeatKind } from './world-shared';
import { seatsDiffer, type CompositionFamily, type FrameBox, type HandoffCandidate, type HoldEvent, type SeatCandidate, type SungWord, type WorldCompositionCaps, type WorldEvent, type WorldEventInput, type WorldEventLine } from './world-events';

type Free = ReturnType<typeof freeJob>;
interface PlanLineW { cue: string; enter?: string; world?: { set: string; enter: string; exit: string; repose?: { at: number; set: string }[]; cam?: { kind: string; at: number }; beat?: { kind: string; at: number } }; handoff?: { kind: string; from: number; to: number } }
interface PlanShotW { shot: string; lyric: { template: string; side: string }; lines: PlanLineW[] }
interface TrCue { cueId: string; shot: string; enter: string; world?: { enter: string; exit: string }; handoff?: unknown }
interface Section { start: number; transition?: { kind: string; dur?: number; dir?: number; seam?: number }; layers?: { t0?: number; paper?: string; dark?: boolean }[] }

/**
 * The five worlds drawn on one page (Codex C): their two composition moves each, mapped onto the six families. A draft
 * to move into world-shared.ts `compositions` in phase 2; every other world's caps are derived (capsOf).
 */
export const ONE_PAGE_CAPS: Record<string, Pick<WorldCompositionCaps, 'kinds' | 'moves'>> = {
  blueprint: { kinds: ['layout-seat', 'camera-reframe'], moves: { 'layout-seat': 'sheet-change', 'camera-reframe': 'detail-viewport' } },
  chalkboard: { kinds: ['layout-seat', 'ground-role'], moves: { 'layout-seat': 'board-region', 'ground-role': 'erase-reseat' } },
  // a thermal receipt: camera still, no shared page handoff; its own feed and tear are its page moves, its stamp a hold
  document: { kinds: ['page-handoff'], moves: { 'page-handoff': 'feed-advance / tear-next' } },
  notebook: { kinds: ['page-handoff', 'layout-seat'], moves: { 'page-handoff': 'page-turn', 'layout-seat': 'margin-seat' } },
  'art-deco': { kinds: ['carrier-swap', 'layout-seat'], moves: { 'carrier-swap': 'poster-panel', 'layout-seat': 'frame-reseat' } },
};
export const ONE_PAGE_WORLDS = Object.keys(ONE_PAGE_CAPS);

/** A set's nominal box, frame fractions, y down: its anchor, which side sits on it, its widest row and its height limit. */
export function seatOf(set: string): SeatCandidate {
  const s = SET_SPECS[set];
  if (!s) return { id: set };
  const [w, h] = s.vertical ? [s.tall * (1080 / 1920), s.share * (1920 / 1080)] : [s.share, s.tall];
  const x0 = s.at[0] - (w * (s.ax + 1)) / 2;
  const y0 = s.at[1] - (h * (s.ay + 1)) / 2;
  const box: FrameBox = { x0: +x0.toFixed(3), y0: +y0.toFixed(3), x1: +(x0 + w).toFixed(3), y1: +(y0 + h).toFixed(3) };
  return { id: set, box, ...(s.object ? { carrierId: s.object } : s.under?.some((u) => u.carrier) ? { carrierId: `${set}:under` } : {}), ...(s.vertical ? { vertical: true } : {}) };
}

/** A world's caps: the declared one-page worlds as Codex C has them, any other derived from its own sets and camera. */
export function capsOf(world: StyleWorld): WorldCompositionCaps {
  const sets = [...new Set(world.layouts.lines.map((l) => l.set))];
  const seats = sets.map((s) => ({ ...seatOf(s), ...(world.layouts.lines.find((l) => l.set === s)?.ground ? { carrierId: `ground:${world.layouts.lines.find((l) => l.set === s)!.ground}` } : {}) }));
  const carrierRole: WorldCompositionCaps['carrierRole'] = world.sheet ? 'page' : world.standsOnPlate ? 'plate' : seats.some((s) => s.carrierId) ? 'object' : 'ground';
  const declared = ONE_PAGE_CAPS[world.id];
  if (declared) return { worldId: world.id, ...declared, seats: sets, carrierRole, source: 'declared' };
  const differs = seats.some((a) => seats.some((b) => seatsDiffer(a, b)));
  const kinds: CompositionFamily[] = [
    ...(differs ? ['layout-seat' as const] : []),
    ...(!world.ownMoves && linksOf(world.id).families.length ? ['page-handoff' as const] : []),
    ...(new Set(seats.map((s) => s.carrierId ?? '')).size > 1 ? ['carrier-swap' as const] : []),
    ...(sharedOf(world).camera !== 'still' ? ['camera-reframe' as const] : []),
  ];
  return { worldId: world.id, kinds, seats: sets, carrierRole, source: 'derived' };
}

const PHRASE_GAP = /[\s、，。！？!?,.;；:：「」『』()（）"“”]/;

/**
 * A line's sung phrases, only from per-character times the aligner trusted: split at its spaces and stops, else at its
 * words. Undefined when the timing is not trusted, does not match the text, or does not move (a line sung "all at once").
 */
export function sungWords(c: { text: string; start: number; end: number; charStarts?: number[]; charTimed?: boolean }): SungWord[] | undefined {
  const cs = [...c.text];
  const t = c.charStarts;
  if (!c.charTimed || !t || t.length !== cs.length || t.at(-1)! - t[0] < 0.2 || t.some((x, i) => i > 0 && x < t[i - 1] - 1e-3)) return undefined;
  const heads: number[] = [];
  cs.forEach((ch, i) => { if (!PHRASE_GAP.test(ch) && (i === 0 || PHRASE_GAP.test(cs[i - 1]))) heads.push(i); });
  const starts = heads.length > 1 ? heads : [...wordBreaks(c.text)].filter((k) => k < cs.length && !PHRASE_GAP.test(cs[k])).sort((a, b) => a - b);
  if (starts.length < 2) return undefined;
  return starts.map((k, n) => ({ text: cs.slice(k, starts[n + 1] ?? cs.length).join('').trim(), from: +t[k].toFixed(3), to: +(n + 1 < starts.length ? t[starts[n + 1]] : c.end).toFixed(3) }));
}

/** The plan's sung lines in order, each with its shot, its own seat and its shown time (engine showAt, without picture pulls). */
function linesOf(free: Free, song: SongTimeline) {
  const shots = (free.plan as unknown as { shots: PlanShotW[] }).shots;
  const cues = free.job.cues;
  const lead = (song.tempo ?? 120) < 95 ? 0.35 : 0.2;
  const rows = shots.flatMap((s) => s.lines.map((l) => ({ s, l, c: cues.find((x) => x.id === l.cue)! }))).filter((x) => x.c).sort((a, b) => a.c.start - b.c.start);
  const lastSung = rows.map(({ c }) => (c.charTimed && c.charStarts?.length ? c.charStarts.at(-1)! : -Infinity));
  return rows.map(({ s, l, c }, i) => {
    const pace = Math.min(1, Math.max(0.35, (c.end - c.start) / 2));
    const enterLead = l.enter === 'cut' || !l.enter ? 0 : 0.25 * pace;
    const show = Math.max(c.start - Math.max(lead, enterLead), Math.min(c.start, (lastSung[i - 1] ?? -Infinity) + 0.3));
    return { shot: s, line: l, cue: c, show: +show.toFixed(3), seat: l.world?.set ?? `${s.lyric.template}:${s.lyric.side}` };
  });
}

/** The Q4 linked handoffs today's renderer would lay (world-handoff.ts linkGrounds, on a copy of the plan's sections). */
function handoffsOf(free: Free, rows: ReturnType<typeof linesOf>): HandoffCandidate[] {
  const sections = structuredClone((free.treatment.graphics?.sections ?? []) as unknown as Section[]);
  const tr = free.treatment.cues as unknown as TrCue[];
  const laid = linkGrounds(sections, rows.map(({ cue, show }) => { const t = tr.find((x) => x.cueId === cue.id); return { id: cue.id, show, start: cue.start, shot: t?.shot ?? '', world: t?.world, handoff: !!t?.handoff }; }));
  // (linkGrounds lays them in line order, one section each: the laid sections in time order are the same list)
  const linked = sections.filter((s) => s.transition?.kind.startsWith('link-') && s.transition.seam !== undefined).sort((x, y) => x.start - y.start);
  if (linked.length !== laid.length) throw new Error(`linkGrounds laid ${laid.length} handoffs on ${linked.length} sections`);
  return laid.map((x, k) => ({ lineId: x.id, kind: x.kind, dir: x.dir, seam: +(linked[k].start + linked[k].transition!.seam!).toFixed(3), dur: linked[k].transition!.dur ?? LINK_PREPARE + LINK_CLEAR }));
}

/** Today's ground cuts that change the frame's light: a section whose ground colour or darkness differs from the one before. */
export function lightsOf(free: Free): { at: number; what: string }[] {
  const sections = (free.treatment.graphics?.sections ?? []) as unknown as Section[];
  return sections.flatMap((s, i) => {
    const [a, b] = [sections[i - 1]?.layers?.[0], s.layers?.[0]];
    return i > 0 && a && b && (a.paper !== b.paper || !!a.dark !== !!b.dark) ? [{ at: s.start, what: `ground light ${a.paper}${a.dark ? ' dark' : ''} → ${b.paper}${b.dark ? ' dark' : ''}` }] : [];
  });
}

/** The Q2 holds the plan carries (lineplan-core beatOfLine), each with its whole window (world-beats.ts WORLD_BEATS sec). */
function holdsOf(rows: ReturnType<typeof linesOf>): HoldEvent[] {
  return rows.flatMap(({ line, cue }) => {
    const b = line.world?.beat;
    const sec = b ? WORLD_BEATS[b.kind as BeatKind]?.sec : undefined;
    return b && sec ? [{ lineId: cue.id, at: b.at, from: b.at, to: +(b.at + sec).toFixed(3), kind: b.kind }] : [];
  });
}

/**
 * A free plan as the scheduler's input: its sung lines (the world's approved seats as candidates, the composer's own seat
 * first), the song's beats and sections, the world's caps, Q2's holds and Q4's linked handoffs. `window` keeps the lines
 * that overlap it and the holds and handoffs on them.
 */
export function fromFreeJob(free: Free, song: SongTimeline, world: StyleWorld, o: { seed?: number; window?: [number, number] } = {}): WorldEventInput {
  const all = linesOf(free, song);
  const caps = capsOf(world);
  const [a, b] = o.window ?? [-Infinity, Infinity];
  const rows = all.filter((r) => r.cue.end > a && r.cue.start < b);
  const ids = new Set(rows.map((r) => r.cue.id));
  const fits = (set: string, text: string) => { const l = world.layouts.lines.find((x) => x.set === set); const n = [...text.replace(/\s/g, '')].length; return !l || ((l.max ?? 99) >= n && n >= (l.min ?? 0) && (!l.column || !/[A-Za-z0-9]/.test(text)) && l.closing !== true); };
  const capsSeat = (set: string) => ({ ...seatOf(set), ...(world.layouts.lines.find((l) => l.set === set)?.ground ? { carrierId: `ground:${world.layouts.lines.find((l) => l.set === set)!.ground}` } : {}) });
  const lines: WorldEventLine[] = rows.map(({ cue, show, seat }) => {
    const own = capsSeat(seat);
    const others = caps.seats.filter((s) => s !== seat && fits(s, cue.text)).map(capsSeat);
    const words = sungWords(cue);
    return { id: cue.id, show, start: cue.start, end: cue.end, ...(words ? { words } : {}), seats: [own, ...others], seat };
  });
  const inWin = (t: number) => t > a - 3 && t < b + 3;
  return {
    lines,
    beats: (song.beats ?? []).filter(inWin),
    downbeats: (song.downbeats ?? []).filter(inWin),
    sections: (song.sections ?? []).map((s) => ({ start: s.start, energy: s.energy })),
    caps: { ...caps, seats: [...new Set([...caps.seats, ...lines.map((l) => l.seat!)])] },
    holds: holdsOf(rows).filter((h) => ids.has(h.lineId)),
    handoffs: handoffsOf(free, all).filter((h) => ids.has(h.lineId)),
    lights: lightsOf(free).filter((l) => inWin(l.at)),
    seed: o.seed ?? 0,
  };
}

/**
 * The composition events today's plan already makes, as the scheduler would write them: a line boundary whose set really
 * differs (seatsDiffer), a change of set inside a line (repose), a linked page handoff (Q4) or a line's own handoff, a
 * world camera move into a part. A boundary carrying several is one event; ground fills, wipes, pieces and holds are none.
 */
export function currentEvents(free: Free, song: SongTimeline, world: StyleWorld): WorldEvent[] {
  const rows = linesOf(free, song);
  const hands = new Map(handoffsOf(free, rows).map((h) => [h.lineId, h]));
  const caps = capsOf(world);
  const seat = (set: string) => ({ ...seatOf(set), ...(caps.seats.includes(set) && world.layouts.lines.find((l) => l.set === set)?.ground ? { carrierId: `ground:${world.layouts.lines.find((l) => l.set === set)!.ground}` } : {}) });
  const out: WorldEvent[] = [];
  let here = '';
  const ev = (e: Omit<WorldEvent, 'id' | 'changesLight'> & { changesLight?: boolean }) => out.push({ id: `${e.kind}:${e.lineIds.at(-1)}:${out.length}`, changesLight: false, ...e });
  rows.forEach(({ cue, line, show, seat: set }, i) => {
    const q4 = hands.get(cue.id);
    const own = line.handoff;
    const moved = i > 0 && seatsDiffer(seat(here), seat(set));
    const cam = line.world?.cam && WORLD_CAM_SEC[line.world.cam.kind] ? line.world.cam : undefined;
    const before = here;
    if (i > 0 && (q4 || own)) ev({ lineIds: [rows[i - 1].cue.id, cue.id], kind: 'page-handoff', at: q4?.seam ?? own!.from, from: q4 ? q4.seam - LINK_PREPARE : own!.from, to: q4 ? q4.seam - LINK_PREPARE + q4.dur : own!.to, seatBefore: before, seatAfter: set, scope: 'line', changesLight: true, reason: q4 ? `Q4 ${q4.kind}` : `handoff ${own!.kind}` });
    else if (moved) ev({ lineIds: [cue.id], kind: 'layout-seat', at: show, from: show, to: show, seatBefore: before, seatAfter: set, scope: 'line', reason: 'set changes at the line' });
    else if (i > 0 && cam && Math.abs(cam.at - show) > 0.05) ev({ lineIds: [cue.id], kind: 'camera-reframe', at: cam.at, from: cam.at, to: cam.at + WORLD_CAM_SEC[cam.kind], seatBefore: before, seatAfter: set, scope: 'section', reason: `world camera ${cam.kind}` });
    else if (i > 0 && cam) ev({ lineIds: [cue.id], kind: 'camera-reframe', at: show, from: show, to: show + WORLD_CAM_SEC[cam.kind], seatBefore: before, seatAfter: set, scope: 'section', reason: `world camera ${cam.kind}` });
    here = set;
    for (const r of line.world?.repose ?? []) {
      if (!seatsDiffer(seat(here), seat(r.set))) { here = r.set; continue; }
      ev({ lineIds: [cue.id], kind: 'layout-seat', at: r.at, from: r.at, to: r.at, seatBefore: here, seatAfter: r.set, scope: 'in-line', reason: 'repose' });
      here = r.set;
    }
  });
  return out;
}
